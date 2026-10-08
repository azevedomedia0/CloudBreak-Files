//! COSMIC desktop UI shell.
//!
//! Layout mirrors the Tauri/React app: sidebar nav · toolbar · file browser · inspector · settings.

#[cfg(feature = "cosmic-ui")]
mod app;
#[cfg(feature = "cosmic-ui")]
mod pages;

#[cfg(feature = "cosmic-ui")]
pub use app::run;

/// Entry used when the `cosmic-ui` feature is disabled (headless / CI without libcosmic).
#[cfg(not(feature = "cosmic-ui"))]
pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    eprintln!(
        "cloudbreak-files: built without `cosmic-ui`. Enable the feature and build on Linux/COSMIC."
    );
    eprintln!("  cargo run --features cosmic-ui");
    Ok(())
}
