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

Needs: Node 22+, Rust stable, WebKitGTK / Tauri Linux deps, `flatpak`, and the GNOME 49 runtime from Flathub. The build script installs Flathub’s `org.flatpak.Builder` (preferred over apt `flatpak-builder`, which still expects the removed `appstream-compose` binary).

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

Set `FLATPAK_OUT_DIR` to write the bundle somewhere else, for example outside a synced folder:

```bash
FLATPAK_OUT_DIR="$HOME/CloudbreakBuilds/flatpak" npm run build:flatpak:docker
```

## Install and run

```bash
flatpak install --user --bundle dist-flatpak/com.cloudbreak.files.flatpak
flatpak run com.cloudbreak.files
```

## ffmpeg and rclone

The manifest builds both into `/app/bin`, where the app looks for them next to its own binary:

- **rclone** (Google Drive "Quick sign-in"): the official v1.75.2 Linux zip, pinned by SHA-256, for x86_64 and aarch64.
- **ffmpeg** (video trim and convert): FFmpeg 7.1.1 built from source, **LGPL-only** (no `--enable-gpl` or `--enable-nonfree`; the build fails otherwise), with libmp3lame, libopus and libvpx from the Freedesktop SDK. `--enable-vaapi` builds the `h264_vaapi` encoder (libva, MIT), which encodes H.264 on the GPU through Intel or AMD VA-API drivers. There is no libx264 (GPL) and no VideoToolbox on Linux, so H.264 comes only from the GPU. **MP4 and MKV are offered only when a graphics device can encode:** the app runs a one-frame test encode on `/dev/dri` when it reads its status, and the Convert dialog hides MP4 and MKV when that fails. On a machine with no working GPU, or no VA-API driver in the Flatpak, AVI, GIF and the audio formats still work. The VA-API drivers come from the Flatpak GL and VAAPI extensions, which this build does not add; a machine's own drivers are used when they are present. The GPU path has not been run on real hardware.

Both are downloaded by `flatpak-builder` while it builds, so the first build needs network access.

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

## Screenshots and screen recording

The File menu's **Take Screenshot…** (Ctrl+Shift+6) works inside the Flatpak sandbox through the desktop portal
(`org.freedesktop.portal.Screenshot`), which shows its own region picker. The picture is saved in `~/Pictures`.
It needs `gdbus`, which the GNOME runtime provides.

**Start/Stop Screen Recording** (Ctrl+Shift+7) is not available in the Flatpak build: recording needs the
ScreenCast portal and PipeWire, and the sandbox cannot reach a screen recorder. It shows a message saying so.
Outside the sandbox (a `.deb` or AppImage install) both shortcuts use `grim`/`slurp`, `gnome-screenshot`,
`spectacle`, `scrot`, `wf-recorder` or `ffmpeg`, whichever is installed.
