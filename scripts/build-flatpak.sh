#!/usr/bin/env bash
# Build a Linux .deb with Tauri, then wrap it in a Flatpak (com.cloudbreak.files).
# Requires Linux with: rust, node, webkitgtk, flatpak, and the GNOME 49 runtime.
# Prefers Flathub's org.flatpak.Builder (has appstreamcli); falls back to host flatpak-builder.
# See docs/flatpak.md.
#
# Env:
#   SKIP_NPM_CI=1     — skip npm ci (CI already installed deps)
#   CARGO_TARGET_DIR  — Rust output dir (default /tmp/cloudbreak-cargo-target)
#   FLATPAK_BUNDLE    — output .flatpak path
#   GNOME_RUNTIME_VERSION — default 49 (must match flatpak/com.cloudbreak.files.yml)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "error: Flatpak builds must run on Linux (this host is $(uname -s))." >&2
  echo "      Try: bash scripts/build-flatpak-docker.sh" >&2
  echo "      Or use GitHub Actions (workflow_dispatch / v* tag)." >&2
  exit 1
fi

# org.flatpak.Builder talks to the host flatpak over the session bus to find
# user-installed SDKs. GitHub Actions runners have no session bus by default.
if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]] && command -v dbus-run-session >/dev/null 2>&1; then
  echo "Starting a temporary D-Bus session for Flatpak Builder…"
  exec dbus-run-session -- "$0" "$@"
fi

export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/cloudbreak-cargo-target}"
FLATPAK_DIR="$ROOT/flatpak"
# flatpak-builder requires state-dir and build-dir on the same filesystem.
# Keep all three under /tmp so CI workspace (often a different mount) is fine.
BUILD_DIR="${FLATPAK_BUILD_DIR:-/tmp/cloudbreak-flatpak-build}"
REPO_DIR="${FLATPAK_REPO_DIR:-/tmp/cloudbreak-flatpak-repo}"
STATE_DIR="${FLATPAK_STATE_DIR:-/tmp/cloudbreak-flatpak-state}"
BUNDLE_OUT="${FLATPAK_BUNDLE:-$ROOT/dist-flatpak/com.cloudbreak.files.flatpak}"
GNOME_RUNTIME_VERSION="${GNOME_RUNTIME_VERSION:-49}"

for cmd in flatpak ar tar npm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: missing required command: $cmd" >&2
    exit 1
  fi
done

echo "Ensuring Flathub + GNOME ${GNOME_RUNTIME_VERSION} runtime/SDK + Flatpak Builder…"
flatpak remote-add --if-not-exists --user flathub https://dl.flathub.org/repo/flathub.flatpakrepo || true
flatpak install -y --user flathub \
  "org.gnome.Platform//${GNOME_RUNTIME_VERSION}" \
  "org.gnome.Sdk//${GNOME_RUNTIME_VERSION}" \
  org.flatpak.Builder

run_flatpak_builder() {
  # Prefer org.flatpak.Builder — Ubuntu's apt flatpak-builder still calls
  # appstream-compose, which GNOME Sdk 47+ no longer ships.
  if flatpak info --user org.flatpak.Builder >/dev/null 2>&1 \
    || flatpak info org.flatpak.Builder >/dev/null 2>&1; then
    flatpak run org.flatpak.Builder "$@"
  elif command -v flatpak-builder >/dev/null 2>&1; then
    flatpak-builder "$@"
  else
    echo "error: install org.flatpak.Builder (Flathub) or flatpak-builder" >&2
    exit 1
  fi
}

if [[ "${SKIP_NPM_CI:-0}" != "1" ]]; then
  echo "Installing npm dependencies…"
  npm ci
else
  echo "Skipping npm ci (SKIP_NPM_CI=1)"
fi

echo "Building Tauri .deb (CARGO_TARGET_DIR=${CARGO_TARGET_DIR})…"
npm run tauri build -- --config src-tauri/tauri.linux.conf.json --bundles deb

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
rm -rf "$BUILD_DIR" "$REPO_DIR" "$STATE_DIR"
mkdir -p "$(dirname "$BUNDLE_OUT")" "$STATE_DIR"
# Run from flatpak/ so relative source paths in the yaml resolve.
(
  cd "$FLATPAK_DIR"
  # Runtime/SDK are preinstalled above. Do not pass --install-deps-from=flathub:
  # nested flatpak install from org.flatpak.Builder needs a D-Bus session (fails in CI).
  # --disable-rofiles-fuse: GitHub runners / nested Flatpak Builder often lack
  # a working FUSE mount for rofiles-fuse.
  run_flatpak_builder --force-clean --user \
    --disable-rofiles-fuse \
    --state-dir="$STATE_DIR" \
    --repo="$REPO_DIR" "$BUILD_DIR" com.cloudbreak.files.yml
)
flatpak build-bundle "$REPO_DIR" "$BUNDLE_OUT" com.cloudbreak.files

echo ""
echo "Flatpak ready: $BUNDLE_OUT"
ls -lh "$BUNDLE_OUT"
echo "Install locally:"
echo "  flatpak install --user --bundle \"$BUNDLE_OUT\""
echo "  flatpak run com.cloudbreak.files"
