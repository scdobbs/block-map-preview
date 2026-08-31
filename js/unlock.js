// The course gate.
//
// A field course releases the app in stages: the block alone to start with, so
// a hypothesis has to be argued from the rock rather than looked up; then the
// map and the column, once there is something to map; then the block cut from
// the mapped area, once the argument is worth testing against a model.
//
// This is a classroom convention with a latch on it, not a security boundary,
// and it is worth being plain about that rather than implying otherwise. The
// app is a static page served from a public repository: the passwords are in
// this file, this file is readable, and anyone who wants past a stage can get
// there. That is the right target. The gate exists so nobody wanders into
// stage three by tapping around on day one — not to defeat a student who has
// decided to cheat, who could equally use any other app on the phone.
//
// It is also temporary. The stages are specific to one course; a later build
// for a general audience should delete this module and the four call sites
// that read it, and nothing else will need to change.

const KEY = 'blockdiagram.unlocked.v1';

/**
 * The stages, in the order they are released.
 *
 * `id` is what the rest of the app asks about. Nothing outside this file knows
 * the passwords, so moving to codes handed out per student, or to dates, means
 * changing this table and nothing else.
 */
export const STAGES = [
  {
    id: 'field',
    label: 'Map and Strata',
    password: 'Ihavethepower!',
    blurb: 'Location, measurements, mapped contacts, and the stratigraphic column.',
  },
  {
    id: 'model',
    label: 'Build a block from your map',
    password: 'Timetocook',
    blurb: 'The Block tab inside Map: cuts a block from what you have mapped and fits a history to it.',
  },
];

export function stage(id) { return STAGES.find((s) => s.id === id) || null; }

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    // Private browsing, or a corrupted value. Locked is the safe answer, and
    // the student can re-enter the password.
    return new Set();
  }
}

function write(set) {
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* nothing to do */ }
}

export function unlocked(id) { return read().has(id); }

export function anyUnlocked() { return read().size > 0; }

/**
 * Try a password against a stage.
 *
 * Trimmed and case-folded on purpose. The password is spoken aloud to a group
 * standing outdoors and typed on a phone keyboard that capitalises and
 * autocorrects; a student who hears it right and types it right should not be
 * refused because iOS put a space on the end. There is nothing to defend here
 * that strictness would defend.
 */
export function tryUnlock(id, text) {
  const s = stage(id);
  if (!s) return false;
  const given = String(text || '').trim().toLowerCase();
  if (!given || given !== s.password.toLowerCase()) return false;
  const set = read();
  set.add(id);
  write(set);
  return true;
}

/** What to show a student who has unlocked a stage and wants to pass it on. */
export function passwordFor(id) {
  return unlocked(id) ? (stage(id)?.password ?? null) : null;
}

/** Put a stage back. For an instructor resetting a borrowed phone. */
export function relock(id) {
  const set = read();
  set.delete(id);
  write(set);
}

export function relockAll() { write(new Set()); }
