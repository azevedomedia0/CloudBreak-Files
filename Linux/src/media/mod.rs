//! Photo / video tooling.
//!
//! Pixel adjustments are implemented. FFmpeg trim/transcode remains a Pop!_OS follow-up
//! (`trim_video_stream` needs an `ffmpeg` binary on PATH).

mod pipeline;

pub use pipeline::{
    calculate_adjusted_pixel, MediaProcessResult, PhotoAdjustments, VideoTrimRequest,
};

use crate::crypto::compute_sha256;
use image::ImageReader;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum MediaError {
    #[error("{0}")]
    Message(String),
    #[error("video trim needs ffmpeg on PATH (not bundled yet)")]
    FfmpegMissing,
}

/// Apply photo adjustments and write a new JPEG/PNG beside the source.
pub fn process_photo_render(
    input_path: &Path,
    output_path: &Path,
    adj: &PhotoAdjustments,
) -> Result<MediaProcessResult, MediaError> {
    let img = ImageReader::open(input_path)
        .map_err(|e| MediaError::Message(e.to_string()))?
        .decode()
        .map_err(|e| MediaError::Message(e.to_string()))?;
    let mut rgba = img.to_rgba8();
    for pixel in rgba.pixels_mut() {
        let (r, g, b) = calculate_adjusted_pixel(pixel[0], pixel[1], pixel[2], adj);
        pixel[0] = r;
        pixel[1] = g;
        pixel[2] = b;
    }
    rgba.save(output_path)
        .map_err(|e| MediaError::Message(e.to_string()))?;
    let bytes = std::fs::read(output_path).map_err(|e| MediaError::Message(e.to_string()))?;
    Ok(MediaProcessResult {
        success: true,
        output_path: output_path.to_string_lossy().into_owned(),
        processed_bytes: bytes.len() as u64,
        duration_seconds: 0.0,
        sha256_checksum: compute_sha256(&bytes),
    })
}

pub fn trim_video_stream(_req: &VideoTrimRequest) -> Result<MediaProcessResult, MediaError> {
    Err(MediaError::FfmpegMissing)
}
