// The Strata section: build a stratigraphic column, then hand it to the rest.
//
// The third sibling. The map is a record of an outcrop that exists, the block
// is an invention meant to explain it, and this is the succession — which is
// the one of the three a student can write down before leaving the room, and
// the one everything else then refers to. Naming eight units of the Poleta
// here is what makes those names tappable when a station gets logged and what
// lets a contact say Poleta over Campito rather than "unit A and unit B".
//
// It borrows the map's document rather than keeping one of its own. A column
// and a set of map units are the same list seen from two directions, and two
// lists would be two lists that disagree by Wednesday. That is also why this
// section leans on the map section for its store: projects, IndexedDB and the
// undo stack all already live there, and a second copy of that machinery would
// be a second set of bugs rather than a second feature.

import { el, clear } from '../widgets.js';
import { expandIcon, collapseIcon } from '../icons.js';
import { buildColumn, columnSVGText, GEOM, fmtThickness } from './column.js';
import { columnPanel, marksPanel, legendPanel, stratSetupPanel } from './panels.js';
import { symbolLabel } from './symbols.js';
import { makeUnit } from '../../field/model.js';
import {
  makeMark, insertIndex, layoutColumn, grainProfile, grainScale,
  toBlockLayers, thicknessOf, canHoldMembers, childRankFor, possibleParents,
  setUnitParent, ownerAfterDrop, normaliseOrder,
} from '../../strat/model.js';

const TABS = [
  { id: 'column', label: 'Column', build: columnPanel },
  { id: 'marks', label: 'Marks', build: marksPanel },
  { id: 'legend', label: 'Legend', build: legendPanel },
  { id: 'sheet', label: 'Sheet', build: stratSetupPanel },
];

/** Grain points are quantised so a drag leaves a profile, not a thousand vertices. */
const GRAIN_STEP = 0.05;

/** How far a finger may travel and still have meant a tap. */
const TAP_SLOP = 8;

export class StratSection {
  constructor(host, field) {
    this.host = host;          // the App, for the shared sheet and the block
    this.field = field;        // the MapSection, which owns the document
    this.store = field.store;
    this.tabs = TABS;
    this.activeTab = 'column';
    this.selectedId = null;
    // Armed modes, the same idiom the map uses for placing a station: you say
    // what you are about to do, a banner says it back, and every tap until you
    // stop does that one thing.
    this.markSymbol = null;
    this.grainMode = false;
    this.full = false;
    this._sent = null;         // what the last hand-off to the block reported
    // Which format the Save button would write. A choice about this moment
    // rather than about the work, so it lives here and not in the document.
    this.saveFormat = 'pdf';
    this._drag = null;         // a grain-size stroke in progress
    this._press = null;        // a press that may yet turn out to be a tap
    this._geom = null;

    this._buildDOM();
    this._unsub = this.store.subscribe(() => this.refresh());
  }

  // -------------------------------------------------------------------------

  _buildDOM() {
    this.sheetEl = el('div', { class: 'strat-sheet' });

    this.undoBtn = hudBtn('↶', 'Undo', () => this.store.undo());
    this.redoBtn = hudBtn('↷', 'Redo', () => this.store.redo());
    this.fullBtn = el('button', {
      class: 'icon-btn', type: 'button', title: 'Full screen section',
      'aria-label': 'Full screen section', onclick: () => this.toggleFull(),
    }, [expandIcon()]);

    this.scaleChip = el('div', { class: 'scale-chip strat-scale' });
    this.banner = el('div', { class: 'mode-banner hidden' });

    this.scroller = el('div', { class: 'strat-scroll' }, [this.sheetEl]);
    this.pane = el('div', { class: 'strat-pane' }, [
      this.scroller,
      el('div', { class: 'hud hud-left' }, [this.undoBtn, this.redoBtn]),
      el('div', { class: 'hud hud-right' }, [this.fullBtn]),
      this.scaleChip,
      el('div', { class: 'strat-bottom' }, [this.banner]),
    ]);

    this.sheetEl.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this.sheetEl.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this.sheetEl.addEventListener('pointerup', () => this._onPointerUp());
    this.sheetEl.addEventListener('pointercancel', () => {
      this._press = null;
      this._endDrag();
    });
  }

  activate() { this.refresh(); }

  deactivate() { this._press = null; this._endDrag(); }

  resize() { this.refresh(); }

  destroy() { this._unsub?.(); }

  // -------------------------------------------------------------------------

  get doc() { return this.store.doc; }

  /** Redraw the section. The panel is rebuilt by the shell, not from here. */
  refresh() {
    if (!this.field.ready) {
      clear(this.sheetEl);
      this.sheetEl.appendChild(el('div', { class: 'strat-empty' }, [
        el('p', { class: 'dim', text: 'Opening your field notes…' }),
      ]));
      return;
    }

    const doc = this.doc;
    // A selection that has been deleted must not outlive the unit, or the
    // editor goes on offering to change something that is not there.
    if (this.selectedId && !doc.units.some((u) => u.id === this.selectedId)) {
      this.selectedId = null;
    }

    clear(this.sheetEl);
    if (!doc.units.length) {
      this.sheetEl.appendChild(el('div', { class: 'strat-empty' }, [
        el('p', { text: 'No column yet.' }),
        el('p', { class: 'dim', text: 'Add units on the Column tab. '
          + 'Names first; thicknesses can come later.' }),
      ]));
      this.scaleChip.textContent = '';
      this._geom = null;
      this._syncBanner();
      this._syncButtons();
      return;
    }

    // The description margin is the widest column on the sheet and the first
    // thing to go when there is no room for it. Decided from the pane rather
    // than asked about: a student on a phone should not have to find a setting
    // to stop their section being four pixels of rock and a paragraph.
    const built = buildColumn(doc, {
      selectedId: this.selectedId,
      descriptions: doc.settings.columnDescriptions !== false && this.roomForText(),
    });
    this._geom = built.geom;
    this._layout = built.layout;
    this.sheetEl.appendChild(built.node);

    const mPer100 = 100 / built.geom.pxPerM;
    this.scaleChip.textContent =
      `${fmtThickness(built.layout.total)} m · ${fmtThickness(mPer100)} m / 100 px`
      + (built.layout.unknown ? `  ·  ${built.layout.unknown} unmeasured` : '');

    this._syncBanner();
    this._syncButtons();
  }

  /**
   * Whether the pane is wide enough for the description margin.
   *
   * Measured, not guessed from a media query, because the section shares the
   * stage and how much of it there is depends on the sheet as well as on the
   * screen.
   */
  roomForText() {
    return (this.scroller.clientWidth || window.innerWidth) >= 520;
  }

  _syncButtons() {
    this.undoBtn.disabled = !this.store.canUndo;
    this.redoBtn.disabled = !this.store.canRedo;
  }

  _syncBanner() {
    const on = !!this.markSymbol || this.grainMode;
    this.banner.classList.toggle('hidden', !on);
    if (!on) return;
    clear(this.banner);
    this.banner.append(
      el('span', { text: this.markSymbol
        ? `Tap where you saw ${symbolLabel(this.markSymbol).toLowerCase()}`
        : 'Drag inside a unit to draw its grain size' }),
      el('button', {
        class: 'banner-done', type: 'button', text: 'Done',
        onclick: () => { this.setMarkSymbol(null); this.setGrainMode(false); },
      }),
    );
  }

  toggleFull() {
    this.full = !this.full;
    this.host.setStratFull(this.full);
    clear(this.fullBtn);
    this.fullBtn.appendChild(this.full ? collapseIcon() : expandIcon());
  }

  // -------------------------------------------------------------------------
  // Pointing at the drawing
  // -------------------------------------------------------------------------

  /**
   * Where a pointer event lands, in the drawing's own coordinates.
   *
   * Through the SVG's screen matrix rather than by measuring the element and
   * scaling by hand: the section is scaled to fit the pane and can be scrolled
   * inside it, and every one of those transforms is already in the matrix.
   */
  _at(e) {
    const svgEl = this.sheetEl.querySelector('svg');
    if (!svgEl || !this._geom) return null;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());

    const { cols, topY, pxPerM } = this._geom;
    const depth = (p.y - topY) / pxPerM;
    const row = this._layout.rows.find((r) => depth >= r.top && depth <= r.base)
      || (depth < 0 ? this._layout.rows[0] : this._layout.rows[this._layout.rows.length - 1]);
    if (!row) return null;
    // Height within the unit, base = 0, which is the way the profile is stored
    // and the way a section is measured.
    const at = row.thickness > 0
      ? clamp01((row.base - clampNum(depth, row.top, row.base)) / row.thickness)
      : 0;
    const n = this._geom.scale.steps.length;
    const g = Math.round(((p.x - cols.lith) / GEOM.lith) * n - 0.5);
    return { x: p.x, y: p.y, row, at, grain: clampNum(g, 0, n - 1), cols };
  }

  /**
   * A press is not yet a tap.
   *
   * The section is taller than the screen, so most gestures that start on it
   * are scrolls. Selecting a unit — or dropping a fossil on one — on pointer
   * DOWN means every scroll changes the selection under the finger and rebuilds
   * the panel while it moves. So a press only remembers where it started, and
   * the tap is decided on release: moved a little, it was a tap; moved a lot,
   * it was a scroll and nothing happened.
   *
   * Grain drawing is the exception, and only because it is armed. There a drag
   * IS the gesture, so it has to take the pointer at once.
   */
  _onPointerDown(e) {
    const spot = this._at(e);
    if (!spot) return;
    const hitUnit = e.target.closest?.('[data-unit]');
    const hitMark = e.target.closest?.('[data-mark]');
    const id = hitUnit?.getAttribute('data-unit') || spot.row.unit.id;

    if (this.grainMode && spot.x >= spot.cols.lith && spot.x <= spot.cols.lith + GEOM.lith) {
      this.select(id);
      this._drag = { unitId: id, key: `grain:${id}:${Date.now()}` };
      this.sheetEl.setPointerCapture?.(e.pointerId);
      this.setGrain(id, spot.at, spot.grain, this._drag.key);
      e.preventDefault();
      return;
    }

    this._press = {
      x: e.clientX, y: e.clientY, unitId: id,
      markId: hitMark?.getAttribute('data-mark') || null,
      at: spot.at,
    };
  }

  _onPointerMove(e) {
    if (this._press && Math.hypot(e.clientX - this._press.x, e.clientY - this._press.y) > TAP_SLOP) {
      this._press = null;
    }
    if (!this._drag) return;
    const spot = this._at(e);
    if (!spot) return;
    this.setGrain(this._drag.unitId, spot.at, spot.grain, this._drag.key);
    e.preventDefault();
  }

  _onPointerUp() {
    const press = this._press;
    this._press = null;
    this._endDrag();
    if (!press) return;
    if (this.markSymbol) { this.addMark(press.unitId, press.at, this.markSymbol); return; }
    if (press.markId) { this.selectMark(press.markId); return; }
    this.select(this.selectedId === press.unitId ? null : press.unitId);
  }

  _endDrag() {
    if (!this._drag) return;
    this._drag = null;
    this.store.breakCoalesce();
  }

  // -------------------------------------------------------------------------
  // Editing
  // -------------------------------------------------------------------------

  select(id) {
    this.selectedId = id;
    this.refresh();
    this.host.renderSectionPanel();
  }

  setMarkSymbol(id) {
    this.markSymbol = id;
    if (id) this.grainMode = false;
    this._syncBanner();
    this.host.renderSectionPanel();
  }

  setGrainMode(on) {
    this.grainMode = on;
    if (on) this.markSymbol = null;
    this._syncBanner();
    this.host.renderSectionPanel();
  }

  /**
   * A new unit next to an existing one.
   *
   * It arrives with a name box and nothing else, deliberately. The thing a
   * student has at this point is an order — Harkless over Poleta over Campito
   * — and asking for a thickness before accepting the name would be asking
   * them to invent one.
   */
  addUnit(neighbourId, side) {
    const unit = makeUnit({ rank: 'formation' });
    this.store.edit((doc) => {
      const at = neighbourId ? insertIndex(doc, neighbourId, side) : doc.units.length;
      doc.units.splice(at, 0, unit);
    }, { structural: true });
    this.select(unit.id);
  }

  /**
   * A member inside a formation, dropped in immediately below its parent.
   *
   * Refused rather than trusted. The panel only offers this where it makes
   * sense, but the rule that the column is two tiers deep belongs to the
   * column and not to the button — a member that acquired members of its own
   * would have no bracket to be drawn in and no way back out.
   */
  addMember(parentId) {
    const parent = this.doc.units.find((u) => u.id === parentId);
    if (!canHoldMembers(this.doc, parent)) return;
    const unit = makeUnit({ rank: childRankFor(parent), parentId });
    this.store.edit((doc) => {
      const kids = doc.units.filter((u) => u.parentId === parentId);
      const last = kids.length ? kids[kids.length - 1].id : parentId;
      doc.units.splice(insertIndex(doc, last, 'below'), 0, unit);
    }, { structural: true });
    this.select(unit.id);
  }

  editUnit(id, fn, coalesce = null) {
    this.store.edit((doc) => {
      const u = doc.units.find((x) => x.id === id);
      if (u) fn(u);
    }, { structural: true, coalesce });
  }

  setParent(id, parentId) {
    const unit = this.doc.units.find((x) => x.id === id);
    if (!unit) return;
    // The same two-tier rule, asked of the model rather than restated here.
    if (parentId && !possibleParents(this.doc, unit).some((p) => p.id === parentId)) return;
    this.store.edit((doc) => {
      const u = doc.units.find((x) => x.id === id);
      if (!u) return;
      const parent = parentId ? doc.units.find((p) => p.id === parentId) : null;
      u.parentId = parentId;
      // The rank follows where it has been put: a thing inside a group is a
      // formation, a thing inside a formation is a member, and a thing taken
      // back out is a formation again.
      if (parent) u.rank = childRankFor(parent);
      else if (u.rank === 'member') u.rank = 'formation';
      // Members belong next to each other or the bracket spans rock that is
      // not theirs. Moving the unit to sit under its new siblings is the
      // difference between a column that says what was meant and one that has
      // to be warned about afterwards.
      if (parentId) {
        const i = doc.units.indexOf(u);
        doc.units.splice(i, 1);
        const kids = doc.units.filter((x) => x.parentId === parentId);
        const anchor = kids.length ? kids[kids.length - 1] : doc.units.find((x) => x.id === parentId);
        const at = anchor ? doc.units.indexOf(anchor) + 1 : doc.units.length;
        doc.units.splice(at, 0, u);
      }
    }, { structural: true });
  }

  /**
   * The column, reordered by a drag.
   *
   * Handed the ids in the order they now read on screen and the one that was
   * actually dragged. Two things follow from a drop and only one of them is
   * the order:
   *
   * A formation travels with its members. Its card is a label for a bracket
   * spanning them, so moving the label without the units would move a name off
   * the rock it names.
   *
   * A unit dropped somewhere is asked where it now belongs, and pulling one
   * clear of its formation is what takes it out — which is the whole point of
   * being able to drag rather than nudge. It comes out as a formation in its
   * own right, because that is what a unit that is part of nothing is.
   */
  reorderUnits(order, movedId) {
    this.store.edit((doc) => {
      const byId = new Map(doc.units.map((u) => [u.id, u]));
      let next = order.map((id) => byId.get(id)).filter(Boolean);
      for (const u of doc.units) if (!next.includes(u)) next.push(u);

      const moved = byId.get(movedId);
      if (moved) {
        const kids = doc.units.filter((u) => u.parentId === moved.id);
        if (kids.length) {
          next = next.filter((u) => !kids.includes(u));
          next.splice(next.indexOf(moved) + 1, 0, ...kids);
        } else {
          const leaves = next.filter((u) => !next.some((x) => x.parentId === u.id));
          setUnitParent(doc, moved, ownerAfterDrop(doc, leaves, moved));
        }
      }
      doc.units = normaliseOrder(next);
    }, { structural: true });
  }

  deleteUnit(id) {
    const doc = this.doc;
    const u = doc.units.find((x) => x.id === id);
    if (!u) return;
    const kids = doc.units.filter((x) => x.parentId === id).length;
    const stations = doc.stations.filter((s) => s.unitId === id).length;
    const marks = (doc.marks || []).filter((m) => m.unitId === id).length;
    const also = [
      kids ? `${kids} member${kids === 1 ? '' : 's'} come out of it` : null,
      marks ? `${marks} symbol${marks === 1 ? '' : 's'} placed in it go` : null,
      stations ? `${stations} station${stations === 1 ? '' : 's'} keep the name; only the link goes` : null,
    ].filter(Boolean);
    if (!confirm(`Remove "${u.name || 'this unit'}" from the column?`
      + (also.length ? `\n\n${also.join('.\n')}.` : ''))) return;

    this.store.edit((d) => {
      d.units = d.units.filter((x) => x.id !== id);
      for (const x of d.units) if (x.parentId === id) x.parentId = null;
      d.marks = (d.marks || []).filter((m) => m.unitId !== id);
      for (const s of d.stations) if (s.unitId === id) s.unitId = null;
    }, { structural: true });
    this.select(null);
  }

  /**
   * A unit's colour, applied to every unit sharing its name.
   *
   * Same rule the map's shading follows: one unit crops out in many places and
   * appears in many rows, and a colour that means "the Poleta" has to mean it
   * everywhere or it means nothing.
   */
  setUnitColor(name, color, id) {
    const key = String(name || '').trim().toLowerCase();
    this.store.edit((doc) => {
      for (const u of doc.units) {
        if (u.id === id || (key && String(u.name || '').trim().toLowerCase() === key)) {
          u.color = color;
        }
      }
    }, { structural: true, coalesce: `color:${id}` });
  }

  // --- grain size ----------------------------------------------------------

  /**
   * Set the grain size at a height in a unit.
   *
   * Heights are quantised, so dragging up a unit leaves a profile of twenty
   * points rather than one per animation frame — and so that dragging back
   * over ground already covered corrects it instead of piling a second point
   * on top of the first.
   */
  setGrain(id, at, g, coalesce) {
    const q = Math.round(clamp01(at) / GRAIN_STEP) * GRAIN_STEP;
    this.editUnit(id, (u) => {
      const pts = (u.grains || []).filter((p) => Math.abs(p.at - q) > GRAIN_STEP / 2);
      pts.push({ at: q, g });
      pts.sort((a, b) => a.at - b.at);
      u.grains = pts;
    }, coalesce);
  }

  /**
   * One more point on the profile.
   *
   * A profile is drawn upward, so a new point goes above the last one: the next
   * thing anybody wants to say is what happens above the last thing they said.
   * Once the top of the unit is already spoken for there is nowhere above to
   * go, so the point splits the topmost interval instead — which is what
   * somebody wants at that stage anyway, having decided the change is not a
   * straight ramp after all.
   */
  addGrainPoint(id) {
    const doc = this.doc;
    const u = doc.units.find((x) => x.id === id);
    if (!u) return;
    const scaleId = doc.settings.grainScale || 'clastic';
    const prof = grainProfile(u, scaleId);
    const top = prof[prof.length - 1];

    let at;
    if (!(u.grains || []).length) at = 0;          // make the implied point real
    else if (top.at < 0.999) at = Math.min(1, top.at + 0.25);
    else at = (prof.length > 1 ? prof[prof.length - 2].at + top.at : top.at) / 2;

    this.editUnit(id, (x) => {
      const pts = grainProfile(x, scaleId).filter((p) => Math.abs(p.at - at) > 1e-3);
      pts.push({ at, g: top.g });
      pts.sort((a, b) => a.at - b.at);
      x.grains = pts;
    });
  }

  setGrainPoint(id, index, patch) {
    this.editUnit(id, (u) => {
      const scaleId = this.doc.settings.grainScale || 'clastic';
      const pts = grainProfile(u, scaleId).slice();
      if (!pts[index]) return;
      pts[index] = { ...pts[index], ...patch };
      pts.sort((a, b) => a.at - b.at);
      u.grains = pts;
    });
  }

  removeGrainPoint(id, index) {
    this.editUnit(id, (u) => {
      const scaleId = this.doc.settings.grainScale || 'clastic';
      const pts = grainProfile(u, scaleId).slice();
      pts.splice(index, 1);
      u.grains = pts;
    });
  }

  // --- marks ---------------------------------------------------------------

  addMark(unitId, at, symbol) {
    const mark = makeMark({ unitId, at: clamp01(at), symbol });
    this.store.edit((doc) => {
      doc.marks = [...(doc.marks || []), mark];
    }, { structural: true });
  }

  selectMark(id) {
    const m = (this.doc.marks || []).find((x) => x.id === id);
    if (m) this.select(m.unitId);
  }

  deleteMark(id) {
    this.store.edit((doc) => {
      doc.marks = (doc.marks || []).filter((m) => m.id !== id);
    }, { structural: true });
  }

  // --- settings ------------------------------------------------------------

  setSetting(patch) {
    this.store.edit((doc) => { Object.assign(doc.settings, patch); },
      { structural: true, coalesce: `strat:${Object.keys(patch).join(',')}` });
  }

  // -------------------------------------------------------------------------
  // Out of the section
  // -------------------------------------------------------------------------

  /**
   * Hand the column to the block.
   *
   * Layers only. The block's history — every fold and fault a student has
   * built — is left exactly as it is, because the point of sending a column
   * over is to deform your own succession rather than the default one, and
   * replacing the whole document would throw away the deformation to do it.
   */
  sendToBlock() {
    const { layers, notes } = toBlockLayers(this.doc);
    if (!layers.length) return;
    this.host.store.edit((d) => { d.layers = layers; }, { structural: true });
    this._sent = { at: Date.now(), notes, count: layers.length };
    this.host.renderSectionPanel();
  }

  sentReport() { return this._sent; }

  clearSent() { this._sent = null; this.host.renderSectionPanel(); }

  exportSVG() {
    download(columnSVGText(this.doc), `${slug(this.doc.name)}-section.svg`, 'image/svg+xml');
  }

  /**
   * The sheet as a PDF, through the browser's own print path.
   *
   * No PDF library, and not for want of looking: writing one would mean
   * writing an SVG-to-PDF converter, and every browser already contains a
   * better one than this app would ever have. The drawing goes into an
   * offscreen frame with a page sized to it, and Print to PDF does the rest —
   * which also means the result is real vector, selectable text and all,
   * rather than a screenshot at some guessed resolution.
   *
   * The page is as wide as A4 and as tall as the section needs, so nothing is
   * shrunk to fit a shape the section is not. A browser that ignores the page
   * size still gets a sheet that fits, because the drawing is set to scale
   * into whatever page it is actually given.
   */
  async exportPDF() {
    const text = columnSVGText(this.doc, { fit: true });
    const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = parsed.documentElement;
    if (root.querySelector('parsererror')) {
      alert('Could not lay the section out for printing. Try SVG.');
      return;
    }
    const box = (root.getAttribute('viewBox') || '0 0 600 800').split(/\s+/).map(Number);
    const vw = box[2] || 600;
    const vh = box[3] || 800;
    root.setAttribute('width', '100%');
    root.setAttribute('height', '100%');

    const PAGE_W = 210;    // mm, the width of A4 portrait
    const MARGIN = 8;
    const contentW = PAGE_W - MARGIN * 2;
    const pageH = clampNum(Math.round(contentW * (vh / vw)) + MARGIN * 2, 120, 2000);
    const title = `${this.doc.name || 'Stratigraphic section'}`;

    const html = `<!doctype html><html><head><meta charset="utf-8">`
      + `<title>${escapeHtml(title)}</title><style>`
      + `@page { size: ${PAGE_W}mm ${pageH}mm; margin: ${MARGIN}mm; }`
      + 'html,body { margin:0; padding:0; height:100%; background:#fff; }'
      + 'svg { display:block; width:100%; height:100%; }'
      + '</style></head><body>'
      + new XMLSerializer().serializeToString(root)
      + '</body></html>';

    await printDocument(html);
  }

  /**
   * The same drawing as a bitmap, for a document that will not take an SVG.
   *
   * Rendered at three times size, because a section is mostly 9pt text and a
   * screen-resolution PNG of it is unreadable the moment it is printed.
   */
  async exportPNG() {
    const text = columnSVGText(this.doc);
    const built = buildColumn(this.doc, { interactive: false });
    const w = built.geom.width;
    // The exported drawing is taller than the on-screen one by its legend, so
    // the height is read back off the file rather than recomputed here.
    const m = /height="([0-9.]+)"/.exec(text);
    const h = m ? Number(m[1]) : built.geom.height;
    const k = 3;

    const blob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * k);
      cv.height = Math.round(h * k);
      const g = cv.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(img, 0, 0, cv.width, cv.height);
      await new Promise((res) => cv.toBlob((b) => {
        if (b) downloadBlob(b, `${slug(this.doc.name)}-section.png`);
        res();
      }, 'image/png'));
    } catch (err) {
      console.error(err);
      alert('Could not render the PNG. Try SVG.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Write the section out in whichever format is currently chosen. */
  save() {
    switch (this.saveFormat) {
      case 'svg': return this.exportSVG();
      case 'png': return this.exportPNG();
      case 'csv': return this.exportCSV();
      default: return this.exportPDF();
    }
  }

  /** The numbers, for a spreadsheet — which is where marks get entered. */
  exportCSV() {
    const doc = this.doc;
    const layout = layoutColumn(doc);
    const scaleId = doc.settings.grainScale || 'clastic';
    const scale = grainScale(scaleId);
    const marksBy = new Map();
    for (const m of doc.marks || []) {
      if (!marksBy.has(m.unitId)) marksBy.set(m.unitId, []);
      marksBy.get(m.unitId).push(symbolLabel(m.symbol));
    }

    const cols = ['order', 'unit', 'rank', 'part_of', 'rock', 'thickness_m',
      'thickness_source', 'block_thickness_m', 'base_height_m', 'top_height_m',
      'grain_min', 'grain_max', 'contact_below', 'marks', 'description'];
    const rows = layout.rows.map((r, i) => {
      const u = r.unit;
      const parent = doc.units.find((p) => p.id === u.parentId);
      const prof = grainProfile(u, scaleId);
      const gs = prof.map((p) => p.g);
      return [
        i + 1,
        u.name || '',
        u.rank || '',
        parent ? parent.name : '',
        u.rockId || '',
        thicknessOf(u) ?? '',
        u.thicknessSource || '',
        Number.isFinite(u.modelThickness) ? u.modelThickness : '',
        Math.round((layout.total - r.base) * 100) / 100,
        Math.round((layout.total - r.top) * 100) / 100,
        scale.steps[Math.min(...gs)]?.long || '',
        scale.steps[Math.max(...gs)]?.long || '',
        u.contactBelow || '',
        (marksBy.get(u.id) || []).join('; '),
        u.description || '',
      ].map(csvCell).join(',');
    });
    download([cols.join(','), ...rows].join('\n'),
      `${slug(doc.name)}-column.csv`, 'text/csv');
  }

  // -------------------------------------------------------------------------

  panelContext() {
    return {
      doc: () => this.doc,
      selectedId: () => this.selectedId,
      select: (id) => this.select(id),

      addUnit: (id, side) => this.addUnit(id, side),
      addMember: (id) => this.addMember(id),
      editUnit: (id, fn, c) => this.editUnit(id, fn, c),
      setParent: (id, p) => this.setParent(id, p),
      reorderUnits: (order, id) => this.reorderUnits(order, id),
      deleteUnit: (id) => this.deleteUnit(id),
      setUnitColor: (name, color, id) => this.setUnitColor(name, color, id),

      grainMode: () => this.grainMode,
      setGrainMode: (v) => this.setGrainMode(v),
      addGrainPoint: (id) => this.addGrainPoint(id),
      setGrainPoint: (id, i, p) => this.setGrainPoint(id, i, p),
      removeGrainPoint: (id, i) => this.removeGrainPoint(id, i),

      markSymbol: () => this.markSymbol,
      setMarkSymbol: (id) => this.setMarkSymbol(id),
      selectMark: (id) => this.selectMark(id),
      deleteMark: (id) => this.deleteMark(id),

      roomForText: () => this.roomForText(),
      setSetting: (p) => this.setSetting(p),
      sendToBlock: () => this.sendToBlock(),
      sentReport: () => this.sentReport(),
      clearSent: () => this.clearSent(),
      showBlock: () => this.host.setMode('block'),
      showMap: () => this.host.setMode('map'),
      saveFormat: () => this.saveFormat,
      setSaveFormat: (v) => { this.saveFormat = v; },
      save: () => this.save(),
    };
  }

  buildPanel(tabId) {
    const tab = this.tabs.find((t) => t.id === tabId) || this.tabs[0];
    this.activeTab = tab.id;
    if (!this.field.ready) {
      return el('div', { class: 'panel' }, [el('div', { class: 'empty' }, [
        el('p', { class: 'dim', text: 'Opening your field notes…' }),
      ])]);
    }
    return tab.build(this.panelContext());
  }
}

// ---------------------------------------------------------------------------

function hudBtn(glyph, label, onClick) {
  return el('button', {
    class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick: onClick,
  }, [el('span', { text: glyph })]);
}

function clamp01(v) { return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }
function clampNum(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * Print an HTML document that is not this one.
 *
 * Through an offscreen same-origin frame rather than a new window, because a
 * window opened for printing is a popup and gets blocked often enough to be
 * useless. The frame is taken down afterwards — on `afterprint` where the
 * browser sends it, and on a timer where it does not, since several do not
 * send it at all when the print came from a frame.
 */
function printDocument(html) {
  return new Promise((resolve) => {
    const frame = el('iframe', { 'aria-hidden': 'true' });
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;'
      + 'border:0;opacity:0;pointer-events:none';
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      setTimeout(() => frame.remove(), 400);
      resolve();
    };
    frame.addEventListener('load', () => {
      const win = frame.contentWindow;
      if (!win) { cleanup(); return; }
      win.addEventListener('afterprint', cleanup, { once: true });
      // A frame's document can report itself loaded a beat before its data-URI
      // images have painted, and printing then leaves white boxes where the
      // lithology should be.
      requestAnimationFrame(() => setTimeout(() => {
        try { win.focus(); win.print(); } catch { /* the dialog is the user's */ }
        setTimeout(cleanup, 60000);
      }, 120));
    });
    document.body.appendChild(frame);
    frame.srcdoc = html;
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed'));
    img.src = url;
  });
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

function download(text, filename, type) {
  downloadBlob(new Blob([text], { type }), filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
