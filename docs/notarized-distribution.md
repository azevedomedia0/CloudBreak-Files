# Notarized direct distribution (macOS)

Ship a signed, notarized `.dmg` from our own site instead of the Mac App Store.

## Current state

- **Release config** is in `src-tauri/tauri.conf.json`: `hardenedRuntime`, `minimumSystemVersion` 11.0 (Big Sur+), `Entitlements.plist`, productivity category, `.app` + `.dmg` targets.
- **Architectures**: `npm run build:mac` and CI build `universal-apple-darwin` (Apple Silicon **and** Intel x86_64), including a universal `ffmpeg` sidecar. The build script fails if either arch is missing from the app binary.
- **Icon Composer source** lives at `src-tauri/icons/CloudBreak-icon.icon` for regenerating `icon.icns` / PNGs. It is **not** listed in `bundle.icon` because Tauri 2.12 invokes `actool` with flags that fail on glass Icon Studio documents (`Bad file descriptor`). The shipped app uses `icon.icns` until Tauri or `actool` fixes that path.
- **Local build**: `npm run build:mac` (wrapper around `scripts/build-macos-release.sh`). Uses `CARGO_TARGET_DIR=/tmp/cloudbreak-cargo-target` by default so OneDrive does not sync Rust artifacts.
- **CI**: `.github/workflows/release.yml` on `v*` tags — universal macOS (signed + notarized when secrets are set) and Windows. Builds upload to a **draft** prerelease.

## 1. Smoke-test the desktop app

- `npm run tauri dev` — window, vault unlock, `vault.json` in app data.
- `npm run test:app` — automated checks in a throwaway data dir (debug build, port 3000, ffmpeg).

## 2. Signing identity (local)

Developer ID Application must be in the login keychain:

```bash
security find-identity -v -p codesigning
```

Export the full name (including team id in parentheses) as:

```bash
export APPLE_SIGNING_IDENTITY='Developer ID Application: … (TEAM_ID)'
```

Optional: set `bundle.macOS.signingIdentity` in `tauri.conf.json` instead of the env var.

## 3. Notarization credentials (one time)

Create an App Store Connect **Team** API key (Users and Access → Integrations), or an app-specific password. Keep the `.p8` outside the repo and outside synced folders (e.g. `~/.private_keys/`, mode 600).

**Local (recommended):** put exports in `~/.config/cloudbreak/apple-notarization.env` (mode `600`). `npm run build:mac` / `scripts/build-macos-release.sh` sources that file automatically. A one-line `source` in `~/.zshrc` is optional for interactive shells.

**API key (recommended for CI and local):**

- `APPLE_SIGNING_IDENTITY`
- `APPLE_API_ISSUER` — Issuer ID UUID
- `APPLE_API_KEY` — Key ID
- `APPLE_API_KEY_PATH` — path to `AuthKey_<KEY_ID>.p8`

**App-specific password:**

- `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`

Never commit or paste these values into the repo, docs, or chat.

## 4. Build

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # once (build script also installs these)
MACOSX_DEPLOYMENT_TARGET=11.0 npm run build:mac
# Confirm Intel + Apple Silicon slices:
#   lipo -archs "/tmp/cloudbreak-cargo-target/.../Cloudbreak Files.app/Contents/MacOS/Cloudbreak Files"
```

Equivalent: `npm run tauri build -- --target universal-apple-darwin` with `CARGO_TARGET_DIR` set as above.

With signing + notarization env vars set, Tauri signs, submits to Apple, waits, and staples. Output under `$CARGO_TARGET_DIR/.../release/bundle/`: `.app` and `.dmg`.

If bundling fails with `Failed to create app Assets.car`, confirm `CloudBreak-icon.icon` is **not** in `bundle.icon` (see Current state). You can also run `pkill -x ibtoold` and rebuild.

## 5. Verify before shipping

```bash
codesign --verify --deep --strict --verbose=2 "<path>/Cloudbreak Files.app"
spctl -a -vv "<path>/Cloudbreak Files.app"    # expect notarized Developer ID after notarization
xcrun stapler validate "<path>.dmg"
```

Download the DMG in a browser (quarantine) on a second Mac or fresh user account and open it.

## 6. Publish

- Upload the DMG to a GitHub Release (tag `v*` triggers CI) or host elsewhere.
- Point the website “Download for Mac” at the public URL. The marketing site section `#download` still links to the web preview until a stable download URL exists.
- Private repo: public release assets need a public releases repo or non-GitHub hosting.

## 7. GitHub Actions secrets

For `.github/workflows/release.yml`:

| Secret | Purpose |
|--------|---------|
| `APPLE_CERTIFICATE` | Base64 of exported Developer ID `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` export password |
| `APPLE_SIGNING_IDENTITY` | Full codesign identity string |
| `APPLE_API_ISSUER` | App Store Connect Issuer ID |
| `APPLE_API_KEY` | API Key ID |
| `APPLE_API_KEY_P8` | Contents of the `.p8` file |
| `TAURI_SIGNING_PRIVATE_KEY` | Updater private key file contents (`~/.tauri/cloudbreak-files.key`) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Optional updater key password (omit if empty) |

Push a `v*` tag (or run workflow_dispatch), test the draft release installers, then publish the release.

Updater + Apple signing secrets are on the repo (`TAURI_SIGNING_*`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_P8`). Local builds use `~/.config/cloudbreak/apple-notarization.env` (see §3). Without issuer + API key, builds sign with Developer ID but skip notarization.

Auto-updates: see [`docs/auto-updates.md`](./auto-updates.md).

## Other platforms and follow-ups

- Windows installer from the same workflow is **unsigned** (SmartScreen warning).
- No Linux build in CI.
- Video tools: `npm run build:mac` fetches and embeds ffmpeg (`scripts/fetch-ffmpeg.sh`). Dev builds without it show a first-run toast and an in-player banner.

## Product limits (wording / support)

- Vault: 32 MB IPC path for small blobs; desktop local files use streaming encrypt. P2P prefers `localPath` ingest / materialize over base64.
- Video trim/convert: release builds embed ffmpeg; otherwise install via Homebrew or use the in-app message.
