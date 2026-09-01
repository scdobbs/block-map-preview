// Vertical-displacement events, and the turn they gave the beds.
//
// A fold and a dome both work the same way: they push rock up or down by an
// amount that depends on map position alone. That is not a convenience, it is
// the property the whole model rests on — a displacement that is a function of
// plan position is exactly invertible by subtracting it again — and it is why
// these two are the only events that need what is in here.
//
// It also has one consequence that has to be dealt with. Vertical motion
// cannot turn a vertical line. So a dike emplaced BEFORE a fold came back out
// of the inverse walk standing exactly as it went in: a pre-fold dike and a
// post-fold dike drew the same straight wall, and the one cross-cutting
// relation the picture exists to teach was unreadable. See `intrusionTurn`.
//
// Both the CPU walk (geo/unmake.js) and the generated shader's uniforms
// (render/material.js) read the answer from here, so there is one arithmetic
// for it rather than two that have to be kept in step.

import {
  axisFrame, azimuthVec, foldWarp, foldEnvelope, foldProfile, DEG,
} from './math.js';

/** Events that displace rock vertically, and so turn the beds under it. */
export function isWarp(e) {
  return e.type === 'fold' || e.type === 'domebasin';
}

/**
 * A fold with its two horizontal axes worked out — `perp` across the fold,
 * `az` along it. `compileHistory` has already done this for the events it
 * holds, so the common path costs one property test.
 */
function withAxes(e) {
  if (e.type !== 'fold' || e.perp) return e;
  return { ...e, perp: axisFrame(e.trend, e.plunge).perp, az: azimuthVec(e.trend) };
}

/**
 * How far up this event pushed the rock standing at (x, y), in metres.
 *
 * Map position alone, with no z in it anywhere. For a fold that is what lets
 * the shape and the envelope in at all: both of the envelope's coordinates are
 * taken from the UNROTATED offset and from its horizontal part, and `perp` and
 * `az` are horizontal, so neither dot product can see z.
 *
 * Reading them off the plunge-rotated point instead would be wrong, and
 * silently so. The wave would be identical — rotating about `perp` leaves the
 * `perp` component alone — but `az` would tilt out of horizontal, and a
 * plunging fold's along-axis coordinate would then drift with depth: the
 * envelope would fade with height rather than along strike, and the inverse
 * would no longer be exact.
 *
 * A profile that genuinely depended on z — a fold dying out downward — would
 * make the inverse implicit, and that is the one extension here that is not
 * free.
 */
export function warpOffset(e, x, y) {
  if (e.type === 'fold') {
    const vx = x - (e.centerX || 0);
    const vy = y - (e.centerY || 0);
    const across = vx * e.perp[0] + vy * e.perp[1];
    const along = vx * e.az[0] + vy * e.az[1];
    const k = (2 * Math.PI) / Math.max(1, e.wavelength);
    const amp = e.amplitude
      * foldEnvelope(along, across, e.reachAlong, e.reachAcross);
    return amp * foldProfile(
      foldWarp(k * across + (e.phase || 0) * DEG, e.vergence, e.hinge), e.profile,
    );
  }
  // Dome or basin: the same bounded cosine, radial in the ellipse's own frame.
  const az = (e.azimuth || 0) * DEG;
  const dx = x - e.centerX;
  const dy = y - e.centerY;
  const ex = dx * Math.cos(az) - dy * Math.sin(az);
  const ey = dx * Math.sin(az) + dy * Math.cos(az);
  const t = Math.hypot(ex / Math.max(1, e.radiusA), ey / Math.max(1, e.radiusB));
  return t >= 1 ? 0 : e.amplitude * 0.5 * (1 + Math.cos(Math.PI * t));
}

/** How far apart the two samples of the surface slope are taken, in metres. */
const SLOPE_EPS = 0.5;

/**
 * The turn a warp gave the beds at one point on the map, as a linear map on
 * offsets from that point. Null where the beds came out flat, which is the
 * identity and the common case.
 *
 * With `s` the slope of the warped surface and the horizontal unit `h` running
 * up it, the map takes an offset's along-`h` part `a` and its vertical part
 * `b` to
 *
 *     a' = a / cos(dip) + b sin(dip)        b' = b cos(dip)
 *
 * which is the bed rotation with the local shear the exact inverse has already
 * taken back out. A line that went in vertical comes out along the bed normal,
 * square to the beds it cuts, which is the picture a folded dike makes.
 *
 * The slope is measured rather than differentiated by hand: a central
 * difference of `warpOffset` costs four evaluations but cannot drift from the
 * profile, the warp and the envelope the way a chain rule written out
 * separately would.
 */
function bedTurn(e, x, y) {
  const gx = (warpOffset(e, x + SLOPE_EPS, y) - warpOffset(e, x - SLOPE_EPS, y))
    / (2 * SLOPE_EPS);
  const gy = (warpOffset(e, x, y + SLOPE_EPS) - warpOffset(e, x, y - SLOPE_EPS))
    / (2 * SLOPE_EPS);
  const s = Math.hypot(gx, gy);
  if (s < 1e-6) return null;
  const c = 1 / Math.sqrt(1 + s * s);   // cosine of the dip the beds took
  const sn = s * c;                     // and its sine
  const hx = gx / s;
  const hy = gy / s;
  const k = 1 / c - 1;
  return [
    1 + k * hx * hx, k * hx * hy, sn * hx,
    k * hx * hy, 1 + k * hy * hy, sn * hy,
    0, 0, c,
  ];
}

/**
 * The turn every warp younger than `index` gave the beds where that event's
 * body sits — the map that carries an offset from the body's centre into the
 * frame the body's own test is written in. Null when nothing turned it.
 *
 * A body cutting across bedding is carried through a fold the way a geologist
 * reads it off the outcrop: it keeps its angle to bedding. So it is turned by
 * the dip the fold left the beds at, rather than moved by the vertical shear
 * that made them. Three things are worth knowing about doing it this way:
 *
 * - **One turn for the whole body, read at its own centre.** Reading the dip
 *   afresh at every query point instead is the exact "everywhere square to
 *   bedding" surface, and it is not usable: the orthogonal trajectories of a
 *   similar fold converge on its axial plane, so past a certain depth the map
 *   stops being one-to-one and a single dike comes out as two, or as a sliver.
 *   A rigid turn is affine, so a dike stays one dike of the right thickness.
 * - **A concordant sill stays concordant.** The vertical part of the turn,
 *   `b' = b cos(dip)`, has no `a` in it at all, so a bedding-parallel sheet is
 *   still bedding-parallel afterwards however far along the fold it runs — it
 *   is only measured square to the beds rather than vertically, and comes out
 *   `1/cos(dip)` thicker in section. Anchoring the turn on the fold's own
 *   datum rather than on the body is what would tilt a sill off its bed.
 * - **A dike striking across the fold is untouched**, and should be: its plane
 *   contains the fold axis, and turning about that axis maps it to itself.
 *
 * The turns compose youngest first, so a body carried through two folds is
 * turned by both, in the order they happened.
 */
export function intrusionTurn(events, index) {
  let m = null;
  for (let i = events.length - 1; i > index; i--) {
    const e = events[i];
    if (!isWarp(e)) continue;
    m = turnMul(bedTurn(withAxes(e), events[index].centerX, events[index].centerY), m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Row-major 3x3 helpers. Null always means the identity.
// ---------------------------------------------------------------------------

export function turnMul(a, b) {
  if (!a) return b;
  if (!b) return a;
  const o = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

/**
 * The dike's plane normal, pulled back through the turn.
 *
 * Testing the turned point against the plane and testing the point against the
 * pulled-back plane are the same arithmetic — |n·(Md)| is |(M'n)·d| — so the
 * turn can be baked into the event once instead of being carried through every
 * query. The result is deliberately not renormalised: its length is what keeps
 * the dike's thickness measured in its own frame rather than in the block's.
 */
export function turnNormal(m, n) {
  if (!m) return n;
  return [
    m[0] * n[0] + m[3] * n[1] + m[6] * n[2],
    m[1] * n[0] + m[4] * n[1] + m[7] * n[2],
    m[2] * n[0] + m[5] * n[1] + m[8] * n[2],
  ];
}

/**
 * What a dike's top and bottom become. The turn's bottom row is (0, 0, cos),
 * and stays that way however many turns are composed, so the depth range is
 * simply stretched — no need to carry the whole matrix into the depth test.
 */
export function turnZRange(m, lo, hi) {
  const c = m ? m[8] : 1;
  return [lo / c, hi / c];
}

/**
 * A pluton's whole test as one matrix: the offset from its centre goes in, and
 * it is inside where the result is no longer than one.
 *
 * Rolling the azimuth, the radii and the bed turn together is not just tidier
 * than three steps — the turn is a general 3x3 and does not decompose back
 * into an azimuth and a set of radii, so one matrix is the only form that can
 * hold all three.
 */
export function plutonFrame(e, m) {
  const az = (e.azimuth || 0) * DEG;
  const ca = Math.cos(az);
  const sa = Math.sin(az);
  const rx = Math.max(1, e.radiusX);
  const ry = Math.max(1, e.radiusY);
  const rz = Math.max(1, e.radiusZ);
  // Rotate into the ellipsoid's own frame, then divide through by its radii.
  const r = [ca / rx, -sa / rx, 0, sa / ry, ca / ry, 0, 0, 0, 1 / rz];
  return turnMul(r, m) || r;
}
