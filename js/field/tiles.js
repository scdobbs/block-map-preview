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
  aerial: {
    id: 'aerial',
    label: 'Aerial',
    kind: 'base',
    detail: 'Plain aerial photography. Wider coverage than the combined layer.',
    maxZoom: 16,
    minZoom: 4,
    bytes: 34000,
    attribution: 'USGS The National Map: Orthoimagery',
    url: (z, x, y) =>
      `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`,
  },
  imagery: {
    id: 'imagery',
    label: 'Aerial + topo',
    kind: 'base',
    // Prettier than plain aerial and gappier: USGS has not cached this
    // combined layer everywhere it has cached the two it is made of. The
    // White-Inyo Mountains have a column of it missing outright.
    detail: 'Aerial photography with contours and names over it. Patchier coverage than plain Aerial.',
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

export const BASE_SOURCES = ['topo', 'aerial', 'imagery'];

export function source(id) { return SOURCES[id] || SOURCES.topo; }

/** Clamp a wanted zoom to what a source actually serves. */
export function clampZoom(sourceId, z) {
  const s = source(sourceId);
  return Math.max(s.minZoom, Math.min(s.maxZoom, Math.floor(z)));
}

// ---------------------------------------------------------------------------
// The cache
// ---------------------------------------------------------------------------

// A tile the server says does not exist is not a tile we failed to fetch.
// USGS caches these services region by region and there are real holes —
// whole columns of the combined imagery layer are simply absent in parts of
// California. Without somewhere to record that, an area containing one can
// never be marked complete, and Repair retries it forever.
//
// So an absent tile gets a tombstone in the cache: a real entry, marked, with
// no body. Verification counts it as accounted for, the map draws the parent
// tile over the hole, and Repair stops asking.
const ABSENT = 'x-tile-absent';

export function absentTombstone() {
  return new Response(new Blob([]), {
    status: 200,
    headers: { [ABSENT]: '1', 'Content-Type': 'application/octet-stream' },
  });
}

export function isAbsent(res) {
  return !!res && res.headers.get(ABSENT) === '1';
}

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
  if (hit) return { response: hit, from: isAbsent(hit) ? 'absent' : 'cache' };
  if (!allowNetwork) return { response: null, from: 'missing' };
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (res.status === 404) {
      await cache.put(url, absentTombstone());
      return { response: null, from: 'absent' };
    }
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
    // Either a tombstone, or a tile cached from a broken response. Neither
    // can be drawn; the caller falls back to the parent tile.
    if (!blob.size) return { bitmap: null, from: from === 'absent' ? 'absent' : 'missing' };
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
  let absent = 0;
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
          if (res.status === 404) {
            // The source has no tile here and never will. Record that, so the
            // area can still be complete and Repair stops asking.
            await cache.put(url, absentTombstone());
            absent++;
          } else if (res.ok) {
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
        onProgress({ done, total, fetched, skipped, failed, absent, bytes });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, step));
  onProgress?.({ done, total, fetched, skipped, failed, absent, bytes });
  return { total, fetched, skipped, failed, absent, bytes, aborted: !!signal?.aborted };
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
  let absent = 0;
  const missing = [];
  for (let i = 0; i < wanted.length; i++) {
    const t = wanted[i];
    const hit = await cache.match(urlFor(t.sourceId, t.z, t.x, t.y));
    if (!hit) missing.push(t);
    else if (isAbsent(hit)) absent++;
    else present++;
    if (onProgress && i % 50 === 0) onProgress({ done: i, total: wanted.length });
  }
  onProgress?.({ done: wanted.length, total: wanted.length });
  return {
    total: wanted.length,
    present,
    // Tiles the source does not have. Downloading again cannot produce them,
    // so an area is complete once nothing is merely missing.
    absent,
    missing: missing.length,
    complete: missing.length === 0,
    at: Date.now(),
  };
}

/**
 * Every tile URL the cache is holding, as a Set.
 *
 * verifyArea asks the cache about one tile at a time, which is right when the
 * question is about one area and wrong when it is asked about all of them at
 * launch: a thousand awaited round-trips take long enough that the answer
 * arrives after the student has stopped looking. One pass over the keys
 * answers the same question for every area at once.
 *
 * Presence is all this can report — a tombstone and a real tile are both keys.
 * That is exactly the readiness question, though: an absent tile is accounted
 * for, and what matters before walking away from signal is whether anything is
 * still merely missing.
 */
export async function cachedTileUrls() {
  const cache = await openCache();
  const out = new Set();
  for (const req of await cache.keys()) out.add(req.url);
  return out;
}

/**
 * Check many areas against one pass over the cache.
 *
 * Returns a Map of area id to the same shape verifyArea gives, minus the
 * absent/present split it cannot see. Used by the field-ready check, where the
 * question is "is anything missing" across everything downloaded.
 */
export async function verifyAreasFast(areas) {
  const held = await cachedTileUrls();
  const out = new Map();
  for (const area of areas) {
    const wanted = areaTiles(area);
    let missing = 0;
    for (const t of wanted) {
      if (!held.has(urlFor(t.sourceId, t.z, t.x, t.y))) missing++;
    }
    out.set(area.id, {
      total: wanted.length,
      missing,
      complete: missing === 0,
      at: Date.now(),
    });
  }
  return out;
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
