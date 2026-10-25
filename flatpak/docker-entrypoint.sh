#!/usr/bin/env bash
# Runs inside the Flatpak builder container. Expects /src (ro) and /out (rw).
set -euo pipefail

if [[ ! -d /src ]]; then
  echo "error: mount the repo at /src" >&2
  exit 1
fi
mkdir -p /out /work
# Writable copy so npm/cargo can write next to the tree.
rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude dist-flatpak \
  --exclude target \
  --exclude 'src-tauri/target' \
  --exclude .git \
  /src/ /work/

# `flatpak run org.flatpak.Builder` needs a system D-Bus socket, which a bare container does not have
# ("error: Could not connect: No such file or directory").
mkdir -p /run/dbus
rm -f /run/dbus/pid
dbus-daemon --system --fork

cd /work
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/tmp/cloudbreak-cargo-target}"
export FLATPAK_BUNDLE="${FLATPAK_BUNDLE:-/out/com.cloudbreak.files.flatpak}"
chmod +x scripts/build-flatpak.sh
bash scripts/build-flatpak.sh

# Also copy the .deb for convenience.
if [[ -f flatpak/cloudbreak-files.deb ]]; then
  cp -f flatpak/cloudbreak-files.deb /out/
fi
