#!/usr/bin/env bash
# Download the official rclone binaries for Tauri externalBin (not committed — see .gitignore).
# rclone powers the "Quick sign-in (no setup)" Google Drive option. Same layout as fetch-ffmpeg.sh:
#   src-tauri/binaries/rclone-{aarch64,x86_64,universal}-apple-darwin
#
# Env:
#   RCLONE_VERSION  pin a version such as 1.70.3 (default: whatever downloads.rclone.org/version.txt says)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/src-tauri/binaries"
BASE="https://downloads.rclone.org"
mkdir -p "$BIN"

if [[ -z "${RCLONE_VERSION:-}" ]]; then
  RCLONE_VERSION="$(curl -fsSL --connect-timeout 30 "$BASE/version.txt" | awk '{print $2}' | sed 's/^v//')"
fi
if [[ ! "$RCLONE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: unexpected rclone version '$RCLONE_VERSION'" >&2
  exit 1
fi
V="v$RCLONE_VERSION"
echo "rclone $V"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Fetch one macOS zip, check it against the release's SHA256SUMS, and install the binary.
fetch_one() {
  local osx_arch="$1" dest="$2" expect_arch="$3"
  local zip="rclone-$V-osx-$osx_arch.zip"
  if [[ -x "$dest" ]]; then
    echo "exists: $dest"
    return 0
  fi
  echo "Downloading $zip"
  curl -fsSL --connect-timeout 30 "$BASE/$V/$zip" -o "$WORK/$zip" || return 1
  curl -fsSL --connect-timeout 30 "$BASE/$V/SHA256SUMS" -o "$WORK/SHA256SUMS" || return 1

  local want got
  want="$(grep -E "[[:space:]]$zip\$" "$WORK/SHA256SUMS" | awk '{print $1}' | head -1)"
  got="$(shasum -a 256 "$WORK/$zip" | awk '{print $1}')"
  if [[ -z "$want" || "$want" != "$got" ]]; then
    echo "error: checksum mismatch for $zip (expected '${want:-none}', got '$got')" >&2
    return 1
  fi

  unzip -q -o "$WORK/$zip" -d "$WORK/$osx_arch"
  local src="$WORK/$osx_arch/rclone-$V-osx-$osx_arch/rclone"
  [[ -f "$src" ]] || { echo "error: rclone missing from $zip" >&2; return 1; }
  cp "$src" "$dest"
  chmod +x "$dest"

  if command -v file >/dev/null 2>&1 && ! file -b "$dest" | grep -qi "$expect_arch"; then
    echo "error: expected $expect_arch binary, got: $(file -b "$dest")" >&2
    rm -f "$dest"
    return 1
  fi
  echo "ok: $dest ($(du -h "$dest" | awk '{print $1}'))"
}

copy_homebrew() {
  local dest="$1"
  for candidate in /opt/homebrew/bin/rclone /usr/local/bin/rclone; do
    if [[ -x "$candidate" ]]; then
      cp "$candidate" "$dest" && chmod +x "$dest"
      echo "ok (homebrew): $dest"
      return 0
    fi
  done
  return 1
}

ARM_BIN="$BIN/rclone-aarch64-apple-darwin"
X64_BIN="$BIN/rclone-x86_64-apple-darwin"
UNI_BIN="$BIN/rclone-universal-apple-darwin"
ARCH_FILTER="${1:-all}"
ok=0

if [[ "$ARCH_FILTER" == "all" || "$ARCH_FILTER" == "arm64" || "$ARCH_FILTER" == "aarch64" ]]; then
  if fetch_one arm64 "$ARM_BIN" "arm64"; then
    ok=1
  elif [[ "$(uname -m)" == "arm64" ]] && copy_homebrew "$ARM_BIN"; then
    ok=1
  fi
fi
if [[ "$ARCH_FILTER" == "all" || "$ARCH_FILTER" == "x64" || "$ARCH_FILTER" == "x86_64" ]]; then
  if fetch_one amd64 "$X64_BIN" "x86_64"; then
    ok=1
  elif [[ "$(uname -m)" == "x86_64" ]] && copy_homebrew "$X64_BIN"; then
    ok=1
  fi
fi

HOST_TRIPLE="$(rustc -vV 2>/dev/null | awk '/^host:/{print $2}' || true)"
if [[ -n "$HOST_TRIPLE" && -x "$BIN/rclone-$HOST_TRIPLE" && ! -e "$BIN/rclone" ]]; then
  ln -sf "rclone-$HOST_TRIPLE" "$BIN/rclone"
fi

if [[ -x "$ARM_BIN" && -x "$X64_BIN" ]]; then
  if [[ ! -x "$UNI_BIN" ]] || [[ "$ARM_BIN" -nt "$UNI_BIN" ]] || [[ "$X64_BIN" -nt "$UNI_BIN" ]]; then
    echo "Creating universal rclone sidecar…"
    lipo -create "$ARM_BIN" "$X64_BIN" -output "$UNI_BIN"
    chmod +x "$UNI_BIN"
  fi
  echo "ok: $UNI_BIN ($(du -h "$UNI_BIN" | awk '{print $1}'))"
elif [[ -x "$ARM_BIN" ]]; then
  ln -sf "rclone-aarch64-apple-darwin" "$UNI_BIN"
elif [[ -x "$X64_BIN" ]]; then
  ln -sf "rclone-x86_64-apple-darwin" "$UNI_BIN"
fi

if [[ "$ok" -eq 0 && ! -x "$UNI_BIN" ]]; then
  echo "error: could not obtain any rclone sidecar." >&2
  exit 1
fi
echo "Done. Release builds embed these via Tauri externalBin."
