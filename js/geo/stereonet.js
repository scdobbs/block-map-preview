// Lower-hemisphere stereographic projection, and the eigenvalue analysis that
// turns a scatter of bedding poles into a fold axis.
//
// The geology this exists to teach: on a cylindrically folded surface, the
// poles to bedding all lie in the plane perpendicular to the hinge line. So
// plot the poles, fit a great circle through them — the pi-circle — and its
// own pole is the fold axis. Nothing about the fold has to be visible on the
// map for this to work, which is exactly why it is worth learning.
//
// The frame is the one the rest of the app uses: X = East, Y = North, Z = Up.
// Everything here works on axes, not directions: a pole and its opposite are
// the same measurement, so the maths is deliberately sign-blind and only the
// drawing code picks the downward end.

import { planeFrame, normalToStrikeDip, normalize, wrap360, DEG, RAD } from './math.js';

export const PROJECTIONS = [
  {
    id: 'equalArea',
    label: 'Equal area',
    hint: 'Schmidt net. Areas are true, so a crowd of poles means a crowd of measurements — the net to fit a girdle on.',
  },
  {
    id: 'equalAngle',
    label: 'Equal angle',
    hint: 'Wulff net. Angles are true and circles stay circles, which is the one to measure an angle between planes on.',
  },
];

/**
 * Project a vector onto the net, as (x east, y north) inside the unit circle.
 *
 * Both projections are usually written with a half-angle of the colatitude;
 * written straight off the vector instead they need no trigonometry at all,
 * because the half-angle identities collapse into the components:
 *   equal angle  r = tan(t/2) = (1 - cos t) / sin t
 *   equal area   r = sqrt(2) sin(t/2) = sqrt(1 - cos t)
 * where t is the angle from straight down, so cos t is the downward component
 * and sin t the horizontal one.
 */
export function project(v, kind = 'equalArea') {
  let [e, n, u] = normalize(v);
  if (u > 0) { e = -e; n = -n; u = -u; }   // lower hemisphere
  const down = -u;                          // cos t
  const h = Math.hypot(e, n);               // sin t
  if (h < 1e-9) return { x: 0, y: 0 };      // vertical line plots at the center
  const r = kind === 'equalAngle' ? (1 - down) / h : Math.sqrt(Math.max(0, 1 - down));
  return { x: (r * e) / h, y: (r * n) / h };
}

/** Downward-pointing normal to a plane — the pole a geologist plots. */
export function poleOf(strikeDeg, dipDeg) {
  const { normal } = planeFrame(strikeDeg, dipDeg);
  return [-normal[0], -normal[1], -normal[2]];
}

/** A line as trend and plunge, always taking the downward end. */
export function vecToTrendPlunge(v) {
  let [e, n, u] = normalize(v);
  if (u > 0) { e = -e; n = -n; u = -u; }
  const plunge = Math.asin(Math.min(1, Math.max(-1, -u))) * RAD;
  // A vertical line has no trend; call it north rather than whatever the
  // rounding error in the horizontal components happens to say.
  const trend = Math.hypot(e, n) < 1e-9 ? 0 : wrap360(Math.atan2(e, n) * RAD);
  return { trend, plunge };
}

/**
 * A line the way it is written in a notebook: trend first, then plunge.
 * "020/15" is a hinge running toward 020 and plunging 15 degrees into the
 * ground. Every readout that prints one says "trend / plunge" beside it,
 * because on its own that reads exactly like the strike/dip of a plane.
 */
export function formatLine({ trend, plunge }) {
  return `${pad3(trend)}/${Math.round(plunge)}`;
}

/** A plane, in the same strike/dip form the readings themselves use. */
export function formatPlane({ strike, dip }) {
  return `${pad3(strike)}/${Math.round(dip)}`;
}

function pad3(v) { return String(Math.round(v) % 360).padStart(3, '0'); }

export function trendPlungeToVec(trendDeg, plungeDeg) {
  const t = trendDeg * DEG;
  const p = plungeDeg * DEG;
  return [Math.sin(t) * Math.cos(p), Math.cos(t) * Math.cos(p), -Math.sin(p)];
}

// ---------------------------------------------------------------------------
// Curves on the net
// ---------------------------------------------------------------------------

/**
 * The lower-hemisphere trace of a plane, as projected points.
 * Sweeping from the strike direction through down-dip and round to the
 * opposite strike direction stays in the lower hemisphere the whole way, so
 * the trace never has to be clipped.
 */
export function greatCircle(strikeDeg, dipDeg, kind, steps = 90) {
  const { strikeVec, dipVec } = planeFrame(strikeDeg, dipDeg);
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI;
    const c = Math.cos(a), s = Math.sin(a);
    out.push(project([
      c * strikeVec[0] + s * dipVec[0],
      c * strikeVec[1] + s * dipVec[1],
      c * strikeVec[2] + s * dipVec[2],
    ], kind));
  }
  return out;
}

/**
 * A cone of half-angle `alpha` about `axis`, as one or more projected
 * polylines. A cone about a horizontal axis pokes out of the top of the
 * sphere, and the part that does has no lower-hemisphere projection, so the
 * curve is returned broken into the arcs that survive.
 */
export function smallCircle(axis, alphaDeg, kind, steps = 120) {
  const a = normalize(axis);
  // Any perpendicular will do to start the frame off.
  const seed = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(a, seed));
  const w = cross(a, u);
  const ca = Math.cos(alphaDeg * DEG), sa = Math.sin(alphaDeg * DEG);

  const segments = [];
  let run = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const v = [
      ca * a[0] + sa * (c * u[0] + s * w[0]),
      ca * a[1] + sa * (c * u[1] + s * w[1]),
      ca * a[2] + sa * (c * u[2] + s * w[2]),
    ];
    if (v[2] <= 1e-9) {
      run.push(project(v, kind));
    } else if (run.length) {
      segments.push(run);
      run = [];
    }
  }
  if (run.length) segments.push(run);
  return segments;
}

// ---------------------------------------------------------------------------
// Fitting
// ---------------------------------------------------------------------------

/**
 * Orientation tensor of a set of axes: the mean of the outer products.
 * Because it is built from v*vT, a vector and its opposite contribute exactly
 * the same thing — which is what makes it the right tool for poles, where
 * "up" and "down" carry no information.
 */
export function orientationTensor(vectors) {
  const T = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const raw of vectors) {
    const v = normalize(raw);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) T[i][j] += v[i] * v[j];
    }
  }
  const n = Math.max(1, vectors.length);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) T[i][j] /= n;
  }
  return T;
}

/**
 * Eigenvalues and eigenvectors of a symmetric 3x3, by cyclic Jacobi rotation,
 * sorted largest eigenvalue first. Jacobi rather than the closed form: at this
 * size both are instant, and Jacobi stays accurate when two eigenvalues are
 * nearly equal — which is precisely the case for a girdle, the one this
 * function exists to handle.
 */
export function eigenSym3(A) {
  const a = A.map((row) => row.slice());
  let V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  for (let sweep = 0; sweep < 24; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-14) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-18) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;

      const apq = a[p][q];
      const app = a[p][p] - t * apq;
      const aqq = a[q][q] + t * apq;
      for (let k = 0; k < 3; k++) {
        if (k === p || k === q) continue;
        const akp = c * a[k][p] - s * a[k][q];
        const akq = s * a[k][p] + c * a[k][q];
        a[k][p] = akp; a[p][k] = akp;
        a[k][q] = akq; a[q][k] = akq;
      }
      a[p][p] = app; a[q][q] = aqq;
      a[p][q] = 0; a[q][p] = 0;

      for (let k = 0; k < 3; k++) {
        const vkp = c * V[k][p] - s * V[k][q];
        const vkq = s * V[k][p] + c * V[k][q];
        V[k][p] = vkp; V[k][q] = vkq;
      }
    }
  }

  const idx = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return {
    values: idx.map((i) => a[i][i]),
    vectors: idx.map((i) => [V[0][i], V[1][i], V[2][i]]),
  };
}

// A reading spread narrower than this is one limb, not a fold: any number of
// great circles fit a single cluster of poles equally well, so the axis that
// falls out of it is arithmetic, not geology.
const MIN_SPREAD = 12;
// And poles this far off the fitted circle are not describing one cylinder.
const MAX_MISFIT = 8;
/**
 * How much better the fitted girdle has to be than the next plane along.
 *
 * This is the test that keeps a dome from being reported as a fold. The poles
 * over a dome lie on a SMALL circle — a cone about the vertical — and a cone
 * is very nearly as well fitted by one great circle as by any other, so the
 * smallest two eigenvalues come out equal and the "axis" is whichever way the
 * rounding error fell. Only when the smallest eigenvalue stands clearly below
 * the middle one is there a girdle plane worth naming.
 */
const MIN_AXIS_RATIO = 6;
// A cone this tight is a cluster, and one this open is a girdle; between the
// two it is a dome or a basin.
const CONE_MIN = 8;
const CONE_MAX = 82;
const CONE_MISFIT = 6;

/**
 * Fit a girdle to a set of bedding poles and say what it means.
 *
 * @param {Array<{strike:number, dip:number}>} beds
 * @returns {object} kind is one of
 *   'few'       not enough readings to fit anything
 *   'cluster'   one attitude — no fold axis is defined
 *   'conical'   poles on a small circle: a dome or basin, not a cylinder
 *   'scattered' the poles do not lie on any one surface
 *   'girdle'    a cylindrical fold, and `axis` is its hinge
 */
export function fitBedding(beds) {
  const poles = beds.map((b) => poleOf(b.strike, b.dip));
  if (poles.length < 3) return { kind: 'few', n: poles.length };

  const { values, vectors } = eigenSym3(orientationTensor(poles));
  const [l1, l2, l3] = values;
  const axis = vectors[2];          // smallest eigenvalue: the girdle's pole
  const meanPole = vectors[0];      // largest: the mean attitude

  // How far the poles sit off the fitted plane. A pole in the plane is 90
  // degrees from its normal, so its own angle out of the plane is asin|p.a|.
  let misfit = 0;
  for (const p of poles) misfit += Math.asin(Math.min(1, Math.abs(dot(p, axis)))) * RAD;
  misfit /= poles.length;

  const spread = girdleSpread(poles, axis);
  const cone = fitCone(poles, meanPole);
  const axisRatio = safe(l2) / safe(l3);

  const base = {
    n: poles.length,
    values,
    cone,
    // Woodcock's shape and strength, for anyone who wants the numbers behind
    // the verdict. K above 1 leans to a cluster, below 1 to a girdle.
    K: shapeK(l1, l2, l3),
    C: Math.log(safe(l1) / safe(l3)),
    misfit,
    spread,
    mean: normalToStrikeDip(meanPole),
  };

  if (spread < MIN_SPREAD) return { ...base, kind: 'cluster' };
  // No girdle plane worth the name: say what the poles are actually doing
  // instead of naming a hinge that the numbers do not support.
  if (axisRatio < MIN_AXIS_RATIO) {
    const conical = cone.misfit < CONE_MISFIT
      && cone.angle > CONE_MIN && cone.angle < CONE_MAX;
    return { ...base, kind: conical ? 'conical' : 'scattered', axisRatio };
  }
  if (misfit > MAX_MISFIT) return { ...base, kind: 'scattered', axisRatio };
  return {
    ...base,
    axisRatio,
    kind: 'girdle',
    axis: vecToTrendPlunge(axis),
    axisVec: axis,
    // The pi-circle itself: the plane the poles lie in.
    girdle: normalToStrikeDip(axis),
  };
}

/**
 * Best-fit cone about the mean pole: its half-angle, and how tightly the poles
 * hold to it. A dome or a basin puts every pole the same angle off vertical,
 * which is a small circle on the net and the one pattern a girdle fit cannot
 * describe.
 */
function fitCone(poles, rawAxis) {
  // An eigenvector has no sign, and poles are drawn downward, so take the
  // downward end. Get this wrong and the cone sits entirely in the upper
  // hemisphere, where a lower-hemisphere net has nothing to draw.
  const axis = rawAxis[2] > 0 ? [-rawAxis[0], -rawAxis[1], -rawAxis[2]] : rawAxis;
  const angles = poles.map((p) => {
    // The poles are axes too, so measure to whichever end is nearer.
    const c = Math.min(1, Math.abs(dot(p, axis)));
    return Math.acos(c) * RAD;
  });
  const angle = angles.reduce((a, b) => a + b, 0) / angles.length;
  const misfit = angles.reduce((a, b) => a + Math.abs(b - angle), 0) / angles.length;
  return { angle, misfit, axis };
}

/**
 * How much of the girdle the readings actually cover, in degrees.
 *
 * Poles are axes, so each one's position around the girdle is only defined
 * modulo 180 degrees. Fold them into that half turn, find the widest gap, and
 * what is left over is the arc the readings span. Two limbs 60 degrees apart
 * span 60; a single limb spans nothing, however many times it was measured.
 */
function girdleSpread(poles, axis) {
  const seed = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const A = normalize(cross(axis, seed));
  const B = cross(axis, A);

  const angles = poles
    .map((p) => {
      const a = Math.atan2(dot(p, B), dot(p, A)) * RAD;
      return ((a % 180) + 180) % 180;
    })
    .sort((x, y) => x - y);

  let widest = angles[0] + 180 - angles[angles.length - 1];   // the wrap-around gap
  for (let i = 1; i < angles.length; i++) {
    widest = Math.max(widest, angles[i] - angles[i - 1]);
  }
  return Math.max(0, 180 - widest);
}

function shapeK(l1, l2, l3) {
  const denom = Math.log(safe(l2) / safe(l3));
  if (denom < 1e-9) return Infinity;
  return Math.log(safe(l1) / safe(l2)) / denom;
}

function safe(v) { return Math.max(v, 1e-12); }

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
