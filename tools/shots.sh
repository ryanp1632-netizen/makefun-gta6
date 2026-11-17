#!/usr/bin/env bash
# Render the screenshot scenes with headless Chrome and convert them to JPEGs under 256 KiB.
# Usage: tools/shots.sh [scene ...]   (default: every scene in the list below)
# Needs: node (to serve game/), Chrome, ffmpeg on PATH. Writes screenshots/<n>-<scene>.jpg.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
PORT=8095
TMP="${TMPDIR:-${TEMP:-/tmp}}/halcyon-shots"
mkdir -p "$TMP" screenshots
SCENES=("1-cover:cover" "2-title:title" "3-onfoot:onfoot" "4-map:map")
if [ "$#" -gt 0 ]; then
  SCENES=()
  for s in "$@"; do SCENES+=("$s"); done
fi
node serve.ts --port "$PORT" > "$TMP/serve.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1
for entry in "${SCENES[@]}"; do
  name="${entry%%:*}"
  scene="${entry##*:}"
  png="$TMP/$name.png"
  rm -f "$png"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1280,800 \
    --virtual-time-budget=60000 --user-data-dir="$TMP/profile-$name" --screenshot="$png" \
    "http://localhost:$PORT/index.html?shot=$scene&seed=1" > "$TMP/$name.chrome.log" 2>&1 || true
  if [ ! -s "$png" ]; then echo "no screenshot for $scene"; continue; fi
  q=3
  while :; do
    ffmpeg -loglevel error -y -i "$png" -q:v "$q" "screenshots/$name.jpg"
    size=$(stat -c %s "screenshots/$name.jpg")
    if [ "$size" -le 262144 ] || [ "$q" -ge 31 ]; then break; fi
    q=$((q + 1))
  done
  echo "$name.jpg  q=$q  $size bytes  (png: $png)"
done
