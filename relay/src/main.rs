//! `cloudbreak-relay [--listen ADDR] [--host-key KEY] [--max-sessions N] [--names-file PATH]`
//!
//! Run it on a machine with a public address and open its port (default 7422). Then put its address in
//! Cloudbreak Files → Preferences → Network on each device that shares a library. People who are invited
//! need nothing: the relay's address is part of the invite.

use cloudbreak_relay::{serve, RelayConfig, DEFAULT_PORT};
use tokio::net::TcpListener;

fn usage() -> ! {
    eprintln!("usage: cloudbreak-relay [--listen ADDR:PORT] [--host-key KEY] [--max-sessions N] [--names-file PATH]\n  (the key can also be set with CLOUDBREAK_RELAY_HOST_KEY, the names file with CLOUDBREAK_RELAY_NAMES_FILE)");
    std::process::exit(2)
}

#[tokio::main]
async fn main() {
    let mut listen = format!("0.0.0.0:{DEFAULT_PORT}");
    let mut config = RelayConfig { host_key: std::env::var("CLOUDBREAK_RELAY_HOST_KEY").ok().filter(|k| !k.is_empty()), ..Default::default() };
    config.names_file = std::env::var_os("CLOUDBREAK_RELAY_NAMES_FILE").filter(|p| !p.is_empty()).map(Into::into);
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--listen" => listen = args.next().unwrap_or_else(|| usage()),
            "--host-key" => config.host_key = Some(args.next().unwrap_or_else(|| usage())),
            "--max-sessions" => config.max_sessions = args.next().and_then(|n| n.parse().ok()).unwrap_or_else(|| usage()),
            "--names-file" => config.names_file = Some(args.next().unwrap_or_else(|| usage()).into()),
            _ => usage(),
        }
    }
    let listener = match TcpListener::bind(&listen).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("cannot listen on {listen}: {e}");
            std::process::exit(1);
        }
    };
    eprintln!(
        "cloudbreak-relay listening on {listen}; hosting {}",
        if config.host_key.is_some() { "needs the key" } else { "is open to anyone (set --host-key to restrict it)" }
    );
    serve(listener, config).await;
}
