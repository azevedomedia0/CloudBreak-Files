# Linux Flatpak

CloudBreak Files ships a Flatpak (`com.cloudbreak.files`) built from the Tauri `.deb` on Linux. Packaging files live in [`flatpak/`](../flatpak/).

## What you get

| Artifact | How |
|----------|-----|
| `.deb` | `npm run tauri build -- --config src-tauri/tauri.linux.conf.json --bundles deb` |
| `.flatpak` bundle | `npm run build:flatpak` (Linux) or `npm run build:flatpak:docker` (macOS/Windows with Docker) |
| CI | Release workflow job `linux-flatpak` on `v*` tags / `workflow_dispatch` |

App id: **`com.cloudbreak.files`** (matches `tauri.conf.json` `identifier`). Binary: **`cloudbreak-files`**.

## Local build (Linux)

Needs: Node 22+, Rust stable, WebKitGTK / Tauri Linux deps, `flatpak`, and the GNOME 49 runtime from Flathub. The build script installs Flathub’s `org.flatpak.Builder` (preferred over apt `flatpak-builder`, which still expects the removed `appstream-compose` binary).

```bash
# Debian/Ubuntu example
sudo apt install flatpak
# plus Tauri system deps: https://v2.tauri.app/start/prerequisites/#linux

npm run build:flatpak
# → dist-flatpak/com.cloudbreak.files.flatpak
```

## Bundled ffmpeg (Linux x86_64)

`scripts/build-flatpak.sh` downloads a static ffmpeg ([eugeneware/ffmpeg-static](https://github.com/eugeneware/ffmpeg-static), release `b6.1.1`) with `scripts/fetch-ffmpeg.sh linux` and installs it in the `.deb` at `/usr/lib/cloudbreak-files/ffmpeg`. It is not placed in `/usr/bin`, so it cannot clash with Debian's `ffmpeg` package. The Flatpak copies it to `/app/lib/cloudbreak-files/ffmpeg`, and `media.rs` looks for it there before falling back to a system ffmpeg. Set `FFMPEG_LINUX_X64_URL` to pin a different build.

The static ffmpeg build is GPL-licensed (GPLv3). The license text, the builder's build info and a written source offer ship with it: [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) and [`licenses/ffmpeg/`](../licenses/ffmpeg/) are installed under `/usr/share/doc/cloudbreak-files/` in the `.deb` and `/app/share/licenses/com.cloudbreak.files/` in the Flatpak. If you pin a different build with `FFMPEG_LINUX_X64_URL`, update those files to match. If the download fails, the build continues without ffmpeg and without these files, and video tools use a system ffmpeg.

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
