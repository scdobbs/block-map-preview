// Station symbols, drawn on a 2D canvas.
//
// These are the same marks the block diagram draws in 3D, and deliberately so:
// a student who has read a fold off the block should recognize every symbol on
// the map without being told. The thresholds for "flat" and "on end" come from
// geo/math.js, which is what keeps the two views from ever disagreeing.

import { FLAT_DIP, VERTICAL_DIP } from '../../geo/math.js';
import { feature, isLinearFeature, isOverturned, lineKind, lineCertainty } from '../../field/model.js';

const DEG = Math.PI / 180;

/**
 * A unit vector along an azimuth in screen pixels.
 * North is up the screen, and screen Y grows downward, hence the negation.
 */
function azVec(azDeg) {
  const a = azDeg * DEG;
  return [Math.sin(a), -Math.cos(a)];
}

/**
 * One station.
 *
 * `size` is the half-length of the strike line in pixels. Everything else is
 * proportioned from it, so the whole symbol scales as one thing.
 */
export function drawStation(ctx, x, y, st, {
  size = 15, color = '#ffc857', selected = false, label = null, scale = 1,
} = {}) {
  const s = size * scale;
  const lw = Math.max(1.6, 2 * scale);

  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // A dark backing stroke under everything. Over aerial photography a thin
  // yellow line on pale limestone is invisible, and this is the cheapest fix
  // that does not involve knowing what is underneath.
  const stroke = (path, width, style) => {
    ctx.lineWidth = width + Math.max(2, 2.5 * scale);
    ctx.strokeStyle = 'rgba(8, 12, 15, .75)';
    path();
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    path();
  };

  const linear = isLinearFeature(st.feature);
  const hasAttitude = linear
    ? Number.isFinite(st.trend) && Number.isFinite(st.plunge)
    : Number.isFinite(st.strike) && Number.isFinite(st.dip);

  // Anything that is not bedding is tagged, because the symbol alone cannot
  // say so and a joint mistaken for bedding is a fold axis that never was.
  // Tag and station number are drawn as one string rather than two, so they
  // can only ever need one clear space instead of two.
  const tag = st.feature && st.feature !== 'bedding' ? feature(st.feature).short : null;
  const annot = [tag, label].filter(Boolean).join(' ');

  if (linear && hasAttitude) {
    // A lineation is an arrow lying along its trend, pointing down-plunge.
    // Steeper lines get a shorter shaft, so a near-vertical one reads as a
    // point rather than pretending to a map direction it barely has.
    const [tx, ty] = azVec(st.trend);
    const len = s * (1 - 0.55 * (st.plunge / 90));
    const head = s * 0.34;
    const [px, py] = azVec(st.trend + 90);
    stroke(() => {
      ctx.beginPath();
      ctx.moveTo(-tx * len, -ty * len);
      ctx.lineTo(tx * len, ty * len);
      ctx.moveTo(tx * len - tx * head + px * head * 0.5, ty * len - ty * head + py * head * 0.5);
      ctx.lineTo(tx * len, ty * len);
      ctx.lineTo(tx * len - tx * head - px * head * 0.5, ty * len - ty * head - py * head * 0.5);
      ctx.stroke();
    }, lw, color);
    drawText(ctx, `${Math.round(st.plunge)}`, -tx * (len + 9 * scale), -ty * (len + 9 * scale), {
      color, scale, weight: 600,
    });
  } else if (!hasAttitude) {
    // A station with no attitude: a plain ring. It is a real observation and
    // it says so, rather than borrowing a symbol that claims a measurement.
    stroke(() => {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }, lw, color);
  } else if (st.dip < FLAT_DIP) {
    // Horizontal: cross in a circle.
    stroke(() => {
      ctx.beginPath();
      ctx.moveTo(-s * 0.75, 0); ctx.lineTo(s * 0.75, 0);
      ctx.moveTo(0, -s * 0.75); ctx.lineTo(0, s * 0.75);
      ctx.stroke();
    }, lw, color);
    stroke(() => {
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }, lw, color);
  } else {
    const [sx, sy] = azVec(st.strike);
    // Down-dip sits 90 degrees clockwise from strike.
    const [dx, dy] = azVec(st.strike + 90);

    if (st.dip > VERTICAL_DIP) {
      // On end: a tick to either side of the strike line.
      stroke(() => {
        ctx.beginPath();
        ctx.moveTo(-sx * s, -sy * s); ctx.lineTo(sx * s, sy * s);
        ctx.moveTo(-dx * s * 0.42, -dy * s * 0.42); ctx.lineTo(dx * s * 0.42, dy * s * 0.42);
        ctx.stroke();
      }, lw, color);
    } else {
      const tick = s * (0.34 + 0.28 * (st.dip / 90));
      // Overturned beds get the recurved tick a printed map uses: at the end
      // of the dip tick it turns along strike and comes back up. Back UP
      // rather than on past the tick, so the symbol reaches no further than an
      // upright one and the dip number below still lands clear of it.
      const hook = isOverturned(st);
      stroke(() => {
        ctx.beginPath();
        ctx.moveTo(-sx * s, -sy * s); ctx.lineTo(sx * s, sy * s);
        ctx.moveTo(0, 0); ctx.lineTo(dx * tick, dy * tick);
        if (hook) {
          const across = s * 0.30;
          const back = s * 0.34;
          ctx.lineTo(dx * tick + sx * across, dy * tick + sy * across);
          ctx.lineTo(dx * (tick - back) + sx * across, dy * (tick - back) + sy * across);
        }
        ctx.stroke();
      }, lw, color);

      // The dip number, set just beyond the tick and always upright — a map
      // is read with the sheet the right way up, not turned to follow each
      // symbol round.
      drawText(ctx, `${Math.round(st.dip)}`, dx * (tick + 9 * scale), dy * (tick + 9 * scale), {
        color, scale, weight: 600,
      });
    }
  }

  // The label goes up-dip — the opposite side from the dip number.
  //
  // A fixed corner looks fine until the beds dip north-east, and then the
  // station number is printed straight through the dip: "88" and "2" become
  // an unreadable "8&2". Hanging it off the dip direction means the two are
  // always half a symbol apart whichever way the rock faces.
  if (annot) {
    if (linear && hasAttitude) {
      // Down-plunge end; the plunge number is at the tail.
      const [ux, uy] = azVec(st.trend + 90);
      drawText(ctx, annot, ux * s * 0.7, uy * s * 0.7, {
        color: '#dce8f0', scale, size: 10, weight: 650, align: 'center',
      });
    } else if (hasAttitude && !linear && st.dip >= FLAT_DIP) {
      const [ux, uy] = azVec(st.strike - 90);
      drawText(ctx, annot, ux * s * 0.62, uy * s * 0.62, {
        color: '#dce8f0', scale, size: 10, weight: 650, align: 'center',
      });
    } else {
      // No dip direction to hang it off; the corner is free either way.
      drawText(ctx, annot, s * 0.85, -s * 0.78, {
        color: '#dce8f0', scale, size: 10, weight: 650, align: 'left',
      });
    }
  }

  if (selected) {
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.15, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.setLineDash([4 * scale, 3 * scale]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawText(ctx, text, x, y, { color = '#fff', scale = 1, size = 11, weight = 600, align = 'center' } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3 * scale;
  ctx.strokeStyle = 'rgba(8, 12, 15, .8)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Where you are, and how well the phone knows it.
 *
 * The accuracy ring is drawn to true ground scale rather than as a fixed
 * decoration, which is the whole point of it: standing under trees with a
 * forty-meter fix, the ring covers half the outcrop and the student can see
 * that placing a station now would be placing it approximately.
 */
export function drawPosition(ctx, x, y, { accuracyPx = 0, heading = null, scale = 1, good = true, stale = false }) {
  ctx.save();
  ctx.translate(x, y);

  if (accuracyPx > 2) {
    ctx.beginPath();
    ctx.arc(0, 0, accuracyPx, 0, Math.PI * 2);
    ctx.fillStyle = good ? 'rgba(90, 170, 255, .13)' : 'rgba(255, 160, 60, .14)';
    ctx.fill();
    ctx.strokeStyle = good ? 'rgba(90, 170, 255, .45)' : 'rgba(255, 160, 60, .5)';
    ctx.lineWidth = 1 * scale;
    ctx.stroke();
  }

  if (heading != null) {
    const [hx, hy] = azVec(heading);
    const [px, py] = azVec(heading + 90);
    const len = 22 * scale, half = 9 * scale;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(hx * len + px * half, hy * len + py * half);
    ctx.lineTo(hx * len - px * half, hy * len - py * half);
    ctx.closePath();
    ctx.fillStyle = 'rgba(90, 170, 255, .35)';
    ctx.fill();
  }

  const r = 7 * scale;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  // A fix that has stopped arriving is drawn hollow. It was true a minute ago
  // and it is not a live position now, and those are different things.
  if (stale) {
    ctx.strokeStyle = '#5aaaff';
    ctx.lineWidth = 2.5 * scale;
    ctx.stroke();
  } else {
    ctx.fillStyle = good ? '#5aaaff' : '#ffa03c';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 * scale;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A mapped line — a contact, a fault, a traverse.
 *
 * Drawn the way a published map draws it: weight by what it is, dash pattern
 * by how well it is known. The pale halo underneath is not decoration; these
 * are dark lines and the basemaps are pale topo sheets and tan desert, so a
 * dark line over a shadowed cliff would otherwise vanish exactly where the
 * geology is most interesting.
 */
// ---------------------------------------------------------------------------
// A dike, drawn as the sheet it is
// ---------------------------------------------------------------------------
// Wide enough to see through, so it is drawn the way a map prints a unit
// rather than the way it prints a boundary: a translucent wash with the rock's
// own ornament in it, cased in white and walled in its own colour. A solid bar
// laid over aerial photography hides the ground the dike was mapped from,
// which is the one thing a student is holding the map up to compare it with.

/** A hex colour at a given alpha. */
function withAlpha(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * The two edges of a band of a given width about a polyline.
 *
 * Each vertex takes the average of its two segment normals, lengthened by the
 * miter so the band keeps its width through a bend rather than pinching at
 * every corner. The miter is capped, because a trace doubling back on itself
 * would otherwise throw a spike halfway across the sheet.
 */
function bandEdges(pts, half) {
  const seg = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy) || 1;
    seg.push({ x: -dy / len, y: dx / len });
  }
  if (!seg.length) return null;

  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = seg[Math.max(0, i - 1)];
    const b = seg[Math.min(seg.length - 1, i)];
    let nx = a.x + b.x;
    let ny = a.y + b.y;
    const len = Math.hypot(nx, ny);
    let mx;
    let my;
    if (len < 1e-6) { mx = a.x; my = a.y; } else {
      nx /= len; ny /= len;
      mx = nx * Math.min(1 / Math.max(nx * a.x + ny * a.y, 0.25), 4);
      my = ny * Math.min(1 / Math.max(nx * a.x + ny * a.y, 0.25), 4);
    }
    left.push({ x: pts[i].x + mx * half, y: pts[i].y + my * half });
    right.push({ x: pts[i].x - mx * half, y: pts[i].y - my * half });
  }
  return { left, right };
}

/** The band as one closed path: up one wall and back down the other. */
function bandPath(ctx, edges) {
  ctx.moveTo(edges.left[0].x, edges.left[0].y);
  for (let i = 1; i < edges.left.length; i++) ctx.lineTo(edges.left[i].x, edges.left[i].y);
  for (let i = edges.right.length - 1; i >= 0; i--) ctx.lineTo(edges.right[i].x, edges.right[i].y);
  ctx.closePath();
}

/**
 * Chevrons, marching along the sheet.
 *
 * The mark the block draws on volcanic rock (PATTERN 6 in geo/glsl.js), so a
 * basalt dike carries the same ornament in plan as it does on the face of the
 * block it builds.
 *
 * Placed along the trace rather than tiled across the screen, which was the
 * first attempt and is wrong for a body this shape. A screen-space tile knows
 * nothing about the band it is filling: in something twenty pixels across it
 * lands a grid of fragments that reads as a mesh, and turning the tile up
 * large enough to read simply clips it away. Walking the centreline instead
 * puts one chevron across the sheet however wide it is, pointing the way the
 * dike runs, and there are no seams to line up.
 */
function drawChevrons(ctx, pts, w, color, scale) {
  const across = w * 0.30;              // half the span, square to the sheet
  const along = w * 0.20;               // how far the apex leads the arms
  const step = Math.max(9 * scale, w * 0.62);

  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, Math.min(1.8, w * 0.075) * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Distance carried between segments, so the spacing is even along the whole
  // trace rather than restarting at every vertex.
  let carry = step * 0.5;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const tx = dx / len;
    const ty = dy / len;
    for (let d = carry; d < len; d += step) {
      const cx = pts[i - 1].x + tx * d;
      const cy = pts[i - 1].y + ty * d;
      ctx.beginPath();
      ctx.moveTo(cx - ty * across - tx * along, cy + tx * across - ty * along);
      ctx.lineTo(cx + tx * along, cy + ty * along);
      ctx.lineTo(cx + ty * across - tx * along, cy - tx * across - ty * along);
      ctx.stroke();
    }
    carry = Math.max(0, carry + step * Math.ceil((len - carry) / step) - len);
  }
}

// ---------------------------------------------------------------------------
// Fault ornament
// ---------------------------------------------------------------------------
// The marks a geologic map puts on a fault to say what it did, which is the
// half of a fault no trace can carry: teeth on the upper plate of a thrust,
// hachures on the dropped side of a normal fault, paired half-arrows for a
// strike-slip one.
//
// All three hang off two things the mapper already told the line card — the
// sense, and which way the plane leans — so nothing here is inferred and a
// fault that has not been asked about is drawn plain. Saying nothing is the
// right answer to "which side went down?" when nobody has said.

/**
 * Which side of the trace the hanging wall is on, as +1 or -1 against the
 * right-hand normal of a segment running in direction `t`.
 *
 * Screen Y grows downward, so the right-hand normal of (tx, ty) is (-ty, tx)
 * and not (ty, -tx). Getting that backwards puts every tick on the footwall,
 * which is not a subtle error on a map — it is the opposite claim.
 */
function hangingSide(dipDir, tx, ty) {
  const [ax, ay] = azVec(dipDir);
  return (ax * -ty + ay * tx) >= 0 ? 1 : -1;
}

/** Total drawn length of a polyline, in pixels. */
function lineLengthPx(pts) {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    sum += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return sum;
}

/**
 * Walk a polyline, calling back at an even spacing along the whole of it.
 *
 * Spacing is carried between segments rather than restarting at each vertex,
 * or the marks would bunch at every bend in the trace.
 */
function alongLine(pts, step, first, fn) {
  let carry = first;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const tx = dx / len;
    const ty = dy / len;
    for (let d = carry; d < len; d += step) {
      fn(pts[i - 1].x + tx * d, pts[i - 1].y + ty * d, tx, ty);
    }
    carry = Math.max(0, carry + step * Math.ceil((len - carry) / step) - len);
  }
}

function drawFaultOrnament(ctx, pts, line, color, scale) {
  const sense = line.sense || '';
  if (!sense) return;
  // Dip-slip ornament sits on one side, and which side is the whole of what it
  // says. Without a dip direction there is no hanging wall to put it on.
  const dipSlip = sense === 'normal' || sense === 'reverse';
  if (dipSlip && !Number.isFinite(line.dipDir)) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  if (sense === 'reverse') {
    // Teeth on the upper plate, filled, base on the trace.
    const size = 7 * scale;
    alongLine(pts, 34 * scale, 12 * scale, (x, y, tx, ty) => {
      const sgn = hangingSide(line.dipDir, tx, ty);
      const nx = -ty * sgn;
      const ny = tx * sgn;
      ctx.beginPath();
      ctx.moveTo(x - tx * size * 0.62, y - ty * size * 0.62);
      ctx.lineTo(x + nx * size, y + ny * size);
      ctx.lineTo(x + tx * size * 0.62, y + ty * size * 0.62);
      ctx.closePath();
      ctx.fill();
    });
  } else if (sense === 'normal') {
    // Hachures on the side that went down, which for a normal fault is the
    // hanging wall. A bar square to the trace, not a tooth: the two must not
    // be mistakable for each other at a glance, which is the entire reason
    // geologic maps use different marks for them.
    const size = 7 * scale;
    ctx.lineWidth = Math.max(1.4, 1.8 * scale);
    alongLine(pts, 26 * scale, 10 * scale, (x, y, tx, ty) => {
      const sgn = hangingSide(line.dipDir, tx, ty);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + -ty * sgn * size, y + tx * sgn * size);
      ctx.stroke();
    });
  } else {
    // Strike-slip: a half-arrow either side, each pointing the way ITS OWN
    // block moved. Dextral means the far block goes to your right whichever
    // side you stand on, so the block to the right of the direction of travel
    // moves backward along it and the one to the left moves forward.
    // A handful along the whole fault, not a row of them.
    //
    // Teeth and hachures run the length of a trace because each one is saying
    // something local — this stretch of the line is the one with the upper
    // plate on that side. A pair of half-arrows says one thing about the whole
    // fault, so a map prints it once or twice and moves on, and a chain of
    // them reads as ornament rather than as a sense of motion.
    //
    // Counted off the DRAWN length rather than the ground length, so the
    // density stays right as the map is zoomed — which is what a map printed
    // at two different scales does anyway.
    const dex = sense === 'dextral' ? 1 : -1;
    const off = 6 * scale;        // how far each arrow sits off the trace
    const len = 22 * scale;
    const head = 6 * scale;
    const total = lineLengthPx(pts);
    const n = Math.max(1, Math.min(3, Math.round(total / (320 * scale))));
    // Evenly spread with equal margins at both ends: one lands in the middle,
    // two at the quarters, three at the sixths.
    let placed = 0;
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    alongLine(pts, total / n, total / (2 * n), (x, y, tx, ty) => {
      if (placed++ >= n) return;    // guard the rounding at the far end
      const rx = -ty;
      const ry = tx;
      for (const side of [1, -1]) {
        // The block on the right of travel moves backward for a dextral fault.
        const dir = -side * dex;
        const bx = x + rx * off * side - tx * len * 0.5 * dir;
        const by = y + ry * off * side - ty * len * 0.5 * dir;
        const ex = bx + tx * len * dir;
        const ey = by + ty * len * dir;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(ex, ey);
        // A half barb, on the side away from the trace, so the pair reads as
        // two blocks sliding past each other rather than as four arrows.
        ctx.lineTo(ex - tx * head * dir + rx * head * 0.75 * side,
          ey - ty * head * dir + ry * head * 0.75 * side);
        ctx.stroke();
      }
    });
  }
  ctx.restore();
}

/**
 * Draw a line as a band of its true width. Returns false if it is too narrow
 * to be worth it, in which case the caller draws the ordinary line symbol.
 */
function drawBand(ctx, pts, line, kind, w, { selected, dash, scale }) {
  const edges = bandEdges(pts, w / 2);
  if (!edges) return false;
  const outer = bandEdges(pts, w / 2 + Math.max(1.6, 2 * scale));

  // The white casing, as a RING. Filling a wider band and laying a translucent
  // one on top would put white behind the wash and bleach it; even-odd paints
  // only the ground between the two outlines, so the casing stays outside.
  if (outer) {
    ctx.beginPath();
    bandPath(ctx, outer);
    bandPath(ctx, edges);
    ctx.fillStyle = 'rgba(255, 255, 255, .8)';
    ctx.fill('evenodd');
  }

  ctx.beginPath();
  bandPath(ctx, edges);

  ctx.fillStyle = withAlpha(kind.color, 0.32);
  ctx.fill();

  // Ornament only once there is room for it. Any narrower and a chevron is
  // three pixels of nothing, and the wash alone says more.
  if (w > 9 * scale) {
    ctx.save();
    ctx.clip();
    drawChevrons(ctx, pts, w, withAlpha(kind.color, 0.9), scale);
    ctx.restore();
  }

  // The walls. Dashed when the mapper said the contact is anything short of
  // certain, exactly as a thin line of the same kind would be.
  ctx.setLineDash(dash);
  ctx.lineWidth = Math.max(1.1, 1.4 * scale);
  ctx.strokeStyle = kind.color;
  ctx.stroke();
  ctx.setLineDash([]);

  if (selected && outer) {
    ctx.beginPath();
    bandPath(ctx, outer);
    ctx.lineWidth = Math.max(2.5, 3 * scale);
    ctx.strokeStyle = 'rgba(255, 200, 87, .75)';
    ctx.stroke();
  }
  return true;
}

export function drawLine(ctx, pts, line, {
  selected = false, scale = 1, drawing = false, active = -1, groundWidth = 0,
} = {}) {
  if (pts.length < 2) return;
  const kind = lineKind(line.kind);
  const dash = lineCertainty(line.certainty).dash.map((d) => d * scale);
  // A line symbol is a MINIMUM, not a width. A contact has no width — it is a
  // surface seen edge on — so the weight in LINE_KINDS is a drawing decision
  // and nothing more. A dike does have one, and where the sheet is wider on
  // the ground than the symbol is on the screen, the ground wins and the line
  // is drawn at the width the rock actually is. Zoom out far enough and the
  // symbol takes over again, which is what stops a four-metre dike vanishing
  // from a map of a whole valley.
  const w = Math.max(kind.weight * scale, groundWidth);

  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Wide enough to have an inside? Then it is a body and not a boundary, and
  // it is drawn as one. A couple of pixels of margin over the symbol's own
  // weight, so a dike does not flicker between the two on a pinch-zoom.
  const asBand = groundWidth > kind.weight * scale + 2 * scale
    && drawBand(ctx, pts, line, kind, w, { selected, dash, scale });

  if (!asBand) {
    ctx.setLineDash([]);
    ctx.lineWidth = w + 3.5 * scale;
    ctx.strokeStyle = 'rgba(255, 255, 255, .8)';
    path(); ctx.stroke();

    ctx.setLineDash(dash);
    ctx.lineWidth = w;
    ctx.strokeStyle = kind.color;
    path(); ctx.stroke();

    if (selected) {
      ctx.setLineDash([]);
      ctx.lineWidth = w + 7 * scale;
      ctx.strokeStyle = 'rgba(255, 200, 87, .45)';
      path(); ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  if (line.kind === 'fault') drawFaultOrnament(ctx, pts, line, kind.color, scale);

  // Vertices are shown only while the line is being built or is selected.
  // On a finished map they would turn every contact into a string of beads.
  if (drawing || selected) {
    for (let i = 0; i < pts.length; i++) {
      const last = drawing && i === pts.length - 1;
      const held = i === active;
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, (held ? 8 : last ? 6 : 4.5) * scale, 0, Math.PI * 2);
      ctx.fillStyle = held || last ? '#ffc857' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = held ? '#ffffff' : 'rgba(8, 12, 15, .75)';
      ctx.lineWidth = (held ? 2.5 : 1.5) * scale;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Distance in pixels from a point to a polyline, for tapping one. */
export function distanceToLine(pts, x, y) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1,
      ((x - a.x) * dx + (y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
  }
  return best;
}

/** The box being drawn for a download, plus its own handles. */
export function drawSelection(ctx, x0, y0, x1, y1, scale = 1) {
  const w = x1 - x0, h = y1 - y0;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 200, 87, .10)';
  ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = '#ffc857';
  ctx.lineWidth = 2 * scale;
  ctx.setLineDash([7 * scale, 4 * scale]);
  ctx.strokeRect(x0, y0, w, h);
  ctx.setLineDash([]);
  for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, 7 * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#ffc857';
    ctx.fill();
    ctx.strokeStyle = '#2a1f05';
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();
  }
  ctx.restore();
}

/** A downloaded area's footprint, so its edge is visible while walking. */
export function drawAreaOutline(ctx, x0, y0, x1, y1, { complete = true, scale = 1 } = {}) {
  ctx.save();
  ctx.strokeStyle = complete ? 'rgba(120, 200, 140, .55)' : 'rgba(255, 140, 90, .65)';
  ctx.lineWidth = 1.5 * scale;
  if (!complete) ctx.setLineDash([6 * scale, 4 * scale]);
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}

/** Scale bar: a round number of meters, measured on the ground. */
export function niceScaleBar(metersPerPixel, maxPx = 110) {
  const target = metersPerPixel * maxPx;
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  let pick = steps[0];
  for (const s of steps) if (s <= target) pick = s;
  return { meters: pick, px: pick / metersPerPixel };
}
