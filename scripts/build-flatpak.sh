#!/usr/bin/env bash
# Build a Linux .deb with Tauri, then wrap it in a Flatpak (com.cloudbreak.files).
# Requires Linux with: rust, node, webkitgtk, flatpak, flatpak-builder, and the GNOME 47 runtime.
# See docs/flatpak.md.
#
# Env:
#   SKIP_NPM_CI=1     — skip npm ci (CI already installed deps)
#   CARGO_TARGET_DIR  — Rust output dir (default /tmp/cloudbreak-cargo-target)
#   FLATPAK_BUNDLE    — output .flatpak path
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "error: Flatpak builds must run on Linux (this host is $(uname -s))." >&2
  echo "      Try: bash scripts/build-flatpak-docker.sh" >&2
  echo "      Or use GitHub Actions (workflow_dispatch / v* tag)." >&2
  exit 1
fi

export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/cloudbreak-cargo-target}"
FLATPAK_DIR="$ROOT/flatpak"
BUILD_DIR="${FLATPAK_BUILD_DIR:-/tmp/cloudbreak-flatpak-build}"
REPO_DIR="${FLATPAK_REPO_DIR:-/tmp/cloudbreak-flatpak-repo}"
BUNDLE_OUT="${FLATPAK_BUNDLE:-$ROOT/dist-flatpak/com.cloudbreak.files.flatpak}"

for cmd in flatpak flatpak-builder ar tar npm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: missing required command: $cmd" >&2
    exit 1
  fi
done

echo "Ensuring GNOME 47 Flatpak runtime/SDK…"
flatpak remote-add --if-not-exists --user flathub https://dl.flathub.org/repo/flathub.flatpakrepo || true
flatpak install -y --user flathub org.gnome.Platform//47 org.gnome.Sdk//47

if [[ "${SKIP_NPM_CI:-0}" != "1" ]]; then
  echo "Installing npm dependencies…"
  npm ci
else
  echo "Skipping npm ci (SKIP_NPM_CI=1)"
fi

echo "Building Tauri .deb (CARGO_TARGET_DIR=${CARGO_TARGET_DIR})…"
npm run tauri build -- --config tauri.linux.conf.json --bundles deb

DEB="$(find "${CARGO_TARGET_DIR}" src-tauri/target -path '*/release/bundle/deb/*.deb' 2>/dev/null | head -1 || true)"
if [[ -z "$DEB" || ! -f "$DEB" ]]; then
  echo "error: no .deb found under ${CARGO_TARGET_DIR} or src-tauri/target" >&2
  exit 1
fi
echo "Using deb: $DEB"
ls -lh "$DEB"

# Manifest expects flatpak/cloudbreak-files.deb next to the yaml.
cp -f "$DEB" "$FLATPAK_DIR/cloudbreak-files.deb"

echo "Building Flatpak…"
rm -rf "$BUILD_DIR" "$REPO_DIR"
mkdir -p "$(dirname "$BUNDLE_OUT")"
# Run from flatpak/ so relative source paths in the yaml resolve.
(
  cd "$FLATPAK_DIR"
  flatpak-builder --force-clean --user --repo="$REPO_DIR" "$BUILD_DIR" com.cloudbreak.files.yml
)
flatpak build-bundle "$REPO_DIR" "$BUNDLE_OUT" com.cloudbreak.files

echo ""
echo "Flatpak ready: $BUNDLE_OUT"
ls -lh "$BUNDLE_OUT"
echo "Install locally:"
echo "  flatpak install --user --bundle \"$BUNDLE_OUT\""
echo "  flatpak run com.cloudbreak.files"
