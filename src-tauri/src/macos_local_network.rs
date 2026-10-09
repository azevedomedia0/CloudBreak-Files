//! Ask macOS for Local Network access (Sequoia / macOS 15+).
//!
//! There is no API to show the privacy alert directly. Connecting a UDP socket
//! to a link-local address triggers it without sending traffic (Apple TN3179).

use std::mem::size_of;
use std::ptr;

/// Best-effort trigger for System Settings → Privacy & Security → Local Network.
/// Safe to call more than once; the system only prompts while the privilege is undetermined.
pub fn request_access() {
    for addr in link_local_ipv6_targets() {
        let fd = unsafe { libc::socket(libc::AF_INET6, libc::SOCK_DGRAM, 0) };
        if fd < 0 {
            continue;
        }
        unsafe {
            libc::connect(
                fd,
                &addr as *const _ as *const libc::sockaddr,
                size_of::<libc::sockaddr_in6>() as libc::socklen_t,
            );
            libc::close(fd);
        }
    }

    // Also try common IPv4 LAN gateways (discard port). Harmless if unreachable.
    for host in ["192.168.0.1:9", "192.168.1.1:9", "10.0.0.1:9", "172.16.0.1:9"] {
        if let Ok(sock) = std::net::UdpSocket::bind("0.0.0.0:0") {
            let _ = sock.connect(host);
        }
    }
}

fn link_local_ipv6_targets() -> Vec<libc::sockaddr_in6> {
    let mut list: *mut libc::ifaddrs = ptr::null_mut();
    if unsafe { libc::getifaddrs(&mut list) } != 0 || list.is_null() {
        return Vec::new();
    }

    let mut bases = Vec::new();
    let mut cursor = list;
    while !cursor.is_null() {
        let ifa = unsafe { &*cursor };
        cursor = ifa.ifa_next;

        if ifa.ifa_addr.is_null() {
            continue;
        }
        let sa = unsafe { &*ifa.ifa_addr };
        if i32::from(sa.sa_family) != libc::AF_INET6 {
            continue;
        }
        // Broadcast-capable interfaces only (same filter as Apple's sample).
        if (ifa.ifa_flags & libc::IFF_BROADCAST as u32) == 0 {
            continue;
        }

        let mut addr6 = unsafe { *(ifa.ifa_addr as *const libc::sockaddr_in6) };
        if !is_link_local(&addr6) {
            continue;
        }
        // Discard service — nothing is sent, but the port would drop traffic if it were.
        addr6.sin6_port = 9u16.to_be();
        bases.push(addr6);
    }
    unsafe { libc::freeifaddrs(list) };

    // Two random host parts per interface, as in TN3179.
    let mut out = Vec::with_capacity(bases.len() * 2);
    for base in bases {
        out.push(with_random_host(base));
        out.push(with_random_host(base));
    }
    out
}

fn ipv6_octets(addr: &libc::sockaddr_in6) -> [u8; 16] {
    // libc layout differs slightly by platform; copy via raw bytes of in6_addr.
    let mut out = [0u8; 16];
    unsafe {
        ptr::copy_nonoverlapping(
            &addr.sin6_addr as *const _ as *const u8,
            out.as_mut_ptr(),
            16,
        );
    }
    out
}

fn set_ipv6_octets(addr: &mut libc::sockaddr_in6, bytes: &[u8; 16]) {
    unsafe {
        ptr::copy_nonoverlapping(
            bytes.as_ptr(),
            &mut addr.sin6_addr as *mut _ as *mut u8,
            16,
        );
    }
}

fn is_link_local(addr: &libc::sockaddr_in6) -> bool {
    let bytes = ipv6_octets(addr);
    bytes[0] == 0xfe && (bytes[1] & 0xc0) == 0x80
}

fn with_random_host(mut addr: libc::sockaddr_in6) -> libc::sockaddr_in6 {
    let mut bytes = ipv6_octets(&addr);
    let mut host = [0u8; 8];
    fill_random(&mut host);
    bytes[8..16].copy_from_slice(&host);
    set_ipv6_octets(&mut addr, &bytes);
    addr
}

fn fill_random(buf: &mut [u8]) {
    #[cfg(unix)]
    {
        if unsafe { libc::getentropy(buf.as_mut_ptr() as *mut libc::c_void, buf.len()) } == 0 {
            return;
        }
    }
    let mut state = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0xA5A5_5A5A);
    for b in buf.iter_mut() {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1);
        *b = (state >> 33) as u8;
    }
}
