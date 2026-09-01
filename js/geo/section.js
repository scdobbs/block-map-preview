// The vertical slice: what the block is made of along a line drawn on the map.
//
// A cross-section is not a new kind of geology, it is a different place to
// stand and ask the same question. `rockAt` already answers "what is here?"
// for any point in the block; a section is that question asked on a regular
// grid over a vertical plane, and a slice is it asked over a horizontal one.
// So nothing in here models anything. It sets up the plane, walks it, and
// hands back codes the drawing can colour — which is the whole reason the
// section can never disagree with the block it was cut from.
//
// Everything is in true geologic metres. Vertical exaggeration is a decision
// the drawing makes, not something baked in here, so a thickness measured off
// this grid is a real thickness.

import { rockAt } from './unmake.js';
import { surfaceHeight, surfaceRange } from './surfaces.js';
import { rock, sliceCut } from './model.js';
import { wrap360, RAD, DEG } from './math.js';

/** Above the land surface — the part of the section that is air. */
export const SKY = -9999;
/** Below the bottom of the column. */
export const BASEMENT = -1;
/** Intrusions are coded from here up, by their position in the history. */
export const INTRUSION = 1000;

/**
 * The top of the block at a map position — the terrain, or the slicer's level
 * where that is lower.
 *
 * The section reads this rather than the terrain so that the two views of a
 * sliced block cannot contradict each other. Rock the slicer has taken off the
 * top of the model is rock that is no longer in the model, and a section that
 * went on drawing it would be showing the student something the block no
 * longer says is there.
 */
export function lidAt(doc, x, y) {
  const cut = sliceCut(doc);
  const g = surfaceHeight(doc.topo, x, y);
  return cut == null ? g : Math.min(g, cut);
}

/**
 * Where A–A′ goes when nobody has said. West to east across the middle: the
 * one line that is guaranteed to cross the block, and the orientation every
 * textbook section is drawn in.
 */
export function defaultSectionLine(box) {
  const my = (box.y0 + box.y1) / 2;
  const inset = (box.x1 - box.x0) * 0.05;
  return { ax: box.x0 + inset, ay: my, bx: box.x1 - inset, by: my };
}

/** The document's line, or the default when it has none or a spoiled one. */
export function sectionLine(doc, box) {
  const s = doc.section;
  const ok = s && [s.ax, s.ay, s.bx, s.by].every(Number.isFinite)
    && Math.hypot(s.bx - s.ax, s.by - s.ay) > 1;
  return ok ? s : defaultSectionLine(box);
}

/**
 * Everything the drawing needs about the plane: where it runs, which way it
 * faces, and how much of the block it has to reach down through.
 *
 * The roof is taken from the ground along THIS line rather than from the
 * highest point anywhere in the block. A section down a valley should not
 * spend half its height on the sky over a summit two kilometres away.
 */
export function sectionFrame(doc, box, line) {
  const { ax, ay, bx, by } = line || sectionLine(doc, box);
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;

  const { lo } = surfaceRange(doc.topo, doc.block.width, doc.block.depth);
  const z0 = lo - doc.block.height;

  let top = -Infinity;
  for (let i = 0; i <= 64; i++) {
    const s = (len * i) / 64;
    top = Math.max(top, lidAt(doc, ax + ux * s, ay + uy * s));
  }
  // A hair of sky above the skyline, so the ground line is drawn rather than
  // clipped by the top of the frame.
  const z1 = top + Math.max(4, (top - z0) * 0.03);

  return {
    ax, ay, bx, by, len, ux, uy,
    // Azimuth of A→B. East is x and north is y, so the bearing is atan2 of
    // the two in that order — not the other way round.
    az: wrap360(Math.atan2(ux, uy) * RAD),
    z0, z1,
    at: (s) => [ax + ux * s, ay + uy * s],
  };
}

/** Ground elevation at n+1 evenly spaced points from A to A′. */
export function groundProfile(doc, frame, n) {
  const out = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const [x, y] = frame.at((frame.len * i) / n);
    out[i] = lidAt(doc, x, y);
  }
  return out;
}

/**
 * The rock at every cell of a cols × rows grid over the section plane.
 * Row 0 is the top of the frame; column 0 is A. Cells are sampled at their
 * centres, which is what keeps a contact from landing half a cell out.
 */
export function sampleSection(h, doc, frame, cols, rows) {
  const code = new Int32Array(cols * rows);
  const dz = (frame.z1 - frame.z0) / rows;
  const evIndex = new Map(h.events.map((e, i) => [e.id, i]));

  for (let i = 0; i < cols; i++) {
    const s = ((i + 0.5) / cols) * frame.len;
    const [x, y] = frame.at(s);
    // One surface lookup per column, not one per cell: the ground does not
    // vary with depth, and a DEM bilinear is not free.
    const ground = lidAt(doc, x, y);
    for (let j = 0; j < rows; j++) {
      const z = frame.z1 - (j + 0.5) * dz;
      code[j * cols + i] = z > ground ? SKY : codeAt(h, evIndex, x, y, z);
    }
  }
  return code;
}

function codeAt(h, evIndex, x, y, z) {
  const r = rockAt(h, [x, y, z]);
  if (r.kind === 'layer') return r.index;
  if (r.kind === 'intrusion') return INTRUSION + (evIndex.get(r.event.id) ?? 0);
  return BASEMENT;
}

/**
 * What each code should be drawn and called. Built once per document, then
 * indexed by the raster — a section is a hundred thousand lookups and none of
 * them should be doing string work.
 */
export function sectionPalette(h, doc) {
  const byCode = new Map();
  // From the compiled history's own layer list, not the document's. The two
  // differ whenever the time slider has wound back past an unconformity, and
  // `rockAt` returns indices into this one — reading the document's would
  // colour every unit as the one above it.
  h.layers.forEach((l, i) => byCode.set(i, {
    color: l.color || rock(l.rockId).color,
    label: l.name || rock(l.rockId).label,
  }));
  const bm = rock(doc.basementRockId);
  byCode.set(BASEMENT, { color: bm.color, label: 'Basement' });
  h.events.forEach((e, i) => {
    if (e.type !== 'dike' && e.type !== 'pluton') return;
    byCode.set(INTRUSION + i, { color: rock(e.rockId).color, label: e.name });
  });
  return byCode;
}

/**
 * Where a plane cuts the section, as a segment in (distance, elevation).
 *
 * A plane meets a vertical plane in a straight line, so this is exact rather
 * than traced: substitute the section's parametrisation into the plane
 * equation and what is left is a·s + b·z + d = 0. A vertical fault gives
 * b = 0 and comes out as a vertical line, with no special case for it.
 *
 * Returns null when the plane misses the drawn frame.
 */
export function planeTrace(frame, normal, center) {
  const a = frame.ux * normal[0] + frame.uy * normal[1];
  const b = normal[2];
  const d = (frame.ax - center[0]) * normal[0]
    + (frame.ay - center[1]) * normal[1]
    - center[2] * normal[2];
  return clipLineToRect(a, b, d, 0, frame.len, frame.z0, frame.z1);
}

/** The part of a·s + b·z + d = 0 inside a rectangle, or null. */
function clipLineToRect(a, b, d, s0, s1, z0, z1) {
  const hits = [];
  const add = (s, z) => {
    if (s < s0 - 1e-6 || s > s1 + 1e-6 || z < z0 - 1e-6 || z > z1 + 1e-6) return;
    if (hits.some((p) => Math.hypot(p[0] - s, p[1] - z) < 1e-6)) return;
    hits.push([s, z]);
  };
  if (Math.abs(b) > 1e-9) {
    add(s0, -(a * s0 + d) / b);
    add(s1, -(a * s1 + d) / b);
  }
  if (Math.abs(a) > 1e-9) {
    add(-(b * z0 + d) / a, z0);
    add(-(b * z1 + d) / a, z1);
  }
  return hits.length >= 2 ? [hits[0], hits[1]] : null;
}

/**
 * How steep a bed looks in this section.
 *
 * The apparent dip is the true dip foreshortened by how obliquely the line
 * crosses strike: cut exactly along strike and horizontal beds are what you
 * draw, however steep they really are. `toward` says which end of the line
 * the beds appear to go down towards, +1 for A′.
 */
export function apparentDip(strike, dip, frame) {
  const theta = (frame.az - strike) * DEG;
  const app = Math.atan(Math.tan(dip * DEG) * Math.abs(Math.sin(theta))) * RAD;
  // True dip points 90 degrees clockwise from strike, by the right-hand rule.
  const dd = (strike + 90) * DEG;
  const along = Math.sin(dd) * frame.ux + Math.cos(dd) * frame.uy;
  return { dip: app, toward: along >= 0 ? 1 : -1 };
}

/**
 * Stations close enough to the line to be worth showing on it, projected on
 * to it. `band` is how far off the line a reading may be, in metres.
 *
 * Projected, not moved: the point of drawing them is to show what was
 * measured against what the section claims, and a station three hundred
 * metres off the line has been carried some distance to get there. So the
 * offset comes back with it and the drawing can say so.
 */
export function projectReadings(readings, frame, band) {
  const out = [];
  for (const r of readings) {
    const dx = r.x - frame.ax;
    const dy = r.y - frame.ay;
    const s = dx * frame.ux + dy * frame.uy;
    if (s < 0 || s > frame.len) continue;
    const off = dx * -frame.uy + dy * frame.ux;
    if (Math.abs(off) > band) continue;
    out.push({
      ...r, s, offset: off,
      apparent: r.dip == null ? null : apparentDip(r.strike, r.dip, frame),
    });
  }
  return out;
}
