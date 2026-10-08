# Cloudbreak Files

Desktop app (Tauri 2, React 19, Vite, Tailwind 4) that manages many cloud accounts and has a client-side encrypted vault.

Most of the UI runs on sample data. Cloud accounts, uploads, photo editing and video trimming are not connected to real services yet.

## Run

Needs Node.js and, for the desktop app, Rust.

```bash
npm install
npm run dev          # web preview at http://localhost:3000
npm run tauri dev    # desktop app
```

## Check

```bash
npm run lint                  # TypeScript type check
cd src-tauri && cargo test    # Rust tests (crypto and vault file)
```

## Linux / COSMIC (scaffold)

A native Rust port for the [COSMIC](https://github.com/pop-os/cosmic-epoch) desktop lives in [`Linux/`](Linux/). Architecture only for now: COSMIC shell, real vault crypto, placeholders for cloud/P2P/media. See [`Linux/README.md`](Linux/README.md).

```bash
cd Linux && cargo test --no-default-features
cd Linux && cargo run          # COSMIC UI (Linux / Pop!_OS recommended)
```

## Security notes

- Encryption is AES-256-GCM with a PBKDF2-HMAC-SHA256 key (600,000 iterations). Passphrases need 8 or more characters.
- The vault stores a salted passphrase check in `vault.json` in the app data folder. It never stores the passphrase or a key.
- Uploads and the "encrypt" buttons do not encrypt file bytes yet.
