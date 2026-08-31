// The map section: an offline field map, a compass clinometer, and a notebook.
//
// A sibling of the block diagram rather than a tab inside it. The two share
// the shell, the rock list and the orientation conventions, and nothing else —
// a block is a thing a student invents to understand a structure, and this is
// a record of an outcrop that actually exists.

import { el, clear } from '../widgets.js';
import { expandIcon, collapseIcon } from '../icons.js';
import { MapCanvas } from './canvas.js';
import { measurePanel, stationsPanel, linesPanel, areasPanel, setupPanel } from './panels.js';
import { blockPanel } from './blockPanel.js';
import { measureView } from './measureView.js';
import { niceScaleBar } from './symbols.js';
import { FieldStore, loadWorkspace, readProject, writeProject, writeIndex,
  removeProject, projectMeta } from '../../field/store.js';
import { defaultFieldDocument, migrateFieldDoc, makeStation, makeArea, makePatch, makeUnit,
  nextStationName, toGeoJSON, toCSV, toKML, toLinesCSV, isLinearFeature, makeLine,
  lineKind, lineIsDrawable, lineLength, formatAttitude } from '../../field/model.js';
import { Clinometer, GeoWatch, fixAge } from '../../field/sensors.js';
import { fetchDeclination as lookupDeclination } from '../../field/declination.js';
import { downloadArea, verifyArea, deleteArea, requestPersistence,
  SOURCES, BASE_SOURCES } from '../../field/tiles.js';
import { fieldReady } from '../../field/ready.js';
import { listPacks, packState, installPack } from '../../field/packs.js';
import { unlocked } from '../../unlock.js';
import { elevationAt } from '../../field/dem.js';
import { distance, formatDistance, bboxCenter } from '../../field/geo.js';
import { cutBlock, surveyExtent } from '../../field/cutblock.js';
import { recordModelThicknesses, planModelThicknesses } from '../../strat/model.js';
import { buildShading, shadingKey, patchColorCss, patchAt,
  unitFromStations, unitVerdictText } from './shading.js';

const TABS = [
  { id: 'measure', label: 'Measure', build: measurePanel },
  { id: 'stations', label: 'Stations', build: stationsPanel },
  { id: 'lines', label: 'Lines', build: linesPanel },
  { id: 'areas', label: 'Areas', build: areasPanel },
  { id: 'block', label: 'Block', build: blockPanel },
  { id: 'setup', label: 'Setup', build: setupPanel },
];

export class MapSection {
  constructor(host) {
    this.host = host;            // the App, for the shared sheet
    this.activeTab = 'measure';
    this.ready = false;
    // Resolves when loadWorkspace has landed. The field-ready check runs from
    // a Block tab that can be opened before the notes have finished loading,
    // and a check that counted a default empty document would report "no
    // offline map" to somebody who has one.
    this.opened = new Promise((resolve) => { this._markOpened = resolve; });
    this.selectedStationId = null;
    this.selectedLineId = null;
    this.placeMode = false;
    // The last block cut from this project, and what the fit decided. Kept on
    // the section rather than in the document: it is a derived reading of the
    // notes, and a stale one must never look like part of the record.
    this._blockReport = null;
    this._blockBuilding = null;
    // What the last build wrote into the stratigraphic column, so the Block
    // tab can say so rather than leaving a number to change behind the
    // student's back.
    this._columnNote = null;
    // Shading is derived from the contacts, so it is cached against their
    // geometry and re-flooded only when that actually changes.
    this._shadeKey = null;
    this._shade = null;
    // Armed to drop a unit patch on the next tap, and the unit it will carry.
    // Chosen before tapping rather than inherited from whatever was shaded
    // last, so a new patch arrives with the right name and therefore the right
    // colour already on it.
    this.shadeMode = false;
    this.shadeUnit = '';
    // The line being drawn. Held outside the document until it is finished,
    // so an abandoned line leaves nothing behind and every tap does not land
    // on the undo stack.
    this.drawing = null;
    this._verifying = null;
    this._download = null;
    this._draftArea = null;
    // The field-ready check and the course packs. Both answer questions asked
    // at camp rather than in the field, and both are held here rather than
    // recomputed per panel build: counting a thousand tiles against the cache
    // is cheap once and silly on every keystroke.
    this._ready = null;
    this._readyChecking = false;
    this._readyTried = false;
    this._packs = null;
    this._packsLoading = false;
    this._packStates = new Map();
    this._packInstall = null;
    this._elev = null;
    this._elevAt = null;
    this._started = false;
    this._clinoStarted = false;
    this.measureNode = null;
    // When set, the clinometer writes into this station instead of making a
    // new one — the way you fill in an attitude you could not take at the time.
    this._measureTarget = null;
    this._featureBeforeTarget = null;
    // Remembered per geometry, so flipping Plane/Line and back returns to the
    // feature that was being measured rather than resetting to the first one.
    this._lastFeature = { planar: 'bedding', linear: 'lineation' };

    this.draft = freshDraft();

    this.projects = [];
    this.projectId = null;
    this.store = new FieldStore(defaultFieldDocument());
    this.clino = new Clinometer({
      getDeclination: () => this.store.doc.settings.declination || 0,
    });
    this.geo = new GeoWatch({ goodAccuracy: 15 });

    this._buildDOM();
    this._bindSensors();

    // The document loads asynchronously, so the map opens on defaults and
    // then jumps to wherever the notes left off.
    loadWorkspace().then(({ index, id, doc }) => {
      this.projects = index.projects;
      this.projectId = id;
      this.store.projectId = id;
      this._adoptDocument(doc);
      this.ready = true;
      this._markOpened();
      this.host.fieldOpened();
    });

    this.store.subscribe((doc, info) => this._onChange(doc, info));
  }

  /**
   * Which tabs exist right now.
   *
   * A getter rather than a field because the course gate can open mid-session:
   * a student types the second password and the Block tab has to appear
   * without the section — and the notes and sensors it is holding — being
   * rebuilt around it. buildPanel already falls back to the first tab when the
   * one it is asked for is absent, so a locked Block tab needs no other guard.
   */
  get tabs() {
    return unlocked('model') ? TABS : TABS.filter((t) => t.id !== 'block');
  }

  // -------------------------------------------------------------------------

  _buildDOM() {
    this.canvas = el('canvas', { class: 'mapview' });

    this.locateBtn = hudBtn(locateIcon(), 'Center on me', () => this.locate());
    this.layerBtn = hudBtn(layersIcon(), 'Change layer', () => this.cycleLayer());
    this.placeBtn = hudBtn(plusIcon(), 'Place a station by hand', () => this.togglePlace());
    this.fullBtn = hudBtn(expandIcon(), 'Full screen map', () => this.toggleFullMap());

    this.undoBtn = hudBtn(textSpan('↶'), 'Undo', () => this.store.undo());
    this.redoBtn = hudBtn(textSpan('↷'), 'Redo', () => this.store.redo());

    this.scaleChip = el('div', { class: 'scale-chip map-scale' });
    this.attrib = el('div', { class: 'map-attrib' });
    this.statusChip = el('div', { class: 'map-status hidden' });
    this.modeBanner = el('div', { class: 'mode-banner hidden' });
    this.readout = el('div', { class: 'map-readout hidden' });

    // Three things want the bottom of the map — a coverage warning, the
    // selected station, and the placement banner — and any two of them can be
    // up at once. Stacking them in one column beats giving each a magic
    // offset and hoping they never meet.
    this.drawBar = el('div', { class: 'draw-bar hidden' });

    this.bottomStack = el('div', { class: 'map-bottom' }, [
      this.statusChip, this.readout, this.modeBanner, this.drawBar,
    ]);

    this.pane = el('div', { class: 'map-pane' }, [
      this.canvas,
      el('div', { class: 'hud hud-left' }, [this.undoBtn, this.redoBtn]),
      el('div', { class: 'hud hud-right' }, [
        this.locateBtn, this.layerBtn, this.fullBtn, this.placeBtn,
      ]),
      this.scaleChip,
      this.attrib,
      this.bottomStack,
    ]);

    this.map = new MapCanvas(this.canvas, {
      onTap: (ll, screen) => this.onTap(ll, screen),
      onMove: () => this._onMapMove(),
      onUserMove: () => this.breakFollow(),
      onVertexDrag: (target, i, ll) => this.dragVertex(target, i, ll),
      onVertexDragEnd: () => this.endVertexDrag(),
      onCoverage: (c) => this._onCoverage(c),
    });
  }

  _bindSensors() {
    this.geo.subscribe((state) => {
      const fix = state.fix;
      this.map.fix = fix;
      this.map.fixStale = fix ? fixAge(fix) > 30 : false;
      if (fix && this.store.doc.settings.follow) {
        this.map.setView(fix.lon, fix.lat, null);
      }
      this.map.invalidate();
      this._refreshElevation(fix);
      if (this.drawing) this._syncDrawBar();
      this._refreshPanel();
    });
    this.clino.subscribe(() => this._refreshPanel());
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  activate() {
    this._started = true;
    this.host.root.classList.toggle('map-full', this.fullMap());
    this.geo.start();
    // Persistence is worth asking for the moment the map is genuinely being
    // used, and not before — an unprompted permission on first launch is the
    // kind of thing people decline out of hand.
    requestPersistence();
    requestAnimationFrame(() => { this.map.resize(); this._syncMap(); });
  }

  deactivate() {
    clearTimeout(this._indexTimer);
    if (this.ready) this.store.flush().then(() => this._writeIndex());
    this.closeMeasure();
    // The block section has no full-screen mode and must never inherit one.
    this.host.root.classList.remove('map-full');
    this._started = false;
    this.geo.stop();
    this.clino.stop();
    this._clinoStarted = false;
    this.store.flush();
  }

  resize() { this.map.resize(); }

  doc() { return this.store.doc; }

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  /** Put a freshly loaded document on screen, with nothing carried over. */
  _adoptDocument(doc) {
    this.selectedStationId = null;
    this.selectedLineId = null;
    this.drawing = null;
    this.map.draftLine = null;
    this.map.activeVertex = null;
    this.map.selectedLineId = null;
    this.map.purge();
    this.closeMeasure();
    if (this.placeMode) this.togglePlace();
    this.store.replace(doc, true);
    // A project you have just opened has nothing to undo back into.
    this.store.undoStack.length = 0;
    this.store.redoStack.length = 0;
    this.map.setView(doc.view.lon, doc.view.lat, doc.view.zoom);
    this._syncMap();
    this._syncDrawBar();
  }

  projectList() { return this.projects; }

  currentProjectId() { return this.projectId; }

  async switchProject(id) {
    if (!id || id === this.projectId) return;
    // The outgoing project is written and its counts recorded before anything
    // points at the incoming one.
    await this.store.flush();
    await this._writeIndex();
    const doc = await readProject(id);
    if (!doc) return;
    this.projectId = id;
    this.store.projectId = id;
    this._adoptDocument(doc);
    await this._writeIndex({ currentId: id });
    this.rebuild();
  }

  /**
   * Start a new project.
   *
   * The declination and the accuracy limit come across, because they describe
   * the phone and roughly where on Earth it is rather than the work; the map
   * areas and every observation do not.
   */
  async newProject(name) {
    await this.store.flush();
    await this._writeIndex();
    const prev = this.store.doc;
    const doc = defaultFieldDocument();
    doc.name = name || 'New project';
    doc.settings = {
      ...doc.settings,
      declination: prev.settings.declination,
      declinationSet: prev.settings.declinationSet,
      declinationSource: prev.settings.declinationSource,
      minAccuracy: prev.settings.minAccuracy,
      baseLayer: prev.settings.baseLayer,
    };
    doc.view = { ...prev.view };
    const id = newId('pr');
    await writeProject(id, doc);
    this.projects = [...this.projects, projectMeta(id, doc)];
    this.projectId = id;
    this.store.projectId = id;
    this._adoptDocument(doc);
    await this._writeIndex({ currentId: id });
    this.rebuild();
  }

  renameProject(name) {
    this.setDocName(name);
    this._writeIndex();
    this.rebuild();
  }

  /**
   * Delete a project, and the map tiles only it was using.
   *
   * Tiles are shared across projects — two field areas can overlap, and a
   * download is a fact about the device rather than about the work. So the
   * areas of every OTHER project are gathered first and anything they still
   * need is kept. Skipping that would punch holes in a map somebody else is
   * about to walk into.
   */
  async deleteProject(id) {
    const meta = this.projects.find((p) => p.id === id);
    if (!meta || this.projects.length < 2) return;
    const doomed = await readProject(id);
    if (!confirm(`Delete the project "${meta.name}"?\n\n`
      + `${plural(meta.stations, 'station')}, ${plural(meta.lines, 'line')}. `
      + `Map areas only this project was using are deleted too; anything another project needs is kept.\n\n`
      + 'This cannot be undone. Export a backup first if you want one.')) return;

    const keep = [];
    for (const p of this.projects) {
      if (p.id === id) continue;
      const other = await readProject(p.id);
      if (other) keep.push(...(other.areas || []));
    }
    for (const area of doomed?.areas || []) await deleteArea(area, keep);

    await removeProject(id);
    this.projects = this.projects.filter((p) => p.id !== id);

    if (this.projectId === id) {
      const next = this.projects[0];
      const doc = await readProject(next.id);
      this.projectId = next.id;
      this.store.projectId = next.id;
      this._adoptDocument(doc || defaultFieldDocument());
      await this._writeIndex({ currentId: next.id });
    } else {
      await this._writeIndex({});
    }
    this.rebuild();
  }

  /**
   * The project list is written from here and nowhere else.
   *
   * Two writers on one key is how a list ends up disagreeing with the
   * documents it describes, so the store no longer touches it. The open
   * project's counts are refreshed from the live document on the way past,
   * which is the only one that can have changed since the last write.
   */
  async _writeIndex(patch = {}) {
    const i = this.projects.findIndex((p) => p.id === this.projectId);
    if (i >= 0) {
      this.projects[i] = {
        ...this.projects[i],
        ...projectMeta(this.projectId, this.store.doc),
      };
    }
    await writeIndex({ currentId: this.projectId, projects: this.projects, ...patch });
  }

  /** Keep the counts current without a write per keystroke. */
  _scheduleIndex() {
    clearTimeout(this._indexTimer);
    this._indexTimer = setTimeout(() => { if (this.ready) this._writeIndex(); }, 1200);
  }

  // -------------------------------------------------------------------------
  // Reacting to change
  // -------------------------------------------------------------------------

  _onChange(doc, info) {
    this._syncMap();
    this.undoBtn.disabled = !this.store.canUndo;
    this.redoBtn.disabled = !this.store.canRedo;
    if (this.selectedStationId && !doc.stations.some((s) => s.id === this.selectedStationId)) {
      this.selectedStationId = null;
    }
    if (this.selectedLineId && !doc.lines.some((l) => l.id === this.selectedLineId)) {
      this.selectedLineId = null;
    }
    if (info.structural) { this._scheduleIndex(); this.host.renderSectionPanel(); }
    else this._refreshPanel();
  }

  _syncMap() {
    const doc = this.store.doc;
    const s = doc.settings;
    const layerChanged = this.map.baseLayer !== s.baseLayer;
    this.map.baseLayer = s.baseLayer;
    this.map.showHillshade = s.showHillshade;
    this.map.showContours = s.showContours;
    this.map.contourInterval = s.contourInterval;
    this.map.labelStations = s.labelStations;
    this.map.showStations = s.showStations;
    this.map.stations = doc.stations;
    this.map.lines = doc.lines;
    this.map.selectedLineId = this.selectedLineId;
    this.map.units = doc.units;
    this.map.patches = doc.patches;
    this.map.areas = doc.areas;
    this._syncShading(doc);
    this.map.selectedId = this.selectedStationId;
    if (layerChanged) this.map.invalidate();
    this.map.invalidate();
    this._syncChrome();
    this._syncFollowButton();
    this._syncFullButton();
  }

  _syncChrome() {
    const bar = niceScaleBar(this.map.metersPerPixel);
    clear(this.scaleChip);
    this.scaleChip.append(
      el('span', { class: 'scale-rule', style: { width: `${Math.round(bar.px)}px` } }),
      el('span', { text: formatDistance(bar.meters) }),
    );
    const src = SOURCES[this.store.doc.settings.baseLayer];
    this.attrib.textContent = src ? src.attribution : '';
  }

  _onMapMove() {
    this._syncChrome();
    // Remember where the map was, but do not let panning fill the undo stack.
    clearTimeout(this._viewTimer);
    this._viewTimer = setTimeout(() => {
      if (!this.ready) return;
      this.store.edit((d) => {
        d.view = { lon: this.map.lon, lat: this.map.lat, zoom: this.map.zoom };
      }, { coalesce: 'map-view', silent: true, transient: true });
    }, 700);
    if (this.map.selection && this.activeTab === 'areas') this._refreshPanel();
  }

  /**
   * Say when the map on screen is not all there.
   *
   * This is the message the whole feature exists to be able to show: not a
   * blank square the student has to interpret, but a count and a reason.
   */
  _onCoverage(cov) {
    const offline = navigator.onLine === false;
    if (!cov.missing) {
      this.statusChip.classList.add('hidden');
      return;
    }
    this.statusChip.classList.remove('hidden');
    this.statusChip.textContent = offline
      ? `${cov.missing} of ${cov.wanted} tiles not downloaded here`
      : `${cov.missing} tiles loading…`;
    this.statusChip.classList.toggle('bad', offline);
  }

  _refreshPanel() {
    this.host.sectionPanel?.refreshReadings?.();
    this.measureNode?.refresh?.();
  }

  /** Rebuild the open panel — for changes that alter what controls exist. */
  rebuild() { this.host.rebuildPanel(); }

  touchDraft() { this._refreshPanel(); }

  // -------------------------------------------------------------------------
  // Map interaction
  // -------------------------------------------------------------------------

  onTap({ lon, lat }, screen) {
    if (this.drawing) { this.addVertex(lon, lat); return; }
    if (this.shadeMode) { this.placePatch(lon, lat); return; }
    if (this.placeMode) {
      this.placeStation(lon, lat, { source: 'manual', bySight: true });
      return;
    }
    // Nearest station within a finger's width.
    let best = null, bestD = 30;
    for (const st of this.store.doc.stations) {
      const p = this.map.lonLatToScreen(st.lon, st.lat);
      const d = Math.hypot(p.x - screen.x, p.y - screen.y);
      if (d < bestD) { bestD = d; best = st; }
    }
    if (best) { this.selectStation(best.id); return; }
    // Stations win ties: they are smaller targets and a line under one is
    // still reachable by tapping any other part of it.
    const line = this.map.lineAt(screen.x, screen.y);
    this.selectStation(null);
    this.selectLine(line ? line.id : null);
  }

  // -------------------------------------------------------------------------
  // Mapped lines
  // -------------------------------------------------------------------------

  selectLine(id) {
    this.selectedLineId = id;
    this.map.selectedLineId = id;
    // The handle you were holding belongs to the line you were holding it on.
    if (this.map.activeVertex?.target !== id) this.map.activeVertex = null;
    this.map.invalidate();
    if (this.activeTab === 'lines') this.host.renderSectionPanel();
  }

  /**
   * Move a point that is already down.
   *
   * Coalesced under one key per vertex, so dragging a contact into place is
   * one undo step rather than sixty, and left non-structural so the panel is
   * not rebuilt under the finger.
   */
  dragVertex(target, index, { lon, lat }) {
    if (target === 'draft') {
      if (!this.drawing || !this.drawing.points[index]) return;
      this.drawing.points[index] = [lon, lat];
      this.map.invalidate();
      return;
    }
    this.editLine(target, (l) => {
      if (l.points[index]) l.points[index] = [lon, lat];
    }, `vertex:${target}:${index}`);
  }

  endVertexDrag() {
    this.store.breakCoalesce();
    // Length and point count are printed in the panel and have just moved.
    if (this.activeTab === 'lines') this.rebuild();
  }

  /** The vertex last touched, if it belongs to the line asked about. */
  activeVertex(lineId) {
    const v = this.map.activeVertex;
    return v && v.target === lineId ? v.index : -1;
  }

  /**
   * Take a point out.
   *
   * Undo covers a stray point while the line is still being drawn, but a
   * finished one would otherwise have to be deleted and walked again. Refused
   * at two points, below which there is no line left to edit.
   */
  removeVertex(lineId, index) {
    const line = this.store.doc.lines.find((l) => l.id === lineId);
    if (!line || line.points.length <= 2) return;
    this.store.edit((doc) => {
      const l = doc.lines.find((x) => x.id === lineId);
      if (l && l.points.length > 2) l.points.splice(index, 1);
    }, { structural: true });
    this.map.activeVertex = null;
    this.map.invalidate();
  }

  /**
   * Start drawing.
   *
   * Two ways to put a point down, because there are two ways to map a
   * contact: tap where you can see it going, or walk it and press "Here" at
   * every bend. The second is what you do when the contact is under your feet
   * and you cannot see its trace at all.
   */
  startLine(kind = 'contact', existing = null) {
    if (this.placeMode) this.togglePlace();
    this.drawing = existing
      ? { ...existing, points: [...existing.points] }
      : makeLine({ kind });
    this._extendingId = existing ? existing.id : null;
    this.map.draftLine = this.drawing;
    this.map.invalidate();
    this._syncDrawBar();
    this.rebuild();
  }

  addVertex(lon, lat) {
    if (!this.drawing) return;
    this.drawing.points.push([lon, lat]);
    this.map.invalidate();
    this._syncDrawBar();
  }

  /** Drop a point where you are standing. */
  addVertexHere() {
    const fix = this.geo.state.fix;
    if (!fix || !this.drawing) return;
    this.addVertex(fix.lon, fix.lat);
  }

  undoVertex() {
    if (!this.drawing || !this.drawing.points.length) return;
    this.drawing.points.pop();
    this.map.invalidate();
    this._syncDrawBar();
  }

  finishLine() {
    const line = this.drawing;
    if (!line) return;
    if (!lineIsDrawable(line)) { this.cancelLine(); return; }
    const extending = this._extendingId;
    this.store.edit((doc) => {
      if (extending) {
        const i = doc.lines.findIndex((l) => l.id === extending);
        if (i >= 0) { doc.lines[i] = line; return; }
      }
      doc.lines.push(line);
    }, { structural: true });
    this.selectedLineId = line.id;
    this.map.selectedLineId = line.id;
    this._endDrawing();
  }

  cancelLine() { this._endDrawing(); }

  _endDrawing() {
    this.drawing = null;
    this._extendingId = null;
    this.map.draftLine = null;
    this.map.invalidate();
    this._syncDrawBar();
    this.rebuild();
  }

  drawingLine() { return this.drawing; }

  extendLine(id) {
    const line = this.store.doc.lines.find((l) => l.id === id);
    if (line) this.startLine(line.kind, line);
  }

  editLine(id, fn, coalesce) {
    this.store.edit((doc) => {
      const l = doc.lines.find((x) => x.id === id);
      if (l) fn(l);
    }, { coalesce: coalesce || null, structural: !coalesce });
  }

  deleteLine(id) {
    const line = this.store.doc.lines.find((l) => l.id === id);
    if (!line) return;
    const what = line.name || lineKind(line.kind).label.toLowerCase();
    if (!confirm(`Delete "${what}"?\n\n${line.points.length} points, ${formatDistance(lineLength(line))}. This cannot be undone once the app is closed.`)) return;
    this.store.edit((doc) => { doc.lines = doc.lines.filter((l) => l.id !== id); },
      { structural: true });
    if (this.selectedLineId === id) this.selectLine(null);
  }

  goToLine(id) {
    const l = this.store.doc.lines.find((x) => x.id === id);
    if (!l || !l.points.length) return;
    const lons = l.points.map((p) => p[0]), lats = l.points.map((p) => p[1]);
    this.map.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], 0.4);
  }

  _syncDrawBar() {
    const line = this.drawing;
    this.drawBar.classList.toggle('hidden', !line);
    if (!line) return;
    const n = line.points.length;
    const fix = this.geo.state.fix;
    clear(this.drawBar);
    this.drawBar.append(
      el('span', { class: 'draw-count', text: `${n} point${n === 1 ? '' : 's'}` }),
      el('button', {
        class: 'draw-btn', type: 'button', text: 'Here', disabled: !fix,
        title: fix ? 'Add a point at your position' : 'No fix yet',
        onclick: () => this.addVertexHere(),
      }),
      el('button', {
        class: 'draw-btn', type: 'button', text: 'Undo', disabled: !n,
        onclick: () => this.undoVertex(),
      }),
      el('button', {
        class: 'draw-btn primary', type: 'button', text: 'Done', disabled: n < 2,
        onclick: () => this.finishLine(),
      }),
      el('button', {
        class: 'draw-btn', type: 'button', text: '×', 'aria-label': 'Cancel',
        onclick: () => this.cancelLine(),
      }),
    );
  }

  selectStation(id) {
    this.selectedStationId = id;
    this.map.selectedId = id;
    this.map.invalidate();
    if (this.activeTab === 'stations') this.host.renderSectionPanel();
    this._showStationChip();
  }

  _showStationChip() {
    const st = this.store.doc.stations.find((s) => s.id === this.selectedStationId);
    this.readout.classList.toggle('hidden', !st);
    if (!st) return;
    clear(this.readout);
    const attitude = Number.isFinite(st.strike)
      ? `${String(Math.round(st.strike)).padStart(3, '0')}/${Math.round(st.dip)}`
      : 'no attitude';
    this.readout.append(
      el('strong', { text: `${st.name || '—'}  ${attitude}` }),
      el('span', { text: st.unitName ? ` · ${st.unitName}` : '' }),
      el('button', {
        class: 'chip-close', type: 'button', text: '×', 'aria-label': 'Deselect',
        onclick: () => this.selectStation(null),
      }),
    );
  }

  /**
   * Stop following, because a hand is on the map.
   *
   * A map that pulls itself back every second is unusable for the one job the
   * Areas tab needs it for — framing somewhere you are not standing. So the
   * first drag wins and the button below gets you back.
   *
   * Written silently: panning is not an edit, and it should neither land on
   * the undo stack nor rebuild the panel under a moving finger.
   */
  breakFollow() {
    if (this.store.doc.settings.follow !== true) return;
    this.store.edit((d) => { d.settings.follow = false; }, { silent: true, transient: true });
    this._syncFollowButton();
    // The Setup tab shows this as a switch, and a switch that disagrees with
    // the map is worse than no switch.
    if (this.activeTab === 'setup') this.rebuild();
  }

  /** Go to the current fix, and resume following it. */
  locate() {
    const fix = this.geo.state.fix;
    if (!fix) { this.geo.start(); return; }
    this.store.edit((d) => { d.settings.follow = true; }, { silent: true, transient: true });
    this.map.setView(fix.lon, fix.lat, Math.max(this.map.zoom, 16));
    this._syncFollowButton();
    if (this.activeTab === 'setup') this.rebuild();
  }

  /**
   * Give the map the whole screen.
   *
   * The panel is where the work is written down, but reading a map is a
   * different job from filling in a form, and on a phone the two do not fit at
   * once. Same idea as the clinometer taking over the screen: whichever one
   * you are using should have all of it.
   */
  toggleFullMap(on = null) {
    const next = on == null ? !this.fullMap() : on;
    this.store.edit((d) => { d.settings.mapFull = next; }, { silent: true, transient: true });
    this.host.root.classList.toggle('map-full', next);
    this._syncFullButton();
    // The sheet has gone or come back, so the map has a different amount of
    // screen. The canvas watches its own box, but the block's canvas does not.
    requestAnimationFrame(() => this.host.scene?.resize?.());
  }

  fullMap() { return this.store.doc.settings.mapFull === true; }

  _syncFullButton() {
    const on = this.fullMap();
    clear(this.fullBtn);
    this.fullBtn.appendChild(on ? collapseIcon() : expandIcon());
    this.fullBtn.classList.toggle('on', on);
    this.fullBtn.title = on ? 'Show the panel' : 'Full screen map';
    this.fullBtn.setAttribute('aria-label', this.fullBtn.title);
  }

  _syncFollowButton() {
    const on = this.store.doc.settings.follow === true;
    this.locateBtn.classList.toggle('on', on);
    this.locateBtn.title = on ? 'Following you — drag the map to stop' : 'Centre on me';
    this.locateBtn.setAttribute('aria-label', this.locateBtn.title);
  }

  cycleLayer() {
    const cur = this.store.doc.settings.baseLayer;
    const i = BASE_SOURCES.indexOf(cur);
    this.setSetting({ baseLayer: BASE_SOURCES[(i + 1) % BASE_SOURCES.length] });
  }

  togglePlace() {
    this.placeMode = !this.placeMode;
    this.placeBtn.classList.toggle('on', this.placeMode);
    this.modeBanner.classList.toggle('hidden', !this.placeMode);
    if (this.placeMode) {
      clear(this.modeBanner);
      this.modeBanner.append(
        el('span', { text: 'Tap the map to place a station' }),
        el('button', {
          class: 'banner-done', type: 'button', text: 'Done',
          onclick: () => this.togglePlace(),
        }),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Recording
  // -------------------------------------------------------------------------

  /** Why the Record button cannot be pressed, in words a student can act on. */
  blockingReason() {
    const d = this.draft;
    const g = this.geo.state;
    const s = this.store.doc.settings;
    // Filling in an attitude on a station that already exists needs no fix at
    // all — the place was recorded when it was visited, and only the reading
    // is outstanding. Gating this on the GPS would make it impossible to do
    // the one thing it is for: finishing a station indoors, or in a canyon.
    if (!this._measureTarget) {
      if (g.status === 'denied') return 'Location is blocked, so a station has nowhere to go.';
      if (!g.fix) return 'Waiting for a position.';
      if (g.fix.accuracy > s.minAccuracy) {
        return `The fix is ± ${Math.round(g.fix.accuracy)} m and the limit is ${s.minAccuracy} m. Wait for it to tighten, or change the limit on Setup.`;
      }
    }
    if (d.noAttitude) return null;
    if (d.source === 'manual') return null;
    if (d.held) return null;
    const c = this.clino.state;
    if (!c.ready) return 'Waiting for the compass.';
    if (!c.still) return 'The phone is still moving. Rest it on the rock.';
    return null;
  }

  startClino() {
    this._clinoStarted = true;
    this.clino.start().then(() => this.rebuild());
    this.rebuild();
  }

  clinoStarted() { return this._clinoStarted; }

  /**
   * Freeze the current reading.
   *
   * Both the plane and the line are kept, because they come from the same
   * instant of the same sensors — the phone's back is on the surface and its
   * long edge lies in that surface at the same time. Holding both means
   * flipping between Plane and Line after the capture still shows a real
   * measurement instead of blanking, and on a slickensided fault it records
   * the plane and the slip line from one placement of the phone.
   */
  captureCompass() {
    const d = this.draft;
    if (d.held) {
      d.held = false;
      d.strike = d.dip = d.trend = d.plunge = d.scatter = null;
      this.clino.reset();
      this._refreshPanel();
      return;
    }
    const c = this.clino.state;
    if (!c.ready) return;
    d.strike = c.strike;
    d.dip = c.dip;
    d.trend = c.trend;
    d.plunge = c.plunge;
    d.scatter = isLinearFeature(d.feature) ? c.lineScatter : c.scatter;
    d.held = true;
    this._refreshPanel();
  }

  /** Switch between measuring a plane and measuring a line. */
  setGeometry(kind) {
    this.setFeature(this._lastFeature[kind] || (kind === 'linear' ? 'lineation' : 'bedding'));
  }

  setFeature(id) {
    this.draft.feature = id;
    this._lastFeature[isLinearFeature(id) ? 'linear' : 'planar'] = id;
    this._refreshPanel();
    this.rebuild();
  }

  // -------------------------------------------------------------------------
  // The full-screen clinometer
  // -------------------------------------------------------------------------

  openMeasure({ target = null } = {}) {
    this._measureTarget = target;
    // Open on what the station already says it is. Coming from a station
    // marked as a slickenline and landing on whatever the last new reading
    // happened to be would quietly record the wrong kind of measurement.
    if (target) {
      const st = this.store.doc.stations.find((x) => x.id === target);
      if (st) {
        // Borrowed, not taken. The draft is what you are about to record
        // next, and going back to finish an old station should not silently
        // change that.
        this._featureBeforeTarget = this.draft.feature;
        this.draft.feature = st.feature;
        this._lastFeature[isLinearFeature(st.feature) ? 'linear' : 'planar'] = st.feature;
        this.draft.held = false;
        this.draft.strike = this.draft.dip = this.draft.trend = this.draft.plunge = null;
        this.draft.scatter = null;
        this.clino.reset();
      }
    }
    if (this.measureNode) return;
    // Nothing can be measured until the sensor has been allowed to run, and
    // asking here means the prompt arrives when the intent is obvious.
    if (!this._clinoStarted) this.startClino();
    this.measureNode = measureView(this.measureContext());
    this.host.root.appendChild(this.measureNode);
    this.host.root.classList.add('measuring');
  }

  closeMeasure() {
    if (this._measureTarget && this._featureBeforeTarget) {
      this.draft.feature = this._featureBeforeTarget;
    }
    this._featureBeforeTarget = null;
    this._measureTarget = null;
    if (!this.measureNode) return;
    this.measureNode.remove();
    this.measureNode = null;
    // When set, the clinometer writes into this station instead of making a
    // new one — the way you fill in an attitude you could not take at the time.
    this._measureTarget = null;
    this.host.root.classList.remove('measuring');
    this.rebuild();
  }

  measureOpen() { return !!this.measureNode; }

  measureContext() {
    return {
      draft: this.draft,
      clinoState: () => this.clino.state,
      geoState: () => this.geo.state,
      groundElevation: () => this.groundElevation(),
      blockingReason: () => this.blockingReason(),
      declination: () => this.store.doc.settings.declination || 0,
      captureCompass: () => this.captureCompass(),
      recordStation: () => this.recordStation(),
      setGeometry: (k) => this.setGeometry(k),
      setFeature: (id) => this.setFeature(id),
      measureTarget: () => this.measureTarget(),
      close: () => this.closeMeasure(),
    };
  }

  recordStation() {
    if (this.blockingReason()) return;
    if (this._measureTarget) { this.applyReadingTo(this._measureTarget); return; }
    const fix = this.geo.state.fix;
    this.placeStation(fix.lon, fix.lat, { fix });
  }

  /** Write the reading in hand onto a station that already exists. */
  applyReadingTo(id) {
    const d = this.draft;
    const c = this.clino.state;
    const linear = isLinearFeature(d.feature);
    const strike = d.held ? d.strike : c.strike;
    const dip = d.held ? d.dip : c.dip;
    const trend = d.held ? d.trend : c.trend;
    const plunge = d.held ? d.plunge : c.plunge;

    this.store.edit((doc) => {
      const st = doc.stations.find((x) => x.id === id);
      if (!st) return;
      st.feature = d.feature;
      st.source = 'compass';
      st.scatter = d.held ? d.scatter : (linear ? c.lineScatter : c.scatter);
      st.declination = doc.settings.declination || 0;
      if (linear) {
        st.trend = trend; st.plunge = plunge;
        st.strike = null; st.dip = null;
      } else {
        st.strike = strike; st.dip = dip;
        st.trend = null; st.plunge = null;
      }
    }, { structural: true });

    d.held = false;
    d.scatter = null;
    d.strike = d.dip = d.trend = d.plunge = null;
    this.clino.reset();
    this.selectedStationId = id;
    this.closeMeasure();
  }

  /**
   * Give a station somewhere to put an attitude it was recorded without.
   *
   * Seeded flat rather than left null, because the controls only appear once
   * there is a value for them to hold, and a dial at zero you then drag is a
   * clearer starting point than an empty one.
   */
  addAttitude(id) {
    this.store.edit((doc) => {
      const st = doc.stations.find((x) => x.id === id);
      if (!st) return;
      if (isLinearFeature(st.feature)) { st.trend = 0; st.plunge = 0; }
      else { st.strike = 0; st.dip = 0; }
      st.source = 'manual';
      st.certainty = 'estimated';
    }, { structural: true });
  }

  /** Take the attitude off again, back to a station with a place and no reading. */
  clearAttitude(id) {
    this.store.edit((doc) => {
      const st = doc.stations.find((x) => x.id === id);
      if (!st) return;
      st.strike = st.dip = st.trend = st.plunge = st.scatter = null;
    }, { structural: true });
  }

  /** Which station the clinometer is currently filling in, if any. */
  measureTarget() {
    if (!this._measureTarget) return null;
    return this.store.doc.stations.find((s) => s.id === this._measureTarget) || null;
  }

  placeStation(lon, lat, { fix = null, source = null, bySight = false } = {}) {
    const d = this.draft;
    const doc = this.store.doc;
    const c = this.clino.state;

    const linear = isLinearFeature(d.feature);
    let strike = null, dip = null, trend = null, plunge = null;
    let scatter = null, src = source || d.source;
    if (!d.noAttitude && !bySight) {
      if (d.source === 'compass') {
        strike = d.held ? d.strike : c.strike;
        dip = d.held ? d.dip : c.dip;
        trend = d.held ? d.trend : c.trend;
        plunge = d.held ? d.plunge : c.plunge;
        scatter = d.held ? d.scatter : (linear ? c.lineScatter : c.scatter);
        src = 'compass';
      } else {
        strike = d.strike; dip = d.dip;
        trend = d.trend; plunge = d.plunge;
        src = 'manual';
      }
      // A station carries one pair or the other, never both, so the file can
      // never imply a measurement that was not the one being taken.
      if (linear) { strike = null; dip = null; } else { trend = null; plunge = null; }
    }

    const st = makeStation({
      name: nextStationName(doc.stations),
      lon, lat,
      elev: this._elev,
      gpsAccuracy: fix ? fix.accuracy : null,
      gpsAltitude: fix ? fix.altitude : null,
      feature: d.feature,
      strike, dip, trend, plunge, scatter,
      source: src,
      certainty: bySight ? 'estimated' : d.certainty,
      declination: doc.settings.declination || 0,
      unitId: d.unitId,
      unitName: d.unitName,
      rockId: d.rockId,
      note: d.note,
    });

    // A station placed by eye across a valley has no GPS behind it, and the
    // record should not imply otherwise.
    if (bySight) { st.gpsAccuracy = null; st.note = st.note || ''; }

    this.store.edit((doc2) => { doc2.stations.push(st); }, { structural: true });
    this.selectedStationId = st.id;

    // The attitude is spent; the context usually is not. A traverse is a
    // dozen readings in the same unit, and retyping it each time is how a
    // notebook ends up with the unit left blank.
    d.held = false;
    d.scatter = null;
    if (d.source === 'compass') { d.strike = d.dip = d.trend = d.plunge = null; }
    d.note = '';
    this.clino.reset();

    // Elevation for the new station arrives from the terrain a moment later.
    elevationAt(lon, lat, { allowNetwork: navigator.onLine !== false }).then((e) => {
      if (e == null) return;
      this.store.edit((doc2) => {
        const t = doc2.stations.find((x) => x.id === st.id);
        if (t) t.elev = e;
      }, { silent: true });
    });

    this.rebuild();
  }

  /**
   * Change what a station is a reading of.
   *
   * Moving between a plane and a line is only allowed while there is no
   * reading to lose; the editor offers it on that basis, and this keeps the
   * unused pair null either way.
   */
  setStationFeature(id, featureId) {
    this.store.edit((doc) => {
      const st = doc.stations.find((x) => x.id === id);
      if (!st) return;
      st.feature = featureId;
      if (isLinearFeature(featureId)) { st.strike = null; st.dip = null; }
      else { st.trend = null; st.plunge = null; }
    }, { structural: true });
  }

  editStation(id, fn, coalesce) {
    this.store.edit((doc) => {
      const st = doc.stations.find((s) => s.id === id);
      if (st) fn(st);
    }, { coalesce: coalesce || null, structural: !coalesce });
  }

  deleteStation(id) {
    const st = this.store.doc.stations.find((s) => s.id === id);
    if (!st) return;
    // Same hazard as a line: a station you have walked away from cannot be
    // taken again, and the delete button sits in a list of taps.
    const bits = [formatAttitude(st), st.unitName].filter((b) => b && b !== 'no attitude');
    if (!confirm(`Delete station ${st.name || ''}?${bits.length ? `\n\n${bits.join(' · ')}` : ''}\n\nThis cannot be undone once the app is closed.`)) return;
    this.store.edit((doc) => {
      doc.stations = doc.stations.filter((s) => s.id !== id);
    }, { structural: true });
    if (this.selectedStationId === id) this.selectedStationId = null;
  }

  goToStation(id) {
    const st = this.store.doc.stations.find((s) => s.id === id);
    if (st) this.map.setView(st.lon, st.lat, Math.max(this.map.zoom, 16));
  }

  moveStationToFix(id) {
    const fix = this.geo.state.fix;
    if (!fix) return;
    this.editStation(id, (s) => {
      s.lon = fix.lon; s.lat = fix.lat; s.gpsAccuracy = fix.accuracy;
    });
  }

  // -------------------------------------------------------------------------
  // Elevation under the fix
  // -------------------------------------------------------------------------

  _refreshElevation(fix) {
    if (!fix) { this._elev = null; return; }
    // Only re-read when the position has actually moved, not on every fix.
    if (this._elevAt && distance(fix.lon, fix.lat, this._elevAt[0], this._elevAt[1]) < 8) return;
    this._elevAt = [fix.lon, fix.lat];
    elevationAt(fix.lon, fix.lat, { allowNetwork: navigator.onLine !== false })
      .then((e) => { this._elev = e; this._refreshPanel(); })
      .catch(() => { this._elev = null; });
  }

  groundElevation() { return this._elev; }

  // -------------------------------------------------------------------------
  // Areas
  // -------------------------------------------------------------------------

  selection() { return this.map.selection; }

  beginSelection() {
    const bbox = this.map.beginSelection();
    this._draftArea = makeArea({
      name: '', bbox, sources: ['topo', 'dem'], minZoom: 10, maxZoom: 16,
    });
    this.rebuild();
  }

  draftArea() {
    if (this._draftArea) this._draftArea.bbox = this.map.selection;
    return this._draftArea;
  }

  setDraftArea(patch) {
    Object.assign(this._draftArea, patch);
    this.rebuild();
  }

  cancelSelection() {
    this.map.clearSelection();
    this._draftArea = null;
    this.rebuild();
  }

  // -------------------------------------------------------------------------
  // Map units
  // -------------------------------------------------------------------------

  /**
   * Re-flood only when the lines or the seeds have moved.
   *
   * Panning must never trigger this, and neither must dropping a station: the
   * shading is a function of the contacts and the patch points and nothing
   * else, so that is exactly what the key is built from.
   */
  _syncShading(doc) {
    const key = shadingKey(doc);
    if (key === this._shadeKey) return;
    this._shadeKey = key;
    this._shade = (doc.patches || []).length ? buildShading(doc) : null;
    this.map.setUnitShading(this._shade);
    if (this.activeTab === 'lines') this.rebuild();
  }

  /** Fills that took most of the sheet — too few contacts to say much. */
  widePatches() {
    return this._shade ? this._shade.wide : new Set();
  }

  shading() { return this._shade; }

  /** What the readings inside each shaded area say it is. */
  patchVerdicts() {
    const out = new Map();
    if (!this._shade) return out;
    for (const p of this.store.doc.patches || []) {
      out.set(p.id, unitFromStations(this._shade, p.id, this.store.doc.stations));
    }
    return out;
  }

  setShadeUnit(name) {
    this.shadeUnit = String(name || '').trim();
    this.rebuild();
  }

  toggleShadeMode(on = null) {
    this.shadeMode = on == null ? !this.shadeMode : on;
    if (this.shadeMode && this.placeMode) this.togglePlace();
    this.modeBanner.classList.toggle('hidden', !this.shadeMode);
    if (this.shadeMode) {
      clear(this.modeBanner);
      this.modeBanner.append(
        el('span', { text: this.shadeUnit
        ? `Tap inside ${this.shadeUnit}` : 'Tap inside a unit to shade it' }),
        el('button', {
          class: 'banner-done', type: 'button', text: 'Done',
          onclick: () => this.toggleShadeMode(false),
        }),
      );
    }
    this.rebuild();
  }

  placePatch(lon, lat) {
    // One patch per area. Tapping the same ground twice used to add a second
    // one, which put a duplicate in the list and changed nothing on the map —
    // the flood already knows who owns that cell, so ask it rather than
    // guessing from how far apart two taps were.
    const already = patchAt(this._shade, lon, lat);
    if (already) {
      const p = (this.store.doc.patches || []).find((x) => x.id === already);
      this._patchNote = p
        ? `That area is already shaded${p.unitName ? ` as ${p.unitName}` : ''}. Change or remove it in the list below rather than adding a second one.`
        : null;
      this.rebuild();
      return;
    }
    const doc = this.store.doc;
    const patch = makePatch({ lon, lat });

    // Flood with the new patch in place before committing anything, because
    // the question "which unit is this" can only be asked of a region that
    // exists — and the region is what the readings have to be inside of.
    const probe = buildShading({ ...doc, patches: [...(doc.patches || []), patch] });
    if (probe && probe.outside && probe.outside.has(patch.id)) {
      this._patchNote = 'That point is outside the ground you have mapped, so there is nothing to fill it against. Shade somewhere inside your contacts.';
      this.rebuild();
      return;
    }
    const said = unitFromStations(probe, patch.id, doc.stations);

    // A unit chosen from the chips is an instruction and wins. Otherwise the
    // readings standing in the area name it, which is the usual case and the
    // one worth not asking about: the student already wrote it down.
    patch.unitName = this.shadeUnit || said.name || '';
    this._patchNote = said.inside
      ? unitVerdictText(said, this.shadeUnit || said.name)
      : 'No readings inside this area, so it could not be named from them. Pick a unit above, or type its name on the row below.';

    this.store.edit((d) => { d.patches = [...(d.patches || []), patch]; });
    this.rebuild();
  }

  /**
   * A unit's colour belongs to the unit, not to the patch that happens to be
   * on screen — set it once and every outcrop of that unit follows, on the map
   * and in the block's column. Creating the unit if it does not exist yet is
   * the point: naming a unit on an outcrop is how most of them come into
   * being, and a student should not have to go to Setup first to colour one.
   */
  setUnitColor(name, color) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return;
    this.store.edit((d) => {
      const found = (d.units || []).find((u) => String(u.name || '').trim().toLowerCase() === key);
      if (found) found.color = color;
      else d.units = [...(d.units || []), makeUnit({ name: String(name).trim(), color })];
    });
    this.rebuild();
  }

  editPatch(id, fn) {
    this.store.edit((d) => {
      const p = (d.patches || []).find((x) => x.id === id);
      if (p) fn(p);
    });
    this.rebuild();
  }

  deletePatch(id) {
    this.store.edit((d) => { d.patches = (d.patches || []).filter((p) => p.id !== id); });
    this.rebuild();
  }

  // -------------------------------------------------------------------------
  // Cutting a block
  // -------------------------------------------------------------------------

  /** What the current box holds, answered without downloading anything. */
  surveyExtent() {
    return surveyExtent(this.store.doc, this.map.selection);
  }

  /**
   * Build a block from the box, and hand it to the other half.
   *
   * The field notes are read and never rewritten: a block is an interpretation
   * of a record, and an interpretation that edits the record it came from is
   * not evidence of anything. Nothing here changes a station, a line or a
   * patch.
   *
   * The one thing it does write is the thickness the block measured, into the
   * column's own `modelThickness` field — beside what the student said, never
   * over it. That is not the interpretation editing the record, it is the
   * interpretation being filed next to it so the two can be compared, which is
   * the whole point of having measured it. The exception, and it is deliberate,
   * is a unit with no thickness at all: there the block's number is adopted
   * outright and stamped as having come from a model, because "I do not know"
   * and "the block says 180 m" are not in conflict.
   */
  async buildBlock() {
    const bbox = this.map.selection;
    if (!bbox || this._blockBuilding) return;
    this._blockBuilding = { label: 'Reading the ground…' };
    this.rebuild();
    try {
      const { doc, report } = await cutBlock(this.store.doc, bbox, {
        allowNetwork: navigator.onLine !== false,
        name: this.store.doc.name,
        localFolds: this.store.doc.settings.localFolds === true,
        onProgress: (done, total) => {
          this._blockBuilding = { label: `Elevation: tile ${done} of ${total}` };
        },
      });
      this._blockReport = report;
      this._blockBuilding = null;
      this._recordThicknesses(report);
      this.map.clearSelection();
      this._draftArea = null;
      this.host.adoptBlock(doc);
      this.rebuild();
    } catch (err) {
      console.error(err);
      this._blockBuilding = null;
      this._blockReport = null;
      this.rebuild();
      this.host.toast
        ? this.host.toast(`Could not build the block: ${err.message}`)
        : alert(`Could not build the block: ${err.message}`);
    }
  }

  /**
   * File what the block measured against the column.
   *
   * Its own undo step, and taken only when something actually changed — a
   * build that told the column nothing it did not already know should not
   * leave an entry on the stack for a student to undo and wonder about.
   */
  _recordThicknesses(report) {
    const units = report?.units;
    if (!Array.isArray(units) || !units.length) return;
    // Asked before it is done, so a build with nothing to add leaves no undo
    // step behind it.
    const plan = planModelThicknesses(this.store.doc, units);
    if (!plan.steps.length) return;
    this.store.edit((doc) => { recordModelThicknesses(doc, units); }, { structural: true });
    this._columnNote = plan;
  }

  /** What the last build told the column, for the Block tab to report. */
  columnNote() { return this._columnNote; }

  /** Live download progress, tagged with which area it belongs to. */
  downloadProgress() {
    if (!this._download) return null;
    return { ...this._download.progress, areaId: this._download.area.id };
  }

  async startDownload() {
    const area = this.draftArea();
    if (!area) return;
    if (!area.name) {
      const [lon, lat] = bboxCenter(area.bbox);
      area.name = `${Math.abs(lat).toFixed(3)}${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(3)}${lon >= 0 ? 'E' : 'W'}`;
    }
    const ctrl = new AbortController();
    this._download = { area, progress: { done: 0, total: 0, bytes: 0, failed: 0 }, ctrl };
    this.rebuild();

    let result = null;
    let quotaHit = false;
    try {
      result = await downloadArea(area, {
        signal: ctrl.signal,
        onProgress: (p) => {
          this._download.progress = p;
          if (this.activeTab === 'areas') this._refreshPanel();
        },
      });
    } catch (err) {
      quotaHit = err && err.name === 'QuotaExceededError';
    }

    // Ask for the declination here, while there is certainly a connection,
    // and offer it rather than applying it. Failure changes nothing.
    const [clon, clat] = bboxCenter(area.bbox);
    const decl = await lookupDeclination(clon, clat);

    const check = await verifyArea(area);
    area.check = check;
    area.savedAt = new Date().toISOString();
    area.bytes = result ? result.bytes : 0;
    if (decl) { area.declination = decl.declination; area.declinationInfo = decl; }

    this._download = null;
    this.map.clearSelection();
    this._draftArea = null;

    this.store.edit((doc) => {
      doc.areas.push(area);
      // First area downloaded, and nobody has set a declination: take NOAA's
      // as the starting point rather than leaving zero standing as a value.
      if (decl && !doc.settings.declinationSet) {
        doc.settings.declination = Math.round(decl.declination * 10) / 10;
        doc.settings.declinationSet = true;
        doc.settings.declinationSource = 'noaa';
      }
    }, { structural: true });

    this._invalidateReadiness();

    if (quotaHit) {
      alert('The browser ran out of storage part-way through.\n\nDelete an area you have finished with, then use Repair on this one.');
    }
  }

  cancelDownload() {
    this._download?.ctrl.abort();
  }

  verifying() { return this._verifying; }

  async verify(id) {
    const area = this.store.doc.areas.find((a) => a.id === id);
    if (!area) return;
    this._verifying = id;
    this.rebuild();
    const check = await verifyArea(area);
    this._verifying = null;
    this.store.edit((doc) => {
      const a = doc.areas.find((x) => x.id === id);
      if (a) a.check = check;
    }, { structural: true });
    this._invalidateReadiness();
  }

  async repair(id) {
    const area = this.store.doc.areas.find((a) => a.id === id);
    if (!area) return;
    const ctrl = new AbortController();
    this._download = { area, progress: { done: 0, total: 0, bytes: 0, failed: 0 }, ctrl };
    this.rebuild();
    try {
      await downloadArea(area, {
        signal: ctrl.signal,
        onProgress: (p) => {
          this._download.progress = p;
          if (this.activeTab === 'areas') this._refreshPanel();
        },
      });
    } catch { /* reported by the check that follows */ }
    this._download = null;
    await this.verify(id);
  }

  async deleteArea(id) {
    const doc = this.store.doc;
    const area = doc.areas.find((a) => a.id === id);
    if (!area) return;
    if (!confirm(`Delete "${area.name || 'this area'}" and its map tiles?\n\nYour stations are not touched.`)) return;
    await deleteArea(area, doc.areas);
    this.store.edit((d) => { d.areas = d.areas.filter((a) => a.id !== id); }, { structural: true });
    this.map.purge();
    this._invalidateReadiness();
    // Deleting the area took the pack's tiles with it, so the pack's card has
    // to stop saying "installed". Recounted rather than cleared: a cleared
    // entry reads as "checking…" and never resolves, because the packs are
    // only enumerated once per open.
    if (area.packId) {
      const pack = (this._packs || []).find((p) => p.id === area.packId);
      if (pack) {
        const st = await packState(pack).catch(() => null);
        if (st) this._packStates.set(pack.id, st);
        this.rebuild();
      }
    }
  }

  goToArea(id) {
    const area = this.store.doc.areas.find((a) => a.id === id);
    if (area) this.map.fitBounds(area.bbox);
  }

  // -------------------------------------------------------------------------
  // Field ready
  // -------------------------------------------------------------------------

  readiness() { return this._ready; }
  readyChecking() { return this._readyChecking; }

  /**
   * Throw the report away because something it counted has changed.
   *
   * Cheaper than re-running here and more honest than leaving it: the panel
   * re-checks the next time it is built, and until then there is no verdict on
   * screen rather than last minute's verdict wearing this minute's colour.
   */
  _invalidateReadiness() {
    this._ready = null;
    this._readyTried = false;
  }

  /**
   * Run the check once on its own, so opening the tab answers the question
   * without anybody having to ask it.
   *
   * Once, not on every build: the panel rebuilds on every keystroke in the
   * area-name field, and a check that re-counted the cache each time would
   * make typing stutter. The button re-runs it on demand, which is the right
   * moment — after a repair, or after deciding to trust it.
   */
  ensureReadiness() {
    if (this._ready || this._readyChecking || this._readyTried) return;
    this._readyTried = true;
    this.checkReadiness();
  }

  /**
   * Set the declination from NOAA, for the field area rather than for here.
   *
   * This is the one thing the readiness check can fix by itself, and it has to,
   * because the control that would otherwise fix it lives on Map -> Setup —
   * behind the first stage. Without this a student on day one is told to set a
   * number they have no way to reach.
   *
   * The lookup uses the centre of the downloaded area, NOT the phone's own
   * position. A student doing this at home on wifi is hundreds of miles from
   * the field area, and the declination there is not the declination that will
   * correct their readings. The area is where the readings will be taken, so
   * the area is what gets asked about.
   *
   * A value the student typed themselves is never overwritten.
   */
  async _ensureDeclination() {
    const doc = this.store.doc;
    if (doc.settings.declinationSet) return false;
    if (navigator.onLine === false) return false;
    // The course pack's area first — on a course that is the field area, and
    // any others are somebody's own box drawn around somewhere else.
    const area = doc.areas.find((a) => a.packId) || doc.areas[0];
    if (!area) return false;
    const [lon, lat] = bboxCenter(area.bbox);
    let r = null;
    try { r = await lookupDeclination(lon, lat); } catch { return false; }
    if (!r) return false;
    this.store.edit((d) => {
      d.settings.declination = Math.round(r.declination * 10) / 10;
      d.settings.declinationSet = true;
      d.settings.declinationSource = 'noaa';
      d.settings.declinationInfo = { ...r, lon, lat, area: area.name || null };
    }, { structural: true });
    return true;
  }

  async checkReadiness() {
    if (this._readyChecking) return;
    this._readyChecking = true;
    this.rebuild();
    try {
      // Count the real notebook, not the empty one the section starts on.
      await this.opened;
      await this._ensureDeclination();
      this._ready = await fieldReady(this.store.doc);
    } catch (err) {
      console.warn('field-ready check failed', err);
      this._ready = { checks: [], state: 'bad', ready: false, at: Date.now(),
        error: err?.message || 'the check itself failed' };
    }
    this._readyChecking = false;
    this.rebuild();
  }

  // -------------------------------------------------------------------------
  // Course packs
  // -------------------------------------------------------------------------

  packs() { return this._packs; }
  packStateOf(id) { return this._packStates.get(id) || null; }

  packProgress() {
    if (!this._packInstall) return null;
    return { ...this._packInstall.progress, packId: this._packInstall.id };
  }

  /** Read the shipped index, then count each pack against the cache. */
  async ensurePacks() {
    if (this._packs || this._packsLoading) return;
    this._packsLoading = true;
    let list = [];
    try { list = await listPacks(); } catch { /* an empty list is the answer */ }
    this._packs = list;
    this._packsLoading = false;
    if (!list.length) { this.rebuild(); return; }
    this.rebuild();
    // Counted in one pass afterwards rather than per pack, so the list appears
    // immediately and fills in its states rather than waiting on all of them.
    const states = await Promise.all(list.map((p) => packState(p).catch(() => null)));
    list.forEach((p, i) => { if (states[i]) this._packStates.set(p.id, states[i]); });
    this.rebuild();
  }

  cancelPackInstall() { this._packInstall?.ctrl.abort(); }

  /** Show where a pack covers, before deciding whether it is the right one. */
  goToPackArea(id) {
    const pack = (this._packs || []).find((p) => p.id === id);
    if (pack?.area?.bbox) this.map.fitBounds(pack.area.bbox);
  }

  /**
   * Install a shipped area.
   *
   * Ends in the same place a hand-made download ends — an entry in doc.areas
   * with a real verify behind it — because everything downstream is written
   * against that and should not learn a second shape. The area is matched by
   * packId rather than name so re-installing repairs the one that is there
   * instead of stacking up duplicates.
   */
  async installPack(id) {
    const pack = (this._packs || []).find((p) => p.id === id);
    if (!pack) return;
    const ctrl = new AbortController();
    this._packInstall = {
      id, ctrl,
      progress: { done: 0, total: pack.tiles || 0, bytes: 0, totalBytes: pack.bytes || 0, failed: 0 },
    };
    this.rebuild();

    let result = null;
    let quotaHit = false;
    try {
      result = await installPack(pack, {
        signal: ctrl.signal,
        onProgress: (p) => {
          if (!this._packInstall) return;
          this._packInstall.progress = p;
          // Whichever panel is showing — the pack card lives on the block's
          // course tab now, and the map section may not even be on screen.
          this.host.touchPanel();
        },
      });
    } catch (err) {
      quotaHit = err && err.name === 'QuotaExceededError';
    }
    this._packInstall = null;

    if (result && !result.aborted) {
      const existing = this.store.doc.areas.find((a) => a.packId === pack.id);
      const area = existing
        ? { ...existing }
        : makeArea({ ...pack.area, packId: pack.id, name: pack.area?.name || pack.name });
      const check = await verifyArea(area);
      area.check = check;
      area.savedAt = new Date().toISOString();
      area.bytes = pack.bytes || result.bytes;
      this.store.edit((doc) => {
        const at = doc.areas.findIndex((a) => a.packId === pack.id);
        if (at >= 0) doc.areas[at] = area;
        else doc.areas.push(area);
      }, { structural: true });
      this.map.purge();
    }

    // Recount both, so the panel tells the truth about what just happened
    // rather than about what was asked for. checkReadiness rather than
    // ensureReadiness: ensure is the once-per-open guard and would see the
    // stale report sitting there and decline to replace it, which is exactly
    // the report that has just stopped being true.
    const st = await packState(pack).catch(() => null);
    if (st) this._packStates.set(pack.id, st);
    this.rebuild();
    await this.checkReadiness();

    if (quotaHit) {
      alert('The browser ran out of storage part-way through.\n\nDelete an area you have finished with, then install this pack again — it picks up where it stopped.');
    }
  }

  // -------------------------------------------------------------------------
  // Settings, units, files
  // -------------------------------------------------------------------------

  setSetting(patch) {
    this.store.edit((doc) => { Object.assign(doc.settings, patch); }, { structural: true });
  }

  setDocName(name) {
    this.store.edit((doc) => { doc.name = name; });
  }

  declinationSet() { return this.store.doc.settings.declinationSet === true; }

  async fetchDeclination() {
    const fix = this.geo.state.fix;
    const lon = fix ? fix.lon : this.map.lon;
    const lat = fix ? fix.lat : this.map.lat;
    const r = await lookupDeclination(lon, lat);
    if (!r) { alert('Could not reach the declination service. Type the value in instead.'); return; }
    this.setSetting({
      declination: Math.round(r.declination * 10) / 10,
      declinationSet: true,
      declinationSource: 'noaa',
    });
  }

  addUnit(unit) {
    this.store.edit((doc) => { doc.units.push(unit); }, { structural: true });
  }

  editUnit(id, fn) {
    this.store.edit((doc) => {
      const u = doc.units.find((x) => x.id === id);
      if (u) fn(u);
    }, { structural: true });
  }

  deleteUnit(id) {
    const unit = this.store.doc.units.find((u) => u.id === id);
    const used = this.store.doc.stations.filter((s) => s.unitId === id).length;
    if (!confirm(`Remove "${unit?.name || 'this unit'}" from the list?`
      + (used ? `\n\n${used} station${used === 1 ? '' : 's'} keep the name; only the link to the list goes.` : ''))) return;
    this.store.edit((doc) => {
      doc.units = doc.units.filter((u) => u.id !== id);
      // Stations keep the name they were given; only the link to the list
      // goes. Deleting a unit should not blank a hundred observations.
      for (const s of doc.stations) if (s.unitId === id) s.unitId = null;
    }, { structural: true });
  }

  exportGeoJSON() {
    download(JSON.stringify(toGeoJSON(this.store.doc), null, 2),
      `${slug(this.store.doc.name)}.geojson`, 'application/geo+json');
  }

  exportCSV() {
    download(toCSV(this.store.doc), `${slug(this.store.doc.name)}-stations.csv`, 'text/csv');
  }

  exportLinesCSV() {
    download(toLinesCSV(this.store.doc), `${slug(this.store.doc.name)}-lines.csv`, 'text/csv');
  }

  exportKML() {
    download(toKML(this.store.doc),
      `${slug(this.store.doc.name)}.kml`,
      'application/vnd.google-earth.kml+xml');
  }

  exportBackup() {
    download(JSON.stringify({ ...this.store.doc, exportedAt: new Date().toISOString() }, null, 2),
      `${slug(this.store.doc.name)}.field.json`, 'application/json');
  }

  importBackup() {
    const input = el('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const doc = migrateFieldDoc(JSON.parse(await file.text()));
        if (!confirm(`Replace the current notes with "${doc.name}"?\n\n${doc.stations.length} stations. This cannot be undone by closing the app.`)) return;
        this.store.replace(doc);
        this.map.setView(doc.view.lon, doc.view.lat, doc.view.zoom);
      } catch (err) {
        alert(`Could not open that file.\n${err.message}`);
      }
    });
    input.click();
  }

  clearAll() {
    const n = this.store.doc.stations.length;
    if (!confirm(`Delete all ${n} stations and start again?\n\nDownloaded map areas are kept. Export a backup first if you want one.`)) return;
    const doc = defaultFieldDocument();
    doc.areas = this.store.doc.areas;
    doc.settings = this.store.doc.settings;
    this.store.replace(doc);
  }

  // -------------------------------------------------------------------------
  // Panel plumbing
  // -------------------------------------------------------------------------

  /** Everything the panels are allowed to reach. */
  panelContext() {
    return {
      doc: () => this.store.doc,
      draft: this.draft,
      rebuild: () => this.rebuild(),
      touchDraft: () => this.touchDraft(),

      geoState: () => this.geo.state,
      clinoState: () => this.clino.state,
      clinoStarted: () => this.clinoStarted(),
      startClino: () => this.startClino(),
      captureCompass: () => this.captureCompass(),
      openMeasure: (opts) => this.openMeasure(opts),
      addAttitude: (id) => this.addAttitude(id),
      clearAttitude: (id) => this.clearAttitude(id),
      setStationFeature: (id, f) => this.setStationFeature(id, f),
      measureOpen: () => this.measureOpen(),
      setFeature: (id) => this.setFeature(id),
      setGeometry: (k) => this.setGeometry(k),
      groundElevation: () => this.groundElevation(),
      blockingReason: () => this.blockingReason(),
      declinationSet: () => this.declinationSet(),

      recordStation: () => this.recordStation(),
      selectStation: (id) => this.selectStation(id),
      selectedStationId: () => this.selectedStationId,
      editStation: (id, fn, c) => this.editStation(id, fn, c),
      deleteStation: (id) => this.deleteStation(id),
      goToStation: (id) => this.goToStation(id),
      moveStationToFix: (id) => this.moveStationToFix(id),

      selectLine: (id) => this.selectLine(id),
      selectedLineId: () => this.selectedLineId,
      startLine: (k) => this.startLine(k),
      drawingLine: () => this.drawingLine(),
      extendLine: (id) => this.extendLine(id),
      editLine: (id, fn, c) => this.editLine(id, fn, c),
      activeVertex: (id) => this.activeVertex(id),
      removeVertex: (id, i) => this.removeVertex(id, i),
      deleteLine: (id) => this.deleteLine(id),
      goToLine: (id) => this.goToLine(id),

      patches: () => this.store.doc.patches || [],
      shadeMode: () => this.shadeMode,
      shadeUnit: () => this.shadeUnit,
      setShadeUnit: (n) => this.setShadeUnit(n),
      toggleShadeMode: (v) => this.toggleShadeMode(v),
      placePatch: (lon, lat) => this.placePatch(lon, lat),
      editPatch: (id, fn) => this.editPatch(id, fn),
      deletePatch: (id) => this.deletePatch(id),
      widePatches: () => this.widePatches(),
      patchColor: (name) => patchColorCss(name),
      patchNote: () => this._patchNote,
      patchVerdicts: () => this.patchVerdicts(),
      unitVerdictText: (v, a) => unitVerdictText(v, a),
      clearPatchNote: () => { this._patchNote = null; },
      setUnitColor: (name, color) => this.setUnitColor(name, color),
      patchCounts: () => (this._shade ? this._shade.counts : new Map()),
      patchCell: () => (this._shade ? this._shade.cell : 0),

      selection: () => this.selection(),
      beginSelection: () => this.beginSelection(),
      cancelSelection: () => this.cancelSelection(),

      surveyExtent: () => this.surveyExtent(),
      buildBlock: () => this.buildBlock(),
      blockReport: () => this._blockReport,
      blockBuilding: () => this._blockBuilding,
      columnNote: () => this._columnNote,
      showColumn: () => this.host.setMode('strata'),
      showBlock: () => this.host.setMode('block'),
      draftArea: () => this.draftArea(),
      setDraftArea: (p) => this.setDraftArea(p),
      startDownload: () => this.startDownload(),
      cancelDownload: () => this.cancelDownload(),
      downloadProgress: () => this.downloadProgress(),
      verify: (id) => this.verify(id),
      verifying: () => this.verifying(),
      repair: (id) => this.repair(id),
      deleteArea: (id) => this.deleteArea(id),
      goToArea: (id) => this.goToArea(id),

      readiness: () => this.readiness(),
      readyChecking: () => this.readyChecking(),
      ensureReadiness: () => this.ensureReadiness(),
      checkReadiness: () => this.checkReadiness(),

      packs: () => this.packs(),
      ensurePacks: () => this.ensurePacks(),
      packStateOf: (id) => this.packStateOf(id),
      packProgress: () => this.packProgress(),
      installPack: (id) => this.installPack(id),
      cancelPackInstall: () => this.cancelPackInstall(),
      goToPackArea: (id) => this.goToPackArea(id),

      setSetting: (p) => this.setSetting(p),
      setDocName: (n) => this.setDocName(n),
      projects: () => this.projectList(),
      currentProjectId: () => this.currentProjectId(),
      switchProject: (id) => this.switchProject(id),
      newProject: (n) => this.newProject(n),
      renameProject: (n) => this.renameProject(n),
      deleteProject: (id) => this.deleteProject(id),
      fetchDeclination: () => this.fetchDeclination(),
      addUnit: (u) => this.addUnit(u),
      editUnit: (id, fn) => this.editUnit(id, fn),
      deleteUnit: (id) => this.deleteUnit(id),
      exportGeoJSON: () => this.exportGeoJSON(),
      exportCSV: () => this.exportCSV(),
      exportLinesCSV: () => this.exportLinesCSV(),
      exportKML: () => this.exportKML(),
      exportBackup: () => this.exportBackup(),
      importBackup: () => this.importBackup(),
      clearAll: () => this.clearAll(),
    };
  }

  buildPanel(tabId) {
    const tab = this.tabs.find((t) => t.id === tabId) || this.tabs[0];
    this.activeTab = tab.id;
    if (!this.ready) {
      return el('div', { class: 'panel' }, [el('div', { class: 'empty' }, [
        el('p', { class: 'dim', text: 'Opening your field notes…' }),
      ])]);
    }
    return tab.build(this.panelContext());
  }
}

// ---------------------------------------------------------------------------

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

let projectCounter = 0;
function newId(prefix) {
  projectCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${projectCounter.toString(36)}`;
}

function freshDraft() {
  return {
    source: 'compass',
    strike: null, dip: null,
    trend: null, plunge: null,
    scatter: null, held: false,
    noAttitude: false,
    feature: 'bedding',
    unitId: null, unitName: '',
    rockId: 'sandstone',
    certainty: 'measured',
    note: '',
  };
}

function hudBtn(icon, label, onClick) {
  return el('button', {
    class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick: onClick,
  }, [icon]);
}

function textSpan(t) { return el('span', { text: t }); }

function svgIcon(paths) {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'hud-icon');
  for (const d of paths) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', 'tabicon-line');
    s.appendChild(p);
  }
  return s;
}

const locateIcon = () => svgIcon(['M12 3 V6 M12 18 V21 M3 12 H6 M18 12 H21',
  'M12 8.2 A3.8 3.8 0 1 0 12 15.8 A3.8 3.8 0 1 0 12 8.2']);
const layersIcon = () => svgIcon(['M12 3 L21 8 L12 13 L3 8 Z', 'M3 12.5 L12 17.5 L21 12.5',
  'M3 16.5 L12 21.5 L21 16.5']);
const plusIcon = () => svgIcon(['M12 5 V19 M5 12 H19']);

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'field';
}

function download(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
