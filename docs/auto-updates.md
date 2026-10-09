# Auto-updates (Tauri updater)

Cloudbreak uses [`tauri-plugin-updater`](https://v2.tauri.app/plugin/updater/) with a **minisign key pair** and a static **`latest.json`** manifest on GitHub Releases.

## What is wired

| Piece | Location |
|--------|----------|
| Public key + endpoints | `src-tauri/tauri.conf.json` → `plugins.updater` |
| Updater artifacts on build | `bundle.createUpdaterArtifacts: true` |
| Rust plugins | `tauri-plugin-updater`, `tauri-plugin-process` in `lib.rs` |
| Capabilities | `updater:default`, `process:default` |
| In-app check | Profile → Preferences → **Check for updates**; quiet toast on launch |
| Release CI | `.github/workflows/release.yml` signs with `TAURI_SIGNING_PRIVATE_KEY` |

Endpoint (hosted manifest):

```text
https://github.com/azevedomedia0/CloudBreak-Files/releases/latest/download/latest.json
```

`tauri-apps/tauri-action` generates and uploads `latest.json` when the updater is configured and the signing key is present.

## One-time: key pair

Keys were generated for this maintainer machine at:

- Private: `~/.tauri/cloudbreak-files.key` (**never commit**)
- Public: `~/.tauri/cloudbreak-files.key.pub` (contents already in `tauri.conf.json`)

Regenerate only if you intentionally rotate (breaks updates for already-shipped apps):

```bash
npm run updater:keys
# or force:
bash scripts/generate-updater-keys.sh --force
# then paste the new .pub contents into tauri.conf.json → plugins.updater.pubkey
```

## Secrets

| Secret / env | Purpose |
|--------------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | Private key **file contents** (or local path for `npm run build:mac`) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Optional; empty if the key has no password |

Both secrets are set on `azevedomedia0/CloudBreak-Files` (private key from `~/.tauri/cloudbreak-files.key`; password empty). Rotate by regenerating keys and re-running:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY -R azevedomedia0/CloudBreak-Files < ~/.tauri/cloudbreak-files.key
printf '' | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD -R azevedomedia0/CloudBreak-Files
```

Local:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/cloudbreak-files.key"
npm run build:mac
```

`scripts/build-macos-release.sh` picks up `~/.tauri/cloudbreak-files.key` automatically when the env var is unset.

## Manifest shape

`latest.json` (example):

```json
{
  "version": "0.1.1",
  "notes": "Bug fixes",
  "pub_date": "2026-10-09T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<contents of Cloudbreak Files.app.tar.gz.sig>",
      "url": "https://github.com/azevedomedia0/CloudBreak-Files/releases/download/v0.1.1/Cloudbreak%20Files.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "<same universal .sig if one artifact, or x86_64-specific>",
      "url": "https://github.com/azevedomedia0/CloudBreak-Files/releases/download/v0.1.1/Cloudbreak%20Files.app.tar.gz"
    }
  }
}
```

Universal macOS builds typically publish one `.app.tar.gz` used for both `darwin-aarch64` and `darwin-x86_64`.

## Public manifest URL

The repo is **public**, so anonymous clients can fetch:

`https://github.com/azevedomedia0/CloudBreak-Files/releases/latest/download/latest.json`

(404 until the first published release that includes `latest.json`.) A private repo would block that download — keep Releases on this public repo, or point `plugins.updater.endpoints` at a public CDN.

## Verify after a release

1. Bump `version` in `src-tauri/tauri.conf.json`, tag `v*`, publish the draft release.
2. Confirm the release assets include `.app.tar.gz`, `.sig`, and `latest.json`.
3. Install an older build, open **Profile → Preferences → Check for updates**, or wait for the launch toast.
