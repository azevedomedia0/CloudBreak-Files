#!/usr/bin/env bash
# Install the relay as a systemd service. Run from the relay/ directory, as root, with the built binary:
#   cargo build --release --bin cloudbreak-relay
#   sudo bash deploy/install-systemd.sh target/release/cloudbreak-relay
set -euo pipefail

BIN="${1:-}"
if [[ -z "$BIN" || ! -x "$BIN" ]]; then
  echo "usage: sudo bash deploy/install-systemd.sh <path to built cloudbreak-relay>" >&2
  exit 2
fi
if [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root (sudo)" >&2
  exit 2
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
install -m 0755 "$BIN" /usr/local/bin/cloudbreak-relay
install -d -m 0750 /etc/cloudbreak-relay
if [[ ! -f /etc/cloudbreak-relay/relay.env ]]; then
  install -m 0600 "$HERE/relay.env.example" /etc/cloudbreak-relay/relay.env
  echo "Created /etc/cloudbreak-relay/relay.env. Set CLOUDBREAK_RELAY_HOST_KEY there, then run this script again."
  exit 0
fi
if grep -q "replace-with-a-long-random-value" /etc/cloudbreak-relay/relay.env; then
  echo "Set a real CLOUDBREAK_RELAY_HOST_KEY in /etc/cloudbreak-relay/relay.env first." >&2
  exit 1
fi
install -m 0644 "$HERE/cloudbreak-relay.service" /etc/systemd/system/cloudbreak-relay.service
systemctl daemon-reload
systemctl enable --now cloudbreak-relay
systemctl --no-pager status cloudbreak-relay || true
