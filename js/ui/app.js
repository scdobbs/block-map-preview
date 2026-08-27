// Application shell: layout, tabs, the identify tool, and file handling.

import { el, svg, clear } from './widgets.js';
import { swatchEl } from './swatch.js';
import { tabIcon } from './icons.js';
import { layersPanel, historyPanel, terrainPanel, viewPanel, fieldPanel } from './panels.js';
import { stereonet } from './stereonet.js';
import { MapSection } from './map/section.js';
import { BlockScene } from '../render/scene.js';
import { Store, loadSaved, exportJSON, importJSON } from '../store.js';
import { defaultDocument, rock, makeMarker } from '../geo/model.js';
import { compileHistory, describeAt, beddingAt, beddingGrid } from '../geo/unmake.js';
import { readMarkers, formatReading, FLAT_DIP, VERTICAL_DIP } from '../render/markers.js';
import { footprint } from '../render/block.js';
import { fitBedding } from '../geo/stereonet.js';
import { quadrantBearing } from '../geo/math.js';

const TABS = [
  { id: 'layers', label: 'Layers', build: layersPanel },
  { id: 'history', label: 'History', build: historyPanel },
  { id: 'terrain', label: 'Terrain', build: terrainPanel },
  { id: 'field', label: 'Field', build: fieldPanel },
  { id: 'view', label: 'View', build: viewPanel },
];

export class App {
  constructor(root) {
    this.root = root;
    this.store = new Store(loadSaved() || defaultDocument());
    this.selectedEventId = null;
    this.selectedMarkerId = null;
    this.markerMode = null;     // null | 'add'
    this.activeTab = 'layers';
    // The map is a separate section rather than a sixth tab: it has its own
    // document, its own storage and its own idea of what the screen is for.
    // Built on first use, so a student who only ever opens blocks never pays
    // for it.
    // Always starts on the block and switches afterwards, so that the one
    // code path which builds the map section is the one that also starts its
    // sensors and sizes its canvas.
    this.mode = 'block';
    this.mapSection = null;
    this.sheetState = 'half';   // 'peek' | 'half' | 'full'
    this._history = null;
    this._readings = null;
    this._fit = null;
    this._mapFit = null;
    this._mapView = null;   // null so the first sync always applies the setting
    this._showNet = null;

    this._buildDOM();
    this.scene = new BlockScene(this.canvas);
    this.scene.controls.onTap = (x, y) => this.onTap(x, y);
    this.scene.controls.onGrab = (x, y) => this.grabMarker(x, y);
    this.scene.controls.onGrabMove = (x, y) => this.dragMarker(x, y);
    this.scene.controls.onGrabEnd = () => this.endMarkerDrag();

    // Handed to every panel. `selectedEventId` is a live getter so a panel
    // rebuilt at any moment sees the current selection.
    this.ctx = {
      store: this.store,
      get selectedEventId() { return this._app.selectedEventId; },
      _app: this,
      selectEvent: (id, tab) => this.selectEvent(id, tab),
      applyPreset: (p) => this.applyPreset(p),
      setView: (az, elev) => {
        // Asking for a 3D viewpoint is asking to leave the map.
        if (this.store.doc.settings.mapView) this.setMapView(false);
        this.scene.controls.setView(az, elev);
      },
      mapView: () => this.store.doc.settings.mapView === true,
      setMapView: (on) => this.setMapView(on),
      frame: () => this.scene.frame(this.store.doc),
      exportFile: () => this.exportFile(),
      importFile: () => this.importFile(),
      exportImage: () => this.exportImage(),
      readings: () => this.readings(),
      markerMode: () => this.markerMode,
      setMarkerMode: (m) => this.setMarkerMode(m),
      selectedMarkerId: () => this.selectedMarkerId,
      selectMarker: (id) => this.selectMarker(id),
      setNet: (on) => this.setNet(on),
      netOpen: () => this.store.doc.settings.showNet === true,
      fit: () => this.fit(),
      mapFit: () => this.mapFit(),
    };

    // Built after ctx, because it reads the readings and the selection through
    // it, and dropped into the stage so it covers the block but never the
    // sheet — on a wide screen the panel stays usable beside it.
    this.net = stereonet(this.ctx);
    this.stage.appendChild(this.net);
    this._bindNetGrip();

    this.panels = {};
    this._renderTabs();
    this._syncAll({ structural: true });

    this.store.subscribe((doc, info) => this._onChange(doc, info));
    window.addEventListener('resize', () => {
      this.scene.resize();
      this.mapSection?.resize();
    });
    // Field notes are the one thing here that cannot be rebuilt from anything
    // else, so they are written out the moment the app goes to the back.
    const flush = () => this.mapSection?.store.flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    this._bindKeys();

    this.scene.resize();
    this.scene.frame(this.store.doc);
    this._loop();

    if (loadMode() === 'map') this.setMode('map');
  }

  // -------------------------------------------------------------------------

  _buildDOM() {
    clear(this.root);

    this.canvas = el('canvas', { class: 'viewport', id: 'viewport' });

    this.undoBtn = iconBtn('↶', 'Undo', () => this.store.undo());
    this.redoBtn = iconBtn('↷', 'Redo', () => this.store.redo());

    this.compass = compassRose();
    this.readout = el('div', { class: 'readout hidden' });
    // Live reading for the marker under the finger. The panel list says the
    // same thing, but not while the sheet is collapsed or the student is
    // looking at the block rather than at the list.
    this.markerChip = el('div', { class: 'marker-chip hidden' });
    this.modeBanner = el('div', { class: 'mode-banner hidden' });
    // A mode you can enter but not obviously leave is a trap, and map view
    // takes away the gesture (turning the block) that would normally get you
    // out of it.
    this.mapChip = el('button', {
      class: 'map-chip hidden', type: 'button',
      title: 'Leave map view', 'aria-label': 'Leave map view',
      onclick: () => this.setMapView(false),
    }, [el('span', { text: 'Map view' }), el('span', { class: 'chip-x', text: '×' })]);
    // Blocks are dimensionless without a stated size, and students need one
    // to read thicknesses off the section.
    this.scaleChip = el('div', { class: 'scale-chip' });

    this.tabBar = el('nav', { class: 'tabbar' });
    this.sheetBody = el('div', { class: 'sheet-body' });
    this.handle = el('button', { class: 'sheet-handle', 'aria-label': 'Resize panel' });
    this.sheet = el('section', { class: 'sheet half' }, [this.handle, this.tabBar, this.sheetBody]);

    // The block and everything pinned over it. Kept as its own box so that the
    // stage can put the stereonet beside it without the compass and the chips
    // drifting off to hover over the net instead.
    this.blockPane = el('div', { class: 'block-pane' }, [
      this.canvas,
      el('div', { class: 'hud hud-left' }, [this.undoBtn, this.redoBtn, this.mapChip]),
      el('div', { class: 'hud hud-right' }, [this.compass.node]),
      this.scaleChip,
      this.markerChip,
      this.modeBanner,
      this.readout,
    ]);
    this.modeSwitch = el('div', { class: 'mode-switch', role: 'tablist' });
    this.stage = el('div', { class: 'stage' }, [this.blockPane, this.modeSwitch]);

    this.root.append(this.stage, this.sheet);

    this._bindSheet();
    this._renderModeSwitch();
  }

  _renderModeSwitch() {
    clear(this.modeSwitch);
    for (const [id, label] of [['block', 'Block'], ['map', 'Map']]) {
      this.modeSwitch.appendChild(el('button', {
        class: `mode-btn ${this.mode === id ? 'on' : ''}`, type: 'button',
        'aria-selected': this.mode === id ? 'true' : 'false',
        onclick: () => this.setMode(id),
      }, [el('span', { text: label })]));
    }
  }

  /**
   * Move between the block diagram and the field map.
   *
   * The two share the sheet and the tab bar and nothing else. Leaving one
   * shuts down what it was running — the map's GPS and compass are the whole
   * battery budget, and there is no reason to hold them open while somebody
   * is dragging a fold.
   */
  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    saveMode(mode);

    if (mode === 'map' && !this.mapSection) {
      this.mapSection = new MapSection(this);
      this.stage.insertBefore(this.mapSection.pane, this.modeSwitch);
    }
    this.root.classList.toggle('mode-map', mode === 'map');

    if (mode === 'map') {
      if (this.markerMode) this.setMarkerMode(null);
      this.mapSection.activate();
    } else {
      this.mapSection?.deactivate();
    }

    this._renderModeSwitch();
    this._renderTabs();
    requestAnimationFrame(() => {
      if (mode === 'block') { this.scene.resize(); this.scene.frame(this.store.doc); }
      else this.mapSection.resize();
    });
  }

  /** The panel the map section currently has on screen, if it is showing. */
  get sectionPanel() { return this.mode === 'map' ? this.panels.map : null; }

  /** Asked for by the map section when its own state changes shape. */
  renderSectionPanel() { if (this.mode === 'map') this._renderPanel(); }

  _tabSet() { return this.mode === 'map' ? this.mapSection.tabs : TABS; }

  _activeTabId() {
    return this.mode === 'map' ? this.mapSection.activeTab : this.activeTab;
  }

  _renderTabs() {
    clear(this.tabBar);
    const active = this._activeTabId();
    for (const t of this._tabSet()) {
      const b = el('button', {
        class: `tab ${t.id === active ? 'active' : ''}`, type: 'button',
        onclick: () => this.setTab(t.id),
      }, [
        el('span', { class: 'tab-icon' }, [tabIcon(t.id)]),
        el('span', { class: 'tab-label', text: t.label }),
      ]);
      this.tabBar.appendChild(b);
    }
    this._renderPanel();
  }

  _renderPanel() {
    clear(this.sheetBody);
    if (this.mode === 'map') {
      const panel = this.mapSection.buildPanel(this.mapSection.activeTab);
      this.panels.map = panel;
      this.sheetBody.appendChild(panel);
      return;
    }
    const t = TABS.find((x) => x.id === this.activeTab);
    const panel = t.build(this.ctx);
    this.panels[this.activeTab] = panel;
    this.sheetBody.appendChild(panel);
  }

  setTab(id) {
    if (this.mode === 'map') {
      if (this.mapSection.activeTab === id && this.sheetState === 'peek') { this._setSheet('half'); return; }
      this.mapSection.activeTab = id;
      if (this.sheetState === 'peek') this._setSheet('half');
      this._renderTabs();
      return;
    }
    if (this.activeTab === id && this.sheetState === 'peek') { this._setSheet('half'); return; }
    // Walking away from the Field tab disarms placement: a student who has
    // moved on should not find taps still dropping readings.
    if (id !== 'field' && this.markerMode) this.setMarkerMode(null);
    this.activeTab = id;
    if (this.sheetState === 'peek') this._setSheet('half');
    this._renderTabs();
  }

  selectEvent(id, tab) {
    this.selectedEventId = id;
    if (tab && this.activeTab !== tab) { this.activeTab = tab; this._renderTabs(); }
    else this._renderPanel();
    this._syncHelper();
  }

  // -------------------------------------------------------------------------

  _onChange(doc, info) {
    this._history = null;
    this._readings = null;
    this._fit = null;
    this._mapFit = null;
    // A deleted marker must not stay selected, or the chip outlives it.
    if (this.selectedMarkerId && !(doc.markers || []).some((m) => m.id === this.selectedMarkerId)) {
      this.selectedMarkerId = null;
    }
    const net = doc.settings.showNet === true;
    if (net !== this._showNet) {
      this._showNet = net;
      this.net.setVisible(net);
      // Half the block pane just appeared or vanished, so the camera's aspect
      // and the framing are both stale. Wait a frame for the layout to settle.
      requestAnimationFrame(() => {
        this.scene.resize();
        this.scene.frame(this.store.doc);
      });
    }

    const map = doc.settings.mapView === true;
    if (map !== this._mapView) {
      this._mapView = map;
      this.scene.setMapView(map);
      this.mapChip.classList.toggle('hidden', !map);
    }
    this.scene.syncDocument(doc);
    this.scene.syncMarkers(doc, this.readings(), this.selectedMarkerId);
    this._syncHelper();
    this._syncMarkerChip();
    this.net?.refresh();
    this.undoBtn.disabled = !this.store.canUndo;
    this.redoBtn.disabled = !this.store.canRedo;
    this.compass.node.style.display = doc.settings.showCompass ? '' : 'none';

    const b = doc.block;
    const w = Math.round(b.width - (b.cutE || 0));
    const d = Math.round(b.depth - (b.cutN || 0));
    const ex = doc.settings.exaggeration || 1;
    this.scaleChip.textContent =
      `${w} × ${d} × ${Math.round(b.height)} m${ex !== 1 ? `  ·  ${ex}× vertical` : ''}`;

    if (info.structural) this._renderPanel();
    // Dragging anything is not structural, but the numbers it moves are often
    // the point of the exercise. `refreshReadings` is the panels' agreed name
    // for "restate yourself without rebuilding under the finger"; panels that
    // have nothing to restate simply do not define it.
    else this.panels[this.activeTab]?.refreshReadings?.();
  }

  _syncAll(info) { this._onChange(this.store.doc, info); }

  _syncHelper() {
    const ev = this.store.doc.events.find((e) => e.id === this.selectedEventId);
    this.scene.showHelper(this.store.doc, ev || null);
  }

  applyPreset(preset) {
    const doc = JSON.parse(JSON.stringify(this.store.doc));
    doc.events = preset.build();
    doc.name = preset.label;
    this.selectedEventId = null;
    this.store.replace(doc);
    this.activeTab = 'history';
    this._renderTabs();
  }

  // -------------------------------------------------------------------------
  // Strike and dip markers
  // -------------------------------------------------------------------------

  /** The compiled history, rebuilt at most once per document change. */
  history() {
    if (!this._history) this._history = compileHistory(this.store.doc);
    return this._history;
  }

  /** Where every marker sits and what it reads, cached the same way. */
  readings() {
    if (!this._readings) this._readings = readMarkers(this.store.doc, this.history());
    return this._readings;
  }

  setMarkerMode(mode) {
    this.markerMode = mode;
    this.modeBanner.classList.toggle('hidden', mode !== 'add');
    if (mode === 'add') {
      clear(this.modeBanner);
      this.modeBanner.append(
        el('span', { text: 'Tap the block to leave a strike & dip' }),
        el('button', {
          class: 'banner-done', type: 'button', text: 'Done',
          onclick: () => this.setMarkerMode(null),
        }),
      );
      this.readout.classList.add('hidden');
    }
    if (this.activeTab === 'field') this._renderPanel();
  }

  /**
   * Flip between the block and the plan view. It is a document setting so it
   * survives a reload, and so one code path drives the camera, the symbols and
   * the button state.
   */
  setMapView(on) {
    if (this.store.doc.settings.mapView === on) return;
    this.store.edit((d) => { d.settings.mapView = on; }, { structural: true });
    this.scene.frame(this.store.doc);
  }

  selectMarker(id) {
    this.selectedMarkerId = id;
    this.scene.syncMarkers(this.store.doc, this.readings(), id);
    this._syncMarkerChip();
    this.net?.refresh();
    if (this.activeTab === 'field') this.panels.field?.refreshReadings?.();
  }

  /**
   * Bedding read on a grid across the whole block, fitted the same way the
   * student's readings are. This is the answer their scatter is converging
   * on, and it is derived from the geometry rather than read off the fold
   * event — so it stays right however the block was built or deformed since.
   */
  /**
   * The girdle fit over the student's own readings. Cached beside them so the
   * net and the Field panel are always quoting the same numbers, and so
   * dragging a marker refits once rather than twice a frame.
   */
  fit() {
    if (!this._fit) this._fit = fitBedding(this.readings().filter((r) => r.dip != null));
    return this._fit;
  }

  mapFit() {
    if (!this._mapFit) {
      const doc = this.store.doc;
      this._mapFit = fitBedding(beddingGrid(this.history(), doc.topo, footprint(doc.block), 14));
    }
    return this._mapFit;
  }

  /**
   * Show or hide the stereonet pane. A document setting rather than a mode,
   * because it is a second view of the same block and it should still be there
   * when the student comes back to the file.
   */
  setNet(on) {
    if (this.store.doc.settings.showNet === on) return;
    this.store.edit((d) => { d.settings.showNet = on; }, { structural: true });
  }

  addMarkerAt(clientX, clientY) {
    const at = this.scene.pickSurface(clientX, clientY, this.store.doc);
    if (!at) return;
    const marker = makeMarker(at[0], at[1]);
    this.selectedMarkerId = marker.id;
    this.store.edit((d) => { (d.markers = d.markers || []).push(marker); }, { structural: true });
  }

  /**
   * Claim a one-finger gesture that starts on a marker. Returning false hands
   * it straight back to the orbit controls, so anywhere else on the block
   * still turns the model.
   */
  grabMarker(clientX, clientY) {
    if (this.store.doc.settings.showMarkers === false) return false;
    if (this.markerMode === 'add') return false;
    const id = this.scene.pickMarker(clientX, clientY);
    if (!id) return false;
    this.store.breakCoalesce();
    this.selectMarker(id);
    this.readout.classList.add('hidden');
    return true;
  }

  dragMarker(clientX, clientY) {
    const id = this.selectedMarkerId;
    if (!id) return;
    const at = this.scene.pickSurface(clientX, clientY, this.store.doc);
    // Off the block entirely: leave the marker where it was rather than
    // flinging it to whichever edge the ray happened to pass.
    if (!at) return;
    this.store.edit((d) => {
      const m = (d.markers || []).find((k) => k.id === id);
      if (m) { m.x = at[0]; m.y = at[1]; }
    }, { coalesce: `marker:${id}` });
  }

  endMarkerDrag() {
    this.store.breakCoalesce();
  }

  _syncMarkerChip() {
    const r = this.readings().find((k) => k.id === this.selectedMarkerId);
    this.markerChip.classList.toggle('hidden', !r);
    if (!r) return;
    clear(this.markerChip);
    this.markerChip.append(
      el('strong', { text: formatReading(r) }),
      el('span', { text: ` · ${chipDetail(r)}` }),
      el('button', {
        class: 'chip-close', type: 'button', text: '×', 'aria-label': 'Deselect',
        onclick: () => this.selectMarker(null),
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Identify tool
  // -------------------------------------------------------------------------

  /** A tap either drops a reading or asks what the rock is. */
  onTap(clientX, clientY) {
    if (this.markerMode === 'add') { this.addMarkerAt(clientX, clientY); return; }
    if (this.selectedMarkerId) this.selectMarker(null);
    this.identify(clientX, clientY);
  }

  identify(clientX, clientY) {
    const hit = this.scene.pick(clientX, clientY);
    if (!hit) { this.readout.classList.add('hidden'); return; }

    const info = describeAt(this.history(), hit.point);
    const bed = beddingAt(this.history(), hit.point);
    const r = rock(info.rockId);

    clear(this.readout);
    this.readout.classList.remove('hidden');
    this.readout.append(
      swatchEl(r.color, r.pattern, 'swatch small'),
      el('div', { class: 'readout-text' }, [
        el('div', { class: 'readout-name', text: info.label }),
        el('div', { class: 'readout-sub', text: info.detail }),
        bed
          ? el('div', { class: 'readout-orient' }, [
            el('strong', { text: `${pad3(bed.strike)}/${Math.round(bed.dip)}` }),
            el('span', { text: ` ${quadrantBearing(bed.strike)} · dip ${Math.round(bed.dip)}°` }),
          ])
          : el('div', { class: 'readout-orient dim', text: 'no bedding here' }),
        el('div', { class: 'readout-xyz', text: `${Math.round(hit.point[0])} E, ${Math.round(hit.point[1])} N, ${Math.round(hit.point[2])} m` }),
      ]),
      el('button', {
        class: 'readout-close', text: '×', 'aria-label': 'Close',
        onclick: () => this.readout.classList.add('hidden'),
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Files
  // -------------------------------------------------------------------------

  exportFile() {
    const blob = new Blob([exportJSON(this.store.doc)], { type: 'application/json' });
    downloadBlob(blob, `${slug(this.store.doc.name)}.block.json`);
  }

  importFile() {
    const input = el('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const doc = importJSON(await file.text());
        this.selectedEventId = null;
        this.store.replace(doc);
        this.scene.frame(doc);
      } catch (err) {
        alert(`Could not open that file.\n${err.message}`);
      }
    });
    input.click();
  }

  exportImage() {
    // The drawing buffer is not preserved between frames, so draw and grab
    // the pixels in the same turn of the event loop.
    this.scene.renderer.render(this.scene.scene, this.scene.camera);
    this.scene.renderer.domElement.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${slug(this.store.doc.name)}.png`);
    }, 'image/png');
  }

  // -------------------------------------------------------------------------

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const store = this.mode === 'map' && this.mapSection ? this.mapSection.store : this.store;
        if (e.shiftKey) store.redo(); else store.undo();
      }
    });
  }

  /**
   * The divider between the block and the stereonet, when they are stacked.
   *
   * A phone has no room to show both properly, so instead of picking a split
   * for the student, let them slide it: all block while they place readings,
   * all net while they read one off it, and anywhere between while they drag a
   * fold and watch both. Tapping cycles the same three, the way the bottom
   * sheet's handle does, because a pill you can drag is a pill you will tap.
   *
   * The split is written to a custom property rather than to the pane's own
   * style, so the side-by-side rule can go on overriding it from the
   * stylesheet when the screen is turned.
   */
  _bindNetGrip() {
    const grip = this.net.grip;
    const STOPS = [30, 58, 100];
    let dragging = false;
    let moved = 0;
    let startY = 0;
    let startPct = 0;

    const current = () => (this.net.clientHeight / (this.stage.clientHeight || 1)) * 100;
    // Never below a readable net; up to the whole stage, where the block goes
    // away entirely and the grip is what brings it back.
    const apply = (v) => {
      this.stage.style.setProperty('--net-split', `${Math.min(100, Math.max(22, v))}%`);
    };

    grip.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = 0;
      startY = e.clientY;
      startPct = current();
      grip.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    grip.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      moved = Math.max(moved, Math.abs(e.clientY - startY));
      apply(startPct + ((startY - e.clientY) / (this.stage.clientHeight || 1)) * 100);
    });
    const end = () => { dragging = false; };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);

    grip.addEventListener('click', () => {
      // A drag ends in a click too; only a real tap should cycle.
      if (moved > 6) { moved = 0; return; }
      const now = current();
      apply(STOPS.find((v) => v > now + 2) ?? STOPS[0]);
    });
  }

  /** Bottom-sheet drag between its three heights. */
  _bindSheet() {
    let startY = 0;
    let startState = this.sheetState;
    let dragging = false;

    const order = ['peek', 'half', 'full'];
    const onDown = (e) => {
      dragging = true; startY = e.clientY; startState = this.sheetState;
      this.handle.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      const i = order.indexOf(startState);
      if (dy < -60 && i < order.length - 1) { this._setSheet(order[i + 1]); dragging = false; }
      if (dy > 60 && i > 0) { this._setSheet(order[i - 1]); dragging = false; }
    };
    const onUp = () => { dragging = false; };

    this.handle.addEventListener('pointerdown', onDown);
    this.handle.addEventListener('pointermove', onMove);
    this.handle.addEventListener('pointerup', onUp);
    this.handle.addEventListener('click', () => {
      this._setSheet(this.sheetState === 'peek' ? 'half' : this.sheetState === 'half' ? 'full' : 'peek');
    });
  }

  _setSheet(state) {
    this.sheetState = state;
    this.sheet.className = `sheet ${state}`;
    requestAnimationFrame(() => this.scene.resize());
  }

  _loop() {
    const tick = () => {
      // Nothing to draw when the block is not the thing on screen — neither
      // with the stereonet pulled up over the whole stage, nor over in the
      // map section.
      if (this.mode === 'block' && this.canvas.clientHeight > 1) {
        this.scene.render();
        this.compass.update(this.scene.controls.azimuth, this.scene.controls.elevation);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

// ---------------------------------------------------------------------------

// Which section was last open. Kept out of both documents: it is a fact about
// this phone, not about the block or the field notes, and a shared file should
// not decide which screen somebody else opens on.
const MODE_KEY = 'blockdiagram.mode';

function loadMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'map' ? 'map' : 'block';
  } catch { return 'block'; }
}

function saveMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* private browsing */ }
}

function iconBtn(glyph, label, onClick) {
  return el('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick: onClick }, [
    el('span', { text: glyph }),
  ]);
}

/** Small rose that spins with the camera so north is never in doubt. */
function compassRose() {
  const node = svg('svg', { viewBox: '0 0 64 64', class: 'compass' });
  node.appendChild(svg('circle', { cx: 32, cy: 32, r: 29, class: 'compass-face' }));
  const dial = svg('g', {});
  dial.appendChild(svg('text', { x: 32, y: 13, 'text-anchor': 'middle', class: 'compass-n', text: 'N' }));
  dial.appendChild(svg('path', { d: 'M32 16 L38 33 L32 28 L26 33 Z', class: 'needle-n' }));
  dial.appendChild(svg('path', { d: 'M32 55 L26 33 L32 38 L38 33 Z', class: 'needle-s' }));
  node.appendChild(dial);

  return {
    node,
    update(azimuth) {
      // Camera azimuth is the direction we look from, so the rose counter-rotates.
      dial.setAttribute('transform', `rotate(${-azimuth} 32 32)`);
    },
  };
}

/** What to say beside the numbers: a bearing only when there is one to give. */
function chipDetail(r) {
  if (r.dip == null) return 'no bedding beneath';
  if (r.dip < FLAT_DIP) return 'flat-lying beds';
  if (r.dip > VERTICAL_DIP) return `${quadrantBearing(r.strike)} · beds on end`;
  return `${quadrantBearing(r.strike)} · dip ${Math.round(r.dip)}°`;
}

function pad3(v) { return String(Math.round(v)).padStart(3, '0'); }

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'block';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
