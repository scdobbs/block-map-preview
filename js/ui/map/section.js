// The map section: an offline field map, a compass clinometer, and a notebook.
//
// A sibling of the block diagram rather than a tab inside it. The two share
// the shell, the rock list and the orientation conventions, and nothing else —
// a block is a thing a student invents to understand a structure, and this is
// a record of an outcrop that actually exists.

import { el, clear } from '../widgets.js';
import { MapCanvas } from './canvas.js';
import { measurePanel, stationsPanel, areasPanel, setupPanel } from './panels.js';
import { measureView } from './measureView.js';
import { niceScaleBar } from './symbols.js';
import { FieldStore, loadFieldDoc } from '../../field/store.js';
import { defaultFieldDocument, migrateFieldDoc, makeStation, makeArea,
  nextStationName, toGeoJSON, toCSV, isLinearFeature } from '../../field/model.js';
import { Clinometer, GeoWatch, fixAge } from '../../field/sensors.js';
import { fetchDeclination as lookupDeclination } from '../../field/declination.js';
import { downloadArea, verifyArea, deleteArea, requestPersistence,
  SOURCES, BASE_SOURCES } from '../../field/tiles.js';
import { elevationAt } from '../../field/dem.js';
import { distance, formatDistance, bboxCenter } from '../../field/geo.js';

const TABS = [
  { id: 'measure', label: 'Measure', build: measurePanel },
  { id: 'stations', label: 'Stations', build: stationsPanel },
  { id: 'areas', label: 'Areas', build: areasPanel },
  { id: 'setup', label: 'Setup', build: setupPanel },
];

export class MapSection {
  constructor(host) {
    this.host = host;            // the App, for the shared sheet
    this.tabs = TABS;
    this.activeTab = 'measure';
    this.ready = false;
    this.selectedStationId = null;
    this.placeMode = false;
    this._verifying = null;
    this._download = null;
    this._draftArea = null;
    this._elev = null;
    this._elevAt = null;
    this._started = false;
    this._clinoStarted = false;
    this.measureNode = null;
    // Remembered per geometry, so flipping Plane/Line and back returns to the
    // feature that was being measured rather than resetting to the first one.
    this._lastFeature = { planar: 'bedding', linear: 'lineation' };

    this.draft = freshDraft();

    this.store = new FieldStore(defaultFieldDocument());
    this.clino = new Clinometer({
      getDeclination: () => this.store.doc.settings.declination || 0,
    });
    this.geo = new GeoWatch({ goodAccuracy: 15 });

    this._buildDOM();
    this._bindSensors();

    // The document loads asynchronously, so the map opens on defaults and
    // then jumps to wherever the notes left off.
    loadFieldDoc().then((doc) => {
      this.store.replace(doc, true);
      this.store.undoStack.length = 0;
      this.ready = true;
      this.map.setView(doc.view.lon, doc.view.lat, doc.view.zoom);
      this._syncMap();
      this.host.renderSectionPanel();
    });

    this.store.subscribe((doc, info) => this._onChange(doc, info));
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
    this.bottomStack = el('div', { class: 'map-bottom' }, [
      this.statusChip, this.readout, this.modeBanner,
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
  // Reacting to change
  // -------------------------------------------------------------------------

  _onChange(doc, info) {
    this._syncMap();
    this.undoBtn.disabled = !this.store.canUndo;
    this.redoBtn.disabled = !this.store.canRedo;
    if (this.selectedStationId && !doc.stations.some((s) => s.id === this.selectedStationId)) {
      this.selectedStationId = null;
    }
    if (info.structural) this.host.renderSectionPanel();
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
    this.map.units = doc.units;
    this.map.areas = doc.areas;
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
  rebuild() { this.host.renderSectionPanel(); }

  touchDraft() { this._refreshPanel(); }

  // -------------------------------------------------------------------------
  // Map interaction
  // -------------------------------------------------------------------------

  onTap({ lon, lat }, screen) {
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
    this.selectStation(best ? best.id : null);
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
    if (g.status === 'denied') return 'Location is blocked, so a station has nowhere to go.';
    if (!g.fix) return 'Waiting for a position.';
    if (g.fix.accuracy > s.minAccuracy) {
      return `The fix is ± ${Math.round(g.fix.accuracy)} m and the limit is ${s.minAccuracy} m. Wait for it to tighten, or change the limit on Setup.`;
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

  openMeasure() {
    if (this.measureNode) return;
    // Nothing can be measured until the sensor has been allowed to run, and
    // asking here means the prompt arrives when the intent is obvious.
    if (!this._clinoStarted) this.startClino();
    this.measureNode = measureView(this.measureContext());
    this.host.root.appendChild(this.measureNode);
    this.host.root.classList.add('measuring');
  }

  closeMeasure() {
    if (!this.measureNode) return;
    this.measureNode.remove();
    this.measureNode = null;
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
      close: () => this.closeMeasure(),
    };
  }

  recordStation() {
    if (this.blockingReason()) return;
    const fix = this.geo.state.fix;
    this.placeStation(fix.lon, fix.lat, { fix });
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

  editStation(id, fn, coalesce) {
    this.store.edit((doc) => {
      const st = doc.stations.find((s) => s.id === id);
      if (st) fn(st);
    }, { coalesce: coalesce || null, structural: !coalesce });
  }

  deleteStation(id) {
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
  }

  goToArea(id) {
    const area = this.store.doc.areas.find((a) => a.id === id);
    if (area) this.map.fitBounds(area.bbox);
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
    download(toCSV(this.store.doc), `${slug(this.store.doc.name)}.csv`, 'text/csv');
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
      openMeasure: () => this.openMeasure(),
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

      selection: () => this.selection(),
      beginSelection: () => this.beginSelection(),
      cancelSelection: () => this.cancelSelection(),
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

      setSetting: (p) => this.setSetting(p),
      setDocName: (n) => this.setDocName(n),
      fetchDeclination: () => this.fetchDeclination(),
      addUnit: (u) => this.addUnit(u),
      editUnit: (id, fn) => this.editUnit(id, fn),
      deleteUnit: (id) => this.deleteUnit(id),
      exportGeoJSON: () => this.exportGeoJSON(),
      exportCSV: () => this.exportCSV(),
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

const expandIcon = () => svgIcon(['M4 9 V4 H9', 'M15 4 H20 V9', 'M20 15 V20 H15', 'M9 20 H4 V15']);
const collapseIcon = () => svgIcon(['M9 4 V9 H4', 'M20 9 H15 V4', 'M15 20 V15 H20', 'M4 15 H9 V20']);
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
