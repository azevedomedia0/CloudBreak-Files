//! Serverless E2EE P2P media library sharing.
//!
//! Ported from `src-tauri/src/p2p/`. Identity (Ed25519), library key wrapping,
//! content-addressed encrypted chunks, signed invites, and a Have/Want/Block
//! swarm over TCP. **Private mode:** invite-dial only — no DHT/STUN/announce.

pub mod chunk_store;
pub mod identity;
pub mod invite;
pub mod keys;
pub mod library_store;
pub mod manifest;
pub mod protocol;
pub mod service;
pub mod swarm;

pub use library_store::LibraryRecord;
pub use service::{
    p2p_accept_invite, p2p_create_library, p2p_export_invite, p2p_fetch_manifest, p2p_get_identity,
    p2p_list_libraries, p2p_read_file, p2p_start_seeding, p2p_stream_chunk, p2p_swarm_status,
    AcceptInviteRequest, CreateLibraryRequest, IdentityInfo, P2pState,
};
pub use swarm::SwarmStatus;
