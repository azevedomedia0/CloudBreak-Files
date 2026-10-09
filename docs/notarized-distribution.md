# Notarized direct distribution (macOS)

Ship a signed, notarized `.dmg` from our own site instead of the Mac App Store. The Developer ID Application certificate (`Your Name (TEAM_ID)`) is already installed.

## 1. Get the desktop app to launch (blocker)
- `CLAUDE.md` says the app has never run under Tauri. The CSP, the on-disk `vault.json`, and the transparent window are untested.
- Run `npm run tauri dev`. Check that the window opens, the vault unlocks, and `vault.json` is written.
- Decide on window transparency. Direct distribution allows Tauri's `macos-private-api` feature, so enable it or drop `"transparent": true`.

## 2. Configure signing in `src-tauri/tauri.conf.json`
- Add a `bundle.macOS` block: `signingIdentity`, `hardenedRuntime: true`, `minimumSystemVersion`, optional `entitlements` file. Hardened runtime is required for notarization.
- Add a `category` (e.g. `public.app-category.productivity`).
- Probably no special entitlements are needed. If a test build is blocked, add only the entitlement it needs.

## 3. Notarization credentials (one time)
- Create an App Store Connect **Team** API key with Developer access (Users and Access, Integrations), or an app-specific password at account.apple.com. Keep the `.p8` file outside the repo and outside any synced folder (for example `~/.private_keys/`, mode 600).
- With an API key, export `APPLE_SIGNING_IDENTITY`, `APPLE_API_ISSUER` (the Issuer ID UUID), `APPLE_API_KEY` (the Key ID) and `APPLE_API_KEY_PATH`.
- With an app-specific password, export `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID`.
- Never commit these values, and never paste them into docs, issues or chat.

## 4. Build a universal app
```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```
With the variables set, Tauri signs, submits to Apple, waits, and staples. Output: `.app` and `.dmg`.

## 5. Verify before shipping
- `codesign --verify --deep --strict --verbose=2 <app>`
- `spctl -a -vv <app>` should say "accepted, source=Notarized Developer ID"
- `xcrun stapler validate <dmg>`
- Download the DMG through a browser (so it is quarantined) onto a second Mac or a fresh user account and open it.

## 6. Publish
- Upload the DMG to a GitHub Release tagged with the version.
- Point the website's "Download for Mac" button at it (it currently links to `#download`).
- The repo is private, so release downloads will not work publicly. Use a public releases repo or our own hosting.

## 7. Automation and other platforms
- `.github/workflows/release.yml` builds macOS (universal, signed, notarized) and Windows on a `v*` tag and uploads them to a draft release. It has not been run yet.
- Repository secrets it needs: `APPLE_CERTIFICATE` (base64 of the exported Developer ID `.p12`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_P8` (the key file contents).
- The Windows installer is unsigned and will show a SmartScreen warning until the app is code-signed. There is no Linux build.
- Auto-updates (`tauri-plugin-updater`) are not set up. They need an updater key pair that only the maintainer should generate and keep, and a place to host the update manifest.

## Risks to settle first
- Still demo or limited: the in-session encryption limit is 32 MB per file, and P2P sharing passes files as base64, so "any file size" on the site is not accurate. Video trim and convert need `ffmpeg` on PATH, which a downloaded app will not have unless it is bundled.
- The site's "True E2EE" claim is backed by the P2P library code (chunk encryption and key wrapping), but make sure the wording matches the real limits above.
- A clean-machine test may show missing permission prompts (folders, network) that do not appear on the dev Mac.
