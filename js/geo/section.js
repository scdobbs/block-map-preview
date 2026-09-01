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

import { rockAt, reachEvent } from './unmake.js';
import { traceContours, chainSegments } from './marching.js';
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
 * Where the faults, dike walls and erosion surfaces meet the section, as
 * polylines in (distance, elevation).
 *
 * The thing to get right here is that a structure is not where it was made.
 * A fault plane is planar in the frame it cut, an erosion surface is a
 * heightfield in the frame it eroded — and every event YOUNGER than either has
 * moved it since. Fold a faulted block and the fault folds with it; intrude
 * through an unconformity and the unconformity is cut. Drawing a fault as the
 * plane it started as puts a straight red line through rock that is offset
 * along a curve, and says the deformation stopped happening at the fault.
 *
 * There is no forward map to draw them with, and there is not meant to be:
 * the whole model is built out of inverses, so that each event only ever has
 * to be undone (see unmake.js). But an inverse is all this needs. A structure
 * is the set of points that land ON it once the younger events are undone, so
 * sampling `reachEvent` over the section and contouring the result at zero
 * gives the trace — and gives it in exactly the frame `rockAt` asked its own
 * question in, which is why the drawn line lands on the raster's own
 * discontinuity rather than near it.
 *
 * `reachEvent` also says where a structure is not, which is half the drawing:
 * a trace has to STOP at rock younger than itself, or the picture claims the
 * opposite cross-cutting relation to the one the block is showing.
 *
 * `cols` and `rows` are the tracing grid, not the section's raster: a fault
 * trace is a smooth curve and does not need a sample per pixel to look like
 * one.
 */
export function structureTraces(h, frame, cols = 190, rows = 140) {
  const out = [];
  const dz = (frame.z1 - frame.z0) / rows;
  // Which unconformities are doing anything. One that claims no units the
  // younger ones left it is not a surface in the block at all — `rockAt` walks
  // straight past it — and a line drawn for it would mark a contact that is
  // not there. The walk is youngest-first because that is the order the
  // clamping happened in.
  const inert = new Set();
  let lo = 0;
  for (let k = h.events.length - 1; k >= 0; k--) {
    const e = h.events[k];
    if (e.type !== 'unconformity') continue;
    if (e.aboveCount <= lo) inert.add(e.id);
    else lo = e.aboveCount;
  }

  // Pass one: sample every structure's field over the section, and note where
  // the walk reaches that structure at all. Rock laid down on a younger
  // unconformity, or melted through by a younger intrusion, postdates this
  // structure and is not cut by it — `reachEvent` is the same walk `rockAt`
  // makes, and it stops in the same places.
  const fields = [];
  for (let k = 0; k < h.events.length; k++) {
    const e = h.events[k];
    if (inert.has(e.id)) continue;
    const field = structureField(e);
    if (!field) continue;
    const g = new Float32Array(cols * rows);
    const seen = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      const z = frame.z1 - (j + 0.5) * dz;
      for (let i = 0; i < cols; i++) {
        const s = ((i + 0.5) / cols) * frame.len;
        const [x, y] = frame.at(s);
        const r = reachEvent(h, [x, y, z], k);
        seen[j * cols + i] = r.reached ? 1 : 0;
        g[j * cols + i] = field(r.p);
      }
    }
    fields.push({ k, e, g, seen });
  }

  // Pass two: contour each, minus the cells a younger fault has torn.
  //
  // A fault younger than a structure carries one wall of it away from the
  // other, so the field is genuinely DISCONTINUOUS across that fault — which
  // is correct, and is the whole content of "the fault cuts the unconformity".
  // Marching squares cannot know that. It sees the two halves at very
  // different values, finds a sign change between them, and draws a contour
  // bridging the gap: a green dashed line lying exactly along the fault,
  // saying the fault is an unconformity. So a cell whose corners are not all
  // in the same fault block is not contoured, and the trace comes out as the
  // two pieces the fault actually left.
  const faults = fields.filter((x) => x.e.type === 'fault');
  for (const { k, e, g, seen } of fields) {
    const torn = faults.filter((x) => x.k > k).map((x) => x.g);
    const runs = [];
    for (const { seg } of traceContours(g, cols, rows, [0])) {
      for (const run of chainSegments(seg)) {
        for (const piece of splitAtGaps(run, seen, torn, cols, rows)) {
          runs.push(piece.map(([gx, gy]) => [
            ((gx + 0.5) / cols) * frame.len,
            frame.z1 - (gy + 0.5) * dz,
          ]));
        }
      }
    }
    if (runs.length) out.push({ id: e.id, kind: e.type, name: e.name, runs });
  }
  return out;
}

/**
 * Break a traced run at every cell where the field being contoured is not one
 * continuous, meaningful thing across all four corners. Two ways it can fail,
 * and a cell that fails either is not drawn:
 *
 *   - part of the cell is rock this structure never reached (`seen`), so the
 *     contour there would be the trace of a structure that is not in that rock
 *   - the cell straddles a younger fault (`torn`), which carried one wall of
 *     this structure away from the other, leaving the field genuinely
 *     discontinuous. Marching squares reads the jump as a sign change and
 *     bridges it, drawing a line along the fault
 *
 * Both leave the trace in the pieces the history actually left it in, which is
 * the point: where a fault trace stops IS the cross-cutting relation.
 */
function splitAtGaps(run, seen, torn, cols, rows) {
  const keep = [];

  const whole = (gx, gy) => {
    const i0 = Math.max(0, Math.min(cols - 2, Math.floor(gx)));
    const j0 = Math.max(0, Math.min(rows - 2, Math.floor(gy)));
    const c = [j0 * cols + i0, j0 * cols + i0 + 1,
      (j0 + 1) * cols + i0, (j0 + 1) * cols + i0 + 1];
    for (const q of c) if (!seen[q]) return false;
    for (const t of torn) {
      const a = t[c[0]] > 0;
      for (let m = 1; m < 4; m++) if ((t[c[m]] > 0) !== a) return false;
    }
    return true;
  };

  let cur = [];
  for (const p of run) {
    if (whole(p[0], p[1])) { cur.push(p); continue; }
    if (cur.length > 1) keep.push(cur);
    cur = [];
  }
  if (cur.length > 1) keep.push(cur);
  return keep;
}

/**
 * A signed field that is zero on the structure and read in the structure's own
 * frame — the same quantity the corresponding test in unmake.js compares
 * against, so the two cannot disagree.
 */
function structureField(e) {
  switch (e.type) {
    case 'fault': {
      // `side` in undoEvent: which wall of the plane the point is on.
      const n = e.normal;
      return (p) => (p[0] - e.centerX) * n[0]
        + (p[1] - e.centerY) * n[1]
        + (p[2] - e.centerZ) * n[2];
    }
    case 'dike': {
      // The dike is a slab crossed with a depth range, so its boundary is the
      // largest of the three distances — negative only inside all of them.
      const n = e.normal;
      const half = Math.max(1, e.thickness) * 0.5;
      const zTop = Math.max(e.topZ, e.bottomZ);
      const zBot = Math.min(e.topZ, e.bottomZ);
      return (p) => Math.max(
        Math.abs((p[0] - e.centerX) * n[0] + (p[1] - e.centerY) * n[1] + p[2] * n[2]) - half,
        p[2] - zTop,
        zBot - p[2],
      );
    }
    case 'unconformity':
      // Height above the erosion surface. The compiled event already carries
      // the derived datum, so this is the surface rockAt actually tests.
      return (p) => p[2] - surfaceHeight(e.surface, p[0], p[1]);
    default:
      return null;
  }
}

/**
 * Cut polylines back to the rock: the part of a trace above the land surface
 * is in the air, and nothing is there to be a fault or an unconformity.
 * Returns a new list of runs, split wherever one crosses the ground.
 */
export function clipRunsToGround(runs, groundAt) {
  const out = [];
  for (const run of runs) {
    let cur = [];
    for (let i = 0; i < run.length; i++) {
      const p = run[i];
      const under = p[1] <= groundAt(p[0]);
      if (under) { cur.push(p); continue; }
      // Leaving the rock: end on the ground rather than at the last sample.
      if (cur.length) {
        const q = run[i - 1];
        cur.push(crossGround(q, p, groundAt));
        out.push(cur);
        cur = [];
      }
      // Coming back in on the next step is handled when that step is under.
      const nx = run[i + 1];
      if (nx && nx[1] <= groundAt(nx[0])) cur.push(crossGround(p, nx, groundAt));
    }
    if (cur.length > 1) out.push(cur);
  }
  return out;
}

/** Bisect for where the segment a-b meets the ground. */
function crossGround(a, b, groundAt) {
  let lo = a;
  let hi = b;
  for (let i = 0; i < 12; i++) {
    const m = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    if (m[1] <= groundAt(m[0])) lo = m; else hi = m;
  }
  return lo;
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
