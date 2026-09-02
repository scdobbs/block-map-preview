#!/bin/sh
# The headless checks. See tools/smoke.mjs for what they cover and why.
# There is no Node here; macOS ships JavaScriptCore, which speaks modules.
set -e
cd "$(dirname "$0")/.."
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc
[ -x "$JSC" ] || { echo "smoke: no jsc at $JSC" >&2; exit 1; }
out=$("$JSC" -m tools/smoke.mjs 2>&1)
echo "$out"
echo "$out" | grep -q '^all passed$' || exit 1
