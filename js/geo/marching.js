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
