#!/usr/bin/env bash
# Signed / notarized macOS release build. See docs/notarized-distribution.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/cloudbreak-cargo-target}"

# Updater signing (creates .app.tar.gz + .sig). Private key must never be committed.
UPDATER_KEY_DEFAULT="${HOME}/.tauri/cloudbreak-files.key"
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -f "$UPDATER_KEY_DEFAULT" ]]; then
  export TAURI_SIGNING_PRIVATE_KEY="$UPDATER_KEY_DEFAULT"
  echo "Using updater private key at $UPDATER_KEY_DEFAULT"
elif [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  echo "warn: TAURI_SIGNING_PRIVATE_KEY unset — updater artifacts (.sig / .tar.gz) will not be signed." >&2
  echo "      Run: bash scripts/generate-updater-keys.sh" >&2
fi

# Stale Xcode icon helpers often break actool when CloudBreak-icon.icon is bundled.
pkill -x ibtoold 2>/dev/null || true
pkill -x actool 2>/dev/null || true

TARGET="${1:-universal-apple-darwin}"

# Embed ffmpeg so end-user Macs do not need Homebrew.
echo "Fetching ffmpeg sidecars…"
if bash "$ROOT/scripts/fetch-ffmpeg.sh"; then
  BUNDLE_FFMPEG=1
else
  echo "warn: ffmpeg sidecars missing — build continues; video tools will show an install message." >&2
  BUNDLE_FFMPEG=0
fi

EXTRA_CONFIG=()
if [[ "$BUNDLE_FFMPEG" -eq 1 ]]; then
  # Only enable externalBin when the binaries exist so `tauri build` does not fail.
  EXTRA_CONFIG+=(--config '{"bundle":{"externalBin":["binaries/ffmpeg"]}}')
fi

echo "Building for ${TARGET} (CARGO_TARGET_DIR=${CARGO_TARGET_DIR})"
npm run tauri build -- --target "$TARGET" "${EXTRA_CONFIG[@]}"

APP="$(find "${CARGO_TARGET_DIR}" -path '*/release/bundle/macos/Cloudbreak Files.app' -type d 2>/dev/null | head -1)"
if [[ -n "$APP" && -d "$APP" ]]; then
  echo ""
  echo "Verify before shipping:"
  echo "  codesign --verify --deep --strict --verbose=2 \"${APP}\""
  echo "  spctl -a -vv \"${APP}\""
  if [[ -x "$APP/Contents/MacOS/ffmpeg" ]]; then
    echo "  bundled ffmpeg: $APP/Contents/MacOS/ffmpeg"
  else
    echo "  note: ffmpeg was not bundled in this build"
  fi
fi
