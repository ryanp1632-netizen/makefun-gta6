#!/usr/bin/env bash
# Render the screenshot scenes with headless Chrome and convert them to JPEGs under 256 KiB.
# Usage: tools/shots.sh [name:scene ...]   (default: the four scenes in the list below)
# Needs: node (to serve game/), Chrome, ffmpeg on PATH. Writes screenshots/<n>-<scene>.jpg.
# WebGL2 runs on SwiftShader (software) so the 3D view renders without a GPU; a scene whose 3D
# renderer fails paints a red error screen, which this script detects and reports.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
PORT=8095
TMP="${TMPDIR:-${TEMP:-/tmp}}/halcyon-shots"
OUT="${SHOTS_OUT:-screenshots}"
mkdir -p "$TMP" "$OUT"
SCENES=("1-cover:cover" "2-onfoot:onfoot" "3-race:race" "4-map:map")
if [ "$#" -gt 0 ]; then
  SCENES=()
  for s in "$@"; do SCENES+=("$s"); done
fi
node serve.ts --port "$PORT" > "$TMP/serve.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1
status=0
for entry in "${SCENES[@]}"; do
  name="${entry%%:*}"
  scene="${entry##*:}"
  png="$TMP/$name.png"
  rm -f "$png"
  "$CHROME" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
    --disable-background-networking --disable-component-update --no-first-run --no-default-browser-check \
    --hide-scrollbars --force-device-scale-factor=1 --window-size=1280,800 --enable-logging=stderr --v=0 \
    --virtual-time-budget=90000 --user-data-dir="$TMP/profile-$name" --screenshot="$png" \
    "http://localhost:$PORT/index.html?shot=$scene&seed=1${SHOT_QUERY:-}" > "$TMP/$name.chrome.log" 2>&1 || true
  if [ ! -s "$png" ]; then echo "no screenshot for $scene"; status=1; continue; fi
  if grep -q "Uncaught\|3D RENDERER FAILED" "$TMP/$name.chrome.log"; then
    echo "ERROR in $scene:"; grep "Uncaught\|CONSOLE" "$TMP/$name.chrome.log" | head -5; status=1
  fi
  q=3
  while :; do
    ffmpeg -loglevel error -y -i "$png" -q:v "$q" "$OUT/$name.jpg"
    size=$(stat -c %s "$OUT/$name.jpg")
    if [ "$size" -le 262144 ] || [ "$q" -ge 31 ]; then break; fi
    q=$((q + 1))
  done
  echo "$name.jpg  q=$q  $size bytes  (png: $png)"
done
exit $status
