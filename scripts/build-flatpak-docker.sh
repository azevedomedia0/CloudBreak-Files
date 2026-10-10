#!/usr/bin/env bash
# Build the Linux Flatpak inside Docker (works from macOS when Docker Desktop is running).
# See docs/flatpak.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is not installed" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "error: Docker daemon is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

IMAGE="${FLATPAK_DOCKER_IMAGE:-cloudbreak-flatpak-builder:local}"
OUT_DIR="$ROOT/dist-flatpak"
mkdir -p "$OUT_DIR"

echo "Building builder image…"
docker build -f "$ROOT/flatpak/Dockerfile" -t "$IMAGE" "$ROOT"

echo "Running Flatpak build in container…"
docker run --rm \
  --privileged \
  -v "$ROOT:/src:ro" \
  -v "$OUT_DIR:/out" \
  -e CARGO_TARGET_DIR=/tmp/cloudbreak-cargo-target \
  -e FLATPAK_BUNDLE=/out/com.cloudbreak.files.flatpak \
  "$IMAGE"

echo ""
echo "Host output: $OUT_DIR/com.cloudbreak.files.flatpak"
ls -lh "$OUT_DIR" || true
