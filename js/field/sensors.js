// The phone as a field instrument: where it is, and which way the rock faces.
//
// Both sensors are wrapped rather than used directly, for the same reason:
// each of them will happily hand back a confident-looking number that is
// wrong, and the wrapper's job is to know when that is happening and say so.

import { normalToStrikeDip, normalize, dot, clamp, cross, rotateAbout,
  rotateAboutVertical, wrap360, RAD } from '../geo/math.js';
import { vecToTrendPlunge } from '../geo/stereonet.js';
import { applyDeclination } from './declination.js';

// ---------------------------------------------------------------------------
// Orientation
// ---------------------------------------------------------------------------

/**
 * The device's own +Z axis — the one that points out of the screen — expressed
 * in East-North-Up.
 *
 * Lay the phone face-up on a bedding plane and that axis IS the pole to
 * bedding, which is why this is the whole measurement. The rotation matrix is
 * the one from the DeviceOrientation spec, R = Rz(alpha)Rx(beta)Ry(gamma);
 * this returns its third column, which is where device +Z lands.
 *
 * Screen rotation deliberately plays no part. Turning the phone in the hand
 * spins the picture but not the slab of glass, so +Z is +Z whichever way up
 * the interface has decided to draw itself.
 */
export function deviceNormal(alphaDeg, betaDeg, gammaDeg) {
  const D = Math.PI / 180;
  const a = alphaDeg * D, b = betaDeg * D, g = gammaDeg * D;
  const cA = Math.cos(a), sA = Math.sin(a);
  const cB = Math.cos(b), sB = Math.sin(b);
  const cG = Math.cos(g), sG = Math.sin(g);
  return [
    cA * sG + cG * sA * sB,   // East
    sA * sG - cA * cG * sB,   // North
    cB * cG,                  // Up
  ];
}

/**
 * The device's +Y axis — the one running up the long edge, out of the top of
 * the phone — expressed in East-North-Up.
 *
 * This is what reads a LINE rather than a plane. Lay the top edge of the phone
 * along a lineation, a slickenline or a fold hinge and point it down-plunge,
 * and that axis is the structure. It is the second column of the same
 * rotation matrix `deviceNormal` takes its third column from, so the two
 * measurements come from one reading of the sensors and cannot disagree.
 */
export function deviceAxis(alphaDeg, betaDeg, gammaDeg) {
  const D = Math.PI / 180;
  const a = alphaDeg * D, b = betaDeg * D, g = gammaDeg * D;
  const cA = Math.cos(a), sA = Math.sin(a);
  const cB = Math.cos(b), sB = Math.sin(b);
  return [
    -cB * sA,   // East
    cA * cB,    // North
    sB,         // Up
  ];
}

/** Angle between two unit vectors, in degrees, ignoring sign. */
export function angleBetween(a, b) {
  return Math.acos(clamp(Math.abs(dot(normalize(a), normalize(b))), -1, 1)) * 180 / Math.PI;
}

/**
 * The heading a tilt-compensated compass reports for a device in this
 * orientation.
 *
 * There are two defensible ways to give a tilted phone a bearing, and they
 * disagree:
 *
 *   - drop the phone's long axis straight down onto the horizontal plane and
 *     read its azimuth. This is what the Euler `alpha` encodes.
 *   - stand the phone up first — rotate it level about the horizontal axis it
 *     is tilted around — and then read the azimuth. This is what a compass
 *     does, and what CoreLocation returns.
 *
 * They agree only when the tilt is square to the phone: dipping away from you,
 * or off to the side. At anything oblique they diverge, by a few degrees on a
 * gentle dip and by tens of degrees on a steep one. Treating one as the other
 * is what made the strike swing when the phone was turned on the rock.
 */
export function tiltCompensatedHeading(normal, axis) {
  const up = [0, 0, 1];
  const lean = Math.hypot(normal[0], normal[1]);
  // Lying flat: the long axis is already horizontal and its azimuth is the
  // heading, with no levelling to do and no tilt axis to do it about.
  if (lean < 1e-9) return wrap360(Math.atan2(axis[0], axis[1]) * RAD);
  const tiltAxis = normalize(cross(up, normal));
  const tilt = Math.acos(clamp(dot(normal, up), -1, 1)) * RAD;
  const levelled = rotateAbout(axis, tiltAxis, -tilt);
  return wrap360(Math.atan2(levelled[0], levelled[1]) * RAD);
}

/**
 * Recover a true-north device frame from a compass heading and the two tilt
 * angles.
 *
 * iOS reports `alpha` against an arbitrary reference and hands the absolute
 * direction over separately as `webkitCompassHeading`, so the frame has to be
 * rebuilt. Substituting the heading into `alpha` looks like it does that and
 * does not: it silently assumes the first of the two conventions above.
 *
 * Instead: build the frame with `alpha` at zero, ask what heading a compass
 * would report for it, and turn the whole frame about the vertical by the
 * difference. Whatever the phone is doing, the answer then depends only on
 * the surface — turning the phone on the spot moves the long axis and the
 * heading together and leaves the plane where it was.
 */
export function orientationFromHeading(headingDeg, betaDeg, gammaDeg) {
  const n = deviceNormal(0, betaDeg, gammaDeg);
  const y = deviceAxis(0, betaDeg, gammaDeg);
  const turn = headingDeg - tiltCompensatedHeading(n, y);
  return {
    normal: rotateAboutVertical(n, turn),
    axis: rotateAboutVertical(y, turn),
  };
}

export function orientationSupported() {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/**
 * iOS will not deliver orientation events until it has been asked, from
 * inside a user gesture. Everywhere else the permission does not exist and
 * the answer is yes.
 */
export async function requestOrientationPermission() {
  const DOE = window.DeviceOrientationEvent;
  if (!DOE) return 'unsupported';
  if (typeof DOE.requestPermission !== 'function') return 'granted';
  try {
    return await DOE.requestPermission();
  } catch {
    return 'denied';
  }
}

const SAMPLE_MS = 1200;      // window the average is taken over
const STILL_DEG = 1.2;       // spread below which the phone counts as held still
const MIN_SAMPLES = 8;

/**
 * A clinometer that refuses to be more confident than it should be.
 *
 * Three things make a phone compass lie, and each one is reported rather than
 * hidden:
 *
 *   scatter    how far the samples in the window disagree. A phone resting on
 *              rock settles to a few tenths of a degree; a hand-held one over
 *              a magnetic outcrop wanders. This is the number that tells a
 *              student to try again, and it is stored with the reading so a
 *              bad one stays visibly bad in the notebook.
 *   absolute   whether the azimuth is referenced to anything at all. Some
 *              browsers deliver tilt without a compass, in which case the dip
 *              is real and the strike is meaningless — so the strike is
 *              withheld rather than invented.
 *   absolute is not the same as correct. No browser on any platform hands
 *   back a bearing that is already turned to true north — iOS included, which
 *   is a trap, because it offers a property called `webkitCompassHeading` that
 *   reads as though it must be. It is not: WebKit fills it from CoreLocation's
 *   `magneticHeading`, never `trueHeading`. So the declination correction is
 *   always this code's job, on every platform, and the user's setting is the
 *   only thing that makes a strike true.
 */
export class Clinometer {
  constructor({ getDeclination = () => 0 } = {}) {
    this.getDeclination = getDeclination;
    this.samples = [];
    this.listeners = new Set();
    this.state = emptyState();
    this._onEvent = this._onEvent.bind(this);
    this._eventName = null;
  }

  subscribe(fn) { this.listeners.add(fn); fn(this.state); return () => this.listeners.delete(fn); }

  async start() {
    if (this._eventName) return 'granted';
    const perm = await requestOrientationPermission();
    if (perm !== 'granted') {
      this._set({ ...emptyState(), error: perm });
      return perm;
    }
    // `deviceorientationabsolute` is the one that promises a real compass
    // reference. Where it does not exist, plain `deviceorientation` may still
    // be absolute (it is on iOS, via webkitCompassHeading) — the event itself
    // says which, and that is what `absolute` below reports.
    this._eventName = 'ondeviceorientationabsolute' in window
      ? 'deviceorientationabsolute'
      : 'deviceorientation';
    window.addEventListener(this._eventName, this._onEvent);
    return 'granted';
  }

  stop() {
    if (!this._eventName) return;
    window.removeEventListener(this._eventName, this._onEvent);
    this._eventName = null;
    this.samples.length = 0;
    this._set(emptyState());
  }

  /** Throw away the window, so the next reading is not half the last one. */
  reset() { this.samples.length = 0; }

  _onEvent(e) {
    if (e.alpha == null && e.webkitCompassHeading == null) return;

    const iosHeading = Number.isFinite(e.webkitCompassHeading) ? e.webkitCompassHeading : null;
    const absolute = iosHeading != null || e.absolute === true;
    const beta = e.beta || 0, gamma = e.gamma || 0;

    // Two different sources, two different reconstructions. Android's absolute
    // events carry a real Euler alpha already referenced to north, so the
    // frame comes straight out of the three angles. iOS carries an arbitrary
    // alpha plus a compass heading, and that has to be rebuilt.
    let n, y;
    if (iosHeading != null) {
      ({ normal: n, axis: y } = orientationFromHeading(iosHeading, beta, gamma));
    } else {
      n = deviceNormal(e.alpha || 0, beta, gamma);
      y = deviceAxis(e.alpha || 0, beta, gamma);
    }
    // Every platform reports against MAGNETIC north, so the correction is
    // always ours to make.
    //
    // The name `webkitCompassHeading` invites the opposite assumption, and
    // taking it on trust puts every strike out by the local declination —
    // fifteen degrees in the western United States — while the app looks
    // like it is working. WebKit fills that property from CoreLocation's
    // `magneticHeading` and never from `trueHeading`, because `trueHeading`
    // is only valid while location updates are running and a web page has no
    // way to guarantee that. See WebCoreMotionManager.mm.
    const decl = this.getDeclination();
    n = applyDeclination(n, decl);
    y = applyDeclination(y, decl);

    const now = performance.now();
    this.samples.push({ t: now, n, y, absolute,
      accuracy: Number.isFinite(e.webkitCompassAccuracy) ? e.webkitCompassAccuracy : null });
    while (this.samples.length && now - this.samples[0].t > SAMPLE_MS) this.samples.shift();

    this._set(this._reduce());
  }

  /** Average the window as vectors, and measure how much it disagrees. */
  _reduce() {
    const s = this.samples;
    if (s.length < MIN_SAMPLES) {
      return { ...emptyState(), settling: true, samples: s.length };
    }

    // Both the pole and the long axis are averaged, so switching between
    // measuring a plane and measuring a line is a change of which number is
    // read out and not a change of what the sensors are doing.
    const mean = meanAxis(s, 'n');
    const meanLine = meanAxis(s, 'y');

    let scatter = 0;
    let lineScatter = 0;
    for (const k of s) {
      scatter = Math.max(scatter, angleBetween(k.n, mean));
      lineScatter = Math.max(lineScatter, angleBetween(k.y, meanLine));
    }

    const absolute = s.every((k) => k.absolute);
    const acc = s[s.length - 1].accuracy;
    const { strike, dip } = normalToStrikeDip(mean);
    const { trend, plunge } = vecToTrendPlunge(meanLine);

    return {
      ready: true,
      settling: false,
      samples: s.length,
      normal: mean,
      // Without a compass reference the dip is still a real measurement — it
      // comes from gravity — but the strike is not, so it is not offered.
      strike: absolute ? strike : null,
      dip,
      // The same reading seen as a line, for lineations, slickenlines and
      // fold hinges. Plunge comes from gravity, trend from the compass, so
      // trend is withheld on the same terms the strike is.
      axis: meanLine,
      trend: absolute ? trend : null,
      plunge,
      scatter,
      lineScatter,
      still: Math.max(scatter, lineScatter) <= STILL_DEG,
      absolute,
      // iOS reports this as a plus-or-minus in degrees, and negative means
      // the magnetometer is not calibrated at all.
      compassAccuracy: acc,
      needsCalibration: acc != null && (acc < 0 || acc > 20),
      error: null,
    };
  }

  _set(state) {
    this.state = state;
    for (const fn of this.listeners) fn(state);
  }
}

/**
 * Mean direction of a set of samples, ignoring sign.
 *
 * A pole and its opposite are the same plane, and a lineation has no arrow —
 * so summing the raw vectors would cancel a reading taken on an overhang
 * against one taken on the floor of the same bed.
 */
function meanAxis(samples, key) {
  let sum = [0, 0, 0];
  const ref = samples[0][key];
  for (const k of samples) {
    const v = k[key];
    const sign = dot(v, ref) < 0 ? -1 : 1;
    sum = [sum[0] + v[0] * sign, sum[1] + v[1] * sign, sum[2] + v[2] * sign];
  }
  return normalize(sum);
}

function emptyState() {
  return {
    ready: false, settling: false, samples: 0,
    normal: null, strike: null, dip: null,
    axis: null, trend: null, plunge: null,
    scatter: null, lineScatter: null, still: false,
    absolute: false,
    compassAccuracy: null, needsCalibration: false,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

/**
 * A GPS watch that tells the truth about what it has.
 *
 * With no cell service a phone still receives satellites perfectly well, but
 * it loses the assistance data that normally makes the first fix quick — so
 * for the first half-minute on a cold start the browser keeps handing back
 * something coarse, or something remembered from the car park. Plotting that
 * silently is exactly how a map ends up with a station fifty meters into the
 * wrong unit.
 *
 * So: the accuracy radius and the age of the fix are always part of the
 * reading, and callers are expected to gate on them.
 */
export class GeoWatch {
  constructor({ goodAccuracy = 15 } = {}) {
    this.goodAccuracy = goodAccuracy;
    this.listeners = new Set();
    this.state = { status: 'idle', fix: null, error: null };
    this._id = null;
  }

  subscribe(fn) { this.listeners.add(fn); fn(this.state); return () => this.listeners.delete(fn); }

  start() {
    if (this._id != null || !navigator.geolocation) {
      if (!navigator.geolocation) this._set({ status: 'unsupported', fix: null, error: null });
      return;
    }
    this._set({ status: 'acquiring', fix: null, error: null });
    this._id = navigator.geolocation.watchPosition(
      (p) => this._onFix(p),
      (err) => this._onError(err),
      // maximumAge 0 because a remembered fix is the failure mode, not a
      // saving. enableHighAccuracy is what asks for the GNSS chip rather
      // than an inference from whatever radio happens to be in range.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
  }

  stop() {
    if (this._id != null) navigator.geolocation.clearWatch(this._id);
    this._id = null;
    this._set({ status: 'idle', fix: null, error: null });
  }

  _onFix(p) {
    const c = p.coords;
    this._set({
      status: 'live',
      error: null,
      fix: {
        lon: c.longitude,
        lat: c.latitude,
        accuracy: c.accuracy,
        altitude: Number.isFinite(c.altitude) ? c.altitude : null,
        altitudeAccuracy: Number.isFinite(c.altitudeAccuracy) ? c.altitudeAccuracy : null,
        heading: Number.isFinite(c.heading) ? c.heading : null,
        speed: Number.isFinite(c.speed) ? c.speed : null,
        at: p.timestamp,
        good: c.accuracy <= this.goodAccuracy,
      },
    });
  }

  _onError(err) {
    const kind = err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable';
    // A timeout on a later fix does not mean the earlier one stopped being
    // true, so the last fix is kept and simply goes on ageing.
    this._set({ ...this.state, status: kind, error: err.message || kind });
  }

  _set(state) {
    this.state = state;
    for (const fn of this.listeners) fn(state);
  }
}

/** How old a fix is, in seconds. */
export function fixAge(fix) {
  return fix ? Math.max(0, (Date.now() - fix.at) / 1000) : Infinity;
}
