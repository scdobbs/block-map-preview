// Marching squares, on any grid of numbers.
//
// It lives here rather than in field/dem.js because it is not about elevation:
// the Map section traces contours of the ground with it, and the block traces
// the outcrop pattern its own history predicts with it -- a grid of
// stratigraphic depth rather than of height. Both halves need it, and field/
// depends on geo/ rather than the other way about, so it belongs on this side.

/**
 * Marching squares.
 *
 * Returns flat segment lists per level, in grid coordinates. Segments from
 * adjacent cells already meet end to end, so stroking them individually draws
 * a continuous line without the bookkeeping of chaining them into polylines —
 * which matters because this runs on a phone, per tile, for a dozen levels.
 */
export function traceContours(grid, w, h, levels) {
  const out = [];
  for (const level of levels) {
    const seg = [];
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const tl = grid[y * w + x];
        const tr = grid[y * w + x + 1];
        const bl = grid[(y + 1) * w + x];
        const br = grid[(y + 1) * w + x + 1];

        let idx = 0;
        if (tl > level) idx |= 8;
        if (tr > level) idx |= 4;
        if (br > level) idx |= 2;
        if (bl > level) idx |= 1;
        if (idx === 0 || idx === 15) continue;

        // Where the level crosses each edge of the cell.
        const T = () => [x + frac(tl, tr, level), y];
        const R = () => [x + 1, y + frac(tr, br, level)];
        const B = () => [x + frac(bl, br, level), y + 1];
        const L = () => [x, y + frac(tl, bl, level)];

        const push = (p, q) => { seg.push(p[0], p[1], q[0], q[1]); };

        switch (idx) {
          case 1: case 14: push(L(), B()); break;
          case 2: case 13: push(B(), R()); break;
          case 3: case 12: push(L(), R()); break;
          case 4: case 11: push(T(), R()); break;
          case 6: case 9:  push(T(), B()); break;
          case 7: case 8:  push(L(), T()); break;
          // The ambiguous saddles. Resolved with the cell's own mean, which
          // is the usual choice and keeps neighbouring cells consistent.
          case 5: {
            const mid = (tl + tr + bl + br) / 4;
            if (mid > level) { push(L(), T()); push(B(), R()); }
            else { push(L(), B()); push(T(), R()); }
            break;
          }
          case 10: {
            const mid = (tl + tr + bl + br) / 4;
            if (mid > level) { push(T(), R()); push(L(), B()); }
            else { push(L(), T()); push(B(), R()); }
            break;
          }
          default: break;
        }
      }
    }
    if (seg.length) out.push({ level, seg: Float32Array.from(seg) });
  }
  return out;
}

/**
 * Marching squares emits its segments in raster order, not along the line, so
 * they have to be chained before anything can be drawn or walked as a trace.
 * Adjacent cells compute their shared endpoint from the same two samples at the
 * same level, so the coordinates match exactly and the join is a lookup rather
 * than a nearest-neighbour search.
 */
export function chainSegments(seg) {
  const K = (x, y) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
  const n = seg.length / 4;
  const at = new Map();
  for (let i = 0; i < n; i++) {
    for (const k of [K(seg[i * 4], seg[i * 4 + 1]), K(seg[i * 4 + 2], seg[i * 4 + 3])]) {
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(i);
    }
  }
  const used = new Uint8Array(n);
  const runs = [];
  for (let s = 0; s < n; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const pts = [[seg[s * 4], seg[s * 4 + 1]], [seg[s * 4 + 2], seg[s * 4 + 3]]];
    for (const fromHead of [false, true]) {
      for (;;) {
        const p = fromHead ? pts[0] : pts[pts.length - 1];
        const next = (at.get(K(p[0], p[1])) || []).find((c) => !used[c]);
        if (next == null) break;
        used[next] = 1;
        const a = [seg[next * 4], seg[next * 4 + 1]];
        const b = [seg[next * 4 + 2], seg[next * 4 + 3]];
        const other = K(a[0], a[1]) === K(p[0], p[1]) ? b : a;
        if (fromHead) pts.unshift(other); else pts.push(other);
      }
    }
    runs.push(pts);
  }
  return runs;
}

function frac(a, b, level) {
  const d = b - a;
  return Math.abs(d) < 1e-9 ? 0.5 : Math.max(0, Math.min(1, (level - a) / d));
}

export function levelsFor(lo, hi, interval) {
  const out = [];
  if (!(interval > 0)) return out;
  const start = Math.ceil(lo / interval) * interval;
  // A guard rather than a limit anyone should hit: if the interval is tiny
  // relative to the relief this would otherwise try to draw thousands.
  for (let v = start; v <= hi && out.length < 400; v += interval) out.push(v);
  return out;
}
