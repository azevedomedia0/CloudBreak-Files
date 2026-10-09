#!/usr/bin/env bash
# Download static ffmpeg sidecars for Tauri externalBin (not committed — see .gitignore).
# Used by `npm run build:mac` and CI so release DMGs ship video tools without requiring Homebrew.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/src-tauri/binaries"
mkdir -p "$BIN"

# eugeneware/ffmpeg-static — gzipped single-file macOS builds.
# Override with FFMPEG_ARM_URL / FFMPEG_X64_URL if you pin a different release.
ARM_URL="${FFMPEG_ARM_URL:-https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-arm64.gz}"
X64_URL="${FFMPEG_X64_URL:-https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-x64.gz}"

fetch_gz() {
  local url="$1"
  local dest="$2"
  local tmp
  tmp="$(mktemp)"
  echo "Downloading ffmpeg → $(basename "$dest")"
  if ! curl -fsSL --connect-timeout 30 -L "$url" -o "$tmp"; then
    echo "warn: download failed ($url)" >&2
    rm -f "$tmp"
    return 1
  fi
  # Some mirrors serve plain binaries; others gzip.
  if gzip -t "$tmp" 2>/dev/null; then
    gzip -dc "$tmp" > "$dest"
  else
    cp "$tmp" "$dest"
  fi
  rm -f "$tmp"
  chmod +x "$dest"

  if command -v file >/dev/null 2>&1; then
    local info
    info="$(file -b "$dest")"
    case "$(basename "$dest")" in
      *aarch64*)
        if ! echo "$info" | grep -qi 'arm64\|aarch64'; then
          echo "warn: expected arm64 binary, got: $info" >&2
          rm -f "$dest"
          return 1
        fi
        ;;
      *x86_64*)
        if ! echo "$info" | grep -qi 'x86_64\|x86-64'; then
          echo "warn: expected x86_64 binary, got: $info" >&2
          rm -f "$dest"
          return 1
        fi
        ;;
    esac
  fi
  echo "ok: $dest ($(du -h "$dest" | awk '{print $1}'))"
}

copy_homebrew() {
  local dest="$1"
  local brew_ffmpeg=""
  for candidate in /opt/homebrew/bin/ffmpeg /usr/local/bin/ffmpeg; do
    if [[ -x "$candidate" ]]; then
      brew_ffmpeg="$candidate"
      break
    fi
  done
  [[ -n "$brew_ffmpeg" ]] || return 1
  cp "$brew_ffmpeg" "$dest"
  chmod +x "$dest"
  echo "ok (homebrew): $dest"
}

ensure() {
  local dest="$1"
  local url="$2"
  if [[ -x "$dest" ]]; then
    echo "exists: $dest"
    return 0
  fi
  if fetch_gz "$url" "$dest"; then
    return 0
  fi
  local host
  host="$(uname -m)"
  if [[ "$(basename "$dest")" == *aarch64* && "$host" == "arm64" ]] || \
     [[ "$(basename "$dest")" == *x86_64* && "$host" == "x86_64" ]]; then
    copy_homebrew "$dest" || return 1
    return 0
  fi
  return 1
}

ARCH_FILTER="${1:-all}"
ok=0

if [[ "$ARCH_FILTER" == "all" || "$ARCH_FILTER" == "arm64" || "$ARCH_FILTER" == "aarch64" ]]; then
  if ensure "$BIN/ffmpeg-aarch64-apple-darwin" "$ARM_URL"; then
    ok=1
  fi
fi

if [[ "$ARCH_FILTER" == "all" || "$ARCH_FILTER" == "x64" || "$ARCH_FILTER" == "x86_64" ]]; then
  if ensure "$BIN/ffmpeg-x86_64-apple-darwin" "$X64_URL"; then
    ok=1
  fi
fi

HOST_TRIPLE="$(rustc -vV 2>/dev/null | awk '/^host:/{print $2}' || true)"
if [[ -n "$HOST_TRIPLE" && -x "$BIN/ffmpeg-$HOST_TRIPLE" && ! -e "$BIN/ffmpeg" ]]; then
  ln -sf "ffmpeg-$HOST_TRIPLE" "$BIN/ffmpeg"
fi

# Universal macOS builds need ffmpeg-universal-apple-darwin next to the arch-specific copies.
ARM_BIN="$BIN/ffmpeg-aarch64-apple-darwin"
X64_BIN="$BIN/ffmpeg-x86_64-apple-darwin"
UNI_BIN="$BIN/ffmpeg-universal-apple-darwin"
if [[ -x "$ARM_BIN" && -x "$X64_BIN" ]]; then
  if [[ ! -x "$UNI_BIN" ]] || [[ "$ARM_BIN" -nt "$UNI_BIN" ]] || [[ "$X64_BIN" -nt "$UNI_BIN" ]]; then
    echo "Creating universal ffmpeg sidecar…"
    lipo -create "$ARM_BIN" "$X64_BIN" -output "$UNI_BIN"
    chmod +x "$UNI_BIN"
  fi
  echo "ok: $UNI_BIN ($(du -h "$UNI_BIN" | awk '{print $1}'))"
elif [[ -x "$ARM_BIN" ]]; then
  ln -sf "ffmpeg-aarch64-apple-darwin" "$UNI_BIN"
elif [[ -x "$X64_BIN" ]]; then
  ln -sf "ffmpeg-x86_64-apple-darwin" "$UNI_BIN"
fi

if [[ "$ok" -eq 0 ]]; then
  echo "error: could not obtain any ffmpeg sidecar." >&2
  exit 1
fi

echo "Done. Release builds embed these via Tauri externalBin."
