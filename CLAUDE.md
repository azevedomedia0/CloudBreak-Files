# Cloudbreak Files

Tauri 2 + React 19 + Vite + Tailwind 4 desktop app. It manages many cloud accounts, has a client-side encrypted vault, and shares files through private P2P libraries. The app starts empty: there is no sample data.

## Commands
- Web dev: `npm install && npm run dev` (port 3000)
- Type check: `npm run lint`
- Rust tests: `cd src-tauri && cargo test` (41 tests)
- Crypto interop (Rust and Web Crypto): `npm run test:crypto`
- Browser vault persistence: `npm run test:vault`
- Editor text round-trip (what gets written to local files): `npx tsx scripts/editor-text-roundtrip-test.mts`
- Desktop app: `npm run tauri dev`
- Release build: `npm run tauri build -- --target universal-apple-darwin` (see `docs/notarized-distribution.md`)

## Notes
- Do not run `npm install` inside a OneDrive folder if you can avoid it. `node_modules` will sync. Use `CARGO_TARGET_DIR` outside OneDrive for Rust builds.
- Never write Apple credentials, key IDs, key file paths, tokens or passwords into this file, the docs or commits. Release credentials live in the maintainer's shell or in GitHub Actions secrets.

- If a macOS build fails with `Failed to create app Assets.car: failed to run actool`, a stale Xcode helper is usually the cause. Run `pkill -x ibtoold` and build again from a normal terminal.

## What works
- **Vault crypto** (`src-tauri/src/crypto.rs`, `commands.rs`): AES-256-GCM, PBKDF2 (600,000 iterations), constant-time passphrase verifier. The session key is held in Rust, not JS. In-session encryption is limited to 32 MB per file.
- **Vault passphrase check** is saved: `vault.json` in the app data folder in the desktop app (`vault_store.rs`), localStorage in the browser (`services/browserVaultStore.ts`). A corrupt file or entry is an error and is never silently replaced.
- **Encrypt buttons and uploads** encrypt with the vault session key when the vault is unlocked (`utils/fileEncryption.ts`, `hooks/useFileActions.ts`).
- **Rust and Web Crypto** use the same format. `npm run test:crypto` checks both directions against a fixture.
- **P2P libraries** (`src-tauri/src/p2p/`): chunked AES-GCM file encryption, encrypted manifests, X25519 key wrapping, invite links. Files are passed through the bridge as base64, so very large files are impractical.
- **Media** (`src-tauri/src/media.rs`): photo adjustments (image crate) and video trim/convert. Video needs `ffmpeg` on PATH. It is not bundled.
- **Local files** (desktop app, `src-tauri/src/local_fs.rs`, `services/localFsBridge.ts`): the native folder picker adds a folder. Cloudbreak scans it, remembers it across launches (`local_roots.json` in the app data folder) and loads media through Tauri's asset protocol. Every read, write and rename is checked against the added folders: `..`, symlinks and paths outside them are refused (11 unit tests). Saving a text or HTML document writes it in place. An edited photo is saved as a new file next to the original. Renaming renames on disk. "Delete" only removes the item from Cloudbreak. Word, PDF and other formats the editor cannot produce are never overwritten. `src-tauri/Info.plist` holds the macOS permission texts.
- **Media commands** (`media_read_temp`, `media_cleanup_temp`, `trim_video_stream`) only accept paths inside the app's temp media folder.
- **Cloud accounts** (`services/cloud/`): Google Drive, Dropbox, OneDrive, MEGA login, Nextcloud. Saved connections are re-synced at launch (`hooks/useCloudAccounts.ts`). One that cannot be reached shows as offline.
- **Desktop shell**: signed, hardened-runtime, notarized macOS build. `macOSPrivateApi` is on so the transparent window works. The app icon is `src-tauri/icons/CloudBreak-icon.icon` (Icon Composer). The toolbar leaves room for the native window buttons.

## Layout
- `src/App.tsx` (about 630 lines) wires state together. Logic lives in hooks: `useFileActions`, `useVault`, `useP2pLibraries`, `useCloudAccounts`, `useNotifications`, `useSidebarSources`, plus `useResizablePanel`, `useToast`, `useGlobalShortcuts`.
- Big components are split into folders: `components/file-browser/`, `components/sidebar/`, `components/video-player/`, `components/document-editor/`.

## App icon
`src-tauri/icons/CloudBreak-icon.icon` is compiled by Tauri with `actool` (Xcode 26 or newer) into `Assets.car`. The classic icons (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`, `icon.png`) are generated from a render of it. To regenerate:
1. `ictool src-tauri/icons/CloudBreak-icon.icon --export-image --output-file design/app-icon-1024.png --platform macOS --rendition Default --width 1024 --height 1024 --scale 1` (`ictool` is in Xcode's Icon Composer.app)
2. `npx tauri icon design/app-icon-1024.png -o /tmp/icons`
3. Copy those six files into `src-tauri/icons/`. `public/icon.png` is the web favicon.

## Not verified
- The native folder picker, scanning, saving edits to disk and the macOS permission prompts have not been clicked through in the real desktop app. The path checks and the editor-to-text conversion are unit tested, and a launch smoke test of the built app passed.
- Launching with `npm run tauri dev` and unlocking the vault in the real desktop app. `vault.json` has not been written by the desktop app yet, so the CSP and the on-disk file are untested at runtime.
- A real first launch on a second Mac or fresh user account (Gatekeeper prompt, folder and network permission prompts). A simulated quarantined download on the dev Mac passed.
- Window dragging: there is no `data-tauri-drag-region`, so the overlay title bar may not drag the window. Fixing it may also need the `core:window:allow-start-dragging` permission.
- Toolbar spacing next to the native window buttons (a 62px spacer, an estimate).
- `.github/workflows/release.yml` has never been run.

## Remaining work
- Local files: video trim output is not saved back to the folder, and "delete" does not move files to the Trash.
- Bundle `ffmpeg` (or ship a clear first-run message), since a downloaded app will not have it on PATH.
- Streaming encryption for files over 32 MB, and a non-base64 path for large P2P transfers.
- Auto-updates (`tauri-plugin-updater`): needs an updater key pair and a hosted manifest.
- The Windows build is only configured in the workflow. It is untested and unsigned.
- Some sidebar actions still create placeholder entries without a real connection, for example "Connect to server" adds an entry that is marked online. Removable devices and "Server Nodes" are not backed by real detection.
- The P2P create flow fills in invited peers with placeholder status and node IDs until a real peer connects.
- Provider credentials are saved in plain browser storage (`services/cloud/credentials.ts`). Moving them to the OS keychain from Rust is the safer design.
- `vite.config.ts` and other files may still need review for warnings after dependency upgrades.
