# Cloudbreak relay

A small server that carries a peer-to-peer connection between two devices that cannot reach each other
directly, because neither router lets a stranger in. Both devices connect **out** to the relay, which joins
them and copies bytes. It stores nothing, and it cannot read a library: the devices run their own access
check (a proof of the invite's token) and exchange encrypted chunks through it.

The relay sees which IP addresses connect, the peer ids, when, and how much is transferred.

## Run it

You need a machine with a public address and one open TCP port (default 7422). Set a host key first. It is the
password for who may host on your relay, so use a long random value:

```bash
openssl rand -hex 24
```

`CLOUDBREAK_RELAY_HOST_KEY` is optional but strongly recommended: without it anyone can use your relay to host, and
its bandwidth is yours. Only devices that **host** need the key; people you invite never do. Keep it in the
environment rather than on the command line, where `ps` shows it. `--max-sessions` limits how many connections are
joined at once (default 256).

### Docker

```bash
cd relay
echo "CLOUDBREAK_RELAY_HOST_KEY=$(openssl rand -hex 24)" > .env
docker compose up -d --build
```

The image is built from `Dockerfile` (a Rust build stage, then a small Debian image that runs as a non-root user).
`docker-compose.yml` runs it read-only with no extra Linux capabilities. Without Compose:

```bash
docker build -t cloudbreak-relay .
docker run -d --restart unless-stopped -p 7422:7422 -e CLOUDBREAK_RELAY_HOST_KEY="$KEY" cloudbreak-relay
```

### systemd (a Linux server, no containers)

Build the binary, then run the installer as root:

```bash
cargo build --release --bin cloudbreak-relay
sudo bash deploy/install-systemd.sh target/release/cloudbreak-relay
```

The first run writes `/etc/cloudbreak-relay/relay.env` (mode 0600) and stops. Set `CLOUDBREAK_RELAY_HOST_KEY` in
that file, then run the script again. The service is `deploy/cloudbreak-relay.service`: it runs as a dynamic user
with a read-only system, no capabilities, and only IPv4/IPv6 sockets, and restarts on failure. Check it with:

```bash
systemctl status cloudbreak-relay
journalctl -u cloudbreak-relay -f
```

### Plain command

```bash
cargo build --release
CLOUDBREAK_RELAY_HOST_KEY=choose-a-long-random-value ./target/release/cloudbreak-relay --listen 0.0.0.0:7422
```

## Use it

In Cloudbreak Files, on each device that shares libraries: **Preferences → Network → Relay server**, enter
`your.host.name:7422` (and the key, if you set one) and click Save & Apply. Invites copied afterwards carry the
relay's address next to the usual ones, so the person you invite needs no setup.

The relay does not encrypt the connection between you and it. Library contents and manifests are encrypted
before they are sent, as for any P2P connection.

## Protocol

ASCII lines, each ending in `\n`, at most 256 bytes. Everything after an `OK` belongs to the two devices.

| Who | Sends | Answer |
|---|---|---|
| Host, once, kept open | `LISTEN <id> <secret> [key]` | `OK`, then `INCOMING <session>` per dialer and `PING` every 30 s |
| Host, per session, on a new connection | `ACCEPT <session>` | `OK`, then the devices talk |
| Dialer | `CONNECT <id>` | `OK` once the host has accepted, or `ERR <reason>` |

`id` is the SHA-256 of `secret` (64 hex characters each), so only the holder of the secret can answer for an id.
The device derives its secret from its identity key, so it keeps the same id between launches.

## Tests

```bash
cargo test
```

The Docker image and the systemd unit were not run on a server while writing this (the Docker build needs
the `rust` and `debian` base images; `systemd-analyze verify` needs a Linux machine).
