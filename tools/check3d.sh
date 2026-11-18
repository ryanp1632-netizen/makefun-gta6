#!/usr/bin/env bash
# Browser checks for the 3D renderer (headless Chrome on SwiftShader, no GPU needed):
#   ?shot=check3d  renders the cover moment and prints draw calls, triangles, chunks and lights;
#   ?shot=flow     plays the real app (title, new game, walk, steal, drive and drift, a police
#                  chase, V to the classic camera and back, a street race started at its gate and
#                  won, every pause tab including STATS, the map on M, on foot in both cameras)
#                  and prints what it saw, plus the 3D renderer's JavaScript time per frame;
#   ?shot=race / ?shot=stats  render the street race and the pause screen's STATS tab.
# Fails when a page throws, the 3D renderer reports a failure or the flow reports a problem.
# Chrome runs with its background networking and component updates off: nothing leaves the machine.
# Images go to $TMPDIR/halcyon-check.
# Usage: tools/check3d.sh        (the flow check is slow on a software renderer: several minutes)
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
PORT=8096
TMP="${TMPDIR:-${TEMP:-/tmp}}/halcyon-check"
mkdir -p "$TMP"
node serve.ts --port "$PORT" > "$TMP/serve.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1
status=0
for scene in check3d flow race stats; do
  png="$TMP/$scene.png"
  rm -f "$png"
  "$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
    --disable-background-networking --disable-component-update --no-first-run --no-default-browser-check \
    --hide-scrollbars --force-device-scale-factor=1 --window-size=1280,800 --enable-logging=stderr --v=0 \
    --virtual-time-budget=600000 --user-data-dir="$TMP/profile-$scene" --screenshot="$png" \
    "http://localhost:$PORT/index.html?shot=$scene&seed=1" > "$TMP/$scene.log" 2>&1 || true
  if [ ! -s "$png" ]; then echo "FAIL $scene: no image"; status=1; continue; fi
  if grep -q "Uncaught\|3D RENDERER FAILED\|failed, switching\|flow FAILED" "$TMP/$scene.log"; then
    echo "FAIL $scene:"; grep "Uncaught\|FAILED\|failed" "$TMP/$scene.log" | head -5; status=1
  elif [ "$scene" = flow ] && ! grep -q "flow ok" "$TMP/$scene.log"; then
    echo "FAIL flow: it never reported \"flow ok\" (see $TMP/flow.log)"; status=1
  else
    echo "ok   $scene  ($png)"
  fi
done
exit $status
