#!/usr/bin/env bash
# Build an LGPL-only ffmpeg for macOS, the one Cloudbreak Files bundles for video trim and convert.
#
#   bash scripts/build-ffmpeg-lgpl.sh [arm64|x86_64]      (default: this Mac's architecture)
#
# LGPL-only means no --enable-gpl and no --enable-nonfree, so the binary can be redistributed with
# the notices in THIRD-PARTY-NOTICES.md. That rules out libx264 and libx265; H.264 comes from Apple's
# VideoToolbox (h264_videotoolbox). The libraries linked in are all LGPL or BSD:
#   libmp3lame (LGPL-2.0), libopus (BSD-3), libvpx (BSD-3), VideoToolbox and AudioToolbox (system).
#
# Everything is built from pinned, SHA-256-checked source tarballs into a scratch folder, and the
# result is refused unless it reports itself as LGPL and links only system libraries.
#
# Needs: Xcode command line tools (clang, make), curl, tar, xz. nasm and pkgconf are built here, so
# nothing else has to be installed. An Intel build on an Apple Silicon Mac cross-compiles.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

case "${1:-$(uname -m)}" in
  arm64 | aarch64) ARCH=arm64; TRIPLE=aarch64-apple-darwin; VPX_TARGET=arm64-darwin20-gcc ;;
  x86_64 | x64) ARCH=x86_64; TRIPLE=x86_64-apple-darwin; VPX_TARGET=x86_64-darwin20-gcc ;;
  *) echo "error: unknown architecture '${1:-}' (use arm64 or x86_64)" >&2; exit 2 ;;
esac

WORK="${FFMPEG_BUILD_DIR:-${TMPDIR:-/tmp}/cloudbreak-ffmpeg-build}"
OUT="${FFMPEG_OUT:-$ROOT/src-tauri/binaries/ffmpeg-$TRIPLE}"
export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-11.0}"
JOBS="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"

# --- Pinned sources: name|version|url|sha256 ---------------------------------------------------
# The hashes are of the files as first downloaded from these hosts. When bumping a version, check the
# new tarball against the project's own signature or checksum before updating the hash.
FFMPEG_VER=7.1.1
FFMPEG_URL=https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VER.tar.xz
FFMPEG_SHA=733984395e0dbbe5c046abda2dc49a5544e7e0e1e2366bba849222ae9e3a03b1
LAME_VER=3.100
LAME_URL=https://downloads.sourceforge.net/project/lame/lame/$LAME_VER/lame-$LAME_VER.tar.gz
LAME_SHA=ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e
OPUS_VER=1.5.2
OPUS_URL=https://downloads.xiph.org/releases/opus/opus-$OPUS_VER.tar.gz
OPUS_SHA=65c1d2f78b9f2fb20082c38cbe47c951ad5839345876e46941612ee87f9a7ce1
VPX_VER=1.14.1
VPX_URL=https://github.com/webmproject/libvpx/archive/refs/tags/v$VPX_VER.tar.gz
VPX_SHA=901747254d80a7937c933d03bd7c5d41e8e6c883e0665fadcb172542167c7977
PKGCONF_VER=2.3.0
PKGCONF_URL=https://distfiles.ariadne.space/pkgconf/pkgconf-$PKGCONF_VER.tar.xz
PKGCONF_SHA=3a9080ac51d03615e7c1910a0a2a8df08424892b5f13b0628a204d3fcce0ea8b
NASM_VER=2.16.03
NASM_URL=https://www.nasm.us/pub/nasm/releasebuilds/$NASM_VER/nasm-$NASM_VER.tar.xz
NASM_SHA=1412a1c760bbd05db026b6c0d1657affd6631cd0a63cddb6f73cc6d4aa616148

LOGS="$WORK/logs"
SRC="$WORK/src"
TOOLS="$WORK/tools"                 # build-machine tools (pkg-config, nasm), always native
PREFIX="$WORK/prefix-$ARCH"         # static libraries for the target architecture
BUILD="$WORK/build-$ARCH"
mkdir -p "$SRC" "$TOOLS" "$PREFIX" "$BUILD" "$LOGS"

# Run a build step with its output in a log, and show the end of the log if it fails.
logged() {
  local name="$1"
  shift
  if ! "$@" >"$LOGS/$name-$ARCH.log" 2>&1; then
    echo "error: building $name failed. Last lines of $LOGS/$name-$ARCH.log:" >&2
    tail -40 "$LOGS/$name-$ARCH.log" >&2
    exit 1
  fi
}

fetch() { # name url sha256 -> verified tarball in $SRC
  local file="$SRC/$(basename "$2")"
  if [[ ! -f "$file" ]]; then
    echo "Downloading $1 ($2)"
    curl -fsSL --connect-timeout 30 -o "$file.part" "$2"
    mv "$file.part" "$file"
  fi
  if ! echo "$3  $file" | shasum -a 256 -c - >/dev/null 2>&1; then
    echo "error: $1 does not match its pinned SHA-256 ($file). Delete it and run again, or update the pin if you meant to bump it." >&2
    exit 1
  fi
}

unpack() { # tarball dir -> fresh copy of the source in $BUILD/<dir>
  rm -rf "$BUILD/$2"
  mkdir -p "$BUILD/$2"
  tar -xf "$SRC/$(basename "$1")" -C "$BUILD/$2" --strip-components=1
}

fetch ffmpeg "$FFMPEG_URL" "$FFMPEG_SHA"
fetch lame "$LAME_URL" "$LAME_SHA"
fetch opus "$OPUS_URL" "$OPUS_SHA"
fetch libvpx "$VPX_URL" "$VPX_SHA"
fetch pkgconf "$PKGCONF_URL" "$PKGCONF_SHA"
[[ "$ARCH" == x86_64 ]] && fetch nasm "$NASM_URL" "$NASM_SHA"

# --- Build-machine tools (native) ---------------------------------------------------------------
export PATH="$TOOLS/bin:$PATH"
if [[ ! -x "$TOOLS/bin/pkg-config" ]]; then
  echo "Building pkgconf $PKGCONF_VER"
  unpack "$PKGCONF_URL" pkgconf
  build_pkgconf() { cd "$BUILD/pkgconf" && ./configure --prefix="$TOOLS" --disable-dependency-tracking && make -j"$JOBS" && make install; }
  logged pkgconf build_pkgconf
  ln -sf pkgconf "$TOOLS/bin/pkg-config"
fi
if [[ "$ARCH" == x86_64 && ! -x "$TOOLS/bin/nasm" ]]; then
  echo "Building nasm $NASM_VER"
  unpack "$NASM_URL" nasm
  build_nasm() { cd "$BUILD/nasm" && ./configure --prefix="$TOOLS" && make -j"$JOBS" && make install; }
  logged nasm build_nasm
fi

# --- Target flags -------------------------------------------------------------------------------
HOST_ARCH="$(uname -m)"
CC_T="clang -arch $ARCH"
CFLAGS_T="-O2 -mmacosx-version-min=$MACOSX_DEPLOYMENT_TARGET"
LDFLAGS_T="-mmacosx-version-min=$MACOSX_DEPLOYMENT_TARGET"
CONF_HOST=()
CROSS=()
if [[ "$ARCH" != "$HOST_ARCH" ]]; then
  CONF_HOST=(--host="$ARCH-apple-darwin")
  CROSS=(--enable-cross-compile --target-os=darwin --host-cc=clang)
fi
export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig"
export PKG_CONFIG_PATH=""

# --- Libraries (static) -------------------------------------------------------------------------
if [[ ! -f "$PREFIX/lib/libmp3lame.a" ]]; then
  echo "Building lame $LAME_VER ($ARCH)"
  unpack "$LAME_URL" lame
  # The export list names a symbol the library does not define, which newer linkers reject.
  sed -i '' '/lame_init_old/d' "$BUILD/lame/include/libmp3lame.sym"
  build_lame() {
    cd "$BUILD/lame" && CC="$CC_T" CFLAGS="$CFLAGS_T" LDFLAGS="$LDFLAGS_T" \
      ./configure ${CONF_HOST[@]+"${CONF_HOST[@]}"} --prefix="$PREFIX" --disable-shared --enable-static --disable-frontend --disable-dependency-tracking \
      && make -j"$JOBS" && make install
  }
  logged lame build_lame
fi

if [[ ! -f "$PREFIX/lib/libopus.a" ]]; then
  echo "Building opus $OPUS_VER ($ARCH)"
  unpack "$OPUS_URL" opus
  build_opus() {
    cd "$BUILD/opus" && CC="$CC_T" CFLAGS="$CFLAGS_T" LDFLAGS="$LDFLAGS_T" \
      ./configure ${CONF_HOST[@]+"${CONF_HOST[@]}"} --prefix="$PREFIX" --disable-shared --enable-static --disable-doc --disable-extra-programs --disable-dependency-tracking \
      && make -j"$JOBS" && make install
  }
  logged opus build_opus
fi

if [[ ! -f "$PREFIX/lib/libvpx.a" ]]; then
  echo "Building libvpx $VPX_VER ($ARCH)"
  unpack "$VPX_URL" libvpx
  build_libvpx() {
    cd "$BUILD/libvpx" && ./configure --prefix="$PREFIX" --target="$VPX_TARGET" --disable-shared --enable-static --enable-pic \
      --disable-examples --disable-tools --disable-docs --disable-unit-tests \
      && make -j"$JOBS" && make install
  }
  logged libvpx build_libvpx
fi

# --- ffmpeg -------------------------------------------------------------------------------------
echo "Building ffmpeg $FFMPEG_VER ($ARCH)"
# Deliberately no --enable-gpl, --enable-nonfree or --enable-version3, and --disable-autodetect so
# no library on this Mac is picked up by accident.
CONFIGURE_ARGS=(
  --prefix="$PREFIX" --arch="$ARCH" --cc="$CC_T"
  ${CROSS[@]+"${CROSS[@]}"}
  --pkg-config="$TOOLS/bin/pkg-config" --pkg-config-flags=--static
  --extra-cflags="$CFLAGS_T -I$PREFIX/include" --extra-ldflags="$LDFLAGS_T -L$PREFIX/lib"
  --disable-autodetect --disable-gpl --disable-nonfree
  --disable-shared --enable-static
  --disable-doc --disable-debug --disable-ffplay --disable-ffprobe
  --enable-libmp3lame --enable-libopus --enable-libvpx
  --enable-videotoolbox --enable-audiotoolbox --enable-zlib --enable-bzlib --enable-iconv
  # iconv is a system library on macOS, but --disable-autodetect does not add -liconv for it.
  --extra-libs=-liconv
)
build_ffmpeg() { unpack "$FFMPEG_URL" ffmpeg && cd "$BUILD/ffmpeg" && ./configure "${CONFIGURE_ARGS[@]}" && make -j"$JOBS" && make install; }
# Skip the rebuild when the binary in the prefix came from this exact version and these exact options.
STAMP="$PREFIX/.ffmpeg-stamp"
WANT_STAMP="$FFMPEG_SHA ${CONFIGURE_ARGS[*]}"
if [[ -x "$PREFIX/bin/ffmpeg" && "$(cat "$STAMP" 2>/dev/null)" == "$WANT_STAMP" ]]; then
  echo "ffmpeg $FFMPEG_VER ($ARCH) is already built"
else
  logged ffmpeg build_ffmpeg
  printf '%s' "$WANT_STAMP" > "$STAMP"
fi

BIN="$PREFIX/bin/ffmpeg"
strip -x "$BIN"

# --- Checks: refuse anything that is not what it claims to be -----------------------------------
# Each check captures a command's output first and tests the text. Piping into `grep -q` under
# pipefail is not safe here: grep exits at the first match, the writer dies of SIGPIPE, and the
# pipeline then reports failure even though grep matched, which turns a positive test upside down.
fail() { echo "error: $1" >&2; exit 1; }

INFO="$(file -b "$BIN")"
[[ "$INFO" == *"$ARCH"* ]] || fail "the binary is not $ARCH: $INFO"

NON_SYSTEM="$(otool -L "$BIN" | tail -n +2 | awk '{print $1}' | grep -Ev '^(/usr/lib/|/System/Library/)' || true)"
if [[ -n "$NON_SYSTEM" ]]; then
  fail "the binary links libraries outside the system: $NON_SYSTEM"
fi

# The configure line is embedded in the binary, so this works for a cross-built one too.
EMBEDDED="$(strings -a "$BIN")"
BAD_OPTIONS="$(grep -Eo -- '--enable-(gpl|nonfree|version3)' <<<"$EMBEDDED" | sort -u | tr '\n' ' ' || true)"
if [[ -n "$BAD_OPTIONS" ]]; then
  fail "the build carries GPL or nonfree options: $BAD_OPTIONS"
fi

if [[ "$ARCH" == "$HOST_ARCH" ]]; then
  # The license text wraps lines inside the phrase, so join them first.
  LICENSE_TEXT="$("$BIN" -L 2>&1 | tr '\n' ' ' | tr -s ' ')"
  [[ "$LICENSE_TEXT" == *"GNU Lesser General Public License"* ]] || fail "the binary does not report an LGPL license"
  ENCODERS="$("$BIN" -hide_banner -encoders 2>/dev/null)"
  for gpl_encoder in libx264 libx265; do
    if grep -Eq "[[:space:]]$gpl_encoder[[:space:]]" <<<"$ENCODERS"; then
      fail "a GPL encoder ($gpl_encoder) is present"
    fi
  done
  for enc in aac libmp3lame libopus libvpx-vp9 flac h264_videotoolbox mpeg4; do
    grep -Eq "[[:space:]]$enc[[:space:]]" <<<"$ENCODERS" || fail "expected encoder $enc is missing"
  done
  "$BIN" -version | grep '^configuration:' || true
else
  echo "(cross-built for $ARCH: license and link checks ran, encoder checks need an $ARCH Mac)"
fi

mkdir -p "$(dirname "$OUT")"
cp "$BIN" "$OUT"
chmod +x "$OUT"
echo "ok: $OUT ($(du -h "$OUT" | awk '{print $1}'), LGPL-only, $ARCH)"
