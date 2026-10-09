#!/usr/bin/env bash
# Generate (or regenerate) the Tauri updater signing key pair.
# Private key stays outside the repo. Public key is printed for tauri.conf.json.
set -euo pipefail

KEY_PATH="${TAURI_UPDATER_KEY_PATH:-$HOME/.tauri/cloudbreak-files.key}"
mkdir -p "$(dirname "$KEY_PATH")"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE=()
if [[ "${1:-}" == "--force" ]]; then
  FORCE+=(-f)
fi

if [[ -f "$KEY_PATH" && ${#FORCE[@]} -eq 0 ]]; then
  echo "Private key already exists at $KEY_PATH"
  echo "Public key:"
  cat "${KEY_PATH}.pub"
  echo ""
  echo "Re-run with --force to overwrite (breaks updates for already-shipped builds)."
  exit 0
fi

npx tauri signer generate -w "$KEY_PATH" --ci "${FORCE[@]}"
chmod 600 "$KEY_PATH" "${KEY_PATH}.pub" 2>/dev/null || true

echo ""
echo "Paste the public key into src-tauri/tauri.conf.json → plugins.updater.pubkey"
echo "Store the private key as GitHub secret TAURI_SIGNING_PRIVATE_KEY (file contents)."
echo "Local builds: export TAURI_SIGNING_PRIVATE_KEY=\"$KEY_PATH\""
