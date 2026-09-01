// Document store: mutation, undo/redo, and offline persistence.
//
// Undo entries are coalesced by key so that dragging a dip slider through
// forty intermediate values leaves one undo step, not forty.

import { defaultDocument, SCHEMA_VERSION, faultKindFromRake, newId } from './geo/model.js';
import { isDemSurface } from './geo/surfaces.js';
import { packGround, unpackGround } from './field/ground.js';

const KEY = 'blockdiagram.doc.v1';
const COALESCE_MS = 900;
const MAX_UNDO = 60;

export class Store {
  constructor(doc = defaultDocument()) {
    this.doc = doc;
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this._lastKey = null;
    this._lastAt = 0;
    this._saveTimer = null;
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /**
   * Apply a mutation.
   * @param {(doc:object)=>void} mutator
   * @param {object} opts
   *   coalesce  key that merges consecutive edits into one undo step
   *   structural  true when the change alters the shape of the history or the
   *               layer list, so the UI must rebuild rather than just repaint
   */
  edit(mutator, opts = {}) {
    const { coalesce = null, structural = false, silent = false } = opts;
    const now = performance.now();
    const sameRun = coalesce != null
      && coalesce === this._lastKey
      && now - this._lastAt < COALESCE_MS;

    if (!sameRun) {
      this.undoStack.push(snapshot(this.doc));
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this._lastKey = coalesce;
    this._lastAt = now;

    mutator(this.doc);
    if (!silent) this._emit({ structural });
    this._scheduleSave();
  }

  /**
   * Change how the document is being LOOKED at, rather than what it is.
   *
   * The time machine moves nothing in the block; it moves where the student is
   * standing to see it. And it moves a lot — playing a history through runs an
   * event a second — so putting it on the undo stack would bury the last real
   * edit under a dozen viewpoints and leave Ctrl-Z meaning something other
   * than "take back what I just did". So it redraws and autosaves like any
   * other change, and undo steps straight over it.
   *
   * The test for using this rather than `edit` is not "is it in settings" — it
   * is whether taking the change back is something a student could want.
   */
  view(mutator) {
    mutator(this.doc);
    this._emit({ structural: false });
    this._scheduleSave();
  }

  /** Replace the whole document (load, preset, reset). Always undoable. */
  replace(doc, structural = true) {
    this.undoStack.push(snapshot(this.doc));
    this.redoStack.length = 0;
    this._lastKey = null;
    this.doc = doc;
    this._emit({ structural });
    this._scheduleSave();
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(snapshot(this.doc));
    this.doc = this.undoStack.pop();
    this._lastKey = null;
    this._emit({ structural: true });
    this._scheduleSave();
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(snapshot(this.doc));
    this.doc = this.redoStack.pop();
    this._lastKey = null;
    this._emit({ structural: true });
    this._scheduleSave();
    return true;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  /** Force the next edit to start a fresh undo step. */
  breakCoalesce() { this._lastKey = null; }

  _emit(info) { for (const fn of this.listeners) fn(this.doc, info); }

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 400);
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(serialiseDoc(this.doc)));
    } catch (err) {
      // Private browsing or a full quota. Losing autosave is survivable;
      // losing the session is not, so carry on silently.
      console.warn('autosave failed', err);
    }
  }
}

/**
 * A deep copy for the undo stack — except for measured ground, which is shared
 * by reference instead.
 *
 * Two reasons, and both are load-bearing. A Float32Array through
 * JSON.stringify comes back as an object with thirty-seven thousand numeric
 * keys, so a round trip does not merely cost, it destroys the terrain. And the
 * samples are immutable: nothing edits a landscape in place, a different area
 * is a different surface object. So sharing is safe, and it keeps an undo step
 * the size it was before any of this existed.
 */
function snapshot(doc) {
  const ground = isDemSurface(doc.topo) ? doc.topo : null;
  if (!ground) return JSON.parse(JSON.stringify(doc));
  const copy = JSON.parse(JSON.stringify({ ...doc, topo: null }));
  copy.topo = ground;
  return copy;
}

/**
 * The document as something that can be written down: the heightfield packed
 * to int16 decimetres and base64, because that is the one part of it that is
 * not already plain JSON.
 */
export function serialiseDoc(doc) {
  if (!isDemSurface(doc.topo)) return doc;
  return { ...doc, topo: packGround(doc.topo) };
}

/** The inverse, tolerant of a file whose ground failed to decode. */
export function reviveDoc(doc) {
  if (!doc || !doc.topo || doc.topo.kind !== 'dem') return doc;
  const ground = unpackGround(doc.topo);
  // A block whose ground will not decode is still a block. Falling back to a
  // flat datum keeps the history, the column and the readings openable rather
  // than losing the lot to a corrupted lid.
  return { ...doc, topo: ground || defaultDocument().topo };
}

export function loadSaved() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    if (!doc || doc.version !== SCHEMA_VERSION) return null;
    return migrate(reviveDoc(doc));
  } catch {
    return null;
  }
}

/** Fill in anything a saved document predates, so old saves keep opening. */
function migrate(doc) {
  const base = defaultDocument();
  doc.settings = { ...base.settings, ...(doc.settings || {}) };
  // A document always opens in the present. The time machine is a way of
  // looking at a block, not a property of it, and a file that reopened halfway
  // through its own history would look like a file that had lost its history.
  doc.settings.timeStep = null;
  doc.block = { ...base.block, ...(doc.block || {}) };
  // Measured ground is taken whole. Spreading a default landform's parameters
  // over it would leave a surface that is both a heightfield and a set of hill
  // parameters, and surfaceHeight would answer from whichever it checked first.
  doc.topo = isDemSurface(doc.topo) ? doc.topo : { ...base.topo, ...(doc.topo || {}) };
  doc.georef = doc.georef || null;
  doc.events = (doc.events || []).map((e) => {
    const ev = { enabled: true, ...e };
    // Faults used to store a bare rake. Recover the kind and obliquity the
    // editor now works in, so older saves keep their geometry exactly.
    if (ev.type === 'fault' && ev.kind == null) {
      Object.assign(ev, faultKindFromRake(ev.rake ?? 90));
      delete ev.rake;
    }
    return ev;
  });
  doc.basementRockId = doc.basementRockId || base.basementRockId;
  // Markers predate nothing yet, but a file saved before they existed must
  // still open — and a hand-edited one must not be able to hand the renderer
  // something that is not a station.
  doc.markers = (Array.isArray(doc.markers) ? doc.markers : [])
    .filter((m) => m && Number.isFinite(m.x) && Number.isFinite(m.y))
    .map((m) => ({ id: m.id || newId('mk'), x: m.x, y: m.y }));
  return doc;
}

export function exportJSON(doc) {
  // Not pretty-printed when it carries ground: an indented base64 blob of a
  // hundred thousand characters helps nobody and triples the file.
  const out = { ...serialiseDoc(doc), exportedAt: new Date().toISOString() };
  return isDemSurface(doc.topo) ? JSON.stringify(out) : JSON.stringify(out, null, 2);
}

export function importJSON(text) {
  const doc = reviveDoc(JSON.parse(text));
  if (!doc.layers || !Array.isArray(doc.layers)) throw new Error('Not a block diagram file');
  return migrate({ ...defaultDocument(), ...doc });
}
