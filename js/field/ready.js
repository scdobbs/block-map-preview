// Can this phone walk away from signal right now?
//
// Every other part of the offline story answers a narrower question — is this
// area downloaded, is the shell cached, is storage protected. Each of them can
// be fine while the answer to the real question is no, and the real question is
// only ever asked in one place: a parking lot at the trailhead, by somebody who
// is about to lose service for eight hours.
//
// So this asks it directly, and it asks the cache rather than the record of
// what the cache was told to hold. The failure this exists to prevent is not
// "the download failed" — that one announces itself. It is the student who
// downloaded an area last week, whose browser quietly evicted it, and who finds
// out standing in the field. A flag set when a download returned cannot catch
// that. A count against real cache entries can.

import { verifyAreasFast, storageReport } from './tiles.js';
import { formatDeclination as formatDecl } from './declination.js';
import { APP_VERSION } from '../version.js';

/**
 * Is the app running from the home screen rather than a browser tab?
 *
 * This matters more than it looks. Safari clears script-created storage for a
 * site with no interaction in seven days of browsing, which over a three-week
 * course is long enough to lose a field area between the download and the day
 * it is needed. A web app opened from the home screen keeps its own counter and
 * is not swept that way, so installing is the single cheapest thing a student
 * can do to protect their map — and it is the one nobody does unless told.
 */
export function isInstalled() {
  try {
    if (window.navigator.standalone === true) return true;       // iOS
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches;
  } catch {
    return false;
  }
}

/** Is the app shell actually being served from the cache, not just cached? */
async function shellState() {
  if (!('serviceWorker' in navigator) || typeof caches === 'undefined') {
    return { ok: false, reason: 'This browser cannot store the app for offline use.' };
  }
  // A registration that exists but is not controlling this page means the
  // worker installed after the page loaded: the files are cached, but this
  // load came from the network and a reload is what proves it.
  const controlling = !!navigator.serviceWorker.controller;
  let cached = false;
  try { cached = await caches.has(`blockdiagram-${APP_VERSION}`); } catch { /* below */ }
  if (cached && controlling) return { ok: true };
  if (cached && !controlling) {
    return { ok: false, soft: true, reason: 'The app is stored but this tab is not using the stored copy yet. Reload once.' };
  }
  return { ok: false, reason: 'The app itself is not stored for offline use yet. Stay on a connection for a moment.' };
}

/**
 * The whole picture, as a list of checks plus one verdict.
 *
 * Checks are graded rather than boolean because the two failures are not the
 * same kind of thing. A missing map area means turn around. Storage that is not
 * protected means it will probably be fine and might not — which is worth
 * saying and not worth stopping for.
 */
export async function fieldReady(doc) {
  const checks = [];
  const areas = doc?.areas || [];

  // --- the map -------------------------------------------------------------
  if (!areas.length) {
    checks.push({
      id: 'areas', label: 'Offline map', state: 'bad', value: 'none',
      detail: 'No area has been downloaded. Off a connection there is no basemap at all — no contours, no imagery, no elevation, and so no hillshade and no station heights.',
    });
  } else {
    const results = await verifyAreasFast(areas);
    const broken = areas.filter((a) => !results.get(a.id)?.complete);
    const missing = broken.reduce((n, a) => n + (results.get(a.id)?.missing || 0), 0);
    if (!broken.length) {
      checks.push({
        id: 'areas', label: 'Offline map', state: 'good',
        value: areas.length === 1 ? '1 area' : `${areas.length} areas`,
        detail: 'Every tile these areas need is in the cache, counted just now.',
      });
    } else {
      checks.push({
        id: 'areas', label: 'Offline map', state: 'bad',
        value: `${missing} tiles missing`,
        detail: `${broken.map((a) => a.name || 'an area').join(', ')} — incomplete. Use Repair while there is still a connection.`,
        areaIds: broken.map((a) => a.id),
      });
    }
  }

  // --- the app itself ------------------------------------------------------
  const shell = await shellState();
  checks.push({
    id: 'shell', label: 'App stored', state: shell.ok ? 'good' : (shell.soft ? 'warn' : 'bad'),
    value: shell.ok ? APP_VERSION : 'not ready',
    detail: shell.ok
      ? `Build ${APP_VERSION} is stored and this tab is running it. It will open with no signal.`
      : shell.reason,
  });

  // --- storage -------------------------------------------------------------
  const installed = isInstalled();
  checks.push({
    id: 'installed', label: 'On the home screen', state: installed ? 'good' : 'warn',
    value: installed ? 'yes' : 'no',
    detail: installed
      ? 'Opened as an installed app, so its storage is not swept for being unused.'
      : 'Running in a browser tab. A tab’s storage can be cleared after about a week of not being opened — long enough to lose the map between downloading it and needing it. Add to Home Screen and open it from there.',
  });

  const storage = await storageReport();
  checks.push({
    id: 'persisted', label: 'Storage protected', state: storage.persisted ? 'good' : 'warn',
    value: storage.persisted ? 'yes' : 'no',
    detail: storage.persisted
      ? 'The browser has been asked not to clear this app’s data, and agreed.'
      : 'The browser has not promised to keep this data under storage pressure. Installing to the home screen is the stronger protection; this is the belt to its braces.',
  });

  // --- declination ---------------------------------------------------------
  // The one row the check can put right on its own, and it has to: the control
  // that would otherwise set it is on Map -> Setup, which a student on day one
  // cannot open. The check asks NOAA for the value at the field area's centre
  // before reporting, so by the time this row is drawn it is usually already
  // done. See _ensureDeclination in js/ui/map/section.js.
  const s = doc?.settings || {};
  const set = !!s.declinationSet;
  const info = s.declinationInfo || null;
  let declDetail;
  if (set && s.declinationSource === 'noaa') {
    declDetail = info?.area
      ? `Looked up for ${info.area} and applied. Every compass reading is corrected by this — you do not need to set it yourself.`
      : 'Looked up for your field area and applied. Every compass reading is corrected by this.';
  } else if (set) {
    declDetail = 'Every compass reading will be corrected by this.';
  } else if (!areas.length) {
    declDetail = 'Set automatically once a map area is installed. Install one above and check again.';
  } else if (navigator.onLine === false) {
    declDetail = 'Needs a connection once, to look up the value for your field area. Get back on wifi and check again.';
  } else {
    declDetail = 'Could not reach the lookup service. Check again on a better connection — until then readings would be recorded as magnetic.';
  }
  checks.push({
    id: 'declination', label: 'Declination set', state: set ? 'good' : 'warn',
    value: set ? formatDecl(s.declination) : 'not set',
    detail: declDetail,
  });

  const worst = checks.some((c) => c.state === 'bad') ? 'bad'
    : checks.some((c) => c.state === 'warn') ? 'warn' : 'good';

  return {
    checks,
    state: worst,
    ready: worst !== 'bad',
    at: Date.now(),
    storage,
  };
}

/** One line for the top of a panel or a banner. */
export function readySummary(report) {
  if (!report) return 'Not checked yet.';
  if (report.state === 'good') return 'Ready for the field. Everything is stored and counted.';
  const bad = report.checks.filter((c) => c.state === 'bad');
  if (bad.length) return `Not ready — ${bad.map((c) => c.label.toLowerCase()).join(', ')}.`;
  const warn = report.checks.filter((c) => c.state === 'warn');
  return `Usable, with ${warn.length} thing${warn.length === 1 ? '' : 's'} worth fixing first.`;
}
