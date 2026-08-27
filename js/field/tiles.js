// Map tiles, and the cache that has to still be there next Tuesday on a ridge
// with no signal.
//
// This is the part of the feature that everything else depends on, so it is
// worth being explicit about the three ways an offline map normally fails and
// what is done about each:
//
//   1. The cache gets swept.  The app's own service worker deletes every cache
//      that is not the current version on every update — which is right for
//      code and catastrophic for tiles. So tiles live under CACHE_NAME below,
//      which carries no app version and which sw.js is written to skip. Change
//      that name and you have thrown away every student's field area.
//
//   2. "Downloaded" was never true.  A download that half-finished still looks
//      finished if nobody counted. Every area therefore stores the exact list
//      of tiles it needs, and can be re-counted against the cache at any time.
//
//   3. It falls back to the network without saying so.  On a laptop that hides
//      the problem; in the field it IS the problem. Reads are cache-first and,
//      when the cache misses, report the miss rather than quietly leaving a
//      gray square that looks like water.

import { tileRange, rangeTiles, rangeCount } from './geo.js';

// No app version in this name, on purpose. See (1) above.
export const CACHE_NAME = 'field-tiles';

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------
// All of these are US federal imagery, in the public domain, served with
// permissive CORS and no key. That combination is why the map is US-only:
// every commercial basemap worth having forbids exactly the bulk pre-caching
// this feature is built to do.
//
// maxZoom is the real limit, found by asking the servers, not the one their
// metadata advertises. USGS declares tiles to zoom 23 and serves none past 16.

export const SOURCES = {
  topo: {
    id: 'topo',
    label: 'Topo',
    kind: 'base',
    detail: 'USGS 7.5-minute quad: contours, streams, roads, names.',
    maxZoom: 16,
    minZoom: 4,
    bytes: 22000,
    attribution: 'USGS The National Map',
    url: (z, x, y) =>
      `https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/${z}/${y}/${x}`,
  },
  imagery: {
    id: 'imagery',
    label: 'Imagery',
    kind: 'base',
    detail: 'Aerial photography with contours and names drawn over it.',
    maxZoom: 16,
    minZoom: 4,
    bytes: 37000,
    attribution: 'USGS The National Map: Orthoimagery',
    url: (z, x, y) =>
      `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/${z}/${y}/${x}`,
  },
  // Not a picture. This one is decoded into numbers, and those numbers are
  // where the hillshade, the contour lines and every station's ground
  // elevation come from.
  dem: {
    id: 'dem',
    label: 'Elevation',
    kind: 'data',
    detail: 'Terrain heights. Drives hillshade, contours and station elevations.',
    maxZoom: 15,
    minZoom: 8,
    bytes: 80000,
    attribution: 'Terrain Tiles on AWS (USGS 3DEP, SRTM)',
    url: (z, x, y) =>
      `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
  },
};

export const BASE_SOURCES = ['topo', 'imagery'];

export function source(id) { return SOURCES[id] || SOURCES.topo; }

/** Clamp a wanted zoom to what a source actually serves. */
export function clampZoom(sourceId, z) {
  const s = source(sourceId);
  return Math.max(s.minZoom, Math.min(s.maxZoom, Math.floor(z)));
}

// ---------------------------------------------------------------------------
// The cache
// ---------------------------------------------------------------------------

let cachePromise = null;
function openCache() {
  if (!cachePromise) cachePromise = caches.open(CACHE_NAME);
  return cachePromise;
}

export function cacheSupported() {
  return typeof caches !== 'undefined' && typeof fetch === 'function';
}

const urlFor = (sourceId, z, x, y) => source(sourceId).url(z, x, y);

/**
 * Read one tile.
 *
 * `allowNetwork` is what makes offline behavior honest: the map passes false
 * when the browser says it is offline, so a miss comes back as a miss straight
 * away instead of hanging on a fetch that cannot succeed.
 */
export async function readTile(sourceId, z, x, y, { allowNetwork = true } = {}) {
  const url = urlFor(sourceId, z, x, y);
  const cache = await openCache();
  const hit = await cache.match(url);
  if (hit) return { response: hit, from: 'cache' };
  if (!allowNetwork) return { response: null, from: 'missing' };
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return { response: null, from: 'error', status: res.status };
    // Browsing around online quietly builds the cache, which is how a student
    // who forgot to download an area sometimes still has it.
    await cache.put(url, res.clone());
    return { response: res, from: 'network' };
  } catch {
    return { response: null, from: 'offline' };
  }
}

/** A tile as something drawable, or null. */
export async function readTileBitmap(sourceId, z, x, y, opts) {
  const { response, from } = await readTile(sourceId, z, x, y, opts);
  if (!response) return { bitmap: null, from };
  try {
    const blob = await response.blob();
    // A zero-length body is a tile that was cached from a broken response.
    // Treat it as absent so the repair pass can pick it up.
    if (!blob.size) return { bitmap: null, from: 'missing' };
    return { bitmap: await createImageBitmap(blob), from };
  } catch {
    return { bitmap: null, from: 'error' };
  }
}

export async function hasTile(sourceId, z, x, y) {
  const cache = await openCache();
  return !!(await cache.match(urlFor(sourceId, z, x, y)));
}

// ---------------------------------------------------------------------------
// Areas
// ---------------------------------------------------------------------------

/**
 * Every tile an area needs, as {sourceId, z, x, y}.
 *
 * Derived from the area rather than stored with it, so the list can never
 * drift out of step with the bounds it was supposed to describe. All zooms
 * from the source's minimum are included: a student who zooms out to see
 * where they are should not find the map has gone blank above the one level
 * that got downloaded.
 */
export function areaTiles(area) {
  const out = [];
  for (const sourceId of area.sources) {
    const s = source(sourceId);
    const top = Math.max(s.minZoom, Math.min(s.maxZoom, area.minZoom ?? 10));
    for (let z = top; z <= Math.min(s.maxZoom, area.maxZoom ?? s.maxZoom); z++) {
      for (const t of rangeTiles(tileRange(area.bbox, z))) {
        out.push({ sourceId, z: t.z, x: t.x, y: t.y });
      }
    }
  }
  return out;
}

/** Tile count and rough size, for the confirmation before a download starts. */
export function estimateArea(area) {
  let tiles = 0;
  let bytes = 0;
  for (const sourceId of area.sources) {
    const s = source(sourceId);
    const top = Math.max(s.minZoom, Math.min(s.maxZoom, area.minZoom ?? 10));
    let n = 0;
    for (let z = top; z <= Math.min(s.maxZoom, area.maxZoom ?? s.maxZoom); z++) {
      n += rangeCount(tileRange(area.bbox, z));
    }
    tiles += n;
    bytes += n * s.bytes;
  }
  return { tiles, bytes };
}

const CONCURRENCY = 6;

/**
 * Fetch every tile an area needs.
 *
 * Tiles already held are skipped, so this doubles as the repair pass: run it
 * again on a half-finished area and it picks up exactly what is missing.
 * Failures are counted and returned rather than thrown — one dead tile in a
 * thousand should not abandon the other nine hundred and ninety-nine.
 */
export async function downloadArea(area, { onProgress, signal } = {}) {
  const cache = await openCache();
  const wanted = areaTiles(area);
  const total = wanted.length;
  let done = 0;
  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  let bytes = 0;
  let cursor = 0;

  const step = async () => {
    while (cursor < wanted.length) {
      if (signal?.aborted) return;
      const t = wanted[cursor++];
      const url = urlFor(t.sourceId, t.z, t.x, t.y);
      try {
        if (await cache.match(url)) {
          skipped++;
        } else {
          const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal });
          if (res.ok) {
            const blob = await res.blob();
            bytes += blob.size;
            await cache.put(url, new Response(blob, {
              status: 200,
              headers: { 'Content-Type': blob.type || 'image/png' },
            }));
            fetched++;
          } else {
            failed++;
          }
        }
      } catch (err) {
        if (signal?.aborted) return;
        // Out of quota is the one failure worth stopping for: every
        // subsequent tile will fail the same way, and grinding through
        // another nine hundred of them helps nobody.
        if (err && err.name === 'QuotaExceededError') {
          cursor = wanted.length;
          failed++;
          throw err;
        }
        failed++;
      }
      done++;
      if (onProgress && (done % 5 === 0 || done === total)) {
        onProgress({ done, total, fetched, skipped, failed, bytes });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, step));
  onProgress?.({ done, total, fetched, skipped, failed, bytes });
  return { total, fetched, skipped, failed, bytes, aborted: !!signal?.aborted };
}

/**
 * Count what is actually in the cache for an area.
 *
 * This is the difference between an app that says "downloaded" and one that
 * means it. It is deliberately a real count against real cache entries, not a
 * flag set when a download returned.
 */
export async function verifyArea(area, { onProgress } = {}) {
  const cache = await openCache();
  const wanted = areaTiles(area);
  let present = 0;
  const missing = [];
  for (let i = 0; i < wanted.length; i++) {
    const t = wanted[i];
    if (await cache.match(urlFor(t.sourceId, t.z, t.x, t.y))) present++;
    else missing.push(t);
    if (onProgress && i % 50 === 0) onProgress({ done: i, total: wanted.length });
  }
  onProgress?.({ done: wanted.length, total: wanted.length });
  return {
    total: wanted.length,
    present,
    missing: missing.length,
    complete: missing.length === 0,
    at: Date.now(),
  };
}

/**
 * Drop an area's tiles.
 *
 * Tiles shared with another area are kept — two overlapping field areas are
 * normal, and deleting one should not punch a hole in the other.
 */
export async function deleteArea(area, others = []) {
  const cache = await openCache();
  const keep = new Set();
  for (const o of others) {
    if (o.id === area.id) continue;
    for (const t of areaTiles(o)) keep.add(urlFor(t.sourceId, t.z, t.x, t.y));
  }
  let removed = 0;
  for (const t of areaTiles(area)) {
    const url = urlFor(t.sourceId, t.z, t.x, t.y);
    if (keep.has(url)) continue;
    if (await cache.delete(url)) removed++;
  }
  return { removed };
}

/** What the browser will admit about storage, for the Areas panel. */
export async function storageReport() {
  const out = { usage: null, quota: null, persisted: false, canPersist: false };
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      out.usage = e.usage ?? null;
      out.quota = e.quota ?? null;
    }
    if (navigator.storage?.persisted) {
      out.persisted = await navigator.storage.persisted();
      out.canPersist = typeof navigator.storage.persist === 'function';
    }
  } catch { /* nothing here is worth an error message */ }
  return out;
}

/**
 * Ask the browser not to evict this origin.
 *
 * Safari clears script-created storage for a site with no interaction in seven
 * days of browsing — but a web app opened from the home screen keeps its own
 * counter and is not swept that way. Asking for persistence on top of that is
 * belt and braces, and it is free.
 */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
