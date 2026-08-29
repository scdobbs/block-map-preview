#!/bin/sh
# The two rules that keep a phone from quietly running last week's app.
#
#   1. sw.js's CACHE and js/version.js's APP_VERSION name the same version.
#      They are separate constants because a classic service worker cannot
#      import a module, and the Setup tab shows APP_VERSION while the browser
#      decides what to download from CACHE. If they disagree, the version line
#      lies.
#
#   2. If any precached file changed, CACHE was bumped. A browser decides
#      whether an update exists by byte-comparing sw.js alone: change infer.js
#      without touching sw.js and every device that already has the app keeps
#      serving the old one out of its cache, forever, with no banner. This is
#      not hypothetical — it is what a9c63f0 did.
#
# Run bare to check the working tree, or with --staged from a pre-commit hook.
# Exits non-zero with a message naming the fix.

set -e
cd "$(dirname "$0")/.."

if [ "$1" = "--staged" ]; then
  show() { git show ":$1" 2>/dev/null || true; }   # the version being committed
  changed() { git diff --cached --name-only; }
else
  show() { cat "$1" 2>/dev/null || true; }
  changed() { git diff --name-only HEAD; }
fi

cache=$(show sw.js | sed -n "s/^const CACHE = 'blockdiagram-\(v[0-9]*\)';/\1/p")
app=$(show js/version.js | sed -n "s/^export const APP_VERSION = '\(v[0-9]*\)';/\1/p")

if [ -z "$cache" ] || [ -z "$app" ]; then
  echo "check-version: could not read CACHE from sw.js or APP_VERSION from js/version.js" >&2
  exit 1
fi

if [ "$cache" != "$app" ]; then
  echo "check-version: sw.js CACHE is $cache but js/version.js APP_VERSION is $app." >&2
  echo "  The Setup tab would report a version the browser is not serving. Set both to the same." >&2
  exit 1
fi

# Every path in the ASSETS array, as written, minus the './' prefix.
assets=$(show sw.js | sed -n "s/^  '\.\/\(.*\)',$/\1/p")

# A changed precached file with no bump is the silent-stale-app bug.
old=$(git show HEAD:sw.js 2>/dev/null | sed -n "s/^const CACHE = 'blockdiagram-\(v[0-9]*\)';/\1/p")
if [ -n "$old" ] && [ "$old" = "$cache" ]; then
  stale=""
  for f in $(changed); do
    case "$f" in sw.js) continue;; esac
    for a in $assets; do
      [ "$f" = "$a" ] && stale="$stale $f"
    done
  done
  if [ -n "$stale" ]; then
    echo "check-version: these precached files changed but CACHE is still $cache:" >&2
    for f in $stale; do echo "    $f" >&2; done
    echo "  Every device that already has the app would keep serving the old copy," >&2
    echo "  with no update banner. Bump CACHE in sw.js and APP_VERSION in js/version.js." >&2
    exit 1
  fi
fi

# A precached file that does not exist is cached individually and silently
# skipped at install time, so it never fails loudly in the browser either.
missing=""
for a in $assets; do
  case "$a" in "") continue;; esac
  [ -e "$a" ] || missing="$missing $a"
done
if [ -n "$missing" ]; then
  echo "check-version: sw.js precaches files that do not exist:" >&2
  for f in $missing; do echo "    $f" >&2; done
  exit 1
fi

echo "check-version: $cache, $(echo "$assets" | grep -c .) assets, consistent."
