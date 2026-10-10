<img width="512" height="512" alt="Ultima-icon-transparent" src="https://github.com/user-attachments/assets/6e3fe949-57cf-4423-b61f-185a15f34589" />

# Cloudbreak Files

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Open-source desktop file explorer for macOS — universal builds for Apple Silicon and Intel (macOS 11 Big Sur or newer). Linux Flatpak packaging is in progress; Windows builds are planned.  
**Tauri 2 · React 19 · Vite · Tailwind 4**

Manage local folders, network volumes, multiple cloud accounts, a client-side encrypted vault, media tools, and private P2P libraries — without sample or demo data on a fresh launch.

**Site:** [azevedomedia0.github.io/CloudBreak-Files](https://azevedomedia0.github.io/CloudBreak-Files/)  
**Repository:** [github.com/azevedomedia0/CloudBreak-Files](https://github.com/azevedomedia0/CloudBreak-Files)

## Features

### Local Files
- Add folders with the native picker; Cloudbreak scans them and remembers roots across launches
- Sidebar refresh rescans all remembered folders from disk
- Path sandbox: reads, writes, and renames stay inside added folders (`..`, symlinks, and escape paths are refused)
- Edit and save text/HTML in place; edited photos save as a new file beside the original
- Rename on disk; Delete moves local items to the system Trash (restorable on macOS)
- Media loads through Tauri’s asset protocol
- Word, PDF, and other formats the editor cannot produce are never overwritten

### Finder-style browsing
- Icons, list, columns, and gallery views with icon size control
- Back / Forward navigation history (folder, account, library, source, category)
- Hover select checkboxes on file and folder thumbnails
- Right-click menus on files and folders (Open, Quick Look, Get Info, Rename, Duplicate, Copy, Share, Tags, Trash, and more)
- Resizable sidebar and File Inspector (including Columns view)
- Appearance themes: Dark, Midnight, Graphite, and Light (Preferences menu)
- Spotlight-style “Search This Mac” on desktop (when available)
- Full-bleed audio player with queue; Quick Look previews
- System terminal side panel (desktop)
- Native-feeling macOS chrome: overlay title bar, traffic lights aligned with the toolbar, transparent window

### Encrypted vault
- AES-256-GCM encryption with PBKDF2 (600,000 iterations) and a constant-time passphrase verifier
- Session key held in Rust, not JavaScript
- Passphrase check persisted as `vault.json` (desktop app data) or browser localStorage — corrupt entries are never silently replaced
- Encrypt uploads and library items when the vault is unlocked
- Desktop local files can use path-based streaming encrypt (no small IPC size cap)
- Rust and Web Crypto share the same ciphertext format (interop tests included)

### Cloud accounts
- Official sign-in: Google Drive, Dropbox and OneDrive (OAuth with PKCE, refresh tokens), Nextcloud (Login Flow v2, revocable app password); MEGA uses email + password. Google Drive also offers a no-setup sign-in through a bundled rclone. See [`docs/cloud-oauth.md`](docs/cloud-oauth.md)
- Connections re-synced at launch; unreachable accounts show as offline
- Provider tokens and passwords stored in the **OS keychain** on desktop (legacy localStorage migrated once and cleared)
- Browser preview still uses localStorage for credentials

### Network & devices (macOS)
- Mounted volumes and network shares listed in the sidebar
- Saved SMB/NFS servers probed over TCP and marked online only when they respond
- Connect to Server opens the share in Finder and saves the entry
- Removable drives can be ejected from the app

### Media tools
- Photo adjustments (in-app photo studio)
- Video trim and convert via ffmpeg (bundled in release builds; Homebrew/PATH in development)
- Converted video can be saved with the native save dialog or into a chosen folder
- Clear in-app messaging when ffmpeg is missing

### Document editing
- In-app document editor for supported text/HTML formats
- Untrusted content gate before external bodies enter the editor
- Round-trip tests for what gets written back to disk

### Private P2P libraries
- Invite-link sharing with chunked AES-GCM file encryption and encrypted manifests
- X25519 key wrapping for peers
- Streamed ingest from a local path (or base64 under 32 MB); large files materialize for playback
- Invitees stay pending until a real swarm peer connects
- Notifications for library invites and peer activity

### Desktop shell & updates
- Signed, hardened-runtime, notarized macOS builds (Developer ID)
- System tray with live P2P seeding status
- Signed auto-updates via GitHub Releases (`latest.json` + minisign; see [`docs/auto-updates.md`](docs/auto-updates.md))
- Check for updates from Profile → Preferences
- Linux Flatpak packaging (`com.cloudbreak.files`; see [`docs/flatpak.md`](docs/flatpak.md))

## Run

Needs Node.js 22+ and, for the desktop app, a Rust toolchain.

```bash
npm install
npm run dev          # web preview at http://localhost:3000
npm run tauri dev    # desktop app
```

Do not keep `node_modules` inside OneDrive if you can avoid it. For Rust builds, set `CARGO_TARGET_DIR` outside OneDrive (the macOS release script does this by default).

## Check

```bash
npm run lint                  # TypeScript
cd src-tauri && cargo test    # Rust (crypto, local FS path checks, …)
npm run test:crypto           # Rust ↔ Web Crypto interop
npm run test:app              # in-app self-test (desktop debug build)
```

## Release

```bash
npm run build:mac             # signed/notarized when Apple env vars are set (universal)
npm run build:flatpak         # Linux only — .deb → Flatpak
npm run build:flatpak:docker  # same via Docker Desktop
```

See [`docs/notarized-distribution.md`](docs/notarized-distribution.md), [`docs/auto-updates.md`](docs/auto-updates.md), and [`docs/flatpak.md`](docs/flatpak.md).  
Never commit Apple API keys, updater private keys, or `.p8` / `.p12` files.

## Privacy and terms

- [Privacy Policy](PRIVACY.md): what stays on your device and the few services the app contacts.
- [Terms of Use and Disclaimer](TERMS.md): no warranty, back up your data, security is not guaranteed.

After editing either, run `python3 scripts/docs-to-html.py` to refresh the website pages.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).  
Bundled third-party software (rclone, MIT) is listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
