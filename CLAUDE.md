# Cloudbreak Files

Tauri 2 + React 19 + Vite + Tailwind 4 desktop app. It manages many cloud accounts, has a client-side encrypted vault, and shares files through private P2P libraries. The app starts empty: there is no sample data.

## Commands
- Web dev: `npm install && npm run dev` (port 3000)
- Type check: `npm run lint`
- Rust tests: `cd src-tauri && cargo test` (107 tests, plus one hand-run Trash test: `cargo test trash_moves -- --ignored`)
- Crypto interop (Rust and Web Crypto): `npm run test:crypto`
- Browser vault persistence: `npm run test:vault`
- Photo pipeline parity (canvas preview vs Rust render): `npx tsx scripts/photo-pipeline-test.mts`
- Editor text round-trip (what gets written to local files): `npx tsx scripts/editor-text-roundtrip-test.mts`
- Terminal splits, saved sessions and keys: `npx tsx scripts/terminal-layout-test.mts`
- Desktop app: `npm run tauri dev`
- In-app self-test (runs inside the real desktop app, debug build only): `npm run test:app`. It checks vault unlock and `vault.json`, the security policy, the asset protocol, local file saves, the path limits, video trim and save, drag permission and toolbar spacing. It uses a throwaway app data folder. Needs port 3000 free and ffmpeg.
- Release build: `npm run build:mac` (universal Apple Silicon + Intel; see `docs/notarized-distribution.md`; sets `CARGO_TARGET_DIR` outside OneDrive, `MACOSX_DEPLOYMENT_TARGET=11.0`)
- Linux Flatpak: `npm run build:flatpak` (Linux) or `npm run build:flatpak:docker` (Docker Desktop; see `docs/flatpak.md`). CI job `linux-flatpak` in `.github/workflows/release.yml`.
- Updater keys: `npm run updater:keys` (private key in `~/.tauri/`; see `docs/auto-updates.md`)

## Notes
- Do not run `npm install` inside a OneDrive folder if you can avoid it. `node_modules` will sync. Use `CARGO_TARGET_DIR` outside OneDrive for Rust builds.
- Never write Apple credentials, key IDs, key file paths, tokens or passwords into this file, the docs or commits. Release credentials live in the maintainer's shell or in GitHub Actions secrets.

- If a macOS build fails with `Failed to create app Assets.car: failed to run actool`, first confirm `CloudBreak-icon.icon` is not in `bundle.icon` (Tauri’s actool flags break glass Icon Studio docs). Otherwise run `pkill -x ibtoold` and rebuild from a normal terminal.

## What works
- **Vault crypto** (`src-tauri/src/crypto.rs`, `commands.rs`): AES-256-GCM, PBKDF2 (600,000 iterations), constant-time passphrase verifier. The session key is held in Rust, not JS. Small blobs still use the 32 MB IPC path; desktop local files use path-based streaming encrypt (`encrypt_session_file` / `CBSTRM01`, no size cap).
- **Vault passphrase check** is saved: `vault.json` in the app data folder in the desktop app (`vault_store.rs`), localStorage in the browser (`services/browserVaultStore.ts`). A corrupt file or entry is an error and is never silently replaced.
- **Encrypt buttons and uploads** encrypt with the vault session key when the vault is unlocked (`utils/fileEncryption.ts`, `hooks/useFileActions.ts`).
- **Rust and Web Crypto** use the same format. `npm run test:crypto` checks both directions against a fixture.
- **P2P libraries** (`src-tauri/src/p2p/`): chunked AES-GCM file encryption, encrypted manifests, X25519 key wrapping, invite links (the seeder signs the dial addresses along with the capability, so they cannot be redirected in transit; copying an invite re-signs it with the Mac's current addresses, and invites from before signed addresses are rejected with a message to copy again). Create accepts a `localPath` (streamed ingest) or base64 under 32 MB; large files materialize via `p2p_materialize_file` (temp path + asset URL). Invitees stay `pending` until a real swarm peer connects. The listener serves a library only to peers that present its invite's access token (`Access` message, protocol v2, constant-time compare); a library's token is minted on create, copy or seed and stored in `libraries.json` (invites without a token are rejected as outdated). Fetched blocks must hash to the cid that was asked for. Connections from other networks are opt-in (Preferences → Network, `p2pRemoteAccess`): `p2p/port_mapping.rs` asks the router to forward the port (NAT-PMP by hand, then UPnP via `igd-next`), renews the lease every 30 minutes and removes it on off or quit. A carrier-grade-NAT or private router address is reported and never put into invites.
- **Terminal** (`src-tauri/src/terminal.rs`, `components/SystemTerminal.tsx`, `utils/terminalKeys.ts`): a real login shell on a PTY, streamed to xterm.js as raw bytes (base64). It follows Terminal.app: ⌘C/⌘V/⌘A/⌘K, ⌘F find, ⌘T/⌘W/⌘⇧[ ]/⌘1-9 tabs, ⌘+/-/0 font size (saved), ⌘←/→/⌫ and ⌥←/→/⌫ line and word editing, ⌘-click links, right-click menu, new tabs open in the current folder, a clean exit closes the tab, and the panel stays mounted while hidden so shells keep running. `emitFileMenuAction` redirects the File menu's ⌘C/⌘A/⌘⌫/⌘D to the terminal while it has focus. Split panes (`utils/terminalLayout.ts`): ⌘D top/bottom, ⌘⇧D side by side, ⌘W closes a pane, ⌘[ ]/⌘⌥arrows move focus, up to 6 per tab; panes render flat and are placed from the layout tree, so splitting never remounts a shell. Profiles (`utils/terminalProfiles.ts`, header palette menu) set colours and cursor per tab; the last chosen is the default. Prompt marks: Return marks the line (or OSC 133 when the shell emits it; a failed command's mark turns red), shown in the overview ruler, ⌘↑/⌘↓ jump. Session restore (`utils/terminalSession.ts`, `terminal_session_save/load/clear`, `terminal_session.json` 0600, preference `restoreTerminalSessions`) saves tabs, splits, folders, titles, profiles and the last 500 lines per pane every 10 s while something changed; restored output is plain text with control characters stripped.
- **Media** (`src-tauri/src/media.rs`): photo adjustments (image crate) and video trim/convert. Video uses a bundled `ffmpeg` sidecar in release builds (`npm run fetch:ffmpeg` / `build:mac`), an LGPL-only build compiled by `scripts/build-ffmpeg-lgpl.sh` (never ship Homebrew's GPL ffmpeg); otherwise Homebrew or PATH. H.264 uses libx264 when the ffmpeg has it and Apple's `h264_videotoolbox` otherwise (`pick_h264_encoder`). Missing ffmpeg shows a first-run toast and a banner in the video trim/convert UI.
- **Local files** (desktop app, `src-tauri/src/local_fs.rs`, `services/localFsBridge.ts`): the native folder picker adds a folder. Cloudbreak scans it, remembers it across launches (`local_roots.json` in the app data folder) and loads media through Tauri's asset protocol. The Local Files sidebar refresh button rescans all remembered folders from disk. Every read, write and rename is checked against the added folders: `..`, symlinks and paths outside them are refused (11 unit tests). Saving a text or HTML document writes it in place. An edited photo is saved as a new file next to the original. Renaming renames on disk. "Delete" moves a local file to the Trash (restorable; macOS Cocoa API, no Finder permission prompt). A video converted from a local file is read in place and saved with the native save dialog or a chosen folder (`local_save_from_temp`). Word, PDF and other formats the editor cannot produce are never overwritten. `src-tauri/Info.plist` holds the macOS permission texts.
- **Sidebar network & devices** (`src-tauri/src/mounted_volumes.rs`, `hooks/useSidebarSources.ts`): macOS lists mounted `/Volumes` and network shares via `getmntinfo`; saved SMB/NFS servers are probed over TCP and only marked online when they respond. Connect to Server opens the share in Finder and saves the entry; no demo NAS placeholders. Removable drives can be ejected via `diskutil`.
- **Media commands** (`media_read_temp`, `media_cleanup_temp`, `trim_video_stream`) only accept paths inside the app's temp media folder.
- **Cloud accounts** (`services/cloud/`): Google Drive (official Sign in with Google — PKCE + loopback in `oauth_google.rs`; needs `VITE_GOOGLE_OAUTH_CLIENT_ID`, see `docs/google-drive-oauth.md`), Dropbox and OneDrive (official OAuth PKCE + loopback in `oauth_pkce.rs`; need `VITE_DROPBOX_OAUTH_CLIENT_ID` / `VITE_MICROSOFT_OAUTH_CLIENT_ID`, see `docs/cloud-oauth.md`; adapters refresh tokens through `services/cloud/oauth/pkce.ts`), Nextcloud (Login Flow v2 → app password, `nextcloud_login_flow`), MEGA login (no official OAuth; password only). Google Drive also has "Quick sign-in (no setup)" through a bundled rclone sidecar (`src-tauri/src/rclone.rs`, `services/cloud/rclone.ts`, `npm run fetch:rclone`; token kept as `rcloneToken` in the keychain; a file is downloaded with `rclone copyto` into the media temp folder when opened or saved, `rclone_drive_fetch`). Pasting a token stays under Advanced. Saved connections are re-synced at launch (`hooks/useCloudAccounts.ts`). One that cannot be reached shows as offline. Provider tokens/passwords (including Google refresh tokens) live in the **OS keychain** on desktop (`src-tauri/src/credentials_store.rs` via the `keyring` crate); the browser preview still uses localStorage. Legacy localStorage entries are migrated into the keychain once and cleared.
- **Desktop shell**: signed, hardened-runtime, notarized macOS build. `macOSPrivateApi` is on so the transparent window works. The app icon is `src-tauri/icons/CloudBreak-icon.icon` (Icon Composer). The toolbar leaves room for the native window buttons.
- **Auto-updates** (`tauri-plugin-updater`): minisign pubkey in `tauri.conf.json`; manifest at GitHub Releases `latest.json`; Profile → Preferences “Check for updates”; CI signs with `TAURI_SIGNING_PRIVATE_KEY` (see `docs/auto-updates.md`).

## Layout
- `src/App.tsx` (about 630 lines) wires state together. Logic lives in hooks: `useFileActions`, `useVault`, `useP2pLibraries`, `useCloudAccounts`, `useNotifications`, `useSidebarSources`, plus `useResizablePanel`, `useToast`, `useGlobalShortcuts`.
- Big components are split into folders: `components/file-browser/`, `components/sidebar/`, `components/video-player/`, `components/document-editor/`.

## App icon
`src-tauri/icons/CloudBreak-icon.icon` is the Icon Composer source. Shipped builds use `icon.icns` (not `Assets.car`) because Tauri 2.12’s actool invocation fails on glass Icon Studio documents. Regenerate the classic icons from a render when the design changes:
1. `ictool src-tauri/icons/CloudBreak-icon.icon --export-image --output-file design/app-icon-1024.png --platform macOS --rendition Default --width 1024 --height 1024 --scale 1` (`ictool` is in Xcode's Icon Composer.app)
2. `npx tauri icon design/app-icon-1024.png -o /tmp/icons`
3. Copy those six files into `src-tauri/icons/`. `public/icon.png` is the web favicon.

## Not verified
- Things that need a person at the screen: the native folder picker and save dialog, the macOS permission prompts (Desktop, Documents, Downloads, external drives), and actually dragging the window by the toolbar. The self-test confirms the drag permission is granted, that 55% of the toolbar is draggable space, and that the toolbar clears the native window buttons by 8px, but it cannot send mouse events.
- A real first launch on a second Mac or fresh user account (Gatekeeper prompt). A simulated quarantined download on the dev Mac passed.
- `.github/workflows/release.yml` has never been run.

## Remaining work
- The Windows build is only configured in the workflow. It is untested and unsigned.
- Linux Flatpak packaging is in-repo (`flatpak/`, `npm run build:flatpak`); CI builds it on Ubuntu. Flathub from-source submission is not done yet.
