<img width="512" height="512" alt="Ultima-icon-transparent" src="https://github.com/user-attachments/assets/6e3fe949-57cf-4423-b61f-185a15f34589" />

# Cloudbreak Files

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Open-source desktop file explorer for macOS — universal builds for Apple Silicon and Intel (macOS 11 Big Sur or newer). Windows/Linux builds planned.  
**Tauri 2 · React 19 · Vite · Tailwind 4**

Manage local folders, multiple cloud accounts, a client-side encrypted vault, media tools, and private P2P libraries — without sample/demo data on a fresh launch.

**Repository:** [github.com/azevedomedia0/CloudBreak-Files](https://github.com/azevedomedia0/CloudBreak-Files)

## Features

- **Local Files** — add folders, rescan from disk, edit/save in place (path-sandboxed)
- **Encrypted vault** — AES-256-GCM, PBKDF2 (600k), session key held in Rust
- **Cloud accounts** — Google Drive, Dropbox, OneDrive, MEGA, Nextcloud (credentials in the OS keychain on desktop)
- **Media** — photo adjustments; video trim/convert (bundled ffmpeg in release builds)
- **P2P libraries** — invite-dial E2EE sharing with chunked encryption
- **Auto-updates** — signed Tauri updater (see [`docs/auto-updates.md`](docs/auto-updates.md))

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

## Release (macOS)

```bash
npm run build:mac             # signed/notarized when Apple env vars are set
```

See [`docs/notarized-distribution.md`](docs/notarized-distribution.md) and [`docs/auto-updates.md`](docs/auto-updates.md).  
Never commit Apple API keys, updater private keys, or `.p8` / `.p12` files.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
