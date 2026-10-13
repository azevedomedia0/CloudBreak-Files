//! Opt-in router port mapping, so peers on other networks can reach this Mac's P2P listener.
//!
//! Off by default (Preferences → "Allow connections from other networks"). When on, the app asks
//! the router itself to forward the listener's TCP port: NAT-PMP first (one UDP exchange with the
//! router; Apple and many home routers), then UPnP IGD. Nothing here talks to anything but the local
//! router: there is no STUN, relay or rendezvous server.
//!
//! It cannot help when the router's own internet address is not public (carrier-grade NAT, common
//! on mobile and some fibre connections): that is detected and reported, and no address is offered.
//! What the listener then serves is limited by the access tokens in `swarm.rs`, not by this module.

use serde::Serialize;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket};
use std::time::Duration;

/// How long a mapping lasts before the router drops it; renewed at half this.
pub const LEASE_SECS: u32 = 3600;
const NATPMP_PORT: u16 = 5351;
const DESCRIPTION: &str = "Cloudbreak Files P2P";

/// What the settings panel shows.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAccessStatus {
    /// The person turned the setting on (whether or not the router went along with it).
    pub enabled: bool,
    /// `ip:port` peers on other networks can dial, when mapping worked.
    pub public_address: Option<String>,
    /// `NAT-PMP` or `UPnP`.
    pub method: Option<String>,
    /// What happened, in words.
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    /// NAT-PMP with this gateway.
    NatPmp(Ipv4Addr),
    Upnp,
}

impl Method {
    pub fn label(self) -> &'static str {
        match self {
            Method::NatPmp(_) => "NAT-PMP",
            Method::Upnp => "UPnP",
        }
    }
}

/// A port the router is forwarding to this Mac.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Mapping {
    pub method: Method,
    pub external_ip: Ipv4Addr,
    pub external_port: u16,
    pub internal_port: u16,
}

/// Whether peers on the internet can reach this address. Private, loopback, link-local,
/// documentation and carrier-grade NAT (100.64.0.0/10) addresses cannot.
pub fn is_publicly_routable(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    let shared = a == 100 && (b & 0xc0) == 64;
    !(ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || ip.is_documentation()
        || shared)
}

// --- NAT-PMP (RFC 6886) ---------------------------------------------------------------------

/// "What is your external address?"
pub fn natpmp_external_request() -> [u8; 2] {
    [0, 0]
}

/// "Forward TCP `internal` (ideally as `external`) for `lifetime` seconds." Lifetime 0 removes it.
pub fn natpmp_map_request(internal: u16, external: u16, lifetime: u32) -> [u8; 12] {
    let mut b = [0u8; 12];
    b[1] = 2; // opcode 2: map TCP
    b[4..6].copy_from_slice(&internal.to_be_bytes());
    b[6..8].copy_from_slice(&external.to_be_bytes());
    b[8..12].copy_from_slice(&lifetime.to_be_bytes());
    b
}

fn natpmp_result(code: u16) -> Result<(), String> {
    match code {
        0 => Ok(()),
        1 => Err("the router does not speak this NAT-PMP version".into()),
        2 => Err("the router refused (port mapping is turned off in its settings)".into()),
        3 => Err("the router has no internet connection".into()),
        4 => Err("the router is out of port mappings".into()),
        5 => Err("the router does not support this request".into()),
        other => Err(format!("the router answered with error {other}")),
    }
}

pub fn natpmp_parse_external(resp: &[u8]) -> Result<Ipv4Addr, String> {
    if resp.len() < 12 || resp[0] != 0 || resp[1] != 128 {
        return Err("unexpected NAT-PMP reply".into());
    }
    natpmp_result(u16::from_be_bytes([resp[2], resp[3]]))?;
    Ok(Ipv4Addr::new(resp[8], resp[9], resp[10], resp[11]))
}

/// The router's answer to a map request: (external port, lifetime).
pub fn natpmp_parse_map(resp: &[u8], internal: u16) -> Result<(u16, u32), String> {
    if resp.len() < 16 || resp[0] != 0 || resp[1] != 130 {
        return Err("unexpected NAT-PMP reply".into());
    }
    natpmp_result(u16::from_be_bytes([resp[2], resp[3]]))?;
    if u16::from_be_bytes([resp[8], resp[9]]) != internal {
        return Err("the router answered for a different port".into());
    }
    let external = u16::from_be_bytes([resp[10], resp[11]]);
    let lifetime = u32::from_be_bytes([resp[12], resp[13], resp[14], resp[15]]);
    Ok((external, lifetime))
}

/// One request/response with the gateway, retried with growing waits (RFC 6886 starts at 250 ms).
fn natpmp_exchange(gateway: Ipv4Addr, request: &[u8]) -> Result<Vec<u8>, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket
        .connect(SocketAddrV4::new(gateway, NATPMP_PORT))
        .map_err(|e| e.to_string())?;
    let mut buf = [0u8; 16];
    for wait_ms in [250u64, 500, 1000] {
        socket.send(request).map_err(|e| e.to_string())?;
        socket
            .set_read_timeout(Some(Duration::from_millis(wait_ms)))
            .map_err(|e| e.to_string())?;
        if let Ok(n) = socket.recv(&mut buf) {
            return Ok(buf[..n].to_vec());
        }
    }
    Err("the router did not answer NAT-PMP".into())
}

fn natpmp_map(gateway: Ipv4Addr, internal: u16, lifetime: u32) -> Result<Mapping, String> {
    let ip = natpmp_parse_external(&natpmp_exchange(gateway, &natpmp_external_request())?)?;
    let (external_port, _) =
        natpmp_parse_map(&natpmp_exchange(gateway, &natpmp_map_request(internal, internal, lifetime))?, internal)?;
    Ok(Mapping {
        method: Method::NatPmp(gateway),
        external_ip: ip,
        external_port,
        internal_port: internal,
    })
}

// --- Finding the router ---------------------------------------------------------------------

/// The default gateway from `route -n get default` output (macOS).
pub fn parse_route_get(output: &str) -> Option<Ipv4Addr> {
    output
        .lines()
        .find_map(|line| line.trim().strip_prefix("gateway:"))
        .and_then(|value| value.trim().parse().ok())
}

/// The default gateway from `/proc/net/route` (Linux): the row whose destination is 00000000,
/// gateway in little-endian hex.
pub fn parse_proc_net_route(table: &str) -> Option<Ipv4Addr> {
    table.lines().skip(1).find_map(|line| {
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 3 || cols[1] != "00000000" {
            return None;
        }
        let raw = u32::from_str_radix(cols[2], 16).ok()?;
        if raw == 0 {
            return None;
        }
        Some(Ipv4Addr::from(raw.to_le_bytes()))
    })
}

fn default_gateway() -> Option<Ipv4Addr> {
    if cfg!(target_os = "macos") {
        let out = std::process::Command::new("/sbin/route")
            .args(["-n", "get", "default"])
            .output()
            .ok()?;
        parse_route_get(&String::from_utf8_lossy(&out.stdout))
    } else if cfg!(target_os = "linux") {
        parse_proc_net_route(&std::fs::read_to_string("/proc/net/route").ok()?)
    } else {
        None
    }
}

// --- UPnP IGD ------------------------------------------------------------------------------

async fn upnp_gateway() -> Result<igd_next::aio::Gateway<igd_next::aio::tokio::Tokio>, String> {
    let mut options = igd_next::SearchOptions::default();
    options.timeout = Some(Duration::from_secs(3));
    igd_next::aio::tokio::search_gateway(options)
        .await
    .map_err(|e| format!("no UPnP router answered ({e})"))
}

async fn upnp_map(local_ip: Ipv4Addr, internal: u16, lifetime: u32) -> Result<Mapping, String> {
    let gateway = upnp_gateway().await?;
    let ip = match gateway.get_external_ip().await.map_err(|e| format!("the UPnP router did not say its address ({e})"))? {
        std::net::IpAddr::V4(v4) => v4,
        std::net::IpAddr::V6(_) => return Err("the UPnP router reported an IPv6 address".into()),
    };
    gateway
        .add_port(
            igd_next::PortMappingProtocol::TCP,
            internal,
            SocketAddr::V4(SocketAddrV4::new(local_ip, internal)),
            lifetime,
            DESCRIPTION,
        )
        .await
        .map_err(|e| format!("the UPnP router refused the mapping ({e})"))?;
    Ok(Mapping {
        method: Method::Upnp,
        external_ip: ip,
        external_port: internal,
        internal_port: internal,
    })
}

// --- What the app calls --------------------------------------------------------------------

/// Ask the router to forward `internal_port` here. NAT-PMP first, then UPnP. The error names
/// what each one said, so the settings panel can tell the person what to change.
pub async fn map(internal_port: u16) -> Result<Mapping, String> {
    let local_ip = crate::p2p::swarm::lan_ipv4().ok_or("This Mac is not connected to a network.")?;
    let mut reasons = Vec::new();
    if let Some(gateway) = default_gateway() {
        match tokio::task::spawn_blocking(move || natpmp_map(gateway, internal_port, LEASE_SECS)).await {
            Ok(Ok(mapping)) => return Ok(mapping),
            Ok(Err(e)) => reasons.push(format!("NAT-PMP: {e}")),
            Err(e) => reasons.push(format!("NAT-PMP: {e}")),
        }
    }
    match upnp_map(local_ip, internal_port, LEASE_SECS).await {
        Ok(mapping) => Ok(mapping),
        Err(e) => {
            reasons.push(format!("UPnP: {e}"));
            Err(reasons.join("; "))
        }
    }
}

/// Renew the same mapping before its lease runs out.
pub async fn renew(mapping: &Mapping) -> Result<Mapping, String> {
    match mapping.method {
        Method::NatPmp(gateway) => {
            let internal = mapping.internal_port;
            tokio::task::spawn_blocking(move || natpmp_map(gateway, internal, LEASE_SECS))
                .await
                .map_err(|e| e.to_string())?
        }
        Method::Upnp => {
            let local_ip = crate::p2p::swarm::lan_ipv4().ok_or("This Mac is not connected to a network.")?;
            upnp_map(local_ip, mapping.internal_port, LEASE_SECS).await
        }
    }
}

/// Take the mapping back down. Best effort: the lease ends on its own within the hour anyway.
pub async fn unmap(mapping: &Mapping) {
    match mapping.method {
        Method::NatPmp(gateway) => {
            let internal = mapping.internal_port;
            let _ = tokio::task::spawn_blocking(move || {
                natpmp_exchange(gateway, &natpmp_map_request(internal, 0, 0))
            })
            .await;
        }
        Method::Upnp => {
            if let Ok(gateway) = upnp_gateway().await {
                let _ = gateway
                    .remove_port(igd_next::PortMappingProtocol::TCP, mapping.external_port)
                    .await;
            }
        }
    }
}

/// The status line for a mapping, or for why there is none.
pub fn describe(result: &Result<Mapping, String>) -> RemoteAccessStatus {
    match result {
        Ok(m) if is_publicly_routable(m.external_ip) => RemoteAccessStatus {
            enabled: true,
            public_address: Some(format!("{}:{}", m.external_ip, m.external_port)),
            method: Some(m.method.label().into()),
            message: format!(
                "Reachable from other networks at {}:{} ({}). Invites you copy from now on include this address.",
                m.external_ip,
                m.external_port,
                m.method.label()
            ),
        },
        Ok(m) => RemoteAccessStatus {
            enabled: true,
            public_address: None,
            method: Some(m.method.label().into()),
            message: format!(
                "Your router forwarded the port, but its own address ({}) is not on the public internet: your provider shares one address among many customers (carrier-grade NAT). Devices on other networks still cannot connect.",
                m.external_ip
            ),
        },
        Err(reasons) => RemoteAccessStatus {
            enabled: true,
            public_address: None,
            method: None,
            message: format!(
                "Your router did not open a port ({reasons}). Turn on UPnP or NAT-PMP in its settings, or forward TCP port {} to this Mac by hand.",
                crate::p2p::protocol::DEFAULT_PORT
            ),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn natpmp_requests_are_laid_out_as_the_rfc_says() {
        assert_eq!(natpmp_external_request(), [0, 0]);
        let req = natpmp_map_request(7421, 7421, 3600);
        assert_eq!(req, [0, 2, 0, 0, 0x1c, 0xfd, 0x1c, 0xfd, 0, 0, 0x0e, 0x10]);
        // Lifetime 0 with external port 0 removes the mapping.
        assert_eq!(&natpmp_map_request(7421, 0, 0)[6..], &[0, 0, 0, 0, 0, 0]);
    }

    #[test]
    fn natpmp_replies_are_read_and_refusals_explained() {
        let external = [0, 128, 0, 0, 0, 0, 0, 9, 203, 0, 113, 7];
        assert_eq!(natpmp_parse_external(&external).unwrap(), Ipv4Addr::new(203, 0, 113, 7));
        let mapped = [0, 130, 0, 0, 0, 0, 0, 9, 0x1c, 0xfd, 0x1c, 0xfe, 0, 0, 0x0e, 0x10];
        assert_eq!(natpmp_parse_map(&mapped, 7421).unwrap(), (7422, 3600));
        let refused = [0, 130, 0, 2, 0, 0, 0, 9, 0x1c, 0xfd, 0, 0, 0, 0, 0, 0];
        assert!(natpmp_parse_map(&refused, 7421).unwrap_err().contains("refused"));
        assert!(natpmp_parse_map(&mapped, 9999).is_err(), "an answer for another port is not ours");
        assert!(natpmp_parse_external(&[0, 1, 2]).is_err());
    }

    #[test]
    fn carrier_grade_and_private_addresses_are_not_offered() {
        assert!(is_publicly_routable(Ipv4Addr::new(81, 2, 69, 160)));
        for ip in [
            Ipv4Addr::new(100, 64, 0, 1),
            Ipv4Addr::new(100, 127, 255, 254),
            Ipv4Addr::new(192, 168, 1, 1),
            Ipv4Addr::new(10, 0, 0, 1),
            Ipv4Addr::new(172, 16, 4, 4),
            Ipv4Addr::new(127, 0, 0, 1),
            Ipv4Addr::new(169, 254, 1, 1),
        ] {
            assert!(!is_publicly_routable(ip), "{ip}");
        }
        assert!(is_publicly_routable(Ipv4Addr::new(100, 128, 0, 1)), "just outside 100.64/10");
    }

    #[test]
    fn the_default_gateway_is_read_on_macos_and_linux() {
        let mac = "   route to: default\ndestination: default\n       mask: default\n    gateway: 192.168.8.1\n  interface: en0\n";
        assert_eq!(parse_route_get(mac), Some(Ipv4Addr::new(192, 168, 8, 1)));
        let linux = "Iface\tDestination\tGateway \tFlags\nwlan0\t0008A8C0\t00000000\t0001\nwlan0\t00000000\t0108A8C0\t0003\n";
        assert_eq!(parse_proc_net_route(linux), Some(Ipv4Addr::new(192, 168, 8, 1)));
        assert_eq!(parse_route_get("no route"), None);
    }

    #[test]
    fn statuses_say_what_happened() {
        let public = Mapping { method: Method::Upnp, external_ip: Ipv4Addr::new(81, 2, 69, 160), external_port: 7421, internal_port: 7421 };
        let s = describe(&Ok(public));
        assert_eq!(s.public_address.as_deref(), Some("81.2.69.160:7421"));
        let cgnat = Mapping { external_ip: Ipv4Addr::new(100, 70, 1, 2), ..public };
        let s = describe(&Ok(cgnat));
        assert!(s.public_address.is_none() && s.message.contains("carrier-grade"));
        let s = describe(&Err("UPnP: no UPnP router answered".into()));
        assert!(s.public_address.is_none() && s.message.contains("forward TCP port 7421"));
    }
}
