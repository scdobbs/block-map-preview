// A short hash of everything in a project that the fit actually reads.
//
// The point is a question two devices can be asked separately and answered
// identically: am I running this model on the same evidence? A block fitted on
// a phone and the same block fitted on a laptop can disagree for three quite
// different reasons — different code, different data, or a different box drawn
// round the mapping — and until you can rule the middle one out you cannot
// tell the other two apart.
//
// What goes in is exactly what `projectNotes` in field/cutblock.js carries
// through to the fit, and nothing else. Notes, colours, timestamps and ids are
// left out on purpose: they differ between two copies of the same mapping and
// including them would report a mismatch that changes no answer. The converse
// error is the one worth avoiding, so anything that reaches `inferHistory` is
// in, including `localFolds` — a setting, not an observation, but one that
// gives the fold an extra freedom and moves the answer.
//
// NOT included, because they are not in the document: the selection box the
// block was cut from, which sets `extent` and therefore the maximum slip the
// search will consider, and the DEM tiles the station heights are read off.
// Two devices agreeing here have the same evidence, not necessarily the same
// block.

/** A number written the same way on every device, or `~` for "not given". */
function n(v, dp) {
  return Number.isFinite(v) ? v.toFixed(dp) : '~';
}

/** A string field, trimmed and case-folded the way the fit compares them. */
function s(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

/**
 * The canonical text of a project: one line per thing the fit can see.
 *
 * Stations, lines and patches are sorted by their own content, because the
 * order they were collected in is not evidence — the same two stations taken
 * in the other order are the same mapping. The units are NOT sorted: their
 * order in `doc.units` IS the column, so sorting them would throw away the
 * succession and report two different columns as one.
 */
export function canonicalText(doc) {
  const out = [];

  for (const u of doc.units || []) {
    out.push(['U', s(u.name), s(u.rank), s(u.parentId ? 'member' : 'top'),
      n(u.thickness, 3), s(u.contactBelow)].join('\t'));
  }

  const rows = [];
  for (const st of doc.stations || []) {
    rows.push(['S', s(st.feature), n(st.lon, 7), n(st.lat, 7),
      n(st.strike, 2), n(st.dip, 2), n(st.trend, 2), n(st.plunge, 2),
      s(st.certainty), s(st.unitName)].join('\t'));
  }
  for (const ln of doc.lines || []) {
    const pts = (ln.points || []).map((p) => `${n(p[0], 7)},${n(p[1], 7)}`).join(' ');
    rows.push(['L', s(ln.kind), s(ln.certainty), s(ln.unitUpper), s(ln.unitLower),
      n(ln.dip, 2), n(ln.dipDir, 2), s(ln.sense), pts].join('\t'));
  }
  for (const p of doc.patches || []) {
    rows.push(['P', s(p.unitName), n(p.lon, 7), n(p.lat, 7)].join('\t'));
  }
  rows.sort();

  const set = doc.settings || {};
  out.push(...rows, `F\tlocalFolds=${set.localFolds === true ? 1 : 0}`);
  return out.join('\n');
}

/**
 * FNV-1a, run twice over the same text with different offset bases so the two
 * 32-bit lanes can be written side by side as one 8-character tag. A cryptographic
 * hash would be better and is not available synchronously — `crypto.subtle` returns
 * a promise, and this is read while a panel is being built. Nothing here is
 * defended against a forged match; it is defended against two students'
 * projects colliding by accident, which eight hex characters is ample for.
 */
function fnv(text, seed) {
  let h = seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    // h *= 16777619, in parts, because the product overflows a double's
    // integer range and Math.imul does not.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Eight hex characters identifying the evidence in a project. */
export function docFingerprint(doc) {
  const text = canonicalText(doc);
  const a = fnv(text, 0x811c9dc5);
  const b = fnv(text, 0x9e3779b9);
  return (a.toString(16).padStart(8, '0').slice(0, 4)
    + b.toString(16).padStart(8, '0').slice(0, 4));
}
