// Application shell: layout, tabs, the identify tool, and file handling.

import { el, svg, clear } from './widgets.js';
import { swatchEl } from './swatch.js';
import { tabIcon, expandIcon, collapseIcon, lockMark } from './icons.js';
import { layersPanel, historyPanel, terrainPanel, viewPanel, fieldPanel,
  coursePanel } from './panels.js';
import { unlocked } from '../unlock.js';
import { stereonet } from './stereonet.js';
import { groundMapPane, GroundMap } from './groundMap.js';
import { crossSectionPane } from './crossSection.js';
import { MapSection } from './map/section.js';
import { StratSection } from './strat/section.js';
import { BlockScene } from '../render/scene.js';
import { Store, loadSaved, exportJSON, importJSON } from '../store.js';
import { defaultDocument, rock, makeMarker, sliceStops, atTime, timeSpan,
  timeStep } from '../geo/model.js';
import { compileHistory, describeAt, beddingAt, beddingGrid } from '../geo/unmake.js';
import { readMarkers, formatReading, FLAT_DIP, VERTICAL_DIP } from '../render/markers.js';
import { footprint } from '../render/block.js';
import { surfaceRange } from '../geo/surfaces.js';
import { fitBedding } from '../geo/stereonet.js';
import { quadrantBearing } from '../geo/math.js';

const TABS = [
  { id: 'layers', label: 'Layers', build: layersPanel },
  { id: 'history', label: 'History', build: historyPanel },
  { id: 'terrain', label: 'Terrain', build: terrainPanel },
  { id: 'field', label: 'Field', build: fieldPanel },
  { id: 'view', label: 'View', build: viewPanel },
  // The course tab. Everything a student has to do before walking away from a
  // connection lives here, and so do the stage passwords — see js/unlock.js,
  // which is written to be deleted when this stops being a class.
  { id: 'course', label: 'EPS 105', build: coursePanel },
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
    // The column is the map's third view of the same field project — its units
    // ARE the map's units — so it borrows that section's store rather than
    // opening a second one over the same database.
    this.stratSection = null;
    this.sheetState = 'half';   // 'peek' | 'half' | 'full'
    this.blockFull = false;     // block over the whole screen, panel hidden
    this.stratFull = false;     // the section over the whole screen
    this._history = null;
    this._readings = null;
    this._fit = null;
    this._mapFit = null;
    this._surveyFit = null;
    this._mapView = null;   // null so the first sync always applies the setting
    this._showNet = null;
    this._showGround = null;
    this._showSection = null;
    this._viewDoc = null;
    this._playing = null;       // the time machine's timer, when it is running

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
      setGroundMap: (on) => this.setGroundMap(on),
      groundOpen: () => this.store.doc.settings.showGroundMap === true,
      groundAvailable: () => GroundMap.available(this.store.doc),
      setSection: (on) => this.setSection(on),
      sectionOpen: () => this.store.doc.settings.showSection === true,
      setSectionLine: (ln, dragging) => this.setSectionLine(ln, dragging),
      setSectionVE: (v) => this.setSectionVE(v),
      endSectionDrag: () => this.store.breakCoalesce(),
      setSlice: (on) => this.setSlice(on),
      sliceOpen: () => this.store.doc.settings.sliceOn === true,
      history: () => this.history(),
      // The document as the time slider has it. Anything that DRAWS geology
      // asks for this; anything that EDITS the block goes on using store.doc,
      // which is the one that actually exists.
      doc: () => this.viewDoc(),
      timeStep: () => timeStep(this.store.doc),
      timeSpan: () => timeSpan(this.store.doc),
      setTimeStep: (t, dragging) => this.setTimeStep(t, dragging),
      playing: () => this._playing != null,
      togglePlay: () => this.togglePlay(),
      stopPlayIfRunning: () => this.stopPlay(),
      fit: () => this.fit(),
      mapFit: () => this.mapFit(),
      surveyFit: () => this.surveyFit(),
    };

    // Built after ctx, because it reads the readings and the selection through
    // it, and dropped into the stage so it covers the block but never the
    // sheet — on a wide screen the panel stays usable beside it.
    this.net = stereonet(this.ctx);
    this.ground = groundMapPane(this.ctx);
    this.xsec = crossSectionPane(this.ctx);
    this.stage.appendChild(this.net);
    this.stage.appendChild(this.ground);
    this.stage.appendChild(this.xsec);
    this._bindNetGrip();
    this._bindSlice();

    this.panels = {};
    this._renderTabs();
    this._syncAll({ structural: true });

    this.store.subscribe((doc, info) => this._onChange(doc, info));
    window.addEventListener('resize', () => {
      this.scene.resize();
      this.mapSection?.resize();
      // The section redraws rather than merely reflowing: how many of its
      // columns fit is a decision taken at draw time from the width it has.
      if (this.mode === 'strata') this.stratSection?.resize();
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

    const last = loadMode();
    // A stage can be taken back, and a saved mode outlives it.
    if (last !== 'block') this.setMode(last);
  }

  // -------------------------------------------------------------------------

  _buildDOM() {
    clear(this.root);

    this.canvas = el('canvas', { class: 'viewport', id: 'viewport' });

    this.undoBtn = iconBtn('↶', 'Undo', () => this.store.undo());
    this.redoBtn = iconBtn('↷', 'Redo', () => this.store.redo());

    // Same control the map half has, for the same reason: on a phone the block
    // and the panel do not both fit, and turning a block is the one thing here
    // that needs room. Doubly so with a companion pane open, where the block is
    // sharing what is left of the stage with the net or the ground map.
    this.fullBtn = iconBtn(expandIcon(), 'Full screen block', () => this.setBlockFull());
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
    // Same idea as the map chip, for the same reason: a block wound back to
    // before its own faults looks like a block somebody has broken, and the
    // gesture that would undo it is not one anybody would guess.
    this.timeChip = el('button', {
      class: 'time-chip hidden', type: 'button', 'aria-label': 'Return to the present',
      onclick: () => this.setTimeStep(null),
    });
    // Blocks are dimensionless without a stated size, and students need one
    // to read thicknesses off the section.
    this.scaleChip = el('div', { class: 'scale-chip' });
    this.sliceBar = this._buildSliceBar();

    this.tabBar = el('nav', { class: 'tabbar' });
    this.sheetBody = el('div', { class: 'sheet-body' });
    this.handle = el('button', { class: 'sheet-handle', 'aria-label': 'Resize panel' });
    this.sheet = el('section', { class: 'sheet half' }, [this.handle, this.tabBar, this.sheetBody]);

    // The block and everything pinned over it. Kept as its own box so that the
    // stage can put the stereonet beside it without the compass and the chips
    // drifting off to hover over the net instead.
    this.blockPane = el('div', { class: 'block-pane' }, [
      this.canvas,
      el('div', { class: 'hud hud-left' }, [this.undoBtn, this.redoBtn, this.mapChip, this.timeChip]),
      el('div', { class: 'hud hud-right' }, [this.fullBtn, this.compass.node]),
      this.scaleChip,
      this.markerChip,
      this.modeBanner,
      this.readout,
      this.sliceBar,
    ]);
    this.modeSwitch = el('div', { class: 'mode-switch', role: 'tablist' });
    this.stage = el('div', { class: 'stage' }, [this.blockPane, this.modeSwitch]);

    this.root.append(this.stage, this.sheet);

    this._bindSheet();
    this._renderModeSwitch();
  }

  /**
   * The slicer's own control, over the block rather than in the panel.
   *
   * It has to be here. The whole of what the slider does is on the block, and
   * a slider in the bottom sheet on a phone is a slider you cannot watch while
   * you drag it — you would be moving a number under a picture that is off
   * screen. So it sits at the foot of the stage, with the elevation it is at
   * and the contact it has landed on written beside it.
   */
  _buildSliceBar() {
    // Borrows the panel slider's styling, `--p` fill and all, so the one
    // control on the stage is not the one control that looks different.
    this.sliceRange = el('input', {
      class: 'range slice-range', type: 'range', min: 0, max: 1, step: 1,
      'aria-label': 'Slice elevation',
    });
    this.sliceRead = el('div', { class: 'slice-read' });
    this.sliceTicks = el('div', { class: 'slice-ticks' });
    return el('div', { class: 'slice-bar hidden' }, [
      el('div', { class: 'slice-top' }, [
        this.sliceRead,
        el('button', {
          class: 'slice-close', type: 'button', text: '×',
          'aria-label': 'Put the block back together',
          onclick: () => this.setSlice(false),
        }),
      ]),
      el('div', { class: 'slice-row' }, [
        el('button', {
          class: 'slice-step', type: 'button', text: '▼',
          title: 'Down to the next contact', 'aria-label': 'Down to the next contact',
          onclick: () => this.stepSlice(-1),
        }),
        el('div', { class: 'slice-track' }, [this.sliceRange, this.sliceTicks]),
        el('button', {
          class: 'slice-step', type: 'button', text: '▲',
          title: 'Up to the next contact', 'aria-label': 'Up to the next contact',
          onclick: () => this.stepSlice(1),
        }),
      ]),
    ]);
  }

  _renderModeSwitch() {
    clear(this.modeSwitch);
    for (const [id, label] of [['block', 'Block'], ['map', 'Map'], ['strata', 'Strata']]) {
      const locked = this._modeLocked(id);
      // Shown locked rather than hidden. A missing Map button reads as an app
      // that cannot do it; a locked one says there is more, and where the key
      // is — which is the difference between a student waiting and a student
      // asking whether the app is broken.
      this.modeSwitch.appendChild(el('button', {
        class: `mode-btn ${this.mode === id ? 'on' : ''} ${locked ? 'locked' : ''}`,
        type: 'button',
        'aria-selected': this.mode === id ? 'true' : 'false',
        title: locked ? 'Locked until your instructor gives you the password' : '',
        onclick: () => (locked ? this._sendToCourseTab() : this.setMode(id)),
      }, [el('span', { text: label }), locked ? lockMark() : null]));
    }
  }

  /** Map and Strata are one stage; the block is always open. */
  _modeLocked(mode) {
    return (mode === 'map' || mode === 'strata') && !unlocked('field');
  }

  /** Tapping a locked mode should land somewhere useful, not do nothing. */
  _sendToCourseTab() {
    if (this.mode !== 'block') this.setMode('block');
    this.activeTab = 'course';
    this._renderTabs();
    this._renderPanel();
    if (this.sheetState === 'peek') this._setSheet('half');
  }

  /**
   * Move between the block diagram and the field map.
   *
   * The two share the sheet and the tab bar and nothing else. Leaving one
   * shuts down what it was running — the map's GPS and compass are the whole
   * battery budget, and there is no reason to hold them open while somebody
   * is dragging a fold.
   */
  /**
   * Take a block cut from a field area and make it the block on screen.
   *
   * Goes through the store's own replace, so it lands on the undo stack: a
   * student who builds a block over the one they were working on has to be
   * able to take that back, and "I lost an hour's work to a button" is exactly
   * the thing an undo stack exists to prevent.
   */
  adoptBlock(doc) {
    this.store.replace(doc, true);
    this.setMapView(false);
    this.activeTab = 'history';
    this.setMode('block');
    this._renderTabs();
    this._renderPanel();
    requestAnimationFrame(() => {
      this.scene.resize();
      this.scene.frame(this.store.doc);
    });
  }

  /**
   * The map beside the block, and the net beside the block, are the same slot.
   * Three panes is not a layout a phone has room for, so opening one closes
   * the other rather than splitting the stage three ways.
   */
  setGroundMap(on) {
    if (this.store.doc.settings.showGroundMap === on) return;
    this.store.edit((d) => {
      d.settings.showGroundMap = on;
      if (on) { d.settings.showNet = false; d.settings.showSection = false; }
    }, { structural: true });
    if (on) this._makeRoomForPane();
  }

  /**
   * Opening a second view of the block on a phone.
   *
   * Stacked, the stage is already sharing itself between the block and the new
   * pane; leaving the panel over half of what is left gives each of them about
   * a quarter of the screen and makes the thing that was just asked for the
   * smallest object on it. So the sheet drops to its handle — still there,
   * still draggable, and one tap from coming back.
   *
   * Only when stacked. Side by side the panes have their own column and the
   * panel is not competing with them for anything.
   */
  _makeRoomForPane() {
    if (this.stacked() && this.sheetState !== 'peek') this._setSheet('peek');
  }

  /** True when the block and its companion pane are stacked rather than side
      by side — the same 4/3 threshold the stylesheet splits on. */
  stacked() {
    return !window.matchMedia('(min-aspect-ratio: 4/3)').matches;
  }

  /**
   * The map section, built on first use.
   *
   * Two sections need it now, and only one of them is the map: the column is
   * a view of the same field project and reads the same store. Constructing it
   * starts nothing — the GPS and the compass are opened by `activate`, not by
   * the constructor — so a student who only ever opens the Strata tab does not
   * pay for a map they never looked at.
   */
  fieldSection() {
    if (!this.mapSection) {
      this.mapSection = new MapSection(this);
      this.stage.insertBefore(this.mapSection.pane, this.modeSwitch);
    }
    return this.mapSection;
  }

  setMode(mode) {
    if (this.mode === mode) return;
    // Nothing left running behind a screen nobody is looking at.
    this.stopPlay();
    // Also the guard for a mode restored from last session: a phone that was
    // left in Map and then relocked must not come back up in it.
    if (this._modeLocked(mode)) return;
    this.mode = mode;
    saveMode(mode);

    if (mode === 'map' || mode === 'strata') this.fieldSection();
    if (mode === 'strata' && !this.stratSection) {
      this.stratSection = new StratSection(this, this.mapSection);
      this.stage.insertBefore(this.stratSection.pane, this.modeSwitch);
    }
    this.root.classList.toggle('mode-map', mode === 'map');
    this.root.classList.toggle('mode-strata', mode === 'strata');

    if (mode === 'map') {
      if (this.markerMode) this.setMarkerMode(null);
      this.mapSection.activate();
    } else {
      this.mapSection?.deactivate();
    }
    if (mode === 'strata') this.stratSection.activate();
    else this.stratSection?.deactivate();

    this._renderModeSwitch();
    this._renderTabs();
    requestAnimationFrame(() => {
      if (mode === 'block') { this.scene.resize(); this.scene.frame(this.store.doc); }
      else if (mode === 'map') this.mapSection.resize();
      else this.stratSection.resize();
    });
  }

  /** The section over the whole screen, panel down to its handle. */
  setStratFull(on) {
    this.stratFull = on;
    this.root.classList.toggle('strat-full', on);
    this._setSheet(on ? 'peek' : 'half');
  }

  /** The section, map or strata, that currently owns the sheet. */
  get section() {
    if (this.mode === 'map') return this.mapSection;
    if (this.mode === 'strata') return this.stratSection;
    return null;
  }

  /** The panel that section currently has on screen, if it is showing. */
  get sectionPanel() { return this.section ? this.panels[this.mode] : null; }

  /** Asked for by a section when its own state changes shape. */
  renderSectionPanel() { if (this.section) this._renderPanel(); }

  /**
   * The field document has been opened, or swapped for another project's.
   *
   * Two sections read it and both have to be told. The column in particular
   * cannot wait for its own panel to be rebuilt: the drawing is in the stage,
   * not in the sheet, and it is drawn from a document that arrives a moment
   * after the section does.
   */
  fieldOpened() {
    this.stratSection?.refresh();
    this.renderSectionPanel();
  }

  /**
   * Restate the numbers in whatever panel is on screen.
   *
   * The map section used to be able to assume its own panel was the one
   * showing. It cannot any more: a pack installs from the block's course tab,
   * with the map section built but not visible.
   */
  touchPanel() {
    if (this.section) this.sectionPanel?.refreshReadings?.();
    else this.panels[this.activeTab]?.refreshReadings?.();
  }

  /**
   * A stage has just been unlocked.
   *
   * Three separate things read the gate — the mode switch, the map section's
   * tab list, and this panel — so all of it is redrawn rather than trying to
   * work out which of them the new stage touched.
   */
  courseUnlockChanged() {
    this._renderModeSwitch();
    this._renderTabs();
    this._renderPanel();
  }

  /** Rebuild whatever panel is on screen, for changes that alter controls. */
  rebuildPanel() {
    if (this.section) this.renderSectionPanel();
    else this._renderPanel();
  }

  _tabSet() { return this.section ? this.section.tabs : TABS; }

  _activeTabId() {
    return this.section ? this.section.activeTab : this.activeTab;
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
    const section = this.section;
    if (section) {
      const panel = section.buildPanel(section.activeTab);
      this.panels[this.mode] = panel;
      this.sheetBody.appendChild(panel);
      return;
    }
    const t = TABS.find((x) => x.id === this.activeTab);
    const panel = t.build(this.ctx);
    this.panels[this.activeTab] = panel;
    this.sheetBody.appendChild(panel);
  }

  setTab(id) {
    const section = this.section;
    if (section) {
      if (section.activeTab === id && this.sheetState === 'peek') { this._setSheet('half'); return; }
      section.activeTab = id;
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
    this._viewDoc = null;
    this._history = null;
    this._readings = null;
    this._fit = null;
    this._mapFit = null;
    this._surveyFit = null;
    // A deleted marker must not stay selected, or the chip outlives it.
    if (this.selectedMarkerId && !(doc.markers || []).some((m) => m.id === this.selectedMarkerId)) {
      this.selectedMarkerId = null;
    }
    // A block cut from an invented landform has no ground map to show, so the
    // pane closes itself rather than sitting there empty.
    const ground = doc.settings.showGroundMap === true && GroundMap.available(doc);
    if (ground !== this._showGround) {
      this._showGround = ground;
      this.ground.setVisible(ground);
      requestAnimationFrame(() => {
        this.scene.resize();
        this.scene.frame(this.store.doc);
      });
    }
    if (ground) this.ground.refresh();

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

    const xs = doc.settings.showSection === true;
    if (xs !== this._showSection) {
      this._showSection = xs;
      this.xsec.setVisible(xs);
      requestAnimationFrame(() => {
        this.scene.resize();
        this.scene.frame(this.store.doc);
      });
    } else if (xs) {
      // A structural change is a new history and deserves the full raster; a
      // slider being dragged is forty of them a second and gets the coarse one,
      // which the pane upgrades once the dragging stops.
      this.xsec.refresh(!info.structural);
    }
    this._syncSliceBar(doc);
    this._syncTimeChip(doc);

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
    // Drawn from the view rather than the document, and only for an event that
    // has happened yet. A fault plane hanging in a block whose fault has been
    // wound out of existence is a guide to nothing.
    const view = this.viewDoc();
    const ev = view.events.find((e) => e.id === this.selectedEventId);
    this.scene.showHelper(view, ev || null);
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

  /**
   * The document as the time slider has it, rebuilt at most once per change.
   *
   * At the present this IS store.doc — atTime hands back the object it was
   * given — so nothing pays for the time machine while nobody is using it.
   */
  viewDoc() {
    if (!this._viewDoc) this._viewDoc = atTime(this.store.doc);
    return this._viewDoc;
  }

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
   * The bedding somebody actually measured, when this block was cut out of a
   * mapped area.
   *
   * Everything else the stereonet plots is read out of the model. A marker
   * stores only where it stands and recovers its attitude from the geology
   * beneath it, which is exactly right when the block IS the ground — put a
   * marker on a fold you built and it tells you what that fold does there. It
   * is not right when the block was fitted to a notebook, because then the
   * poles on the net are the fit's own answer being read back to it, and they
   * will lie on a perfect girdle whatever the outcrop did.
   *
   * These are the readings themselves, carried onto the block by cutblock and
   * never touched by it. They are the only thing on the net that can disagree
   * with the block, so they are the reason there is a net at all.
   */
  surveyFit() {
    if (!this._surveyFit) {
      const st = (this.store.doc.survey && this.store.doc.survey.stations) || null;
      if (!st || !st.length) { this._surveyFit = { beds: [] }; }
      else {
        const beds = st
          .filter((s) => Number.isFinite(s.strike) && Number.isFinite(s.dip))
          .map((s, i) => ({ id: `survey:${s.id || i}`, strike: s.strike, dip: s.dip }));
        this._surveyFit = { beds, fit: beds.length >= 3 ? fitBedding(beds) : null };
      }
    }
    return this._surveyFit;
  }

  /**
   * Give the block the whole screen, or give the panel back.
   *
   * Transient rather than saved: which half of the screen you want right now
   * is a fact about what you are doing this minute, and a file that reopens
   * with its panel hidden looks broken. The map half stores its equivalent for
   * the same length of time and no longer.
   */
  setBlockFull(on = null) {
    const next = on == null ? !this.blockFull : on;
    if (next === this.blockFull) return;
    this.blockFull = next;
    this.root.classList.toggle('block-full', next);
    this._syncFullButton();
    // The stage just changed size and the canvas does not watch its own box.
    requestAnimationFrame(() => this.scene.resize());
  }

  _syncFullButton() {
    clear(this.fullBtn);
    this.fullBtn.appendChild(this.blockFull ? collapseIcon() : expandIcon());
    this.fullBtn.classList.toggle('on', this.blockFull);
    this.fullBtn.title = this.blockFull ? 'Show the panel' : 'Full screen block';
    this.fullBtn.setAttribute('aria-label', this.fullBtn.title);
  }

  /**
   * Show or hide the stereonet pane. A document setting rather than a mode,
   * because it is a second view of the same block and it should still be there
   * when the student comes back to the file.
   */
  setNet(on) {
    if (this.store.doc.settings.showNet === on) return;
    this.store.edit((d) => {
      d.settings.showNet = on;
      // One companion pane at a time — see setGroundMap.
      if (on) { d.settings.showGroundMap = false; d.settings.showSection = false; }
    }, { structural: true });
    if (on) this._makeRoomForPane();
  }

  /**
   * Show or hide the cross-section pane. The third occupant of the one slot
   * beside the block, on the same terms as the other two.
   */
  setSection(on) {
    if (this.store.doc.settings.showSection === on) return;
    this.store.edit((d) => {
      d.settings.showSection = on;
      if (on) { d.settings.showNet = false; d.settings.showGroundMap = false; }
    }, { structural: true });
    if (on) {
      this._makeRoomForPane();
      // A section needs a locator, a plot, a legend and a row of buttons, and
      // the net's default share of a stacked phone screen does not hold them.
      // Only a floor: a pane already pulled taller than this keeps its height.
      if (this.stacked()) this._atLeastPaneSplit(70);
    }
  }

  /** Give the companion pane at least this much of the stage, never less. */
  _atLeastPaneSplit(pct) {
    const now = (this.xsec.clientHeight / (this.stage.clientHeight || 1)) * 100;
    if (now < pct) this.stage.style.setProperty('--net-split', `${pct}%`);
  }

  /**
   * Move A–A′. Coalesced while a finger is on it, so dragging an endpoint
   * across the map leaves one undo step rather than one per pointer event.
   */
  setSectionLine(line, dragging = false) {
    this.store.edit((d) => {
      d.section = { ax: line.ax, ay: line.ay, bx: line.bx, by: line.by };
    }, { coalesce: dragging ? 'section:line' : null });
    // Nothing to redraw from here: the edit is not structural, so the panel is
    // not rebuilt under the finger, and the store's own change already brings
    // the pane back coarsely.
  }

  /**
   * Pin the section's vertical exaggeration, or 0 to let it fill the pane.
   *
   * Redrawn at full quality straight away rather than left to the pane's
   * settle timer: this is one deliberate tap on a control, not a slider being
   * dragged, and the coarse raster is not what it asked for.
   */
  setSectionVE(v) {
    this.store.edit((d) => { d.settings.sectionVE = v; });
    this.xsec.refresh(false);
  }

  // --- the time machine -----------------------------------------------------

  /**
   * Wind the block to the state it was in after `t` events. Null is the
   * present, and so is any number at or past the end of the history.
   */
  setTimeStep(t, dragging = false) {
    const n = timeSpan(this.store.doc);
    const v = t == null || t >= n ? null : Math.max(0, Math.min(n, Math.round(t)));
    if (this.store.doc.settings.timeStep === v) return;
    if (!dragging && this._playing && v == null) this.stopPlay();
    this.store.view((d) => { d.settings.timeStep = v; });
  }

  /**
   * Run the history forward, a step a beat, and stop at the present.
   *
   * The point of the slider is the sequence, and a student dragging it is
   * doing two things at once: working the control and watching the block.
   * Playing lets them only watch.
   */
  togglePlay() {
    if (this._playing) { this.stopPlay(); return; }
    const n = timeSpan(this.store.doc);
    if (!n) return;
    // Pressing play at the end means "show me that again" — nobody asks to
    // watch a film from its last frame.
    if (timeStep(this.store.doc) >= n) this.setTimeStep(0);
    this._playing = setInterval(() => {
      const at = timeStep(this.store.doc);
      if (at >= timeSpan(this.store.doc)) { this.stopPlay(); return; }
      this.setTimeStep(at + 1, true);
    }, 950);
    this.touchPanel();
  }

  stopPlay() {
    if (!this._playing) return;
    clearInterval(this._playing);
    this._playing = null;
    this.touchPanel();
  }

  /** The chip over the block, which is the only sign a rewound block gives. */
  _syncTimeChip(doc) {
    const n = timeSpan(doc);
    const at = timeStep(doc);
    const past = at < n;
    this.timeChip.classList.toggle('hidden', !past);
    if (!past) return;
    const on = doc.events.filter((e) => e.enabled !== false);
    const name = at === 0 ? 'before the first event' : `after ${on[at - 1].name}`;
    clear(this.timeChip);
    this.timeChip.append(
      el('span', { text: at === 0 ? 'Before any event' : `${at} of ${n} events` }),
      el('span', { class: 'chip-x', text: '×' }),
    );
    this.timeChip.title = `The block ${name}. Tap to return to the present.`;
  }

  // --- the horizontal slicer ------------------------------------------------

  /** How far the slider can travel: the base of the block to the skyline. */
  _sliceBounds(doc = this.store.doc) {
    const { lo, hi } = surfaceRange(doc.topo, doc.block.width, doc.block.depth);
    return { lo: lo - doc.block.height, hi };
  }

  setSlice(on) {
    const doc = this.store.doc;
    if (doc.settings.sliceOn === on) return;
    const { hi } = this._sliceBounds(doc);
    this.store.edit((d) => {
      d.settings.sliceOn = on;
      // Opens at the skyline: the block looks exactly as it did, and the very
      // first thing the slider does is take rock away. Starting it part-way
      // down would present an already-cut block as though that were the model.
      if (on && !Number.isFinite(d.settings.sliceZ)) d.settings.sliceZ = hi;
    }, { structural: true });
  }

  setSliceZ(z, dragging = false) {
    const { lo, hi } = this._sliceBounds();
    const v = Math.min(hi, Math.max(lo, z));
    this.store.edit((d) => { d.settings.sliceZ = v; },
      { coalesce: dragging ? 'slice:z' : null });
  }

  /** To the next contact up or down — the stops the slider clicks on to. */
  stepSlice(dir) {
    const doc = this.store.doc;
    const { lo, hi } = this._sliceBounds(doc);
    const here = Number.isFinite(doc.settings.sliceZ) ? doc.settings.sliceZ : hi;
    const stops = sliceStops(this.viewDoc())
      .map((st) => st.z)
      .concat([lo, hi])
      .filter((z) => z >= lo - 1e-6 && z <= hi + 1e-6)
      .sort((a, b) => a - b);
    const next = dir > 0
      ? stops.find((z) => z > here + 1e-3)
      : [...stops].reverse().find((z) => z < here - 1e-3);
    if (next == null) return;
    this.store.breakCoalesce();
    this.setSliceZ(next);
  }

  _bindSlice() {
    // The slider works in whole metres over the block's own height, so the
    // numbers it reports are the numbers on the elevation axis rather than a
    // percentage of something.
    this.sliceRange.addEventListener('input', () => {
      this.setSliceZ(snapSlice(Number(this.sliceRange.value), this.viewDoc(),
        this._sliceBounds()), true);
    });
    this.sliceRange.addEventListener('change', () => this.store.breakCoalesce());
  }

  /**
   * Restate the bar for the document as it now is.
   *
   * The contact names come from the column as deposited, so the readout says
   * "level with" rather than "at": in a tilted or folded block that contact is
   * not at one elevation, and the slider stop is a datum, not a depth.
   */
  _syncSliceBar(doc) {
    const on = doc.settings.sliceOn === true;
    this.sliceBar.classList.toggle('hidden', !on);
    this.blockPane.classList.toggle('has-slice', on);
    if (!on) return;

    const { lo, hi } = this._sliceBounds(doc);
    const z = Number.isFinite(doc.settings.sliceZ) ? doc.settings.sliceZ : hi;
    this.sliceRange.min = Math.floor(lo);
    this.sliceRange.max = Math.ceil(hi);
    this.sliceRange.value = z;
    this.sliceRange.style.setProperty('--p', hi > lo ? (z - lo) / (hi - lo) : 0);

    const datum = doc.topo.datum || 0;
    // From the view: wind time back past an unconformity and the units above
    // it have not been deposited, so they have no contact to stop at either.
    const stops = sliceStops(this.viewDoc()).filter((st) => st.z >= lo && st.z <= hi);
    const at = stops.find((st) => Math.abs(st.z - z) < 0.75);
    clear(this.sliceRead);
    this.sliceRead.append(
      el('strong', { text: `${Math.round(z + datum)} m` }),
      el('span', {
        text: at
          ? ` · level with the ${at.label[0].toLowerCase()}${at.label.slice(1)}`
          : ` · ${Math.round(hi - z)} m below the skyline`,
      }),
    );

    // Ticks where the contacts sit, so the stops are visible before you find
    // them by dragging.
    clear(this.sliceTicks);
    const span = Math.max(1, hi - lo);
    for (const st of stops) {
      this.sliceTicks.appendChild(el('span', {
        class: `slice-tick ${at === st ? 'on' : ''}`,
        title: st.label,
        style: { left: `${((st.z - lo) / span) * 100}%` },
      }));
    }
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
            el('span', { text: ` ${quadrantBearing(bed.strike)} · dip ${Math.round(bed.dip)}°${overturnedNote(bed)}` }),
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
  /**
   * The pill between the block and whichever pane is sharing the stage with it.
   *
   * Bound to each pane rather than to the stereonet alone, which is what it
   * used to be: the ground map builds the same grip, exposes it the same way,
   * and had nothing listening to it — so on a phone, where the split is the
   * only thing that decides how much map you get, it was stuck at whatever the
   * stylesheet last left it and the map was unreadably small with no way to
   * grow it. The two panes share a slot and a stylesheet; they now share this.
   */
  _bindNetGrip() {
    for (const pane of [this.net, this.ground, this.xsec]) this._bindPaneGrip(pane);
  }

  _bindPaneGrip(pane) {
    const grip = pane.grip;
    if (!grip) return;
    const STOPS = [30, 58, 100];
    let dragging = false;
    let moved = 0;
    let startY = 0;
    let startPct = 0;

    const current = () => (pane.clientHeight / (this.stage.clientHeight || 1)) * 100;
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

const MODES = new Set(['block', 'map', 'strata']);

function loadMode() {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return MODES.has(m) ? m : 'block';
  } catch { return 'block'; }
}

function saveMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* private browsing */ }
}

/** `glyph` is either a character or a ready-made mark, so both kinds of button
    are built the same way and styled by the same rule. */
/**
 * Pull the slider on to a contact when it is close to one.
 *
 * Without this the stops are decorative: at a hundred metres a pixel, landing
 * exactly on the base of a unit by dragging is luck. The window is a fraction
 * of the whole travel rather than a fixed number of metres, so it feels the
 * same on a two-kilometre block and a two-hundred-metre one.
 */
function snapSlice(z, doc, bounds) {
  const window_ = (bounds.hi - bounds.lo) * 0.012;
  let best = null;
  for (const st of sliceStops(doc)) {
    if (st.z < bounds.lo || st.z > bounds.hi) continue;
    const d = Math.abs(st.z - z);
    if (d <= window_ && (best == null || d < Math.abs(best - z))) best = st.z;
  }
  return best == null ? z : best;
}

function iconBtn(glyph, label, onClick) {
  return el('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick: onClick }, [
    typeof glyph === 'string' ? el('span', { text: glyph }) : glyph,
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
  return `${quadrantBearing(r.strike)} · dip ${Math.round(r.dip)}°${overturnedNote(r)}`;
}

/**
 * Said only when it is true, and only of a bed that has a dip direction to
 * have been turned past. A vertical bed is its own overturned twin, and a
 * flat-lying one that is upside down is a recumbent limb the block cannot make.
 */
function overturnedNote(r) {
  return r.overturned && r.dip >= FLAT_DIP && r.dip <= VERTICAL_DIP ? ' · overturned' : '';
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
