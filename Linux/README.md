# Cloudbreak Files — Linux / COSMIC

Native Rust port for **Pop!_OS / COSMIC**, built so you can finish UI polish and host integration on a Pop machine.

## Status

| Area | State |
|------|--------|
| COSMIC shell (nav, browser, inspector, settings tabs) | **Working** |
| Vault crypto + `vault.json` | **Ported** (same format as Tauri) |
| P2P stack (identity, keys, invite, chunks, swarm, service API) | **Ported** from `src-tauri/src/p2p` |
| Create library / export invite / start swarm (UI) | **Wired** |
| Local filesystem browse | **Working** |
| Photo pixel adjustments | **Working** (`media::process_photo_render`) |
| Cloud HTTP proxy | **Ported** (`cloud::http`) |
| Cloud OAuth / provider mounts | Stub adapters — finish on Pop!_OS |
| Video trim / ffmpeg | Stub (`MediaError::FfmpegMissing`) |
| Rich document editor | Text open/save only |
| COSMIC theme sync / light gray chrome | Partial — prefs saved; polish against `cosmic-theme` on Pop |

**Verified here:** `cargo test --no-default-features` (17 tests) and `cargo check --features cosmic-ui`.

## Layout

```
Linux/
  Cargo.toml
  resources/com.cloudbreak.Files.desktop
  src/
    main.rs
    crypto.rs / vault_store.rs / paths.rs
    domain/          # types, prefs, sample data, filter/sort
    p2p/             # full stack + service.rs (no Tauri)
    cloud/           # http proxy + stub adapters
    local_fs.rs      # home directory browser
    media/           # photo pipeline + ffmpeg stub
    editors/         # plain text documents
    ui/              # COSMIC Application
```

## Build on Pop!_OS

```bash
sudo apt install build-essential pkg-config libxkbcommon-dev libwayland-dev \
  libegl1-mesa-dev libvulkan-dev clang
rustup update

cd Linux
cargo test --no-default-features
cargo run
```

Optional Wayland feature (edit `Cargo.toml` `libcosmic` features to add `"wayland"`).

Install launcher entry:

```bash
cargo build --release
sudo cp target/release/cloudbreak-files /usr/local/bin/
sudo cp resources/com.cloudbreak.Files.desktop /usr/share/applications/
```

Data lives under:

- `$XDG_CONFIG_HOME/cloudbreak-files/` — `preferences.json`, `profile.json`, `vault.json`
- `$XDG_DATA_HOME/cloudbreak-files/` — P2P identity, libraries, chunks

## Finish on Pop!_OS (suggested)

1. Run the UI, create a P2P library, dial invite between two machines on LAN.
2. Add `"wayland"` to libcosmic features; verify nav bar + header on COSMIC.
3. Wire cloud adapters (tokens / OAuth) using `cloud::http` like the Tauri bridge.
4. Shell out to system `ffmpeg` in `media::trim_video_stream`.
5. Map Appearance light/dark onto `cosmic-theme` / application stylesheet.
6. Clipboard copy for invites (`arboard` or COSMIC clipboard API).
7. Accept-invite form UI (service API already exists: `p2p_accept_invite`).

## Relation to Tauri app

Same crypto domains and P2P invite format (`aetherlib:1` kept for compatibility). Prefer keeping `Linux/src/p2p` and `src-tauri/src/p2p` in sync, or extract a shared crate later.
