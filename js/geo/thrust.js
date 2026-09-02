// Thrust-belt kinematics: the two folds a thrust makes for itself.
//
// A planar fault slides one rigid wall past another and leaves the beds in
// each wall exactly as it found them. Real thrusts almost never do that. The
// two structures that make a fold-and-thrust belt look the way it does are
// both consequences of the fault's own shape:
//
//   fault-bend fold        the fault steps up from one bedding-parallel flat
//                          to another along a ramp, and the hanging wall has
//                          to bend twice to stay on it — once at the bottom
//                          of the ramp and once at the top. The result is a
//                          flat-topped anticline riding on the ramp.
//
//   fault-propagation fold the fault ends upward at a tip. The slip it can no
//                          longer carry has to go somewhere, and it goes into
//                          folding the wedge of rock ahead of the tip — an
//                          asymmetric anticline with a steep forelimb, growing
//                          as the tip works its way up.
//
// Stack several ramp-flat thrusts in sequence and you have a duplex: each
// horse is the slice between one ramp and the next, bounded below by the
// shared floor thrust and above by the shared roof thrust. Nothing here knows
// about duplexes — they fall out of putting three of these events in a row,
// because a younger fault deforms everything older, which is what carries the
// earlier horses piggyback on the later ones.
//
// ---------------------------------------------------------------------------
// Why these two are built so differently
// ---------------------------------------------------------------------------
//
// The whole model needs one thing from every event: an exact inverse (see
// geo/unmake.js). The two structures give it up very differently.
//
// A ramp-flat thrust gives it away free, if the hanging wall is moved by
// VERTICAL SHEAR — every column of rock keeps its height above the fault as it
// slides along. Then the map is
//
//     t -> t - S,      z -> f(t - S) + (z - f(t))
//
// with f the fault's surface and S the slip along the flat, and that is a
// closed form which inverts by reading it the other way. It also degenerates
// correctly: where f is a plane, f(t-S) - f(t) is constant and the hanging
// wall translates rigidly, which is exactly the planar `fault` event. Vertical
// shear is the standard construction in section restoration, and it is not
// Suppe's exact kink-band solution — it lets bed thickness change on the
// limbs, where Suppe's conserves it and makes the forelimb steeper than the
// backlimb. What it does get right is the part that teaches: a ramp anticline
// with a backlimb dipping at the ramp angle, a flat crest as wide as the slip
// exceeds the ramp, and both dying out where the fault flattens.
//
// A fault-propagation fold gives nothing away. Trishear (Erslev 1991) is a
// VELOCITY field, and the deformation is its flow — path-dependent, because
// the fault tip advances while the rock is moving through the zone. There is
// no closed form to invert. So it is integrated instead, in a fixed number of
// equal increments, with the tip walked back down the ramp as the walk goes.
// TRISHEAR_STEPS is that number, and it is shared with the generated shader so
// the two walks take literally the same steps.
//
// This module is the arithmetic both walks read. geo/unmake.js calls it
// directly; geo/glsl.js mirrors it line for line in GLSL. Keep them in step.

import { azimuthVec, clamp, DEG } from './math.js';

/** Events whose slip makes a fold, and which carry a fault surface with them. */
export function isThrust(e) {
  return e.type === 'rampflat' || e.type === 'propfold';
}

/**
 * The transport frame: a horizontal unit vector pointing the way the hanging
 * wall moves, and the map point the structure is anchored to.
 *
 * Everything in here is cylindrical about that direction — the ramp runs
 * straight, forever, along strike — so a point's coordinate across transport
 * never changes and never has to be carried.
 */
export function transportFrame(e) {
  const [tx, ty] = azimuthVec(e.transport || 0);
  return { tx, ty, cx: e.centerX || 0, cy: e.centerY || 0 };
}

/** How far along transport a world point sits, from the structure's anchor. */
function transportCoord(e, x, y) {
  return (x - e.cx) * e.tx + (y - e.cy) * e.ty;
}

/**
 * The strike a thrust's fault surface would be measured at.
 *
 * The ramp climbs toward the transport direction, so it dips back the way the
 * sheet came from: dip azimuth = transport + 180. Strike sits 90 degrees
 * anticlockwise of the dip azimuth under the right-hand rule, which lands on
 * transport + 90.
 */
export function thrustStrike(e) {
  return ((e.transport || 0) + 90) % 360;
}

// ---------------------------------------------------------------------------
// The ramp-flat surface
// ---------------------------------------------------------------------------

/**
 * A flat at `floorZ`, a ramp climbing at `ramp` degrees for `rise` metres, and
 * a second flat on top of it — as a function of the transport coordinate, with
 * the bottom bend at t = 0.
 *
 * The bends are rounded over `round` metres rather than left as corners. A
 * corner is the geologically honest thing (a kink-band fault-bend fold really
 * does have sharp axial surfaces) but it makes the surface's slope jump, and
 * the slope is what the fault trace's line width is measured against in the
 * shader. Rounding costs a few metres of fidelity at two points and buys a
 * trace that does not flicker where it crosses a bend.
 *
 * The rounding is capped at half the ramp length so that a short ramp still
 * reaches its full rise instead of quietly falling short of it.
 */
export function rampGeometry(e) {
  const tan = Math.tan(clamp(e.ramp || 30, 2, 85) * DEG);
  const rise = Math.max(1, e.rise || 1);
  const len = rise / tan;
  const round = clamp(e.round || 0, 1, len * 0.5);
  return { floorZ: e.floorZ || 0, tan, len, round };
}

/**
 * max(0, u), rounded off over +/-r. C1, so the surface it builds has no kink
 * in its slope.
 *
 * The shader mirrors this AND its derivative, as softRamp/softRampD, because
 * it needs the fault surface's slope to hold the red trace to one width where
 * it climbs the ramp. Nothing on this side ever asks what the slope is, so
 * there is no derivative here to pair with it.
 */
function soft(u, r) {
  if (u <= -r) return 0;
  if (u >= r) return u;
  const s = u + r;
  return (s * s) / (4 * r);
}

/** Elevation of the fault surface at transport coordinate t. */
export function rampHeight(g, t) {
  return g.floorZ + g.tan * (soft(t, g.round) - soft(t - g.len, g.round));
}

/**
 * Undo one ramp-flat thrust.
 *
 * `v`, the height of the point above the fault measured straight up, is what
 * the whole construction is built on: the forward motion preserves it exactly,
 * so it can be read off the point's present position and used to place the
 * point before the slip. It also means the hanging-wall test is the same
 * before and after — a point above the fault was above it then too — which is
 * the same property that lets the planar fault take its side test either side
 * of the slip.
 */
export function undoRampFlat(e, p) {
  const t = transportCoord(e, p[0], p[1]);
  const v = p[2] - rampHeight(e.rampG, t);
  if (v <= 0) return p;                 // footwall: never moved
  const s = e.slip;
  return [
    p[0] - s * e.tx,
    p[1] - s * e.ty,
    rampHeight(e.rampG, t - s) + v,
  ];
}

/** Height above the fault surface: negative in the footwall, zero on it. */
export function rampFlatField(e, p) {
  return p[2] - rampHeight(e.rampG, transportCoord(e, p[0], p[1]));
}

// ---------------------------------------------------------------------------
// Trishear
// ---------------------------------------------------------------------------

/**
 * How many increments the trishear flow is integrated in.
 *
 * The shader runs this many iterations per fragment per event, so it is the
 * cost of the whole event; sixteen is where the forelimb stops moving by more
 * than the width of the line drawn on it.
 */
export const TRISHEAR_STEPS = 16;

/** Slowest the tip may climb, per metre the sheet slips. See trishearFrame. */
export const PS_MIN = 0.5;

/**
 * The trishear zone: the fault direction and the zone's taper.
 *
 * `f2` is up-dip along the fault in the (transport, up) plane — the direction
 * the hanging wall moves and the tip propagates. `n2` is its normal, pointing
 * into the hanging wall. Both are 2-vectors because the structure is
 * cylindrical: nothing ever moves across transport.
 */
export function trishearFrame(e) {
  const th = clamp(e.ramp || 30, 2, 85) * DEG;
  const f2 = [Math.cos(th), Math.sin(th)];
  const n2 = [-f2[1], f2[0]];
  const m = Math.tan(clamp(e.apical || 60, 20, 120) * 0.5 * DEG);
  const slip = Math.max(0, e.slip || 0);
  // A tip that does not move is where this model comes apart, and it comes
  // apart for a real reason rather than a numerical one. The zone is pinned to
  // the tip, so with the tip standing still the same rock is fed through the
  // same apex increment after increment and the strain there grows without
  // bound — which is a true statement about trishear, not about sixteen steps:
  // integrating it more finely makes the pile-up worse, not better. Natural
  // fault-propagation folds run from about one to three, and half is as low as
  // this can be asked to go and still draw a structure rather than a knot.
  // The editor's slider starts there too; this is the guard for a file that
  // was written by hand.
  const ps = clamp(e.ps == null ? 1 : e.ps, PS_MIN, 6);
  return { f2, n2, m, slip, prop: ps * slip };
}

/**
 * The displacement one increment of trishear gives a point, in the tip's own
 * frame. `ux` runs up-dip from the tip, `uy` across the fault into the hanging
 * wall, and the answer comes back in the same pair, as a fraction of the
 * increment.
 *
 * Erslev's linear symmetric field, and it is in two halves that meet at the
 * tip:
 *
 *   behind the tip   the hanging wall takes the whole increment and the
 *                    footwall none of it. That jump IS the fault. It is not an
 *                    approximation to be smoothed away — it is the offset, and
 *                    it is the same rigid translation the planar `fault` event
 *                    makes, taken a sixteenth at a time.
 *   ahead of it      a wedge opening at the trishear angle, with the
 *                    along-fault part interpolated across it and the
 *                    across-fault part whatever makes the field
 *                    divergence-free: m (eta^2 - 1) / 4.
 *
 * The two halves meet continuously, which is the property that makes the
 * unsmoothed field the right one. The wedge closes to nothing at the tip, so
 * eta is already pinned at +/-1 as ux goes to zero, and both parts arrive at
 * exactly the step the fault side is already making. Widen the wedge to a
 * blunt nose instead — which is what this did first, to keep the map safely
 * invertible — and the two halves no longer meet: the fault becomes a band of
 * distributed shear a tenth of the slip wide, and beds cross it as an S-bend
 * with no break in them at all. Which is not a thrust.
 *
 * The across-fault part is what does the geological work. It is negative
 * everywhere the wedge is open, so rock carried through settles toward the
 * footwall — the thinned, over-steepened forelimb that tells a
 * fault-propagation fold apart from anything else. Behind the tip the zone
 * stops opening and the term goes with it: back there this is a fault and
 * nothing else.
 *
 * What a sharp tip costs, and why it is affordable: see the note in
 * `undoPropFold`.
 */
function trishearStep(fr, ux, uy) {
  if (ux <= 0) return [uy > 0 ? 1 : 0, 0];
  // The floor is a guard against 0/0 at the tip point itself, nothing more —
  // a millimetre, where every other length here is tens of metres.
  const eta = clamp(uy / Math.max(fr.m * ux, 1e-3), -1, 1);
  return [0.5 * (1 + eta), fr.m * 0.25 * (eta * eta - 1)];
}

/**
 * Undo one fault-propagation fold.
 *
 * The walk runs the increments backwards, and retreats the tip down the ramp
 * as it goes: increment k carried the rock while the tip stood where it stood
 * after k-1 increments, so that is where the tip is put to take it back off.
 * With the propagation-to-slip ratio at zero the tip never moves and this is a
 * fault with a fixed tip and a fold growing over it; at two it climbs twice as
 * fast as the sheet slips, which is the usual range for a natural one.
 *
 * Only the transport and vertical coordinates are touched. The coordinate
 * across transport is untouched because nothing in the field has a component
 * there — the structure runs on forever along strike.
 *
 * **What the sharp tip costs.** Sixteen increments cannot integrate a singular
 * field exactly, and right at the tip the wedge is thinner than an increment
 * is long, so the map can turn over on itself there. The size of that is worth
 * knowing rather than guessing, because it decides whether a sharp tip is
 * affordable at all.
 *
 * A step maps p to p - s u(p), and its Jacobian is the identity minus s times
 * the field's gradient. Work that gradient out for a zone of half-width w and
 * two of its four entries carry a factor w' — the rate the zone OPENS — and
 * the other two do not. Only the two with w' in them can turn the map over,
 * because the other two displace rock along a direction the displacement does
 * not vary in, which is simple shear and is always invertible however hard it
 * shears. That is the whole reason a knife-edge fault is safe: behind the tip
 * w' is zero, so the discontinuity there costs nothing at all.
 *
 * Ahead of the tip w = m ux and w' = m, and the condition comes out as
 * ux > s/2 — the trishear angle cancels. So the region at risk is half an
 * increment long, a few metres, and it sits on the fault trace where a red
 * line is drawn anyway. The tip also moves further than that in a single
 * increment whenever the propagation ratio is above one, so no rock stays in
 * it.
 *
 * The earlier reading of this was that the danger went as s/(2w), which made
 * it look like the whole thin end of the wedge was unsafe and bought a blunt
 * nose that was not needed and cost the fault its offset.
 */
export function undoPropFold(e, p) {
  const fr = e.tri;
  const t0 = transportCoord(e, p[0], p[1]);
  let t = t0;
  let z = p[2] - e.tipZ;
  const s = fr.slip / TRISHEAR_STEPS;

  for (let i = 0; i < TRISHEAR_STEPS; i++) {
    // i = 0 undoes the last increment, whose tip stood one increment of
    // propagation short of where it stands now; i = N-1 undoes the first.
    const back = (fr.prop * (i + 1)) / TRISHEAR_STEPS;
    const dt = t + fr.f2[0] * back;
    const dz = z + fr.f2[1] * back;
    const ux = dt * fr.f2[0] + dz * fr.f2[1];
    const uy = dt * fr.n2[0] + dz * fr.n2[1];
    const [px, py] = trishearStep(fr, ux, uy);
    t -= s * (px * fr.f2[0] + py * fr.n2[0]);
    z -= s * (px * fr.f2[1] + py * fr.n2[1]);
  }

  const shift = t - t0;
  return [p[0] + shift * e.tx, p[1] + shift * e.ty, e.tipZ + z];
}

/**
 * Signed distance to the fault PLANE: zero on it, positive on the hanging-wall
 * side. Where the fault actually exists is `propFoldBelowTip`, separately.
 *
 * The two have to be separate, and it took a wrong picture to see why. A
 * signed distance to the fault RAY — the plane's distance behind the tip, the
 * distance to the tip point itself ahead of it — is the honest description of
 * the surface and is exactly what the shader inks the trace from. But it is
 * useless to a contour tracer, because it still changes sign across the ray's
 * forward continuation while its magnitude stays large: marching squares sees
 * plus a hundred next to minus a hundred, reads a crossing, and draws the
 * fault straight on up through the fold it dies into. Which is the one thing a
 * fault-propagation fold exists to say it does not do.
 *
 * So the sign stays with the plane, where it is continuous, and where the
 * fault stops is said with a mask instead — the same mechanism `reachEvent`
 * already uses to stop a trace at rock the structure never got to.
 */
export function propFoldField(e, p) {
  const t = transportCoord(e, p[0], p[1]);
  const z = p[2] - e.tipZ;
  return t * e.tri.n2[0] + z * e.tri.n2[1];
}

/** Is this point down-dip of the tip, where the fault is a break at all? */
export function propFoldBelowTip(e, p) {
  const t = transportCoord(e, p[0], p[1]);
  const z = p[2] - e.tipZ;
  return t * e.tri.f2[0] + z * e.tri.f2[1] <= 0;
}
