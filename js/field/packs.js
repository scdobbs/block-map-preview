// Course packs: a field area the app ships with, so nobody has to find signal.
//
// The problem here is logistics, not code. Downloading an area the ordinary way
// means a couple of thousand requests to a USGS server, from a phone, over
// whatever connection is available — and the connection available near a good
// field area is usually none. The standard answer is to drive everybody
// somewhere with service and have twenty students download at once, which is
// slow when it works and a lost morning when it does not.
//
// A pack is those same tiles, fetched once by whoever built the course, stored
// in the app's own repository, and served from the app's own origin. Installing
// one is a handful of requests to a CDN instead of two thousand to USGS; it can
// be done anywhere with any connection, a week early, in a dorm; and every
// student ends up with byte-identical tiles rather than twenty different
// half-successful downloads.
//
// Two decisions are worth defending:
//
//   Tiles land under the canonical source URLs the live map already asks for.
//   Once a pack is installed nothing downstream can tell it from an area
//   downloaded by hand — the same verify counts it, the same Repair fixes it,
//   the same reader draws it. Inventing a second lookup path for packed tiles
//   would have meant a second set of bugs in the one part of the app that has
//   to work on a ridge.
//
//   Tiles are concatenated into a few large chunks rather than left as files.
//   Two thousand small requests is slow even on good wifi and hostile to a
//   flaky one; four eight-megabyte requests is neither. The chunk is also the
//   resume unit: a pack whose install was interrupted picks up at the first
//   chunk that is not already fully in the cache.

import { CACHE_NAME, absentTombstone } from './tiles.js';

const INDEX_URL = './packs/index.json';

/**
 * What packs this build ships with.
 *
 * The index is precached with the app shell, so the list renders with no
 * connection — which matters, because "why is there no map" and "there is a
 * pack you never installed" is a conversation worth having offline.
 */
export async function listPacks() {
  try {
    const res = await fetch(INDEX_URL, { cache: 'no-cache' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.packs) ? data.packs : [];
  } catch {
    return [];
  }
}

async function readManifest(pack) {
  const res = await fetch(`${pack.path}pack.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`pack manifest ${res.status}`);
  return res.json();
}

/**
 * How much of a pack is already in the cache.
 *
 * Counted against real entries rather than a flag, for the same reason
 * everything else here is: a pack installed three weeks ago may have been
 * evicted since, and a student who sees "installed" on a pack that is half
 * gone is worse off than one who sees nothing.
 */
export async function packState(pack) {
  try {
    const manifest = await readManifest(pack);
    const cache = await caches.open(CACHE_NAME);
    const held = new Set();
    for (const req of await cache.keys()) held.add(req.url);
    let have = 0;
    for (const [url] of manifest.index) if (held.has(url)) have++;
    return {
      total: manifest.index.length,
      have,
      installed: have === manifest.index.length,
      partial: have > 0 && have < manifest.index.length,
      manifest,
    };
  } catch {
    return { total: pack.tiles || 0, have: 0, installed: false, partial: false, manifest: null };
  }
}

/**
 * Put a pack's tiles into the tile cache.
 *
 * Reports progress in bytes, because that is what the student is waiting on and
 * what their patience is calibrated to. Chunks already accounted for are
 * skipped without being fetched, so re-running after an interruption — or after
 * an eviction that took half the area — costs only what is actually missing.
 */
export async function installPack(pack, { onProgress, signal } = {}) {
  const manifest = await readManifest(pack);
  const cache = await caches.open(CACHE_NAME);

  const held = new Set();
  for (const req of await cache.keys()) held.add(req.url);

  // Group the index by chunk so each chunk is fetched at most once, and only
  // if something in it is actually wanted.
  const byChunk = new Map();
  for (const entry of manifest.index) {
    const c = entry[1];
    if (!byChunk.has(c)) byChunk.set(c, []);
    byChunk.get(c).push(entry);
  }

  const wanted = [];
  for (const [c, entries] of byChunk) {
    if (entries.every((e) => held.has(e[0]))) continue;
    wanted.push(c);
  }
  wanted.sort((a, b) => a - b);

  const totalBytes = wanted.reduce((n, c) => n + (manifest.chunks[c]?.bytes || 0), 0);
  let doneBytes = 0;
  let written = 0;
  let skipped = manifest.index.length - wanted.reduce((n, c) => n + byChunk.get(c).length, 0);
  let failed = 0;

  const report = () => onProgress?.({
    done: written + skipped, total: manifest.index.length,
    bytes: doneBytes, totalBytes, failed,
  });
  report();

  for (const c of wanted) {
    if (signal?.aborted) break;
    const chunk = manifest.chunks[c];
    let buf;
    try {
      const res = await fetch(`${pack.path}${chunk.file}`, { signal, cache: 'no-cache' });
      if (!res.ok) throw new Error(`chunk ${chunk.file}: ${res.status}`);
      // Streamed rather than awaited whole, so the bar moves during the one
      // part of this that actually takes time.
      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        const parts = [];
        let n = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
          n += value.length;
          doneBytes += value.length;
          report();
        }
        buf = new Uint8Array(n);
        let at = 0;
        for (const p of parts) { buf.set(p, at); at += p.length; }
      } else {
        buf = new Uint8Array(await res.arrayBuffer());
        doneBytes += buf.length;
        report();
      }
    } catch (err) {
      if (signal?.aborted) break;
      failed += byChunk.get(c).length;
      report();
      continue;
    }

    for (const [url, , off, len, mimeIdx] of byChunk.get(c)) {
      if (signal?.aborted) break;
      if (held.has(url)) { skipped++; continue; }
      try {
        if (!len) {
          // The source has no tile here. Recorded the same way a live download
          // records it, so verification counts it as accounted for and Repair
          // stops asking.
          await cache.put(url, absentTombstone());
        } else {
          const mime = manifest.mimes?.[mimeIdx] || 'image/png';
          const body = buf.subarray(off, off + len);
          await cache.put(url, new Response(body, {
            status: 200, headers: { 'Content-Type': mime },
          }));
        }
        written++;
      } catch (err) {
        // Out of quota is the one failure worth stopping for: every tile after
        // it fails the same way.
        if (err && err.name === 'QuotaExceededError') {
          report();
          throw err;
        }
        failed++;
      }
      if ((written % 25) === 0) report();
    }
    report();
  }

  report();
  return {
    total: manifest.index.length,
    written, skipped, failed,
    aborted: !!signal?.aborted,
    bytes: doneBytes,
    area: manifest.area,
  };
}
