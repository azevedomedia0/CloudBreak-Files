#!/usr/bin/env bash
# Download static ffmpeg sidecars for Tauri externalBin (not committed — see .gitignore).
# Used by `npm run build:mac` and CI so release DMGs ship video tools without requiring Homebrew.
# `fetch-ffmpeg.sh linux` fetches the Linux x86_64 build that scripts/build-flatpak.sh packs into the .deb.
# These are GPL-licensed static builds (see eugeneware/ffmpeg-static); keep the notice in docs/flatpak.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/src-tauri/binaries"
mkdir -p "$BIN"

# Every download is pinned to a SHA-256 and rejected on mismatch. Override a URL together with its
# *_SHA256 (an empty value skips the check). If you change a build, update THIRD_PARTY_NOTICES.md and
# licenses/ffmpeg/BUILD-INFO-*.txt too: these are GPL builds and their notices ship with the app.
#
# macOS arm64: Martin Riedl's static FFmpeg 9.0.2 (GPLv3, open build script). The eugeneware
# ffmpeg-darwin-arm64 build used before was configured with --enable-nonfree (unredistributable).
ARM_URL="${FFMPEG_ARM_URL:-https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/ffmpeg.zip}"
ARM_SHA256="${FFMPEG_ARM_SHA256-c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924}"
# macOS x86_64: evermeet.cx FFmpeg 6.1.1-tessus (GPLv3), via eugeneware/ffmpeg-static b6.1.1.
X64_URL="${FFMPEG_X64_URL:-https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-x64.gz}"
X64_SHA256="${FFMPEG_X64_SHA256-929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106}"
LINUX_X64_URL="${FFMPEG_LINUX_X64_URL:-https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz}"
LINUX_X64_SHA256="${FFMPEG_LINUX_X64_SHA256-}"  # TODO: pin once the exact build is vetted

fetch_gz() {
  local url="$1"
  local dest="$2"
  local sha="${3-}"
  local tmp
  tmp="$(mktemp)"
  echo "Downloading ffmpeg → $(basename "$dest")"
  if ! curl -fsSL --connect-timeout 30 -L "$url" -o "$tmp"; then
    echo "warn: download failed ($url)" >&2
    rm -f "$tmp"
    return 1
  fi
  if [[ -n "$sha" ]]; then
    local got
    got="$(shasum -a 256 "$tmp" | awk '{print $1}')"
    if [[ "$got" != "$sha" ]]; then
      echo "error: checksum mismatch for $url (expected $sha, got $got)" >&2
      rm -f "$tmp"
      return 2
    fi
  fi
  # Archives: .zip (single "ffmpeg" member), gzip, or a plain binary.
  if [[ "$url" == *.zip ]]; then
    unzip -p "$tmp" ffmpeg > "$dest"
  elif gzip -t "$tmp" 2>/dev/null; then
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
  local sha="${3-}"
  if [[ -x "$dest" ]]; then
    echo "exists: $dest"
    return 0
  fi
  local rc=0
  fetch_gz "$url" "$dest" "$sha" || rc=$?
  if [[ "$rc" -eq 0 ]]; then
    return 0
  fi
  # A checksum mismatch is never papered over with a local Homebrew copy.
  if [[ "$rc" -eq 2 ]]; then
    return 1
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

if [[ "$ARCH_FILTER" == "linux" ]]; then
  if ensure "$BIN/ffmpeg-x86_64-unknown-linux-gnu" "$LINUX_X64_URL" "$LINUX_X64_SHA256"; then
    echo "Done. scripts/build-flatpak.sh packs this into the .deb."
    exit 0
  fi
  echo "error: could not obtain the Linux ffmpeg sidecar." >&2
  exit 1
fi

if [[ "$ARCH_FILTER" == "all" || "$ARCH_FILTER" == "arm64" || "$ARCH_FILTER" == "aarch64" ]]; then
  if ensure "$BIN/ffmpeg-aarch64-apple-darwin" "$ARM_URL" "$ARM_SHA256"; then
    ok=1
  fi
fi

if [[ "$ARCH_FILTER" == "all" || "$ARCH_FILTER" == "x64" || "$ARCH_FILTER" == "x86_64" ]]; then
  if ensure "$BIN/ffmpeg-x86_64-apple-darwin" "$X64_URL" "$X64_SHA256"; then
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
