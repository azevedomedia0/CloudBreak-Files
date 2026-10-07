use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoAdjustments {
    pub exposure: f32,    // -100 to 100
    pub brightness: f32,  // -100 to 100
    pub contrast: f32,    // -100 to 100
    pub highlights: f32,  // -100 to 100
    pub shadows: f32,     // -100 to 100
    pub warmth: f32,      // -100 to 100
    pub saturation: f32,  // -100 to 100
    pub sharpness: f32,   // 0 to 100
    pub clarity: f32,     // 0 to 100
    pub rotation: i32,    // 0, 90, 180, 270
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoTrimRequest {
    pub input_path: String,
    pub output_path: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub target_format: String, // mp4, webm, gif
    pub target_resolution: String, // 4k, 1080p, 720p
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaProcessResult {
    pub success: bool,
    pub output_path: String,
    pub processed_bytes: u64,
    pub duration_seconds: f64,
    pub sha256_checksum: String,
}

pub fn calculate_adjusted_pixel(r: u8, g: u8, b: u8, adj: &PhotoAdjustments) -> (u8, u8, u8) {
    let mut rf = r as f32 / 255.0;
    let mut gf = g as f32 / 255.0;
    let mut bf = b as f32 / 255.0;

    // Exposure & Brightness
    let exposure_factor = (adj.exposure / 100.0) * 1.5;
    let brightness_factor = adj.brightness / 100.0 * 0.5;
    rf = (rf + brightness_factor + exposure_factor).clamp(0.0, 1.0);
    gf = (gf + brightness_factor + exposure_factor).clamp(0.0, 1.0);
    bf = (bf + brightness_factor + exposure_factor).clamp(0.0, 1.0);

    // Contrast
    let contrast_factor = 1.0 + (adj.contrast / 100.0);
    rf = ((rf - 0.5) * contrast_factor + 0.5).clamp(0.0, 1.0);
    gf = ((gf - 0.5) * contrast_factor + 0.5).clamp(0.0, 1.0);
    bf = ((bf - 0.5) * contrast_factor + 0.5).clamp(0.0, 1.0);

    // Warmth
    let temp = adj.warmth / 100.0 * 0.2;
    rf = (rf + temp).clamp(0.0, 1.0);
    bf = (bf - temp).clamp(0.0, 1.0);

    (
        (rf * 255.0).round() as u8,
        (gf * 255.0).round() as u8,
        (bf * 255.0).round() as u8,
    )
}
