# AetherCloud Vault

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

## Security notes

- Encryption is AES-256-GCM with a PBKDF2-HMAC-SHA256 key (600,000 iterations). Passphrases need 8 or more characters.
- The vault stores a salted passphrase check in `vault.json` in the app data folder. It never stores the passphrase or a key.
- Uploads and the "encrypt" buttons do not encrypt file bytes yet.
