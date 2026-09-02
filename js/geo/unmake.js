// "Unmaking" — the inverse geologic history.
//
// The whole model rests on one idea. To find out what rock sits at a point in
// the block today, you run the history backwards: undo the youngest event,
// then the next youngest, and so on, until the point lands back in the
// undeformed layer cake it was deposited in. Then you just ask which layer
// that depth falls in.
//
// Every deformation here is exactly invertible:
//   tilt   - rigid rotation about a horizontal axis
//   fold   - an upright fold (vertical displacement, wave across `perp`)
//            followed by a rigid tilt about `perp`; neither step changes the
//            `perp` coordinate the wave is read from
//   dome   - vertical displacement depending only on (x, y)
//   fault  - rigid translation of the hanging wall parallel to the fault
//            plane, so the side test is unchanged by the slip itself
//
// The two thrusts in geo/thrust.js are the exceptions worth naming. A ramp-flat
// thrust is still exact — vertical shear preserves the height above the fault,
// which is the coordinate its inverse is written in — but a fault-propagation
// fold is a flow, and is inverted by integrating it back in fixed increments
// rather than in closed form. See the note at the top of that file.
//
// Moving rock straight up and down is what keeps a fold and a dome exactly
// invertible, and it is the right picture for a bedded pile. It is the wrong
// picture for a body that CUTS the pile, because vertical motion cannot turn a
// vertical line — so an intrusion is carried through a younger warp by the
// turn it gave the beds instead, baked into the body's own geometry at compile
// time. See `intrusionTurn` in geo/warp.js.
//
// This module is the CPU twin of the generated shader in glsl.js. It exists
// so the app can answer "what unit did I just tap on?" without a GPU
// readback, and so the geology can be unit-tested. Keep the two in step.

import {
  planeFrame, axisFrame, azimuthVec, slipVec, rotateAbout, normalToStrikeDip,
  dot, sub,
} from './math.js';
import { surfaceHeight } from './surfaces.js';
import {
  warpOffset, intrusionTurn, turnNormal, turnZRange, plutonFrame,
} from './warp.js';
import {
  transportFrame, rampGeometry, trishearFrame, undoRampFlat, undoPropFold,
} from './thrust.js';
import {
  cumulativeDepths, totalThickness, faultRake, unconformityDatums, atTime,
} from './model.js';

/**
 * Precompute the per-event vectors so a point query is just arithmetic.
 * Call once per document change, then reuse for many points.
 */
export function compileHistory(doc0) {
  // The one place the CPU side reads the history, so the one place the time
  // machine has to be applied. Everything downstream — identify, the readings,
  // the stereonet, the cross-section raster — asks its questions of `h` and is
  // wound back with it, without knowing that it was.
  const doc = atTime(doc0);
  const events = doc.events.filter((e) => e.enabled !== false);
  const datums = unconformityDatums(doc);
  const compiled = events.map((e) => {
    switch (e.type) {
      case 'unconformity': {
        // Bake in the derived datum and the clamped unit count so the query
        // path is pure arithmetic and cannot drift from the shader, which is
        // handed the same two numbers as uniforms.
        const d = datums.get(e.id);
        if (!d) return { ...e };
        return { ...e, aboveCount: d.above, surface: { ...e.surface, base: d.base } };
      }
      case 'tilt': {
        const { strikeVec } = planeFrame(e.strike, e.dip);
        return { ...e, axis: strikeVec };
      }
      case 'fold': {
        const { perp } = axisFrame(e.trend, e.plunge);
        // `perp` is across the axis, `az` along it — both horizontal, and both
        // in the frame the plunge tilt is undone into. Horizontal is the whole
        // point: see the note in undoEvent.
        return { ...e, perp, az: azimuthVec(e.trend) };
      }
      case 'fault': {
        const { normal } = planeFrame(e.strike, e.dip);
        const u = slipVec(e.strike, e.dip, faultRake(e));
        return { ...e, normal, slip3: [u[0] * e.slip, u[1] * e.slip, u[2] * e.slip] };
      }
      // Both thrusts are cylindrical about their transport direction, so what
      // they need precomputed is that direction and the shape of their fault.
      case 'rampflat':
        return { ...e, ...transportFrame(e), rampG: rampGeometry(e) };
      case 'propfold':
        return { ...e, ...transportFrame(e), tri: trishearFrame(e) };
      case 'dike': {
        const { normal } = planeFrame(e.strike, e.dip);
        return { ...e, normal };
      }
      default:
        return { ...e };
    }
  });

  // Second pass, because a body's geometry depends on what came AFTER it. Every
  // warp younger than an intrusion turned the beds the intrusion cuts, and it
  // was carried round with them — so the turn is folded into the body's own
  // test here, once, rather than carried through every query. The generated
  // shader is handed exactly these numbers as uniforms; see geo/warp.js.
  for (let i = 0; i < compiled.length; i++) {
    const e = compiled[i];
    if (e.type === 'dike') {
      const m = intrusionTurn(compiled, i);
      if (!m) continue;
      const [bottomZ, topZ] = turnZRange(m, e.bottomZ, e.topZ);
      compiled[i] = { ...e, normal: turnNormal(m, e.normal), bottomZ, topZ };
    } else if (e.type === 'pluton') {
      // Always a matrix, turned or not, so the query path has one shape.
      compiled[i] = { ...e, frame: plutonFrame(e, intrusionTurn(compiled, i)) };
    }
  }

  const cum = cumulativeDepths(doc.layers);
  return {
    events: compiled,
    layers: doc.layers,
    cum,
    total: totalThickness(doc.layers),
    basementRockId: doc.basementRockId,
  };
}

/**
 * Undo a single kinematic event. Returns the position the point occupied
 * before the event happened.
 */
function undoEvent(e, p) {
  switch (e.type) {
    case 'tilt': {
      const c = [e.centerX || 0, e.centerY || 0, e.centerZ || 0];
      const r = rotateAbout(sub(p, c), e.axis, -e.dip);
      return [r[0] + c[0], r[1] + c[1], r[2] + c[2]];
    }
    case 'fold': {
      // Undo the plunge tilt first, then the upright fold beneath it.
      //
      // Rotating about `perp` leaves the `perp` component untouched, and the
      // fold displaces along z, which is also orthogonal to `perp`. So the
      // wave coordinate survives both steps and the inverse stays exact — and
      // the displacement can be read off the point's map position alone, which
      // is what `warpOffset` is.
      const cx = e.centerX || 0;
      const cy = e.centerY || 0;
      const d = rotateAbout([p[0] - cx, p[1] - cy, p[2]], e.perp, e.plunge || 0);
      return [d[0] + cx, d[1] + cy, d[2] - warpOffset(e, p[0], p[1])];
    }
    case 'domebasin':
      return [p[0], p[1], p[2] - warpOffset(e, p[0], p[1])];
    case 'rampflat':
      return undoRampFlat(e, p);
    case 'propfold':
      return undoPropFold(e, p);
    case 'fault': {
      const c = [e.centerX, e.centerY, e.centerZ];
      // Slip is parallel to the plane, so this side test gives the same
      // answer before and after the slip is removed.
      const side = dot(sub(p, c), e.normal);
      if (side <= 0) return p; // footwall: never moved
      return [p[0] - e.slip3[0], p[1] - e.slip3[1], p[2] - e.slip3[2]];
    }
    default:
      return p;
  }
}

/**
 * A point carried back through every event AFTER the one at `index`, and no
 * further. This is where a fitted structure reads its evidence from: with the
 * faults undone the observations sit where the fold left them, and the fold
 * alone is left to explain them.
 */
export function undoAfter(h, p0, index) {
  let p = [p0[0], p0[1], p0[2]];
  for (let i = h.events.length - 1; i > index; i--) {
    const e = h.events[i];
    if (e.type === 'unconformity' || e.type === 'dike' || e.type === 'pluton') continue;
    p = undoEvent(e, p);
  }
  return p;
}

/**
 * Carry a point back to just before event `index`, and say whether the walk
 * gets there at all.
 *
 * `undoAfter` answers the first half of that. This adds the half that decides
 * whether a structure is even PRESENT at a point, and it is the half a drawing
 * needs. rockAt's walk returns the moment it lands above a younger
 * unconformity or inside a younger intrusion, and never reaches the events
 * below: rock deposited on an unconformity postdates every fault beneath it,
 * so no fault beneath it cuts it. A fault trace drawn on through that cover
 * says the fault is the younger of the two — which is the one thing the
 * cross-cutting relation exists to settle, answered backwards.
 *
 * The loop is rockAt's, minus the layer lookup, and has to stay that way.
 */
export function reachEvent(h, p0, index) {
  let p = [p0[0], p0[1], p0[2]];
  let lo = 0;
  for (let i = h.events.length - 1; i > index; i--) {
    const e = h.events[i];

    if (e.type === 'unconformity') {
      const above = e.aboveCount;   // clamped at compile, as in rockAt
      if (above <= lo) continue;    // nothing deposited on it — not yet a surface
      if (p[2] > surfaceHeight(e.surface, p[0], p[1])) return { p, reached: false };
      lo = above;
      continue;
    }

    if (e.type === 'dike' || e.type === 'pluton') {
      if (insideIntrusion(e, p)) return { p, reached: false };
      continue;
    }

    p = undoEvent(e, p);
  }
  return { p, reached: true };
}

/** Is this point inside an intrusive body, in that body's own time frame? */
function insideIntrusion(e, p) {
  if (e.type === 'dike') {
    const c = [e.centerX, e.centerY, 0];
    const d = Math.abs(dot(sub(p, c), e.normal));
    if (d > e.thickness * 0.5) return false;
    return p[2] <= e.topZ && p[2] >= e.bottomZ;
  }
  if (e.type === 'pluton') {
    // `frame` rolls the azimuth, the radii and the bed turn into one map, so
    // the body is a plain unit ball in the space it lands in.
    const m = e.frame;
    const dx = p[0] - e.centerX;
    const dy = p[1] - e.centerY;
    const dz = p[2] - e.centerZ;
    return Math.hypot(
      m[0] * dx + m[1] * dy + m[2] * dz,
      m[3] * dx + m[4] * dy + m[5] * dz,
      m[6] * dx + m[7] * dy + m[8] * dz,
    ) <= 1;
  }
  return false;
}

/**
 * Which layer contains `depth`, measured downward from the top of the
 * sub-column [lo, hi)? Returns a layer index, or -1 for basement.
 * Points above the top of the column extend the topmost unit — the block has
 * to be made of something, and repeating the youngest unit reads correctly.
 *
 * `infill` extends the DEEPEST unit downward instead of falling through to
 * basement. The units above an unconformity need it: they were deposited onto
 * a surface with relief, so wherever that surface drops below the base of the
 * flat-lying stack, the lowest of those units is what fills the low and abuts
 * the older rock. Basement there would be basement sitting above an
 * unconformity, which cannot happen.
 */
function layerAt(h, depth, lo, hi, infill = false) {
  if (depth <= 0) return lo < hi ? lo : -1;
  const base = lo > 0 ? h.cum[lo - 1] : 0;
  for (let i = lo; i < hi; i++) {
    if (depth < h.cum[i] - base) return i;
  }
  return infill && hi > lo ? hi - 1 : -1;
}

/**
 * The rock at world point `p` today.
 * Returns { kind: 'layer', index } | { kind: 'intrusion', event } | { kind: 'basement' }
 */
export function rockAt(h, p0) {
  let p = [p0[0], p0[1], p0[2]];
  let lo = 0;                 // top of the currently-active sub-column
  const hi = h.layers.length;

  for (let i = h.events.length - 1; i >= 0; i--) {
    const e = h.events[i];

    if (e.type === 'unconformity') {
      const above = e.aboveCount;   // clamped, and its datum derived, at compile
      // Nothing was deposited on it, so there is no younger cover to switch to
      // and it is not yet an unconformity. Leave the history alone.
      if (above <= lo) continue;
      // Anything above the erosion surface was deposited after it.
      const u = surfaceHeight(e.surface, p[0], p[1]);
      if (p[2] > u) {
        let tPost = 0;
        for (let k = lo; k < above; k++) tPost += Math.max(0.5, h.layers[k].thickness);
        const datum = e.fill === 'drape' ? u : e.surface.base;
        const idx = layerAt(h, datum + tPost - p[2], lo, above, true);
        return idx < 0 ? { kind: 'basement' } : { kind: 'layer', index: idx };
      }
      // Below it: keep walking back, now restricted to the older units.
      lo = above;
      continue;
    }

    if (e.type === 'dike' || e.type === 'pluton') {
      if (insideIntrusion(e, p)) return { kind: 'intrusion', event: e };
      continue;
    }

    p = undoEvent(e, p);
  }

  const idx = layerAt(h, -p[2], lo, hi);
  return idx < 0 ? { kind: 'basement' } : { kind: 'layer', index: idx };
}

/**
 * Continuous stratigraphic depth at a point: how far below the top of its own
 * sub-column the point sits, in metres. `rockAt` is this quantity bucketed
 * into units; keeping the un-bucketed value lets us differentiate it.
 */
export function stratDepth(h, p0) {
  let p = [p0[0], p0[1], p0[2]];
  let lo = 0;

  for (let i = h.events.length - 1; i >= 0; i--) {
    const e = h.events[i];
    if (e.type === 'unconformity') {
      const above = e.aboveCount;   // clamped, and its datum derived, at compile
      if (above <= lo) continue;    // nothing deposited on it — see rockAt
      const u = surfaceHeight(e.surface, p[0], p[1]);
      if (p[2] > u) {
        let tPost = 0;
        for (let k = lo; k < above; k++) tPost += Math.max(0.5, h.layers[k].thickness);
        const datum = e.fill === 'drape' ? u : e.surface.base;
        return datum + tPost - p[2];
      }
      lo = above;
      continue;
    }
    if (e.type === 'dike' || e.type === 'pluton') continue;
    p = undoEvent(e, p);
  }
  return -p[2];
}

/**
 * Orientation of bedding at a point, recovered the way a field measurement
 * works: the beds are surfaces of constant stratigraphic depth, so the
 * gradient of that scalar field is normal to bedding.
 *
 * Returns null inside an intrusion, where bedding is meaningless.
 */
export function beddingAt(h, p, eps = 1.5) {
  if (rockAt(h, p).kind === 'intrusion') return null;
  const gx = stratDepth(h, [p[0] + eps, p[1], p[2]]) - stratDepth(h, [p[0] - eps, p[1], p[2]]);
  const gy = stratDepth(h, [p[0], p[1] + eps, p[2]]) - stratDepth(h, [p[0], p[1] - eps, p[2]]);
  const gz = stratDepth(h, [p[0], p[1], p[2] + eps]) - stratDepth(h, [p[0], p[1], p[2] - eps]);
  const g = [gx, gy, gz];
  if (!Number.isFinite(gx + gy + gz) || Math.hypot(gx, gy, gz) < 1e-9) return null;
  // Depth grows downward, so the up-facing bed normal is the negated gradient.
  return normalToStrikeDip([-g[0], -g[1], -g[2]]);
}

/**
 * Bedding orientation on a regular grid across the map, read at the land
 * surface. A student's handful of stations is a sample of exactly this, so
 * running the same girdle fit over the grid gives the answer their readings
 * are converging on — without anyone having to be told what the fold event
 * was set to.
 *
 * Points with no bedding under them (inside an intrusion) are left out rather
 * than guessed at.
 */
export function beddingGrid(h, topo, box, n = 14) {
  const out = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = box.x0 + ((box.x1 - box.x0) * i) / n;
      const y = box.y0 + ((box.y1 - box.y0) * j) / n;
      const bed = beddingAt(h, [x, y, surfaceHeight(topo, x, y) - 0.5]);
      if (bed) out.push(bed);
    }
  }
  return out;
}

/** Human-readable description of the unit at a point. */
export function describeAt(h, p) {
  const r = rockAt(h, p);
  if (r.kind === 'basement') return { label: 'Basement', rockId: h.basementRockId, detail: 'below the mapped section' };
  if (r.kind === 'intrusion') {
    return { label: r.event.name, rockId: r.event.rockId, detail: r.event.type === 'dike' ? 'tabular intrusion' : 'intrusive body' };
  }
  const layer = h.layers[r.index];
  return {
    label: layer.name,
    rockId: layer.rockId,
    detail: `unit ${h.layers.length - r.index} of ${h.layers.length} · ${Math.round(layer.thickness)} m thick`,
    index: r.index,
  };
}
