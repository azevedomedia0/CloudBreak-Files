# Cloudbreak relay

A small server that carries a peer-to-peer connection between two devices that cannot reach each other
directly, because neither router lets a stranger in. Both devices connect **out** to the relay, which joins
them and copies bytes. It stores nothing, and it cannot read a library: the devices run their own access
check (a proof of the invite's token) and exchange encrypted chunks through it.

The relay sees which IP addresses connect, the peer ids, when, and how much is transferred.

## Run it

You need a machine with a public address and one open TCP port (default 7422).

```bash
cd relay
cargo build --release
./target/release/cloudbreak-relay --listen 0.0.0.0:7422 --host-key "choose-a-password"
```

`--host-key` (or `CLOUDBREAK_RELAY_HOST_KEY`) is optional but recommended: without it anyone can use your relay
to host, and its bandwidth is yours. Only devices that **host** need the key; people you invite never do.
`--max-sessions` limits how many connections are joined at once (default 256).

A systemd unit:

```ini
[Unit]
Description=Cloudbreak relay
After=network-online.target

[Service]
ExecStart=/usr/local/bin/cloudbreak-relay --listen 0.0.0.0:7422
Environment=CLOUDBREAK_RELAY_HOST_KEY=choose-a-password
Restart=always
DynamicUser=yes

[Install]
WantedBy=multi-user.target
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
