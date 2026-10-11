#!/usr/bin/env bash
# Signed / notarized macOS release build (Apple Silicon + Intel). See docs/notarized-distribution.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/cloudbreak-cargo-target}"
# Match tauri.conf.json bundle.macOS.minimumSystemVersion so Intel Macs on Big Sur+ can run the binary.
export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-11.0}"

# Local Apple signing + notarization (never committed). See docs/notarized-distribution.md.
APPLE_ENV_DEFAULT="${HOME}/.config/cloudbreak/apple-notarization.env"
if [[ -f "${APPLE_NOTARIZATION_ENV:-$APPLE_ENV_DEFAULT}" ]]; then
  # shellcheck disable=SC1090
  source "${APPLE_NOTARIZATION_ENV:-$APPLE_ENV_DEFAULT}"
  echo "Loaded Apple notarization env from ${APPLE_NOTARIZATION_ENV:-$APPLE_ENV_DEFAULT}"
fi
if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  # Prefer Developer ID Application when present in the login keychain.
  DEV_ID="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Developer ID Application: .*\)"/\1/p' | head -1 || true)"
  if [[ -n "$DEV_ID" ]]; then
    export APPLE_SIGNING_IDENTITY="$DEV_ID"
    echo "Using codesign identity: $APPLE_SIGNING_IDENTITY"
  fi
fi
if [[ -n "${APPLE_SIGNING_IDENTITY:-}" && -n "${APPLE_API_ISSUER:-}" && -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_PATH:-}" && -f "${APPLE_API_KEY_PATH}" ]]; then
  echo "Notarization: enabled (API key + issuer present)"
elif [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "warn: signing without notarization — set APPLE_API_ISSUER / APPLE_API_KEY / APPLE_API_KEY_PATH" >&2
  echo "      (or create ~/.config/cloudbreak/apple-notarization.env)" >&2
else
  echo "warn: APPLE_SIGNING_IDENTITY unset — build will not be Developer ID signed." >&2
fi

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

# Universal builds need both Rust targets (Apple Silicon host still cross-compiles x86_64).
if [[ "$TARGET" == "universal-apple-darwin" ]]; then
  if command -v rustup >/dev/null 2>&1; then
    rustup target add aarch64-apple-darwin x86_64-apple-darwin
  else
    echo "warn: rustup not found — ensure aarch64-apple-darwin and x86_64-apple-darwin are installed." >&2
  fi
fi

# Embed ffmpeg so end-user Macs do not need Homebrew (arm64 + x86_64 → lipo universal).
echo "Fetching ffmpeg sidecars…"
if bash "$ROOT/scripts/fetch-ffmpeg.sh"; then
  BUNDLE_FFMPEG=1
else
  echo "warn: ffmpeg sidecars missing — build continues; video tools will show an install message." >&2
  BUNDLE_FFMPEG=0
fi

if [[ "$TARGET" == "universal-apple-darwin" && "$BUNDLE_FFMPEG" -eq 1 ]]; then
  if [[ ! -x "$ROOT/src-tauri/binaries/ffmpeg-x86_64-apple-darwin" ]]; then
    echo "error: Intel ffmpeg sidecar missing; universal builds need both architectures." >&2
    exit 1
  fi
  if [[ ! -x "$ROOT/src-tauri/binaries/ffmpeg-aarch64-apple-darwin" ]]; then
    echo "error: Apple Silicon ffmpeg sidecar missing; universal builds need both architectures." >&2
    exit 1
  fi
fi

# Embed rclone for the "Quick sign-in (no setup)" Google Drive option.
echo "Fetching rclone sidecars…"
if bash "$ROOT/scripts/fetch-rclone.sh"; then
  BUNDLE_RCLONE=1
else
  echo "warn: rclone sidecars missing — build continues; Quick sign-in will ask users to install rclone." >&2
  BUNDLE_RCLONE=0
fi

if [[ "$TARGET" == "universal-apple-darwin" && "$BUNDLE_RCLONE" -eq 1 ]]; then
  for arch in x86_64 aarch64; do
    if [[ ! -x "$ROOT/src-tauri/binaries/rclone-$arch-apple-darwin" ]]; then
      echo "error: $arch rclone sidecar missing; universal builds need both architectures." >&2
      exit 1
    fi
  done
fi

EXTERNAL_BIN=()
[[ "$BUNDLE_FFMPEG" -eq 1 ]] && EXTERNAL_BIN+=('"binaries/ffmpeg"')
[[ "$BUNDLE_RCLONE" -eq 1 ]] && EXTERNAL_BIN+=('"binaries/rclone"')

EXTRA_CONFIG=()
if [[ "${#EXTERNAL_BIN[@]}" -gt 0 ]]; then
  # Only enable externalBin when the binaries exist so `tauri build` does not fail.
  EXTERNAL_JSON="$(IFS=,; echo "${EXTERNAL_BIN[*]}")"
  EXTRA_CONFIG+=(--config "{\"bundle\":{\"externalBin\":[${EXTERNAL_JSON}]}}")
fi

echo "Building for ${TARGET} (MACOSX_DEPLOYMENT_TARGET=${MACOSX_DEPLOYMENT_TARGET}, CARGO_TARGET_DIR=${CARGO_TARGET_DIR})"
npm run tauri build -- --target "$TARGET" "${EXTRA_CONFIG[@]}"

APP="$(find "${CARGO_TARGET_DIR}" -path '*/release/bundle/macos/Cloudbreak Files.app' -type d 2>/dev/null | head -1)"
if [[ -n "$APP" && -d "$APP" ]]; then
  BIN="$APP/Contents/MacOS/Cloudbreak Files"
  if [[ "$TARGET" == "universal-apple-darwin" && -x "$BIN" ]]; then
    ARCHS="$(lipo -archs "$BIN" 2>/dev/null || true)"
    echo "App binary architectures: ${ARCHS:-unknown}"
    if ! echo "$ARCHS" | grep -q 'x86_64'; then
      echo "error: release binary is missing x86_64 (Intel). Refusing to ship an Apple Silicon–only build." >&2
      exit 1
    fi
    if ! echo "$ARCHS" | grep -q 'arm64'; then
      echo "error: release binary is missing arm64 (Apple Silicon)." >&2
      exit 1
    fi
    if [[ -x "$APP/Contents/MacOS/ffmpeg" ]]; then
      FF_ARCHS="$(lipo -archs "$APP/Contents/MacOS/ffmpeg" 2>/dev/null || true)"
      echo "Bundled ffmpeg architectures: ${FF_ARCHS:-unknown}"
      if ! echo "$FF_ARCHS" | grep -q 'x86_64' || ! echo "$FF_ARCHS" | grep -q 'arm64'; then
        echo "error: bundled ffmpeg must be universal (arm64 + x86_64)." >&2
        exit 1
      fi
    fi
  fi

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
