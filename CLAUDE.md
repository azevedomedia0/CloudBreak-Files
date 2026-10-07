# AetherCloud Vault (cloudsync-hub)

Tauri 2 + React 19 + Vite + Tailwind 4 desktop app. It manages many cloud accounts and has a client-side encrypted vault. Most UI data is sample data.

## Commands
- Web dev: `npm install && npm run dev` (port 3000)
- Type check: `npm run lint`
- Rust tests: `cd src-tauri && cargo test`
- Desktop app: `cd src-tauri && cargo tauri dev` (needs `@tauri-apps/cli`, not installed yet)

## Done (review fixes, critical items)
- `src-tauri/src/crypto.rs`: real AES-256-GCM + PBKDF2. Min passphrase 8 chars. Passphrase verifier (constant-time). 7 unit tests pass.
- `src-tauri/src/commands.rs`: `encrypt_data` uses `encrypt_bytes`. New `decrypt_data`. Vault unlock checks the passphrase. First unlock after launch sets it. Verifier is in memory only.
- `src/services/rustBridge.ts`: removed fake `btoa` encryption. Tauri invoke, with a Web Crypto fallback in the same data format.
- UI: removed pre-filled passphrases. Removed the false "no unencrypted bytes" claim. Unlock buttons send the passphrase (`handleToggleVaultLock` in `App.tsx`).
- `package.json`: `esbuild` set to `^0.28.0` (it conflicted with Vite 8).

- `cargo check` is clean (no warnings) and `cargo test` passes (7 tests).
- Tauri bridge uses `@tauri-apps/api/core` (`invoke`, `isTauri`). Added `@tauri-apps/api` and `@tauri-apps/cli` and an `npm run tauri` script.
- Strict CSP and `devCsp` set in `tauri.conf.json`. Allowed hosts: Google Fonts, Unsplash images, the sample-video bucket.
- Removed the unused `fs`, `dialog` and `shell` plugins from `Cargo.toml`. Added `src-tauri/capabilities/default.json` (`core:default` only).
- `package.json`: renamed to `aethercloud-vault`. Removed `@google/genai`, `express`, `dotenv`, `@types/express`. Deleted the empty `bun.lock`.
- `src-tauri/icons/` and `build.rs` already existed. `.gitignore` now covers `src-tauri/target`, `src-tauri/gen`, `*.zip`.
- Web side checked in a scratch copy outside OneDrive: `npm install`, `npm run lint` and `npm run build` pass.

- Medium items done:
  - Vault passphrase check is saved to `vault.json` in the app data folder (`src-tauri/src/vault_store.rs`, atomic write, 0600). A corrupt file is an error, never silently replaced. Not yet run inside the real Tauri app.
  - PBKDF2 is 600,000 iterations in Rust and TypeScript. The verifier stores its own iteration count. Dev builds compile the crypto crates with `opt-level = 3` so tests stay fast. 12 Rust tests pass.
  - `src/utils/crypto.ts`: keys are non-extractable and base64 is chunked (3 MB tested). `rustBridge.ts` zeroes raw key bytes after use.
  - `process_photo_render` and `trim_video_stream` now return a "not implemented" error instead of fake success. Nothing in the UI calls them yet.
  - Sample data: removed the fake tokens and all real-looking emails (now `you@example.com` and similar). The API key field starts empty.
  - Uploads and the encrypt buttons no longer claim real encryption. Uploads get a real SHA-256 (files up to 100 MB) and are marked "local preview". The encrypt buttons set a "demo flag" with a toast saying bytes are not encrypted.
  - AI Studio leftovers removed (README rewritten, `.env.example`, `metadata.json`, HMR comments).
  - Large files split: `FileBrowser` (195 lines, views in `components/file-browser/`), `Sidebar` (176, sections in `components/sidebar/`), `VideoPlayerModal` (421, `components/video-player/`), `App.tsx` (901 to 455). It now uses `hooks/useResizablePanel.ts`, `useToast.ts`, `useGlobalShortcuts.ts`, `useFileActions.ts`, `utils/libraryBuilders.ts`, `utils/filterFiles.ts`, and the `AppModals`, `DropOverlay` and `Toast` components.
- Checked in the web preview (scratch copy, not the desktop app), no console errors: all four view modes, library banners, video trim/transcode tabs, the browser crypto path (round trip, wrong passphrase, vault unlock), Cmd+B and Space shortcuts, drag-and-drop upload (real SHA-256, toast, overlay), and the folder and profile modals.

- App icon: the folder icon you supplied. Corners were cut to transparent with a squircle mask. Source is `design/app-icon-1024.png`. To regenerate: `npx tauri icon design/app-icon-1024.png -o /tmp/icons`, then copy `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`, `icon.png` into `src-tauri/icons/`. `public/icon.png` is the web favicon.

## Not verified
- The app has not been launched with `npm run tauri dev`. The CSP and the on-disk vault file are untested at runtime.
- The Rust and Web Crypto paths use the same format but were never tested against each other's output.
- `"transparent": true` on the window may need the `macos-private-api` feature on macOS.

## Remaining work
- Real encryption for uploads and the encrypt buttons. It needs a session key design (key held in Rust, not a passphrase kept in JS).
- Browser mode keeps the vault passphrase check in memory only. It resets on reload.
- `media.rs` / `trim_video_stream` / `process_photo_render` need real implementations.
- `App.tsx` is 455 lines. The remaining bulk is the toolbar/sidebar/browser layout JSX and the sidebar and notification handlers.
- Delete `_to_delete/crypto.rs.orig`.

## Notes
- Do not run `npm install` inside a OneDrive folder if you can avoid it. `node_modules` will sync. Use `CARGO_TARGET_DIR` outside OneDrive for Rust builds.
