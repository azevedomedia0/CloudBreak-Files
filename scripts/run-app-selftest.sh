#!/bin/bash
# Runs the in-app self-test inside the real desktop app (debug build) and prints its report.
# It uses a throwaway app data folder, so your real vault and folder list are never touched.
# Needs port 3000 free (stop `npm run dev` first) and ffmpeg for the video checks.
set -u
cd "$(dirname "$0")/.."
export CLOUDBREAK_SELFTEST_DIR="${TMPDIR:-/tmp}/cb-selftest"
DATA="$HOME/Library/Application Support/com.cloudbreak.files.selftest"
rm -rf "$CLOUDBREAK_SELFTEST_DIR" "$DATA"
npm run tauri dev -- --config '{"identifier":"com.cloudbreak.files.selftest"}' > "$CLOUDBREAK_SELFTEST_DIR.log" 2>&1 &
DEV=$!
for _ in $(seq 1 150); do
  [ -f "$CLOUDBREAK_SELFTEST_DIR/report.txt" ] && break
  kill -0 "$DEV" 2>/dev/null || break
  sleep 4
done
sleep 2
if [ -f "$CLOUDBREAK_SELFTEST_DIR/report.txt" ]; then
  cat "$CLOUDBREAK_SELFTEST_DIR/report.txt"
  STATUS=$(grep -q "ALL CHECKS PASSED" "$CLOUDBREAK_SELFTEST_DIR/report.txt" && echo 0 || echo 1)
else
  echo "No report was written. See $CLOUDBREAK_SELFTEST_DIR.log"
  STATUS=2
fi
pkill -f "vite --port=3000" 2>/dev/null
kill "$DEV" 2>/dev/null
rm -rf "$CLOUDBREAK_SELFTEST_DIR" "$DATA"
exit $STATUS
