// Orientation math for structural geology.
//
// Coordinate frame: X = East, Y = North, Z = Up. Distances are in metres.
// Azimuths (strike, trend, dip direction) are degrees clockwise from North.
// Dip and plunge are degrees below horizontal.
//
// Strike follows the right-hand rule: with the strike direction ahead of you,
// the bed dips down to your right.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Unit vector pointing along an azimuth, horizontal. */
export function azimuthVec(azDeg) {
  const a = azDeg * DEG;
  return [Math.sin(a), Math.cos(a), 0];
}

/**
 * Orthonormal frame for a plane given strike/dip.
 *   strikeVec  horizontal, along strike (right-hand rule)
 *   dipVec     down-dip, in the plane
 *   normal     unit normal with a positive Z component (i.e. points to the
 *              hanging wall for any dip < 90 degrees)
 */
export function planeFrame(strikeDeg, dipDeg) {
  const s = strikeDeg * DEG;
  const d = dipDeg * DEG;
  const sinS = Math.sin(s), cosS = Math.cos(s);
  const cosD = Math.cos(d), sinD = Math.sin(d);

  // Strike direction.
  const strikeVec = [sinS, cosS, 0];
  // Dip azimuth sits 90 degrees clockwise from strike.
  const dipAz = [cosS, -sinS, 0];
  // Down-dip vector in the plane.
  const dipVec = [cosD * dipAz[0], cosD * dipAz[1], -sinD];
  // normal = dipVec x strikeVec  ->  tilts toward the dip azimuth, Z >= 0.
  const normal = cross(dipVec, strikeVec);

  return { strikeVec, dipAz, dipVec, normal };
}

/**
 * Frame for a fold axis given trend/plunge.
 *   axis   the plunging hinge line itself (used to draw axial traces)
 *   perp   horizontal, 90 degrees clockwise from the trend
 *
 * A plunging fold is built as an upright fold that was afterwards tilted
 * about `perp` by the plunge angle. That tilt is what carries the hinge
 * lines down along the trend.
 *
 * The tempting shortcut -- keep the wave a function of the horizontal `perp`
 * coordinate and merely lean the displacement direction over -- does NOT
 * plunge anything. The displacement then depends only on horizontal position,
 * so it is constant along any vertical plane, and the crest of a flat bed
 * stays a horizontal line however far the displacement direction is leaned.
 * It shears the fold instead of plunging it.
 */
export function axisFrame(trendDeg, plungeDeg) {
  const t = trendDeg * DEG;
  const p = plungeDeg * DEG;
  const cosP = Math.cos(p), sinP = Math.sin(p);

  const axis = [Math.sin(t) * cosP, Math.cos(t) * cosP, -sinP];
  const perp = [Math.cos(t), -Math.sin(t), 0];
  return { axis, perp };
}

/**
 * Slip direction in a fault plane, from rake (pitch) measured in the plane
 * from the strike direction, rotating toward down-dip.
 *   rake 0    = slip along the strike azimuth (sinistral for a vertical fault)
 *   rake 90   = pure down-dip slip  (hanging wall drops -> normal fault)
 *   rake 180  = slip against the strike azimuth (dextral)
 *   rake 270  = pure up-dip slip    (hanging wall rises -> reverse fault)
 */
export function slipVec(strikeDeg, dipDeg, rakeDeg) {
  const { strikeVec, dipVec } = planeFrame(strikeDeg, dipDeg);
  const r = rakeDeg * DEG;
  const c = Math.cos(r), s = Math.sin(r);
  return [
    c * strikeVec[0] + s * dipVec[0],
    c * strikeVec[1] + s * dipVec[1],
    c * strikeVec[2] + s * dipVec[2],
  ];
}

/** Rodrigues rotation of `v` about unit axis `k` by `angleDeg`. */
export function rotateAbout(v, k, angleDeg) {
  const a = angleDeg * DEG;
  const c = Math.cos(a), s = Math.sin(a);
  const kv = dot(k, v);
  const kxv = cross(k, v);
  return [
    v[0] * c + kxv[0] * s + k[0] * kv * (1 - c),
    v[1] * c + kxv[1] * s + k[1] * kv * (1 - c),
    v[2] * c + kxv[2] * s + k[2] * kv * (1 - c),
  ];
}

/** Convert a plane normal back to strike/dip degrees. */
export function normalToStrikeDip(n) {
  let [x, y, z] = normalize(n);
  if (z < 0) { x = -x; y = -y; z = -z; }
  const dip = Math.acos(Math.min(1, Math.max(-1, z))) * RAD;
  // Dip azimuth is the horizontal projection of the normal.
  let dipAz = Math.atan2(x, y) * RAD;
  const strike = wrap360(dipAz - 90);
  return { strike, dip };
}

/**
 * Turn a vector's azimuth by `deg`, leaving its inclination alone.
 *
 * Used both for the magnetic-to-true correction and for aligning a device
 * frame with a compass heading, which are the same operation on a sphere.
 */
export function rotateAboutVertical(v, deg) {
  const d = deg * DEG;
  if (!d) return v;
  const c = Math.cos(d), s = Math.sin(d);
  const [e, n, u] = v;
  return [e * c + n * s, n * c - e * s, u];
}

export function wrap360(a) { return ((a % 360) + 360) % 360; }

export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function normalize(a) {
  const L = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / L, a[1] / L, a[2] / L];
}

export function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * Where a dip stops being read as inclined.
 *
 * Below FLAT_DIP a bed is drawn with the cross-in-circle and above
 * VERTICAL_DIP with the double tick, because those are the symbols a map
 * prints and because a "2 degree" dip is inside the noise of any instrument
 * that measured it. Both the 3D markers and the 2D field map read these, so
 * the two views can never disagree about what counts as flat.
 */
/**
 * The shape of a fold, beyond a cosine.
 *
 * A fold event displaces points vertically by a function of ONE coordinate:
 * how far across the axis they lie. That is the property the whole engine
 * rests on — moving in z does not change that coordinate, so the inverse of a
 * fold is exact and closed-form whatever the profile does. Which means the
 * profile can be any periodic function of that coordinate at all, and the rest
 * of the engine never has to know: `beddingAt` finite-differences the result,
 * so nothing needs an analytic derivative either.
 *
 * So these three add real fold geometry for the price of arithmetic. They are
 * mirrored in the shader (`emitFold` in geo/glsl.js) and the two MUST agree —
 * the CPU walk is the reference the GPU is checked against.
 */

/**
 * Phase warp: what turns a cosine into a fold with a shape.
 *
 *   psi(t) = t + vergence * (1 - cos t) + hinge * sin(2t) / 2
 *
 * The two terms do genuinely different things, and both of the obvious first
 * guesses are wrong in ways worth recording.
 *
 * `vergence * (1 - cos t)` is ODD, and moves the trough off centre. One limb
 * becomes short and steep, the other long and gentle, which is what an
 * asymmetric fold IS. The crests and troughs keep their full amplitude — only
 * the spacing between them changes — so the fold verges without growing.
 *
 * `hinge * sin(2t) / 2` is EVEN, and leaves the crests and troughs exactly
 * where they are. Its derivative is 1 + hinge*cos(2t), the same at t = 0 and
 * t = pi, so it treats both hinges alike — which is what a control called
 * "hinge shape" has to do. It moves the steepest part of each limb: negative
 * pushes it to mid-limb and opens the crest into a genuine box fold, flat on
 * top with steep sides; positive pulls it against the hinge, tightening the
 * crest and flattening the middle of the limb.
 *
 * What it is NOT is a chevron. A chevron has straight limbs — constant dip
 * from hinge to hinge — and no phase warp of a cosine produces that, because
 * the derivative of a triangle wave is a square wave and a square wave is not
 * a couple of harmonics. Tightening the hinge here always costs a flattened
 * limb centre. Worth knowing before reading too much into a tight one.
 *
 * The tempting `hinge * sin t` is worse: its derivative is 1 + hinge at the
 * crest and 1 - hinge at the trough, so it sharpens the anticlines while
 * opening the synclines out. That is cusp-and-lobe — a real fold style, but a
 * different control, and it makes every second hinge do the opposite of what
 * the slider says.
 *
 * Both leave psi(t + 2pi) = psi(t) + 2pi, so the train stays periodic.
 */
export const FOLD_SKEW_MAX = 0.9;

/**
 * The pair, held inside the circle where psi stays monotonic.
 *
 * psi' = 1 + vergence*sin(t) + hinge*cos(2t), and the two terms can hit their
 * worst at the same t, so what has to stay under one is |vergence| + |hinge| —
 * the sum, not the diagonal. Beyond that the warp runs backwards over part of
 * the cycle and the profile grows extra crests, which are parasitic folds
 * nobody asked for. The inverse survives it either way (the displacement is
 * still a function of one coordinate) but the geology would be nonsense, so
 * the pair is scaled back together rather than clamped one at a time, which
 * would let the corner through.
 */
function foldSkew(vergence, hinge) {
  const v = vergence || 0;
  const h = hinge || 0;
  const m = Math.abs(v) + Math.abs(h);
  const f = m > FOLD_SKEW_MAX ? FOLD_SKEW_MAX / m : 1;
  return [v * f, h * f];
}

export function foldWarp(t, vergence, hinge) {
  const [v, h] = foldSkew(vergence, hinge);
  if (!v && !h) return t;
  return t + v * (1 - Math.cos(t)) + h * Math.sin(2 * t) / 2;
}

/**
 * Where a given warped phase came from, for drawing the axial traces.
 *
 * Newton, because psi is monotonic with a derivative bounded below by
 * 1 - FOLD_SKEW_MAX, so it converges in a handful of steps from psi itself.
 * Only the helper geometry needs this; the geology never inverts the warp.
 */
export function foldWarpInverse(psi, vergence, hinge) {
  const [v, h] = foldSkew(vergence, hinge);
  if (!v && !h) return psi;
  let t = psi;
  for (let i = 0; i < 24; i++) {
    const f = t + v * (1 - Math.cos(t)) + h * Math.sin(2 * t) / 2 - psi;
    const slope = 1 + v * Math.sin(t) + h * Math.cos(2 * t);
    const step = f / Math.max(1 - FOLD_SKEW_MAX, slope);
    t -= step;
    if (Math.abs(step) < 1e-10) break;
  }
  return t;
}

/**
 * How many harmonics a fitted fold profile carries. Fixed, because the shader
 * declares the uniforms for exactly this many and cannot index them by a
 * computed count. Eight of a fundamental twice the block wide resolves
 * anything down to a quarter of the block, which is finer than a handful of
 * stations can say anything about.
 */
export const FOLD_HARMONICS = 8;

/**
 * The shape of a fold across its axis, as a function of warped phase.
 *
 * Without a profile this is the cosine every fold has always been. With one
 * it is a Fourier series in that same phase — `profile` holds
 * [a1, b1, a2, b2, ...] for cos(n·psi) and sin(n·psi) — normalised so the
 * event's `amplitude` still means the peak displacement in metres. Anything
 * that is a function of the phase alone keeps the fold exactly invertible,
 * which is the one property the whole model rests on, so this is the widest
 * family the block can carry for free.
 *
 * The GLSL twin in geo/glsl.js evaluates the same sum, unrolled. Keep them
 * in step.
 */
export function foldProfile(psi, profile) {
  if (!profile || !profile.length) return Math.cos(psi);
  let f = 0;
  for (let n = 1; n <= FOLD_HARMONICS; n++) {
    const a = profile[2 * n - 2] || 0;
    const b = profile[2 * n - 1] || 0;
    if (a || b) f += a * Math.cos(n * psi) + b * Math.sin(n * psi);
  }
  return f;
}

/**
 * Where a profile crests and troughs, over one period of the unwarped phase
 * t in [0, 2π). Each entry is { t, value }, value in units of the amplitude.
 * A plain cosine gives t = 0 (crest, +1) and t = π (trough, −1); a fitted
 * profile can have more, or unevenly spaced ones, which is the point of it.
 */
export function foldProfileExtrema(profile, vergence, hinge, steps = 720) {
  const f = (t) => foldProfile(foldWarp(t, vergence, hinge), profile);
  const out = [];
  const step = (2 * Math.PI) / steps;
  let prev = f(-step);
  let cur = f(0);
  for (let i = 0; i < steps; i++) {
    const next = f((i + 1) * step);
    if ((cur > prev && cur >= next) || (cur < prev && cur <= next)) {
      out.push({ t: i * step, value: cur });
    }
    prev = cur;
    cur = next;
  }
  return out;
}

/**
 * How much of its amplitude the fold still has at a point — 1 in the middle,
 * 0 outside its reach, tapered smoothly between.
 *
 * The same bounded cosine taper a dome or basin already uses, for the same
 * reason: real structures are finite. A fold train that runs at full amplitude
 * to the edge of every block is the reason one fitted structure has to serve a
 * whole map, and why a gentle limb in one corner cannot coexist with a tight
 * train in another.
 *
 * Either reach left at zero means "no limit in that direction", so a fold that
 * dies out along strike but runs on across it is one number, not a special
 * case. Both zero is the old behaviour exactly.
 *
 * `along` and `across` must both be measured in the unplunged frame, where
 * they are horizontal — that is what keeps the envelope independent of z, and
 * so keeps the fold's inverse exact.
 */
export function foldEnvelope(along, across, reachAlong, reachAcross) {
  const a = reachAlong > 0 ? reachAlong : 0;
  const b = reachAcross > 0 ? reachAcross : 0;
  if (!a && !b) return 1;
  const u = Math.hypot(a ? along / a : 0, b ? across / b : 0);
  return u >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * u));
}

export const FLAT_DIP = 1.5;
export const VERTICAL_DIP = 88.5;

/** Format an azimuth as a quadrant bearing, e.g. 135 -> "S45E". */
export function quadrantBearing(azDeg) {
  const a = wrap360(azDeg);
  if (a === 0 || a === 360) return 'N';
  if (a === 90) return 'E';
  if (a === 180) return 'S';
  if (a === 270) return 'W';
  if (a < 90) return `N${round1(a)}E`;
  if (a < 180) return `S${round1(180 - a)}E`;
  if (a < 270) return `S${round1(a - 180)}W`;
  return `N${round1(360 - a)}W`;
}

function round1(v) { return Math.round(v * 10) / 10; }
