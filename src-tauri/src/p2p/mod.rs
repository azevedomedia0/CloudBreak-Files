//! Serverless E2EE P2P media library sharing.
//!
//! Identity (Ed25519), library key wrapping, content-addressed encrypted chunks,
//! signed invites, and a Have/Want/Block swarm over TCP.
//! **Private mode (all libraries):** invite-dial only — no DHT, STUN, or peer announce.

pub mod chunk_store;
pub mod commands;
pub mod identity;
pub mod invite;
pub mod keys;
pub mod library_store;
pub mod manifest;
pub mod protocol;
pub mod swarm;

pub use commands::P2pState;
