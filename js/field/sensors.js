// The phone as a field instrument: where it is, and which way the rock faces.
//
// Both sensors are wrapped rather than used directly, for the same reason:
// each of them will happily hand back a confident-looking number that is
// wrong, and the wrapper's job is to know when that is happening and say so.

import { normalToStrikeDip, normalize, dot, clamp } from '../geo/math.js';
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

/** Angle between two unit vectors, in degrees, ignoring sign. */
export function angleBetween(a, b) {
  return Math.acos(clamp(Math.abs(dot(normalize(a), normalize(b))), -1, 1)) * 180 / Math.PI;
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

    // iOS reports an absolute heading but an `alpha` measured from wherever
    // the phone happened to be switched on, so the heading is substituted back
    // in. Azimuth runs clockwise from north and alpha runs the other way,
    // hence the subtraction.
    const iosHeading = Number.isFinite(e.webkitCompassHeading) ? e.webkitCompassHeading : null;
    const alpha = iosHeading != null ? 360 - iosHeading : (e.alpha || 0);
    const absolute = iosHeading != null || e.absolute === true;

    let n = deviceNormal(alpha, e.beta || 0, e.gamma || 0);
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
    n = applyDeclination(n, this.getDeclination());

    const now = performance.now();
    this.samples.push({ t: now, n, absolute,
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

    let sum = [0, 0, 0];
    for (const k of s) {
      // Poles are sign-blind: a normal and its opposite are the same plane.
      // Summing without this check would cancel a reading taken on an
      // overhang against one taken on the floor of the same bed.
      const sign = dot(k.n, s[0].n) < 0 ? -1 : 1;
      sum = [sum[0] + k.n[0] * sign, sum[1] + k.n[1] * sign, sum[2] + k.n[2] * sign];
    }
    const mean = normalize(sum);

    let scatter = 0;
    for (const k of s) scatter = Math.max(scatter, angleBetween(k.n, mean));

    const absolute = s.every((k) => k.absolute);
    const acc = s[s.length - 1].accuracy;
    const { strike, dip } = normalToStrikeDip(mean);

    return {
      ready: true,
      settling: false,
      samples: s.length,
      normal: mean,
      // Without a compass reference the dip is still a real measurement — it
      // comes from gravity — but the strike is not, so it is not offered.
      strike: absolute ? strike : null,
      dip,
      scatter,
      still: scatter <= STILL_DEG,
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

function emptyState() {
  return {
    ready: false, settling: false, samples: 0,
    normal: null, strike: null, dip: null,
    scatter: null, still: false,
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
