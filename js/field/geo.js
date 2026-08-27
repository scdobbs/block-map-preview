// Web Mercator, tiles, and distance on the globe.
//
// The map works in three coordinate systems and it is worth naming them once:
//
//   lon/lat   WGS84 degrees. What the GPS reports and what a station stores.
//   world     Web Mercator normalized to 0..1 across the whole planet. This is
//             what the map pans and zooms in, and it does not care what zoom
//             level is on screen.
//   tile      z/x/y, which is how the tile servers are addressed.
//
// Everything converts lon/lat to world exactly once and then scales. Panning
// re-projects nothing, which is what keeps the map smooth on an old phone.

export const TILE = 256;
// Mercator is defined on a sphere of the WGS84 semi-major axis, so the
// projection must use that number and no other. Ground distance is a
// different question: over a whole ellipsoid the mean radius is the better
// sphere, and using the equatorial one instead runs 0.3% long — three meters
// every kilometre, which is more error than the GPS contributes.
export const EARTH_R = 6378137;      // WGS84 semi-major axis, for projection
export const MEAN_R = 6371008.8;     // mean radius, for distance
export const MAX_LAT = 85.05112878;  // where Mercator is cut square

export function clampLat(lat) { return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)); }

export function lonToWorld(lon) { return (lon + 180) / 360; }

export function latToWorld(lat) {
  const r = clampLat(lat) * Math.PI / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / (2 * Math.PI);
}

export function worldToLon(x) { return x * 360 - 180; }

export function worldToLat(y) {
  const n = Math.PI * (1 - 2 * y);
  return Math.atan(Math.sinh(n)) * 180 / Math.PI;
}

/**
 * Ground meters per screen pixel.
 *
 * Mercator stretches with latitude, so this is not a property of the zoom
 * alone. A scale bar that ignores the cosine is wrong by a third in Alaska.
 */
export function metersPerPixel(lat, zoom) {
  return (2 * Math.PI * EARTH_R * Math.cos(clampLat(lat) * Math.PI / 180))
    / (TILE * Math.pow(2, zoom));
}

/** World units per ground meter, at a given latitude. */
export function worldPerMeter(lat) {
  return 1 / (2 * Math.PI * EARTH_R * Math.cos(clampLat(lat) * Math.PI / 180));
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

export function tileOf(lon, lat, z) {
  const n = Math.pow(2, z);
  return {
    x: Math.floor(lonToWorld(lon) * n),
    y: Math.floor(latToWorld(lat) * n),
    z,
  };
}

/**
 * Inclusive tile bounds covering a bbox at one zoom.
 * bbox is [west, south, east, north] in degrees.
 */
export function tileRange(bbox, z) {
  const n = Math.pow(2, z);
  const [w, s, e, nth] = bbox;
  const x0 = Math.floor(lonToWorld(w) * n);
  const x1 = Math.floor(lonToWorld(e) * n);
  // World Y grows southward, so north gives the smaller index.
  const y0 = Math.floor(latToWorld(nth) * n);
  const y1 = Math.floor(latToWorld(s) * n);
  return {
    z,
    x0: Math.max(0, Math.min(x0, x1)),
    x1: Math.min(n - 1, Math.max(x0, x1)),
    y0: Math.max(0, Math.min(y0, y1)),
    y1: Math.min(n - 1, Math.max(y0, y1)),
  };
}

export function rangeCount(r) {
  return (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
}

/** Every tile in a range, as {z,x,y}. */
export function* rangeTiles(r) {
  for (let x = r.x0; x <= r.x1; x++) {
    for (let y = r.y0; y <= r.y1; y++) yield { z: r.z, x, y };
  }
}

/** The lon/lat bbox a single tile covers. */
export function tileBounds(z, x, y) {
  const n = Math.pow(2, z);
  return [
    worldToLon(x / n),
    worldToLat((y + 1) / n),
    worldToLon((x + 1) / n),
    worldToLat(y / n),
  ];
}

export const tileKey = (z, x, y) => `${z}/${x}/${y}`;

// ---------------------------------------------------------------------------
// Distance and bearing
// ---------------------------------------------------------------------------

/** Great-circle distance in meters. */
export function distance(lon1, lat1, lon2, lat2) {
  const d = Math.PI / 180;
  const a1 = lat1 * d, a2 = lat2 * d;
  const dLat = (lat2 - lat1) * d;
  const dLon = (lon2 - lon1) * d;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a1) * Math.cos(a2) * Math.sin(dLon / 2) ** 2;
  return 2 * MEAN_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing, degrees clockwise from true north. */
export function bearing(lon1, lat1, lon2, lat2) {
  const d = Math.PI / 180;
  const a1 = lat1 * d, a2 = lat2 * d;
  const dLon = (lon2 - lon1) * d;
  const y = Math.sin(dLon) * Math.cos(a2);
  const x = Math.cos(a1) * Math.sin(a2) - Math.sin(a1) * Math.cos(a2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** A square bbox of the given half-width in meters, centered on a point. */
export function bboxAround(lon, lat, halfMeters) {
  const dLat = (halfMeters / MEAN_R) * 180 / Math.PI;
  const dLon = dLat / Math.max(0.01, Math.cos(clampLat(lat) * Math.PI / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

export function bboxCenter(b) { return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }

/** Rough ground width and height of a bbox, in meters. */
export function bboxSize(b) {
  const [cx, cy] = bboxCenter(b);
  return [distance(b[0], cy, b[2], cy), distance(cx, b[1], cx, b[3])];
}

export function bboxContains(b, lon, lat) {
  return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Decimal degrees, five places — about a meter, which is past GPS anyway. */
export function formatLonLat(lon, lat) {
  return `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}  `
    + `${Math.abs(lon).toFixed(5)}°${lon >= 0 ? 'E' : 'W'}`;
}

/** Degrees and decimal minutes, which is what most field slips still use. */
export function formatDDM(lon, lat) {
  const part = (v, pos, neg) => {
    const a = Math.abs(v);
    const deg = Math.floor(a);
    return `${deg}° ${((a - deg) * 60).toFixed(3)}' ${v >= 0 ? pos : neg}`;
  };
  return `${part(lat, 'N', 'S')}  ${part(lon, 'E', 'W')}`;
}

export function formatDistance(m) {
  if (!Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

export function formatBytes(b) {
  if (!Number.isFinite(b) || b <= 0) return '0 MB';
  const MB = 1024 * 1024;
  if (b < MB) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 * MB) return `${(b / MB).toFixed(b < 100 * MB ? 1 : 0)} MB`;
  return `${(b / 1024 / MB).toFixed(1)} GB`;
}
