// Map units: the coloured areas between the contacts.
//
// A geologic map is mostly polygons, and until now this one had only the lines
// around them — leaving the student to hold the units in their head, which is
// exactly the part of reading a map that is worth making visible.
//
// The polygons are NOT stored. A unit patch is a name and a point inside it,
// and its extent is flooded out from that point to the surrounding contacts
// every time it is needed. That is the whole design:
//
//   - it cannot go stale. Drag a contact and the shading follows it, because
//     there is only ever one copy of the geometry — the lines.
//   - a whole geologic map costs a few dozen points of storage.
//
// The edge of the sheet is a boundary, exactly as it is on a printed map. Real
// contacts almost never close on each other: they run off the side of the area
// somebody walked, and the band between two of them is open at both ends. A
// fill that stopped only at contacts would escape from nearly every real map.
// Closing against the neat line is not a workaround, it is what a geologic map
// does — a unit that runs off the sheet is still a unit.
//
// Deliberately free of any coordinate system: it floods a plane. The map calls
// it in Web Mercator to shade the screen, and the block calls it in block
// metres to turn a patch into evidence, and neither has to know about the
// other.

/**
 * Line kinds that stop a fill.
 *
 * A traverse is where you walked, not a boundary, so it does not. A map
 * boundary does — it is the neat line, and drawing one is how you close the
 * open ends of a real map so its units can be filled in at all.
 */
export const BARRIER_KINDS = new Set(['contact', 'unconformity', 'fault', 'dike', 'boundary']);

/**
 * Flood every seed out to the surrounding barriers.
 *
 * @param {object} opts
 *   lines    [{ kind, pts: [[x,y], ...] }]
 *   seeds    [{ id, x, y }]
 *   box      { x0, y0, x1, y1 }
 *   res      cells across the longer side
 * @returns {{ owner: Int16Array, res, nx, ny, box, cell, wide: Set<string>,
 *             counts: Map<string, number> }}
 *   `wide` names any fill that took most of the sheet — drawn, but a sign
 *   there are too few contacts around it for the answer to mean much.
 *   `outside` names any seed that fell off the sheet altogether.
 *   `owner` holds the index into `seeds` for each cell, or -1.
 */
export function floodPatches({ lines, seeds, box, res = 512 }) {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const nx = w >= h ? res : Math.max(8, Math.round((w / h) * res));
  const ny = h > w ? res : Math.max(8, Math.round((h / w) * res));
  const cell = w / nx;

  const blocked = new Uint8Array(nx * ny);
  const toI = (x) => Math.floor(((x - box.x0) / w) * nx);
  const toJ = (y) => Math.floor(((y - box.y0) / h) * ny);

  for (const ln of lines) {
    if (!BARRIER_KINDS.has(ln.kind)) continue;
    const p = ln.pts || [];
    for (let k = 1; k < p.length; k++) {
      stroke(blocked, nx, ny, toI(p[k - 1][0]), toJ(p[k - 1][1]), toI(p[k][0]), toJ(p[k][1]));
    }
    if (p.length > 1) {
      cap(blocked, nx, ny, toI(p[0][0]), toJ(p[0][1]));
      cap(blocked, nx, ny, toI(p[p.length - 1][0]), toJ(p[p.length - 1][1]));
    }
  }

  const owner = new Int16Array(nx * ny).fill(-1);
  const wide = new Set();
  const counts = new Map();
  // Not an escape hatch — the edge is a wall — but a fill that swallows very
  // nearly the whole sheet means nothing bounded it at all.
  //
  // The threshold has to clear a legitimately large unit. Somebody who draws a
  // map boundary and shades the ground inside it can easily fill seventy per
  // cent of the sheet and be entirely right; only a fill with no boundary
  // anywhere reaches the middle nineties.
  const broad = Math.floor(nx * ny * 0.88);

  // Each seed floods its own region without regard to the others, and only
  // then are overlaps resolved.
  //
  // Flooding them in turn instead would let whichever was tapped first claim
  // the ground and starve the rest — and the one most likely to be tapped
  // first is the broad background outside the contacts, which would swallow
  // every band before they were drawn. Order of tapping is not evidence about
  // geology and must not decide the map.
  const stamp = new Int32Array(nx * ny);
  const regions = [];

  const outside = new Set();
  seeds.forEach((seed, index) => {
    const si = toI(seed.x);
    const sj = toJ(seed.y);
    // A seed off the sheet cannot be flooded against anything. Named rather
    // than silently skipped: it is nearly always a point somewhere the mapping
    // is not, and the person who tapped it deserves to be told which.
    if (si < 0 || sj < 0 || si >= nx || sj >= ny) {
      outside.add(seed.id);
      regions.push(null);
      return;
    }
    const start = free(blocked, stamp, index + 1, nx, ny, si, sj);
    if (start < 0) { regions.push(null); return; }

    const stack = [start];
    const cells = [start];
    stamp[start] = index + 1;
    while (stack.length) {
      const at = stack.pop();
      const i = at % nx;
      const j = (at - i) / nx;
      for (let d = 0; d < 4; d++) {
        const ni = i + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const nj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const at2 = nj * nx + ni;
        if (blocked[at2] || stamp[at2] === index + 1) continue;
        stamp[at2] = index + 1;
        cells.push(at2);
        stack.push(at2);
      }
    }
    regions.push(cells);
    counts.set(seed.id, cells.length);
    if (cells.length > broad) wide.add(seed.id);
  });

  // Biggest first, so a tightly bounded band is painted over the broad
  // background it sits inside rather than being hidden beneath it. The most
  // specific reading of a point is the one worth showing.
  const order = regions
    .map((cells, index) => ({ index, n: cells ? cells.length : -1 }))
    .filter((r) => r.n >= 0)
    .sort((a, b) => b.n - a.n);
  for (const { index } of order) {
    for (const at of regions[index]) owner[at] = index;
  }

  return { owner, nx, ny, box, cell, wide, counts, outside };
}

/**
 * The nearest unblocked cell to a seed that landed on a line.
 *
 * Kept deliberately short. A long search does not rescue a seed, it walks it
 * through the very contact it was meant to stop at and shades the unit next
 * door instead — confidently, and with no sign that anything went wrong. Two
 * cells clears a line or the junction of two, and a tap further into the rock
 * than that was never blocked to begin with.
 */
const SNAP = 2;

function free(blocked, stamp, gen, nx, ny, si, sj) {
  for (let r = 0; r <= SNAP; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = si + di;
        const j = sj + dj;
        if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
        const at = j * nx + i;
        if (!blocked[at] && stamp[at] !== gen) return at;
      }
    }
  }
  return -1;
}

/**
 * Bresenham, one cell wide.
 *
 * A contact is a line, and on a map with a dike in it a barrier three cells
 * thick is not a rounding error — it is the whole unit. At a sheet a kilometre
 * across, three cells is seven metres, so the two walls of a fifteen-metre dike
 * eat the band between them and the fill comes out as broken slivers, or
 * escapes into the neighbouring unit entirely.
 *
 * One cell holds because of what is on the other side of it: the flood walks
 * the FOUR neighbours and Bresenham lays down an EIGHT-connected line, and a
 * 4-connected path cannot cross an 8-connected one. Where the line steps
 * diagonally the two cells left open are themselves diagonal, so the fill
 * cannot step between them, and going round means running along the line,
 * which continues. The thickening was guarding against a leak that the
 * connectivity had already ruled out.
 *
 * Change the flood to eight neighbours and this stops being true. The two go
 * together.
 */
function stroke(blocked, nx, ny, x0, y0, x1, y1) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let guard = 0;
  for (;;) {
    if (x >= 0 && y >= 0 && x < nx && y < ny) blocked[y * nx + x] = 1;
    if ((x === x1 && y === y1) || guard++ > 100000) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/**
 * How far a line's END is thickened, in cells.
 *
 * The one place a hand-drawn map really does leak is a junction: a contact
 * drawn to die against a fault, stopping a metre short of it. The interior of
 * a line needs no help — it is continuous by construction — so the forgiveness
 * is spent where it is needed and nowhere else, which is what lets the
 * interior stay one cell wide through the narrowest band on the sheet.
 */
const END_CAP = 1;

function cap(blocked, nx, ny, x, y) {
  for (let j = y - END_CAP; j <= y + END_CAP; j++) {
    for (let i = x - END_CAP; i <= x + END_CAP; i++) {
      if (i >= 0 && j >= 0 && i < nx && j < ny) blocked[j * nx + i] = 1;
    }
  }
}

/**
 * Points inside each patch, thinned to something a fit can afford to evaluate.
 *
 * Returned in the same plane the flood ran in, so the caller decides what the
 * numbers mean.
 */
export function samplePatches(flood, seeds, perPatch = 160) {
  const { owner, nx, ny, box } = flood;
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const bins = seeds.map(() => []);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const o = owner[j * nx + i];
      if (o < 0) continue;
      bins[o].push([box.x0 + ((i + 0.5) / nx) * w, box.y0 + ((j + 0.5) / ny) * h]);
    }
  }
  return bins.map((pts) => {
    if (pts.length <= perPatch) return pts;
    const step = pts.length / perPatch;
    const out = [];
    for (let k = 0; k < perPatch; k++) out.push(pts[Math.floor(k * step)]);
    return out;
  });
}

/**
 * The sheet: a box round the mapping, with a margin.
 *
 * Built from the LINES and not from the seeds, because the seeds are wherever
 * somebody tapped and the sheet is what they mapped. One stray station — a
 * reading taken at a desk three hundred kilometres away, which every real
 * notebook accumulates — would otherwise stretch the sheet across four degrees
 * of longitude, make every cell most of a kilometre across, and collapse every
 * contact on the map into the same region. Seeds are only consulted when there
 * are no lines at all to define anything.
 */
export function extentOf(lines, seeds, pad = 0.04) {
  const xs = [];
  const ys = [];
  for (const ln of lines) for (const p of ln.pts || []) { xs.push(p[0]); ys.push(p[1]); }
  if (!xs.length) for (const s of seeds) { xs.push(s.x); ys.push(s.y); }
  if (!xs.length) return null;
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  // A square-ish margin, and never zero-width on a single straight line.
  const mx = Math.max((x1 - x0) * pad, (y1 - y0) * pad, 1e-9);
  return { x0: x0 - mx, y0: y0 - mx, x1: x1 + mx, y1: y1 + mx };
}
