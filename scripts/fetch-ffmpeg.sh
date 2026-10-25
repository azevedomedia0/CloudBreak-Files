#!/usr/bin/env bash
# Provide the LGPL-only ffmpeg sidecars for Tauri externalBin (not committed: see .gitignore).
# Used by `npm run build:mac` and CI so release DMGs ship video tools without requiring Homebrew.
#
# The sidecars are built from source by scripts/build-ffmpeg-lgpl.sh. A binary that is already in
# src-tauri/binaries is kept only if it was built without --enable-gpl or --enable-nonfree; anything
# else (an old prebuilt download, a copy of Homebrew's GPL ffmpeg) is removed and rebuilt, because a
# release must never ship it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/src-tauri/binaries"
mkdir -p "$BIN"

# True when the binary's embedded configure line has neither GPL nor nonfree options.
# pipefail is off inside: grep -q exits at the first match, which makes `strings` die of SIGPIPE, and
# with pipefail that failure would read as "no match" and wave a GPL binary through.
is_lgpl_build() (
  set +o pipefail
  ! strings -a "$1" 2>/dev/null | grep -Eq -- '--enable-(gpl|nonfree)'
)

ensure() {
  local dest="$1"
  local arch="$2"
  if [[ -x "$dest" ]]; then
    if is_lgpl_build "$dest"; then
      echo "exists: $dest (LGPL-only)"
      return 0
    fi
    echo "Removing $(basename "$dest"): it was built with GPL or nonfree options and cannot be shipped."
    rm -f "$dest"
  fi
  bash "$ROOT/scripts/build-ffmpeg-lgpl.sh" "$arch"
}

ARCH_FILTER="${1:-all}"
ok=0

if [[ "$ARCH_FILTER" == "all" || "$ARCH_FILTER" == "arm64" || "$ARCH_FILTER" == "aarch64" ]]; then
  if ensure "$BIN/ffmpeg-aarch64-apple-darwin" arm64; then
    ok=1
  fi
fi

if [[ "$ARCH_FILTER" == "all" || "$ARCH_FILTER" == "x64" || "$ARCH_FILTER" == "x86_64" ]]; then
  if ensure "$BIN/ffmpeg-x86_64-apple-darwin" x86_64; then
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
if [[ -e "$UNI_BIN" && ! -L "$UNI_BIN" ]] && ! is_lgpl_build "$UNI_BIN"; then
  rm -f "$UNI_BIN"
fi
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
