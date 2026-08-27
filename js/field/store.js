// Persistence for field notes.
//
// The block diagram autosaves to localStorage, which is the right size for a
// block and the wrong place for this. Field notes are the one thing in the app
// that cannot be recreated by rebuilding it — walk the traverse again is not
// an answer — so they go in IndexedDB: a bigger budget, asynchronous writes
// that do not stall the map while a finger is dragging it, and a store the
// browser is markedly less eager to throw away under pressure.
//
// localStorage stays as the fallback for a browser that will not open a
// database at all, which in practice means private browsing. Degraded is
// better than refusing to take notes.

import { defaultFieldDocument, migrateFieldDoc, newFieldId } from './model.js';

const DB_NAME = 'blockdiagram-field';
const DB_VERSION = 1;
const STORE = 'documents';
// The single document the app used to have. Still read once, to carry an
// existing notebook into the first project rather than stranding it.
const LEGACY_KEY = 'current';
const INDEX_KEY = 'projects';
const docKey = (id) => `doc:${id}`;
const FALLBACK_KEY = 'blockdiagram.field.v1';
const COALESCE_MS = 900;
const MAX_UNDO = 60;

// ---------------------------------------------------------------------------
// A very small IndexedDB wrapper
// ---------------------------------------------------------------------------

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) { reject(err); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
    // Safari has been known to open neither successfully nor with an error.
    // Waiting forever would leave the map stuck on "Loading", so give up and
    // take the fallback path instead.
    setTimeout(() => reject(new Error('indexedDB open timed out')), 4000);
  }).catch((err) => {
    console.warn('field store: falling back to localStorage —', err.message);
    return null;
  });
  return dbPromise;
}

async function idbGet(key) {
  const db = await openDB();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}

async function idbPut(key, value) {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch { resolve(false); }
  });
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
// A project is a whole field document — its own stations, lines, units, map
// areas, declination and remembered view. Two field areas have nothing to say
// to each other, and a notebook that mixes them is one nobody can hand in.
//
// Keeping a project as a complete document rather than as a tag on every
// record means nothing has to be filtered anywhere: the app goes on working
// with one document, and switching projects swaps which one that is.

export function projectMeta(id, doc) {
  return {
    id,
    name: doc.name || 'Field notes',
    stations: (doc.stations || []).length,
    lines: (doc.lines || []).length,
    areas: (doc.areas || []).length,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Open the workspace: the list of projects and whichever one was last open.
 *
 * Never throws, and never comes back with nothing — a first run, a failed
 * database and an upgrade from the single-document version all end up with one
 * project and a document in it.
 */
export async function loadWorkspace() {
  let index = null;
  try { index = await idbGet(INDEX_KEY); } catch { /* fall through */ }

  if (!index || !Array.isArray(index.projects) || !index.projects.length) {
    let legacy = null;
    try { legacy = await idbGet(LEGACY_KEY); } catch { /* fall through */ }
    if (!legacy) {
      try {
        const raw = localStorage.getItem(FALLBACK_KEY);
        if (raw) legacy = JSON.parse(raw);
      } catch { /* fall through */ }
    }
    const doc = legacy ? migrateFieldDoc(legacy) : defaultFieldDocument();
    const id = newFieldId('pr');
    await idbPut(docKey(id), doc);
    index = { currentId: id, projects: [projectMeta(id, doc)] };
    await idbPut(INDEX_KEY, index);
    return { index, id, doc };
  }

  // A missing or unreadable current project falls back to the first one
  // rather than to an empty screen with a list that says otherwise.
  let id = index.currentId;
  if (!index.projects.some((p) => p.id === id)) id = index.projects[0].id;
  let stored = null;
  try { stored = await idbGet(docKey(id)); } catch { /* fall through */ }
  return { index, id, doc: migrateFieldDoc(stored || defaultFieldDocument()) };
}

export async function readProject(id) {
  try {
    const stored = await idbGet(docKey(id));
    return stored ? migrateFieldDoc(stored) : null;
  } catch { return null; }
}

export async function writeProject(id, doc) { return idbPut(docKey(id), doc); }

export async function writeIndex(index) { return idbPut(INDEX_KEY, index); }

export async function removeProject(id) {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(docKey(id));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch { resolve(false); }
  });
}

/**
 * Same shape as the block's Store, deliberately: the panels are written
 * against one idea of what a store is, and a second idea would be a second
 * set of bugs.
 */
export class FieldStore {
  constructor(doc = defaultFieldDocument(), projectId = null) {
    this.doc = doc;
    this.projectId = projectId;
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this._lastKey = null;
    this._lastAt = 0;
    this._saveTimer = null;
    this._saving = null;
    this._dirty = false;
    this.lastSavedAt = null;
    this.saveError = null;
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /**
   * Apply a mutation.
   *
   *   coalesce    key that merges consecutive edits into one undo step
   *   structural  the change alters what controls exist, so rebuild the panel
   *   silent      do not notify listeners
   *   transient   not an edit at all — where the map is looking, whether it is
   *               following you. These live in the document so they survive a
   *               reload, but they are not work, and undo should step back
   *               over a deleted station rather than over a pan.
   */
  edit(mutator, opts = {}) {
    const { coalesce = null, structural = false, silent = false, transient = false } = opts;
    const now = performance.now();
    const sameRun = coalesce != null
      && coalesce === this._lastKey
      && now - this._lastAt < COALESCE_MS;

    if (!sameRun && !transient) {
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

  breakCoalesce() { this._lastKey = null; }

  _emit(info) { for (const fn of this.listeners) fn(this.doc, info); }

  _scheduleSave() {
    this._dirty = true;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.save(), 350);
  }

  /**
   * Writes are serialised, and each one carries the project it belongs to.
   *
   * Two things went wrong here before. `save` returned early when another
   * write was in flight, which meant `flush` could resolve having written
   * nothing — so switching projects saved the outgoing one only by luck. And
   * the project id was read at write time rather than captured with the
   * snapshot, so a write still in flight when the project changed would land
   * the old document under the new project's key.
   *
   * Now every call returns a promise that resolves when THAT state is on
   * disk, and the id travels with the data.
   */
  save() {
    const run = () => this._write();
    const chained = this._saving ? this._saving.then(run, run) : run();
    this._saving = chained;
    chained.finally(() => { if (this._saving === chained) this._saving = null; });
    return chained;
  }

  async _write() {
    this._dirty = false;
    const id = this.projectId;
    const copy = snapshot(this.doc);
    try {
      const ok = id ? await idbPut(docKey(id), copy) : false;
      if (!ok) localStorage.setItem(FALLBACK_KEY, JSON.stringify(copy));
      this.lastSavedAt = Date.now();
      this.saveError = null;
    } catch (err) {
      // Worth surfacing, unlike the block's autosave: this is the one place
      // in the app where a failed write means observations are gone.
      this.saveError = err.message || 'save failed';
      console.warn('field autosave failed', err);
    }
  }

  /** Force a write now — used when the app is being backgrounded. */
  flush() { clearTimeout(this._saveTimer); return this.save(); }
}

function snapshot(doc) { return JSON.parse(JSON.stringify(doc)); }
