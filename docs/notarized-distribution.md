# Notarized direct distribution (macOS)

Ship a signed, notarized `.dmg` from our own site instead of the Mac App Store. The Developer ID Application certificate (`Steven Azevedo (X8NUFM9WY7)`) is already installed.

## 1. Get the desktop app to launch (blocker)
- `CLAUDE.md` says the app has never run under Tauri. The CSP, the on-disk `vault.json`, and the transparent window are untested.
- Run `npm run tauri dev`. Check that the window opens, the vault unlocks, and `vault.json` is written.
- Decide on window transparency. Direct distribution allows Tauri's `macos-private-api` feature, so enable it or drop `"transparent": true`.

## 2. Configure signing in `src-tauri/tauri.conf.json`
- Add a `bundle.macOS` block: `signingIdentity`, `hardenedRuntime: true`, `minimumSystemVersion`, optional `entitlements` file. Hardened runtime is required for notarization.
- Add a `category` (e.g. `public.app-category.productivity`).
- Probably no special entitlements are needed. If a test build is blocked, add only the entitlement it needs.

## 3. Notarization credentials (one time)
- Create an app-specific password at appleid.apple.com, or an App Store Connect API key.
- Set `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID=X8NUFM9WY7` in the shell. Never commit them.

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

## 7. Later
- GitHub Actions on a macOS runner, with the certificate and credentials as secrets.
- `tauri-plugin-updater` with its own signing key for auto-updates.
- Windows and Linux build paths (Linux is "coming soon" on the site).

## Risks to settle first
- Unfinished features: the media tools return "not implemented" and the encrypt buttons are demo flags. Label the release a 0.1 beta or hide them.
- The site claims "True E2EE" file sharing. Make sure the shipped app matches.
- A clean-machine test may show missing permission prompts (folders, network) that do not appear on the dev Mac.
