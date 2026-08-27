// Magnetic declination: the angle between magnetic north, which is what a
// magnetometer finds, and true north, which is what a map is drawn to.
//
// This is the one number in the whole measurement chain that the app cannot
// derive from the sensors, and getting it wrong rotates every strike by the
// same amount without looking wrong at all. So it is a plain setting the
// student owns. Anyone carrying a Brunton has already dialled it in on the
// compass and can type the same number here.
//
// Two conveniences sit behind that field, never in front of it:
//
//   - iOS reports a heading that is already corrected to true north, so on an
//     iPhone the correction here is zero and the setting only documents what
//     the phone already did.
//   - When an area is cached the app is by definition online, so it asks NOAA
//     for the declination at that area's center and offers it as a suggestion.
//     If that fails, nothing breaks: the field is still there.

import { rotateAboutVertical } from '../geo/math.js';

export const DECL_UNSET = null;

/**
 * Rotate an East-North-Up vector from a magnetic-referenced frame into a
 * true-north one.
 *
 * A bearing measured from magnetic north converts to true by adding the
 * declination, so the whole horizontal plane turns by that angle.
 */
export function applyDeclination(v, declDeg) {
  return rotateAboutVertical(v, declDeg || 0);
}

/** The same correction applied to a bare azimuth. */
export function trueAzimuth(magneticAz, declDeg) {
  return ((magneticAz + (declDeg || 0)) % 360 + 360) % 360;
}

export function formatDeclination(d) {
  if (d == null) return 'not set';
  const v = Math.abs(d);
  if (v < 0.05) return '0°';
  return `${v.toFixed(1)}° ${d > 0 ? 'E' : 'W'}`;
}

/**
 * Ask NOAA for the declination at a point, for the current epoch.
 *
 * Only ever called while the app is online and only to fill in a suggestion,
 * so every failure path is the same: return null and let the student type it.
 * The timeout matters — a field trip's worth of tiles is already downloading
 * when this runs, and this must not be what holds it up.
 */
export async function fetchDeclination(lon, lat, { timeoutMs = 8000 } = {}) {
  const url = 'https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination'
    + `?lat1=${lat.toFixed(4)}&lon1=${lon.toFixed(4)}&key=zNEw7&resultFormat=json`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = await res.json();
    const r = json?.result?.[0];
    if (!r || !Number.isFinite(r.declination)) return null;
    return {
      declination: r.declination,
      uncertainty: r.declination_uncertainty ?? null,
      // Declination drifts, and a cached area may be opened a year later.
      // Keeping the rate of change lets the app say when its number is stale
      // rather than quietly going on being confident about it.
      driftPerYear: r.declination_sv ?? null,
      model: json.model || null,
      epoch: r.date ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
