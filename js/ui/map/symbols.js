// Station symbols, drawn on a 2D canvas.
//
// These are the same marks the block diagram draws in 3D, and deliberately so:
// a student who has read a fold off the block should recognize every symbol on
// the map without being told. The thresholds for "flat" and "on end" come from
// geo/math.js, which is what keeps the two views from ever disagreeing.

import { FLAT_DIP, VERTICAL_DIP } from '../../geo/math.js';
import { feature, isLinearFeature, lineKind, lineCertainty } from '../../field/model.js';

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
      stroke(() => {
        ctx.beginPath();
        ctx.moveTo(-sx * s, -sy * s); ctx.lineTo(sx * s, sy * s);
        ctx.moveTo(0, 0); ctx.lineTo(dx * tick, dy * tick);
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
export function drawLine(ctx, pts, line, {
  selected = false, scale = 1, drawing = false, active = -1,
} = {}) {
  if (pts.length < 2) return;
  const kind = lineKind(line.kind);
  const dash = lineCertainty(line.certainty).dash.map((d) => d * scale);
  const w = kind.weight * scale;

  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

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
  ctx.setLineDash([]);

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
