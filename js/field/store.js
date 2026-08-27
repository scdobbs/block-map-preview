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

import { defaultFieldDocument, migrateFieldDoc } from './model.js';

const DB_NAME = 'blockdiagram-field';
const DB_VERSION = 1;
const STORE = 'documents';
const DOC_KEY = 'current';
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

/** Read the saved notes, or a fresh document. Never throws. */
export async function loadFieldDoc() {
  try {
    const stored = await idbGet(DOC_KEY);
    if (stored) return migrateFieldDoc(stored);
  } catch { /* fall through */ }
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw) return migrateFieldDoc(JSON.parse(raw));
  } catch { /* fall through */ }
  return defaultFieldDocument();
}

/**
 * Same shape as the block's Store, deliberately: the panels are written
 * against one idea of what a store is, and a second idea would be a second
 * set of bugs.
 */
export class FieldStore {
  constructor(doc = defaultFieldDocument()) {
    this.doc = doc;
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this._lastKey = null;
    this._lastAt = 0;
    this._saveTimer = null;
    this._saving = false;
    this._dirty = false;
    this.lastSavedAt = null;
    this.saveError = null;
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

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
   * Writes are serialised. Two overlapping transactions on the same key can
   * land in either order, and the loser would be the newer note.
   */
  async save() {
    if (this._saving) { this._scheduleSave(); return; }
    this._saving = true;
    this._dirty = false;
    const copy = snapshot(this.doc);
    try {
      const ok = await idbPut(DOC_KEY, copy);
      if (!ok) localStorage.setItem(FALLBACK_KEY, JSON.stringify(copy));
      this.lastSavedAt = Date.now();
      this.saveError = null;
    } catch (err) {
      // Worth surfacing, unlike the block's autosave: this is the one place
      // in the app where a failed write means observations are gone.
      this.saveError = err.message || 'save failed';
      console.warn('field autosave failed', err);
    } finally {
      this._saving = false;
      if (this._dirty) this._scheduleSave();
    }
  }

  /** Force a write now — used when the app is being backgrounded. */
  flush() { clearTimeout(this._saveTimer); return this.save(); }
}

function snapshot(doc) { return JSON.parse(JSON.stringify(doc)); }
