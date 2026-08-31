// Offline shell. Everything the app needs is precached on install, so once
// the app has been opened with a connection it will keep opening without one
// — which is the whole point of using it in the field.
//
// Bump CACHE when any precached file changes, and APP_VERSION in js/version.js
// with it — tools/check-version.sh checks the two agree.
//
// KEEP is the other half of that rule and matters more. The sweep below
// deletes every cache that is not the current one, which is right for the app
// shell and would be a disaster for downloaded map tiles: bumping the version
// to fix a typo would silently throw away every student's field area, and they
// would not find out until they were standing in it with no signal. So the
// tile cache is named without a version and listed here as untouchable.

const CACHE = 'blockdiagram-v52';

// Must match CACHE_NAME in js/field/tiles.js.
const TILE_CACHE = 'field-tiles';
const KEEP = new Set([TILE_CACHE]);

const ASSETS = [
  './',
  './index.html',
  './app.webmanifest',
  './css/app.css',
  './vendor/three.module.js',
  './js/main.js',
  './js/version.js',
  './js/store.js',
  './js/geo/math.js',
  './js/geo/model.js',
  './js/geo/surfaces.js',
  './js/geo/unmake.js',
  './js/geo/stereonet.js',
  './js/geo/glsl.js',
  './js/geo/marching.js',
  './js/geo/infer.js',
  './js/render/block.js',
  './js/render/controls.js',
  './js/render/material.js',
  './js/render/scene.js',
  './js/render/contours.js',
  './js/render/markers.js',
  './js/ui/app.js',
  './js/ui/panels.js',
  './js/ui/widgets.js',
  './js/ui/swatch.js',
  './js/ui/icons.js',
  './js/ui/surfaceEditor.js',
  './js/ui/stereonet.js',
  './js/ui/groundMap.js',
  './js/field/geo.js',
  './js/field/model.js',
  './js/field/store.js',
  './js/field/tiles.js',
  './js/field/ready.js',
  './js/field/packs.js',
  './js/field/dem.js',
  './js/field/sensors.js',
  './js/field/declination.js',
  './js/field/ground.js',
  './js/field/cutblock.js',
  './js/field/patches.js',
  './js/field/fingerprint.js',
  './js/ui/map/section.js',
  './js/ui/map/canvas.js',
  './js/ui/map/panels.js',
  './js/ui/map/measureView.js',
  './js/ui/map/symbols.js',
  './js/ui/map/blockPanel.js',
  './js/ui/map/shading.js',
  './js/strat/model.js',
  './js/ui/strat/section.js',
  './js/ui/strat/column.js',
  './js/ui/strat/panels.js',
  './js/ui/strat/symbols.js',
  './packs/index.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll is all-or-nothing; add individually so one missing optional file
    // cannot leave the app with no offline cache at all.
    await Promise.all(ASSETS.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k !== CACHE && !KEEP.has(k))
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations fall back to the cached shell so a cold start with no signal
  // still lands on the app rather than the browser's offline page.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Course-pack payloads are the one same-origin thing that must NOT be
  // cached here. They are tens of megabytes, they are being fetched precisely
  // in order to be unpacked into the tile cache, and storing them again under
  // the shell would double the cost of a pack and then throw the copy away on
  // the next version bump. The pack index is small, changes only when a pack
  // is added, and has to be readable with no signal — so it stays precached.
  if (url.pathname.includes('/packs/') && !url.pathname.endsWith('/index.json')) {
    e.respondWith(fetch(req));
    return;
  }

  // Cache first: these files only change when the app is updated, and being
  // fast beats being current.
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch {
      return Response.error();
    }
  })());
});
