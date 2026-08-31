// What build of the app is actually running.
//
// Not read from the service worker's cache, deliberately. The worker calls
// skipWaiting, so between installing an update and reloading the page the
// cache holds the new version while the page is still executing the old
// modules — and a version line that reported the cache would say v48 to
// somebody running v47, which is the exact confusion it exists to end. A
// constant compiled into the module graph is the version of the code asking
// the question.
//
// Must match CACHE in sw.js. The two are separate because a classic service
// worker cannot import a module, and they are checked against each other by
// tools/check-version.sh rather than by hoping.
export const APP_VERSION = 'v55';
