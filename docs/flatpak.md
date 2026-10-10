# Linux Flatpak

Cloudbreak Files ships a Flatpak (`com.cloudbreak.files`) built from the Tauri `.deb` on Linux. Packaging files live in [`flatpak/`](../flatpak/).

## What you get

| Artifact | How |
|----------|-----|
| `.deb` | `npm run tauri build -- --config src-tauri/tauri.linux.conf.json --bundles deb` |
| `.flatpak` bundle | `npm run build:flatpak` (Linux) or `npm run build:flatpak:docker` (macOS/Windows with Docker) |
| CI | Release workflow job `linux-flatpak` on `v*` tags / `workflow_dispatch` |

App id: **`com.cloudbreak.files`** (matches `tauri.conf.json` `identifier`). Binary: **`cloudbreak-files`**.

## Local build (Linux)

Needs: Node 22+, Rust stable, WebKitGTK / Tauri Linux deps, `flatpak`, and the GNOME 48 runtime from Flathub. The build script installs Flathub’s `org.flatpak.Builder` (preferred over apt `flatpak-builder`, which still expects the removed `appstream-compose` binary).

```bash
# Debian/Ubuntu example
sudo apt install flatpak
# plus Tauri system deps: https://v2.tauri.app/start/prerequisites/#linux

npm run build:flatpak
# → dist-flatpak/com.cloudbreak.files.flatpak
```

## Docker build (macOS / any host)

With Docker Desktop running:

```bash
npm run build:flatpak:docker
# → dist-flatpak/com.cloudbreak.files.flatpak
```

## Install and run

```bash
flatpak install --user --bundle dist-flatpak/com.cloudbreak.files.flatpak
flatpak run com.cloudbreak.files
```

## Manifest permissions

[`flatpak/com.cloudbreak.files.yml`](../flatpak/com.cloudbreak.files.yml) grants:

- Wayland / X11 + GPU (`dri`)
- Network (cloud providers, updates, P2P)
- Home + common XDG folders (Local Files)
- `org.freedesktop.secrets` (keyring)
- StatusNotifierWatcher (tray)

## Flathub

The current manifest wraps a prebuilt `.deb` (fine for direct distribution). Flathub prefers offline **from-source** builds with generated `cargo-sources.json` / `node-sources.json` via [flatpak-builder-tools](https://github.com/flatpak/flatpak-builder-tools). See the [Tauri Flatpak guide](https://v2.tauri.app/distribute/flatpak/) before opening a Flathub PR.

## Files

- `flatpak/com.cloudbreak.files.yml` — Flatpak Builder manifest
- `flatpak/com.cloudbreak.files.metainfo.xml` — AppStream metadata
- `flatpak/com.cloudbreak.files.desktop` — desktop entry
- `flatpak/Dockerfile` + `docker-entrypoint.sh` — containerized builder
- `src-tauri/tauri.linux.conf.json` — Linux `deb`/`appimage`, `mainBinaryName`, metainfo path
- `scripts/build-flatpak.sh` — end-to-end deb → flatpak
- `scripts/build-flatpak-docker.sh` — same build via Docker
