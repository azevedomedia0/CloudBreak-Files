//! Cloudbreak Files — Linux / COSMIC port.
//!
//! Built for finishing on Pop!_OS. Core crypto, vault, P2P stack, local FS, and
//! COSMIC shell are in place; cloud OAuth and ffmpeg trim still need host wiring.

pub mod cloud;
pub mod crypto;
pub mod domain;
pub mod editors;
pub mod local_fs;
pub mod media;
pub mod p2p;
pub mod paths;
pub mod ui;
pub mod vault_store;

pub use domain::preferences::{AppPreferences, AppTheme};
pub use domain::sample::SampleLibrary;
pub use p2p::P2pState;
