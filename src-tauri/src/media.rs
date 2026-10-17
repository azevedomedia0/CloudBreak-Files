//! Photo adjustments (image crate) and video trim/transcode (bundled ffmpeg sidecar, Homebrew, or PATH).

use crate::crypto::compute_sha256;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use image::{DynamicImage, GenericImageView, ImageFormat, ImageReader, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PhotoAdjustments {
    pub exposure: f32,   // -100 to 100
    pub brightness: f32, // -100 to 100
    pub contrast: f32,   // -100 to 100
    pub highlights: f32, // -100 to 100
    pub shadows: f32,    // -100 to 100
    pub warmth: f32,     // -100 to 100
    pub tint: f32,       // -100 to 100
    pub saturation: f32, // -100 to 100
    pub vibrance: f32,   // -100 to 100
    pub sharpness: f32,  // 0 to 100
    pub clarity: f32,    // 0 to 100
    pub vignette: f32,   // 0 to 100
    pub rotation: i32,   // 0, 90, 180, 270
    pub flip_h: bool,
    pub flip_v: bool,
    /// Normalized crop in post-rotation space (0–1). Defaults to full frame.
    pub crop_x: f32,
    pub crop_y: f32,
    pub crop_w: f32,
    pub crop_h: f32,
}

impl Default for PhotoAdjustments {
    fn default() -> Self {
        Self {
            exposure: 0.0,
            brightness: 0.0,
            contrast: 0.0,
            highlights: 0.0,
            shadows: 0.0,
            warmth: 0.0,
            tint: 0.0,
            saturation: 0.0,
            vibrance: 0.0,
            sharpness: 0.0,
            clarity: 0.0,
            vignette: 0.0,
            rotation: 0,
            flip_h: false,
            flip_v: false,
            crop_x: 0.0,
            crop_y: 0.0,
            crop_w: 1.0,
            crop_h: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoRenderRequest {
    /// Source image bytes (base64). JPEG / PNG / WebP.
    pub image_base64: String,
    pub adjustments: PhotoAdjustments,
    /// jpeg | png | webp
    pub output_format: String,
    /// JPEG/WebP quality 1–100 (ignored for PNG).
    pub quality: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoRenderResult {
    pub image_base64: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub processed_bytes: u64,
    pub sha256_checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoTrimRequest {
    pub input_path: String,
    pub output_path: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
    /// mp4, mkv, avi, webm, gif, mp3, aac, wav, flac
    pub target_format: String,
    /// original | 4k | 2k | 1080p | 720p | 480p
    pub target_resolution: String,
    #[serde(default = "default_true")]
    pub include_audio: bool,
    /// Frames per second of the result; 0 keeps the source's frame rate (a GIF then uses 15).
    #[serde(default)]
    pub fps: u32,
    /// lossless | high | balanced | compact
    #[serde(default = "default_quality")]
    pub quality: String,
}

fn default_true() -> bool {
    true
}
fn default_quality() -> String {
    "high".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaProcessResult {
    pub success: bool,
    pub output_path: String,
    pub processed_bytes: u64,
    pub duration_seconds: f64,
    pub sha256_checksum: String,
}

#[derive(Debug, thiserror::Error)]
pub enum MediaError {
    #[error("{0}")]
    Message(String),
    #[error(
        "Video trim and convert need ffmpeg. Install it with Homebrew (brew install ffmpeg), \
         or rebuild the desktop app so the bundled copy is included."
    )]
    FfmpegMissing,
}

const MAX_PHOTO_BYTES: usize = 40 * 1024 * 1024;

fn luminance(r: f32, g: f32, b: f32) -> f32 {
    0.2126 * r + 0.7152 * g + 0.0722 * b
}

/// Tone / color adjustments for a single RGB pixel.
pub fn calculate_adjusted_pixel(r: u8, g: u8, b: u8, adj: &PhotoAdjustments) -> (u8, u8, u8) {
    let mut rf = r as f32 / 255.0;
    let mut gf = g as f32 / 255.0;
    let mut bf = b as f32 / 255.0;

    // Exposure (EV-ish) & brightness
    let exposure_factor = (adj.exposure / 100.0) * 1.5;
    let brightness_factor = adj.brightness / 100.0 * 0.5;
    rf = (rf + brightness_factor + exposure_factor).clamp(0.0, 1.0);
    gf = (gf + brightness_factor + exposure_factor).clamp(0.0, 1.0);
    bf = (bf + brightness_factor + exposure_factor).clamp(0.0, 1.0);

    // Contrast around mid-gray
    let contrast_factor = 1.0 + (adj.contrast / 100.0);
    rf = ((rf - 0.5) * contrast_factor + 0.5).clamp(0.0, 1.0);
    gf = ((gf - 0.5) * contrast_factor + 0.5).clamp(0.0, 1.0);
    bf = ((bf - 0.5) * contrast_factor + 0.5).clamp(0.0, 1.0);

    // Highlights / shadows (tone curve by luminance)
    let lum = luminance(rf, gf, bf);
    if adj.highlights != 0.0 && lum > 0.5 {
        let t = ((lum - 0.5) / 0.5).clamp(0.0, 1.0);
        let amount = (adj.highlights / 100.0) * 0.35 * t;
        rf = (rf - amount).clamp(0.0, 1.0);
        gf = (gf - amount).clamp(0.0, 1.0);
        bf = (bf - amount).clamp(0.0, 1.0);
    }
    if adj.shadows != 0.0 && lum < 0.5 {
        let t = (1.0 - lum / 0.5).clamp(0.0, 1.0);
        let amount = (adj.shadows / 100.0) * 0.35 * t;
        rf = (rf + amount).clamp(0.0, 1.0);
        gf = (gf + amount).clamp(0.0, 1.0);
        bf = (bf + amount).clamp(0.0, 1.0);
    }

    // Warmth / tint
    let temp = adj.warmth / 100.0 * 0.2;
    rf = (rf + temp).clamp(0.0, 1.0);
    bf = (bf - temp).clamp(0.0, 1.0);
    let tint = adj.tint / 100.0 * 0.15;
    gf = (gf + tint).clamp(0.0, 1.0);
    rf = (rf - tint * 0.5).clamp(0.0, 1.0);
    bf = (bf - tint * 0.5).clamp(0.0, 1.0);

    // Saturation
    let sat = 1.0 + (adj.saturation / 100.0);
    let gray = luminance(rf, gf, bf);
    rf = (gray + (rf - gray) * sat).clamp(0.0, 1.0);
    gf = (gray + (gf - gray) * sat).clamp(0.0, 1.0);
    bf = (gray + (bf - gray) * sat).clamp(0.0, 1.0);

    // Vibrance — boost low-saturation pixels more
    if adj.vibrance != 0.0 {
        let max_c = rf.max(gf).max(bf);
        let min_c = rf.min(gf).min(bf);
        let sat_amt = if max_c > 1e-6 { (max_c - min_c) / max_c } else { 0.0 };
        let vib = 1.0 + (adj.vibrance / 100.0) * (1.0 - sat_amt);
        let g2 = luminance(rf, gf, bf);
        rf = (g2 + (rf - g2) * vib).clamp(0.0, 1.0);
        gf = (g2 + (gf - g2) * vib).clamp(0.0, 1.0);
        bf = (g2 + (bf - g2) * vib).clamp(0.0, 1.0);
    }

    (
        (rf * 255.0).round() as u8,
        (gf * 255.0).round() as u8,
        (bf * 255.0).round() as u8,
    )
}

fn apply_pixel_adjustments(img: &mut RgbaImage, adj: &PhotoAdjustments) {
    for pixel in img.pixels_mut() {
        let (r, g, b) = calculate_adjusted_pixel(pixel[0], pixel[1], pixel[2], adj);
        pixel[0] = r;
        pixel[1] = g;
        pixel[2] = b;
    }
}

fn apply_clarity(img: &mut RgbaImage, amount: f32) {
    if amount.abs() < 0.5 {
        return;
    }
    let strength = (amount / 100.0) * 0.45;
    let w = img.width() as usize;
    let h = img.height() as usize;
    let src: Vec<[u8; 4]> = img.pixels().map(|p| p.0).collect();
    for y in 1..h.saturating_sub(1) {
        for x in 1..w.saturating_sub(1) {
            let i = y * w + x;
            let center = src[i];
            let mut sum = [0i32; 3];
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let j = ((y as i32 + dy) as usize) * w + (x as i32 + dx) as usize;
                    sum[0] += src[j][0] as i32;
                    sum[1] += src[j][1] as i32;
                    sum[2] += src[j][2] as i32;
                }
            }
            let blur = [
                (sum[0] / 8) as f32,
                (sum[1] / 8) as f32,
                (sum[2] / 8) as f32,
            ];
            let out = [
                ((center[0] as f32 - blur[0]) * strength + center[0] as f32).clamp(0.0, 255.0) as u8,
                ((center[1] as f32 - blur[1]) * strength + center[1] as f32).clamp(0.0, 255.0) as u8,
                ((center[2] as f32 - blur[2]) * strength + center[2] as f32).clamp(0.0, 255.0) as u8,
                center[3],
            ];
            img.put_pixel(x as u32, y as u32, Rgba(out));
        }
    }
}

fn apply_sharpen(img: &mut RgbaImage, amount: f32) {
    if amount < 0.5 {
        return;
    }
    // Unsharp-ish: center * (1+a) - neighbors * a/4
    let a = (amount / 100.0) * 1.2;
    let w = img.width() as usize;
    let h = img.height() as usize;
    let src: Vec<[u8; 4]> = img.pixels().map(|p| p.0).collect();
    for y in 1..h.saturating_sub(1) {
        for x in 1..w.saturating_sub(1) {
            let i = y * w + x;
            let c = src[i];
            let n = src[i - w];
            let s = src[i + w];
            let e = src[i + 1];
            let west = src[i - 1];
            let out = [
                ((c[0] as f32) * (1.0 + a)
                    - a * 0.25 * (n[0] as f32 + s[0] as f32 + e[0] as f32 + west[0] as f32))
                    .clamp(0.0, 255.0) as u8,
                ((c[1] as f32) * (1.0 + a)
                    - a * 0.25 * (n[1] as f32 + s[1] as f32 + e[1] as f32 + west[1] as f32))
                    .clamp(0.0, 255.0) as u8,
                ((c[2] as f32) * (1.0 + a)
                    - a * 0.25 * (n[2] as f32 + s[2] as f32 + e[2] as f32 + west[2] as f32))
                    .clamp(0.0, 255.0) as u8,
                c[3],
            ];
            img.put_pixel(x as u32, y as u32, Rgba(out));
        }
    }
}

fn apply_vignette(img: &mut RgbaImage, amount: f32) {
    if amount < 0.5 {
        return;
    }
    let w = img.width() as f32;
    let h = img.height() as f32;
    let cx = w / 2.0;
    let cy = h / 2.0;
    let max_d = (cx.hypot(cy)).max(1.0);
    let strength = (amount / 100.0) * 0.85;
    let inner = 1.0 - amount / 120.0;

    for (x, y, pixel) in img.enumerate_pixels_mut() {
        let d = ((x as f32 - cx).hypot(y as f32 - cy) / max_d).clamp(0.0, 1.0);
        let t = ((d - inner) / (1.0 - inner).max(0.01)).clamp(0.0, 1.0);
        let darken = 1.0 - strength * t * t;
        pixel[0] = ((pixel[0] as f32) * darken).round().clamp(0.0, 255.0) as u8;
        pixel[1] = ((pixel[1] as f32) * darken).round().clamp(0.0, 255.0) as u8;
        pixel[2] = ((pixel[2] as f32) * darken).round().clamp(0.0, 255.0) as u8;
    }
}

fn apply_geometry(img: DynamicImage, adj: &PhotoAdjustments) -> DynamicImage {
    let mut out = img;
    if adj.flip_h {
        out = out.fliph();
    }
    if adj.flip_v {
        out = out.flipv();
    }
    let rot = ((adj.rotation % 360) + 360) % 360;
    out = match rot {
        90 => out.rotate90(),
        180 => out.rotate180(),
        270 => out.rotate270(),
        _ => out,
    };

    let (w, h) = out.dimensions();
    if w == 0 || h == 0 {
        return out;
    }
    let crop_w = adj.crop_w.clamp(0.01, 1.0);
    let crop_h = adj.crop_h.clamp(0.01, 1.0);
    let crop_x = adj.crop_x.clamp(0.0, 1.0 - crop_w);
    let crop_y = adj.crop_y.clamp(0.0, 1.0 - crop_h);
    let full_frame = crop_x <= 0.0005
        && crop_y <= 0.0005
        && crop_w >= 0.9995
        && crop_h >= 0.9995;
    if full_frame {
        return out;
    }
    let x = (crop_x * w as f32).round() as u32;
    let y = (crop_y * h as f32).round() as u32;
    let mut cw = (crop_w * w as f32).round() as u32;
    let mut ch = (crop_h * h as f32).round() as u32;
    if x >= w || y >= h {
        return out;
    }
    cw = cw.min(w - x).max(1);
    ch = ch.min(h - y).max(1);
    out.crop_imm(x, y, cw, ch)
}

fn encode_image(img: &DynamicImage, format: &str, quality: u8) -> Result<(Vec<u8>, String), MediaError> {
    let q = quality.clamp(1, 100);
    let mut buf = Cursor::new(Vec::new());
    match format.to_ascii_lowercase().as_str() {
        "png" => {
            img.write_to(&mut buf, ImageFormat::Png)
                .map_err(|e| MediaError::Message(e.to_string()))?;
            Ok((buf.into_inner(), "image/png".into()))
        }
        "webp" => {
            img.write_to(&mut buf, ImageFormat::WebP)
                .map_err(|e| MediaError::Message(e.to_string()))?;
            Ok((buf.into_inner(), "image/webp".into()))
        }
        _ => {
            let rgb = img.to_rgb8();
            let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, q);
            enc.encode(rgb.as_raw(), rgb.width(), rgb.height(), image::ExtendedColorType::Rgb8)
                .map_err(|e| MediaError::Message(e.to_string()))?;
            Ok((buf.into_inner(), "image/jpeg".into()))
        }
    }
}

/// Apply adjustments to in-memory image bytes and re-encode.
pub fn process_photo_bytes(
    data: &[u8],
    adj: &PhotoAdjustments,
    output_format: &str,
    quality: u8,
) -> Result<PhotoRenderResult, MediaError> {
    if data.len() > MAX_PHOTO_BYTES {
        return Err(MediaError::Message(format!(
            "Image exceeds the {} MB render limit",
            MAX_PHOTO_BYTES / (1024 * 1024)
        )));
    }

    let img = ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|e| MediaError::Message(e.to_string()))?
        .decode()
        .map_err(|e| MediaError::Message(e.to_string()))?;

    let img = apply_geometry(img, adj);
    let mut rgba = img.to_rgba8();
    apply_pixel_adjustments(&mut rgba, adj);
    apply_clarity(&mut rgba, adj.clarity);
    apply_sharpen(&mut rgba, adj.sharpness);
    apply_vignette(&mut rgba, adj.vignette);

    let out_img = DynamicImage::ImageRgba8(rgba);
    let width = out_img.width();
    let height = out_img.height();
    let (bytes, mime_type) = encode_image(&out_img, output_format, quality)?;
    let checksum = compute_sha256(&bytes);
    let processed_bytes = bytes.len() as u64;

    Ok(PhotoRenderResult {
        image_base64: B64.encode(bytes),
        mime_type,
        width,
        height,
        processed_bytes,
        sha256_checksum: checksum,
    })
}

/// Path-based photo render (writes beside / to `output_path`).
pub fn process_photo_render(
    input_path: &Path,
    output_path: &Path,
    adj: &PhotoAdjustments,
) -> Result<MediaProcessResult, MediaError> {
    let data = std::fs::read(input_path).map_err(|e| MediaError::Message(e.to_string()))?;
    let ext = output_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg");
    let rendered = process_photo_bytes(&data, adj, ext, 92)?;
    let bytes = B64
        .decode(rendered.image_base64.as_bytes())
        .map_err(|e| MediaError::Message(e.to_string()))?;
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| MediaError::Message(e.to_string()))?;
    }
    std::fs::write(output_path, &bytes).map_err(|e| MediaError::Message(e.to_string()))?;
    Ok(MediaProcessResult {
        success: true,
        output_path: output_path.to_string_lossy().into_owned(),
        processed_bytes: bytes.len() as u64,
        duration_seconds: 0.0,
        sha256_checksum: rendered.sha256_checksum,
    })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegStatus {
    pub available: bool,
    pub path: Option<String>,
    /// `bundled` | `env` | `homebrew` | `path` | `missing`
    pub source: String,
    pub install_hint: String,
    /// Whether this ffmpeg can encode H.264 (libx264 or VideoToolbox). Without it MP4 and MKV are not offered.
    pub h264: bool,
}

pub const FFMPEG_INSTALL_HINT: &str =
    "Install ffmpeg with Homebrew: brew install ffmpeg. Release builds of Cloudbreak Files ship a bundled copy.";

pub(crate) fn find_ffmpeg() -> Result<PathBuf, MediaError> {
    which_ffmpeg().map(|(path, _)| path).ok_or(MediaError::FfmpegMissing)
}

pub fn ffmpeg_status() -> FfmpegStatus {
    match which_ffmpeg() {
        Some((path, source)) => FfmpegStatus {
            available: true,
            h264: ffmpeg_can_encode_h264(&path),
            path: Some(path.to_string_lossy().into_owned()),
            source: source.to_string(),
            install_hint: String::new(),
        },
        None => FfmpegStatus {
            available: false,
            path: None,
            source: "missing".into(),
            install_hint: FFMPEG_INSTALL_HINT.into(),
            h264: false,
        },
    }
}

/// Asks this ffmpeg for its encoders, so the Convert dialog offers MP4 and MKV only when they can be made.
fn ffmpeg_can_encode_h264(ffmpeg: &Path) -> bool {
    let Ok(out) = Command::new(ffmpeg).args(["-hide_banner", "-encoders"]).output() else {
        return false;
    };
    match pick_h264_encoder(&String::from_utf8_lossy(&out.stdout)) {
        Some(H264Encoder::VaApi) => vaapi_device(ffmpeg).is_some(),
        Some(_) => true,
        None => false,
    }
}

fn ffmpeg_binary_name() -> &'static str {
    if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }
}

/// Sidecar next to the app binary (Tauri `externalBin`) and common Homebrew paths.
fn which_ffmpeg() -> Option<(PathBuf, &'static str)> {
    if let Ok(p) = std::env::var("FFMPEG_PATH") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Some((path, "env"));
        }
    }

    let name = ffmpeg_binary_name();

    // Bundled sidecar: Contents/MacOS/ffmpeg (release) or target/*/ffmpeg (dev with externalBin).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some((candidate, "bundled"));
            }
            // Dev tree: src-tauri/binaries/ffmpeg-<triple> when running `cargo test` / odd layouts.
            let binaries = dir.join("binaries").join(name);
            if binaries.is_file() {
                return Some((binaries, "bundled"));
            }
        }
    }

    let homebrew = [
        PathBuf::from("/opt/homebrew/bin").join(name),
        PathBuf::from("/usr/local/bin").join(name),
        PathBuf::from("/usr/bin").join(name),
    ];
    for candidate in &homebrew {
        if candidate.is_file() {
            return Some((candidate.clone(), "homebrew"));
        }
    }

    std::env::var_os("PATH").and_then(|paths| {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some((candidate, "path"));
            }
        }
        None
    })
}

fn scale_filter(resolution: &str) -> Option<&'static str> {
    match resolution.to_ascii_lowercase().as_str() {
        "4k" | "2160p" => Some("scale=3840:-2"),
        "2k" | "1440p" => Some("scale=2560:-2"),
        "1080p" => Some("scale=1920:-2"),
        "720p" => Some("scale=1280:-2"),
        "480p" => Some("scale=854:-2"),
        _ => None, // original
    }
}

fn crf_for_quality(quality: &str) -> &'static str {
    match quality.to_ascii_lowercase().as_str() {
        "lossless" => "16",
        "high" => "20",
        "compact" => "28",
        _ => "23", // balanced
    }
}

/// The H.264 encoder an ffmpeg offers. The ffmpeg bundled with Cloudbreak is LGPL-only, so it has no
/// libx264 (that is GPL); it uses Apple's VideoToolbox instead. A Homebrew or Linux ffmpeg usually has
/// libx264, which is preferred when it is there.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum H264Encoder {
    X264,
    VideoToolbox,
    /// Intel and AMD graphics through VA-API (Linux). Frames are uploaded to the GPU, so it needs a device.
    VaApi,
}

/// Pick from `ffmpeg -encoders` output, where each encoder line reads `<flags> <name> <description>`.
fn pick_h264_encoder(listing: &str) -> Option<H264Encoder> {
    let has = |name: &str| listing.lines().any(|line| line.split_whitespace().nth(1) == Some(name));
    if has("libx264") {
        Some(H264Encoder::X264)
    } else if has("h264_videotoolbox") {
        Some(H264Encoder::VideoToolbox)
    } else if has("h264_vaapi") {
        Some(H264Encoder::VaApi)
    } else {
        None
    }
}

fn detect_h264_encoder(ffmpeg: &Path) -> Result<H264Encoder, MediaError> {
    let out = Command::new(ffmpeg)
        .args(["-hide_banner", "-encoders"])
        .output()
        .map_err(|e| MediaError::Message(format!("Failed to spawn ffmpeg: {e}")))?;
    let encoder = pick_h264_encoder(&String::from_utf8_lossy(&out.stdout)).ok_or_else(|| {
        MediaError::Message(if cfg!(target_os = "linux") {
            // The ffmpeg shipped with the Linux builds is LGPL-only, so it has no libx264.
            "This build's ffmpeg has no H.264 encoder, so MP4 and MKV are not available here. \
             AVI, GIF and the audio formats work. To convert to MP4 or MKV, point FFMPEG_PATH at an ffmpeg \
             that has libx264."
                .into()
        } else {
            "This ffmpeg has no H.264 encoder (libx264 or h264_videotoolbox). \
             Install one with Homebrew: brew install ffmpeg"
                .into()
        })
    })?;
    if encoder == H264Encoder::VaApi && vaapi_device(ffmpeg).is_none() {
        return Err(MediaError::Message(
            "This computer's graphics card cannot encode H.264 through VA-API, so MP4 and MKV are not available. \
             AVI, GIF and the audio formats work."
                .into(),
        ));
    }
    Ok(encoder)
}

/// The render device a VA-API encode can use, found once per run: the first `/dev/dri/renderD*` node where a
/// one-frame H.264 encode succeeds. `None` off Linux, or when no graphics device can encode (no driver, no GPU).
fn vaapi_device(ffmpeg: &Path) -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        static DEVICE: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
        DEVICE
            .get_or_init(|| {
                let mut nodes: Vec<String> = std::fs::read_dir("/dev/dri")
                    .ok()?
                    .filter_map(|e| e.ok())
                    .map(|e| e.path().to_string_lossy().into_owned())
                    .filter(|p| p.rsplit('/').next().is_some_and(|n| n.starts_with("renderD")))
                    .collect();
                nodes.sort();
                nodes.into_iter().find(|device| vaapi_test_encode(ffmpeg, device))
            })
            .clone()
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = ffmpeg;
        None
    }
}

/// Encodes one small frame on `device` with h264_vaapi. Success means the driver and the GPU really work,
/// which listing the encoder does not show.
#[cfg(target_os = "linux")]
fn vaapi_test_encode(ffmpeg: &Path, device: &str) -> bool {
    Command::new(ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-init_hw_device",
            &format!("vaapi=va:{device}"),
            "-filter_hw_device",
            "va",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=256x256:rate=1",
            "-frames:v",
            "1",
            "-vf",
            "format=nv12,hwupload",
            "-c:v",
            "h264_vaapi",
            "-f",
            "null",
            "-",
        ])
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

/// The picture an H.264 encode will produce: output size and frame rate. Intel Macs take a bitrate, and the
/// right bitrate depends on how many pixels per second there are.
#[derive(Debug, Clone, Copy, PartialEq)]
struct VideoShape {
    width: u32,
    height: u32,
    fps: f64,
}

/// What a bitrate is worked out from when the source cannot be read: 1080p at 30 fps.
const DEFAULT_SHAPE: VideoShape = VideoShape { width: 1920, height: 1080, fps: 30.0 };

/// Bits per pixel per frame for each level, measured by VMAF against libx264 CRF 16 / 20 / 23 / 28 on a
/// detailed 1080p30 clip (VideoToolbox in bitrate mode needs about 2-2.5x libx264's bits to score the same).
/// Simple footage costs far less: the encoder only spends what the picture needs.
fn videotoolbox_bits_per_pixel(level: &str) -> f64 {
    match level {
        "lossless" => 0.46,
        "high" => 0.29,
        "compact" => 0.11,
        _ => 0.21, // balanced
    }
}

/// Bitrate (kbit/s) for a level, scaled by pixels per second and kept within what H.264 hardware takes.
fn videotoolbox_bitrate_kbps(quality: &str, shape: VideoShape) -> u32 {
    let level = quality.to_ascii_lowercase();
    let pixels_per_second = f64::from(shape.width) * f64::from(shape.height) * shape.fps.clamp(1.0, 240.0);
    let kbps = videotoolbox_bits_per_pixel(&level) * pixels_per_second / 1000.0;
    kbps.round().clamp(400.0, 80_000.0) as u32
}

/// VideoToolbox takes a constant quality (0-100) on Apple Silicon and only a bitrate on Intel.
/// The Apple Silicon values were chosen by VMAF so each level scores about the same as the libx264 CRF
/// it replaces (16, 20, 23, 28) on four 1080p clips (aerial, grainy aerial, gradients, UI): 80, 72, 66, 56.
/// The old 90/75/60/45 made Lossless and High several times larger for no visible gain, and Compact worse.
/// On Intel the bitrate scales with the output's pixels per second (`videotoolbox_bitrate_kbps`). Those
/// bits-per-pixel figures were measured on Apple Silicon's encoder in bitrate mode, not on an Intel Mac's.
fn videotoolbox_quality_args(quality: &str, shape: Option<VideoShape>) -> [String; 2] {
    let level = quality.to_ascii_lowercase();
    if cfg!(target_arch = "aarch64") {
        let q = match level.as_str() {
            "lossless" => "80",
            "high" => "72",
            "compact" => "56",
            _ => "66",
        };
        ["-q:v".into(), q.into()]
    } else {
        let kbps = videotoolbox_bitrate_kbps(&level, shape.unwrap_or(DEFAULT_SHAPE));
        ["-b:v".into(), format!("{kbps}k")]
    }
}

/// Width and height of the first video stream, read from what `ffmpeg -i` prints (no ffprobe needed).
fn parse_video_size(ffmpeg_info: &str) -> Option<(u32, u32)> {
    let line = ffmpeg_info.lines().find(|l| l.contains("Video:") && !l.contains("attached pic"))?;
    line.split(|c: char| c.is_whitespace() || matches!(c, ',' | '[' | ']' | '(' | ')')).find_map(|token| {
        let (w, h) = token.split_once('x')?;
        if w.starts_with('0') || !w.bytes().all(|b| b.is_ascii_digit()) || !h.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        let (w, h): (u32, u32) = (w.parse().ok()?, h.parse().ok()?);
        ((16..=16384).contains(&w) && (16..=16384).contains(&h)).then_some((w, h))
    })
}

fn probe_input(ffmpeg: &Path, input: &str) -> VideoProbe {
    match Command::new(ffmpeg).args(["-hide_banner", "-i", input]).output() {
        Ok(out) => parse_probe(&String::from_utf8_lossy(&out.stderr)),
        Err(_) => VideoProbe::default(),
    }
}

/// What `ffmpeg -i` says about a video: the real details the app shows instead of guesses.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoProbe {
    /// 0 when the file has no video stream (or ffmpeg did not say).
    pub width: u32,
    pub height: u32,
    pub fps: Option<f64>,
    pub duration_seconds: Option<f64>,
    /// A readable name such as "H.264".
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub bitrate_kbps: Option<u32>,
}

fn friendly_codec(raw: &str) -> String {
    match raw.to_ascii_lowercase().as_str() {
        "h264" => "H.264".into(),
        "hevc" => "H.265".into(),
        "vp8" => "VP8".into(),
        "vp9" => "VP9".into(),
        "av1" => "AV1".into(),
        "mpeg4" => "MPEG-4".into(),
        "mpeg2video" => "MPEG-2".into(),
        "prores" => "ProRes".into(),
        "gif" => "GIF".into(),
        "aac" => "AAC".into(),
        "mp3" => "MP3".into(),
        "opus" => "Opus".into(),
        "vorbis" => "Vorbis".into(),
        "flac" => "FLAC".into(),
        other if other.starts_with("pcm_") => "PCM".into(),
        other => other.to_ascii_uppercase(),
    }
}

/// The text of a stream line after `label` (e.g. "Video:"), up to the first space: the codec name.
fn codec_after(line: &str, label: &str) -> Option<String> {
    let rest = line.split(label).nth(1)?.trim_start();
    let name = rest.split(|c: char| c.is_whitespace() || c == ',').next()?;
    (!name.is_empty() && name != "none").then(|| friendly_codec(name))
}

/// A number of the form "29.97" that ends a comma-separated field ("29.97 fps" or "30 tbr").
fn rate_field(line: &str, unit: &str) -> Option<f64> {
    line.split(',').find_map(|field| {
        let field = field.trim();
        field.strip_suffix(unit)?.trim().parse::<f64>().ok().filter(|v| v.is_finite() && *v > 0.0)
    })
}

/// Read `ffmpeg -hide_banner -i file` output (stderr). Anything it does not say stays unknown.
pub fn parse_probe(ffmpeg_info: &str) -> VideoProbe {
    let mut probe = VideoProbe::default();
    if let Some(at) = ffmpeg_info.find("Duration: ") {
        let text = &ffmpeg_info[at + 10..];
        let stamp = text.split(',').next().unwrap_or("").trim();
        let parts: Vec<&str> = stamp.split(':').collect();
        if let [h, m, sec] = parts.as_slice() {
            if let (Ok(h), Ok(m), Ok(sec)) = (h.parse::<f64>(), m.parse::<f64>(), sec.parse::<f64>()) {
                probe.duration_seconds = Some(h * 3600.0 + m * 60.0 + sec);
            }
        }
        if let Some(rest) = text.split("bitrate:").nth(1) {
            let kbps = rest.trim().split_whitespace().next().and_then(|n| n.parse::<u32>().ok());
            probe.bitrate_kbps = kbps;
        }
    }
    let video = ffmpeg_info
        .lines()
        .find(|l| l.contains("Video:") && !l.contains("attached pic"));
    if let Some(line) = video {
        probe.video_codec = codec_after(line, "Video:");
        probe.fps = rate_field(line, " fps").or_else(|| rate_field(line, " tbr"));
        if let Some((w, h)) = parse_video_size(ffmpeg_info) {
            probe.width = w;
            probe.height = h;
        }
        // A phone video stored sideways says so in side data: the picture is shown turned.
        let turned = ffmpeg_info.lines().any(|l| {
            l.split("rotation of ")
                .nth(1)
                .and_then(|r| r.split_whitespace().next())
                .and_then(|r| r.parse::<f64>().ok())
                .is_some_and(|deg| (deg.abs() - 90.0).abs() < 1.0 || (deg.abs() - 270.0).abs() < 1.0)
        });
        if turned {
            std::mem::swap(&mut probe.width, &mut probe.height);
        }
    }
    if let Some(line) = ffmpeg_info.lines().find(|l| l.contains("Audio:")) {
        probe.audio_codec = codec_after(line, "Audio:");
    }
    probe
}

pub fn probe_video(input: &Path) -> Result<VideoProbe, MediaError> {
    let ffmpeg = find_ffmpeg()?;
    let out = Command::new(&ffmpeg)
        .args(["-hide_banner", "-i"])
        .arg(input)
        .output()
        .map_err(|e| MediaError::Message(format!("Failed to spawn ffmpeg: {e}")))?;
    // ffmpeg exits with an error here (no output file); the description is on stderr either way.
    Ok(parse_probe(&String::from_utf8_lossy(&out.stderr)))
}

/// The size the output will have after the requested scaling (even numbers, as the encoder needs).
fn output_size(source: (u32, u32), target_resolution: &str) -> (u32, u32) {
    let Some(filter) = scale_filter(target_resolution) else { return source };
    let target_width: u32 = filter
        .trim_start_matches("scale=")
        .split(':')
        .next()
        .and_then(|w| w.parse().ok())
        .unwrap_or(source.0);
    let height = (u64::from(source.1) * u64::from(target_width) + u64::from(source.0) / 2) / u64::from(source.0.max(1));
    (target_width, (height as u32 / 2 * 2).max(2))
}

fn h264_args(encoder: H264Encoder, quality: &str, shape: Option<VideoShape>) -> Vec<String> {
    match encoder {
        // The frames already sit on the GPU (see the `hwupload` filter), so only the encoder is named here. The
        // quality scale is the same as libx264's CRF: a constant quantizer, lower is better.
        H264Encoder::VaApi => vec![
            "-c:v".into(),
            "h264_vaapi".into(),
            "-qp".into(),
            crf_for_quality(quality).into(),
        ],
        H264Encoder::X264 => vec![
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "medium".into(),
            "-crf".into(),
            crf_for_quality(quality).into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
        ],
        H264Encoder::VideoToolbox => {
            let mut args: Vec<String> = vec![
                "-c:v".into(),
                "h264_videotoolbox".into(),
                // A Mac with no hardware encoder falls back to software instead of failing.
                "-allow_sw".into(),
                "1".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ];
            args.extend(videotoolbox_quality_args(quality, shape));
            args
        }
    }
}

/// Trim / transcode with system ffmpeg. Returns metadata for the output file.
pub fn trim_video_stream(req: &VideoTrimRequest) -> Result<MediaProcessResult, MediaError> {
    if req.end_seconds <= req.start_seconds {
        return Err(MediaError::Message(
            "end_seconds must be greater than start_seconds".into(),
        ));
    }
    if req.start_seconds < 0.0 {
        return Err(MediaError::Message("start_seconds must be >= 0".into()));
    }

    let input = Path::new(&req.input_path);
    let output = Path::new(&req.output_path);
    if !input.is_file() {
        return Err(MediaError::Message(format!(
            "Input video not found: {}",
            req.input_path
        )));
    }
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|e| MediaError::Message(e.to_string()))?;
    }

    let ffmpeg = find_ffmpeg()?;
    let duration = req.end_seconds - req.start_seconds;
    let fmt = req.target_format.to_ascii_lowercase();
    let is_audio = matches!(fmt.as_str(), "mp3" | "aac" | "wav" | "flac");
    // 0 keeps the source's frame rate; anything else is a fixed rate.
    let fps = req.fps.min(120);

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-ss".into(),
        format!("{:.3}", req.start_seconds),
        "-to".into(),
        format!("{:.3}", req.end_seconds),
        "-i".into(),
        req.input_path.clone(),
    ];

    if is_audio {
        args.push("-vn".into());
        match fmt.as_str() {
            "wav" => {
                args.extend(["-c:a".into(), "pcm_s16le".into()]);
            }
            "flac" => {
                args.extend(["-c:a".into(), "flac".into()]);
            }
            "aac" => {
                args.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "192k".into()]);
            }
            _ => {
                // mp3
                args.extend(["-c:a".into(), "libmp3lame".into(), "-b:a".into(), "192k".into()]);
            }
        }
    } else if fmt == "gif" {
        let scale = scale_filter(&req.target_resolution).unwrap_or("scale=480:-2");
        let vf = format!(
            "fps={},{scale}:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
            if fps == 0 { 15 } else { fps }
        );
        args.extend(["-vf".into(), vf, "-loop".into(), "0".into()]);
    } else {
        // H.264 is picked first: a VA-API encode needs its frames uploaded to the GPU at the end of the filter chain.
        let encoder = if matches!(fmt.as_str(), "webm" | "avi") {
            None
        } else {
            Some(detect_h264_encoder(&ffmpeg)?)
        };
        let vaapi = encoder == Some(H264Encoder::VaApi);
        let mut vf_parts: Vec<String> = Vec::new();
        if let Some(scale) = scale_filter(&req.target_resolution) {
            vf_parts.push(scale.to_string());
        }
        if fps > 0 {
            vf_parts.push(format!("fps={fps}"));
        }
        if vaapi {
            vf_parts.push("format=nv12".into());
            vf_parts.push("hwupload".into());
        }
        if !vf_parts.is_empty() {
            args.extend(["-vf".into(), vf_parts.join(",")]);
        }

        let crf = crf_for_quality(&req.quality);
        match fmt.as_str() {
            "webm" => {
                args.extend([
                    "-c:v".into(),
                    "libvpx-vp9".into(),
                    "-crf".into(),
                    crf.into(),
                    "-b:v".into(),
                    "0".into(),
                ]);
                if req.include_audio {
                    args.extend(["-c:a".into(), "libopus".into()]);
                } else {
                    args.push("-an".into());
                }
            }
            "avi" => {
                args.extend(["-c:v".into(), "mpeg4".into(), "-q:v".into(), "5".into()]);
                if req.include_audio {
                    args.extend(["-c:a".into(), "libmp3lame".into()]);
                } else {
                    args.push("-an".into());
                }
            }
            "mkv" | "mp4" | _ => {
                let encoder = encoder.ok_or_else(|| MediaError::Message("No H.264 encoder was chosen.".into()))?;
                // Only the bitrate-mode path (Intel VideoToolbox) needs the output's size and frame rate.
                let shape = if encoder == H264Encoder::VideoToolbox && !cfg!(target_arch = "aarch64") {
                    let probe = probe_input(&ffmpeg, &req.input_path);
                    (probe.width > 0 && probe.height > 0).then(|| {
                        let (width, height) = output_size((probe.width, probe.height), &req.target_resolution);
                        let fps = if fps > 0 { f64::from(fps) } else { probe.fps.unwrap_or(30.0) };
                        VideoShape { width, height, fps }
                    })
                } else {
                    None
                };
                args.extend(h264_args(encoder, &req.quality, shape));
                if req.include_audio {
                    args.extend(["-c:a".into(), "aac".into(), "-b:a".into(), "192k".into()]);
                } else {
                    args.push("-an".into());
                }
                if fmt == "mp4" {
                    args.extend(["-movflags".into(), "+faststart".into()]);
                }
            }
        }
    }

    // VA-API opens its device before the input is read, so the device is named ahead of everything else.
    if matches!(fmt.as_str(), "webm" | "avi" | "gif") {
        // No hardware upload for these.
    } else if let Some(device) = vaapi_device(&ffmpeg).filter(|_| detect_h264_encoder(&ffmpeg).ok() == Some(H264Encoder::VaApi)) {
        let init = ["-init_hw_device".to_string(), format!("vaapi=va:{device}"), "-filter_hw_device".to_string(), "va".to_string()];
        args.splice(0..0, init);
    }

    args.push(req.output_path.clone());

    let output_status = Command::new(&ffmpeg)
        .args(&args)
        .output()
        .map_err(|e| MediaError::Message(format!("Failed to spawn ffmpeg: {e}")))?;

    if !output_status.status.success() {
        let stderr = String::from_utf8_lossy(&output_status.stderr);
        let hint = stderr
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("ffmpeg failed");
        return Err(MediaError::Message(format!("ffmpeg error: {hint}")));
    }

    let bytes = std::fs::read(output).map_err(|e| MediaError::Message(e.to_string()))?;
    Ok(MediaProcessResult {
        success: true,
        output_path: req.output_path.clone(),
        processed_bytes: bytes.len() as u64,
        duration_seconds: duration,
        sha256_checksum: compute_sha256(&bytes),
    })
}

/// Write bytes into the app temp dir; returns the absolute path.
pub fn stage_temp_file(app_temp: &Path, data: &[u8], extension: &str) -> Result<PathBuf, MediaError> {
    std::fs::create_dir_all(app_temp).map_err(|e| MediaError::Message(e.to_string()))?;
    let ext = extension.trim_start_matches('.').to_ascii_lowercase();
    let safe_ext = if ext.is_empty() || !ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        "bin".into()
    } else {
        ext
    };
    let name = format!(
        "cb-media-{}-{}.{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        &uuid::Uuid::new_v4().to_string()[..8],
        safe_ext
    );
    let path = app_temp.join(name);
    std::fs::write(&path, data).map_err(|e| MediaError::Message(e.to_string()))?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid_png(w: u32, h: u32, color: [u8; 3]) -> Vec<u8> {
        let mut img = RgbaImage::new(w, h);
        for p in img.pixels_mut() {
            *p = Rgba([color[0], color[1], color[2], 255]);
        }
        let mut buf = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(img)
            .write_to(&mut buf, ImageFormat::Png)
            .unwrap();
        buf.into_inner()
    }

    #[test]
    fn pixel_exposure_brightens() {
        let adj = PhotoAdjustments {
            exposure: 50.0,
            ..Default::default()
        };
        let (r, g, b) = calculate_adjusted_pixel(100, 100, 100, &adj);
        assert!(r > 100 && g > 100 && b > 100);
    }

    #[test]
    fn photo_render_round_trip_png() {
        let png = solid_png(32, 24, [40, 80, 120]);
        let adj = PhotoAdjustments {
            contrast: 20.0,
            saturation: 10.0,
            rotation: 90,
            ..Default::default()
        };
        let out = process_photo_bytes(&png, &adj, "png", 90).unwrap();
        assert_eq!(out.width, 24); // rotated
        assert_eq!(out.height, 32);
        assert!(out.processed_bytes > 0);
        assert_eq!(out.mime_type, "image/png");
        let decoded = B64.decode(out.image_base64.as_bytes()).unwrap();
        assert!(!decoded.is_empty());
    }

    #[test]
    fn photo_render_applies_crop() {
        let png = solid_png(100, 80, [10, 20, 30]);
        let adj = PhotoAdjustments {
            crop_x: 0.1,
            crop_y: 0.1,
            crop_w: 0.5,
            crop_h: 0.5,
            ..Default::default()
        };
        let out = process_photo_bytes(&png, &adj, "png", 90).unwrap();
        assert_eq!(out.width, 50);
        assert_eq!(out.height, 40);
    }

    #[test]
    fn photo_render_path_writes_file() {
        let dir = std::env::temp_dir().join(format!("cb-photo-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.png");
        let output = dir.join("out.jpg");
        std::fs::write(&input, solid_png(16, 16, [200, 100, 50])).unwrap();
        let result = process_photo_render(&input, &output, &PhotoAdjustments::default()).unwrap();
        assert!(result.success);
        assert!(output.is_file());
        assert_eq!(result.processed_bytes, std::fs::metadata(&output).unwrap().len());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn trim_rejects_bad_range() {
        let req = VideoTrimRequest {
            input_path: "/nope.mp4".into(),
            output_path: "/tmp/out.mp4".into(),
            start_seconds: 5.0,
            end_seconds: 2.0,
            target_format: "mp4".into(),
            target_resolution: "720p".into(),
            include_audio: true,
            fps: 30,
            quality: "high".into(),
        };
        assert!(trim_video_stream(&req).is_err());
    }

    #[test]
    fn ffmpeg_trim_real_clip_when_available() {
        let Some((ffmpeg, _)) = which_ffmpeg() else {
            eprintln!("skipping ffmpeg trim test — ffmpeg not found");
            return;
        };

        let dir = std::env::temp_dir().join(format!("cb-vid-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.mp4");
        // MP4 needs an H.264 encoder; where there is none (a Linux machine without a working GPU) the trim goes to AVI,
        // which every ffmpeg can write, so the trim itself is still tested.
        let (format, output) = if ffmpeg_can_encode_h264(&ffmpeg) {
            ("mp4", dir.join("out.mp4"))
        } else {
            ("avi", dir.join("out.avi"))
        };

        // 1s color bars with silent audio (MPEG-4 video: every ffmpeg has that encoder, not every one has H.264)
        let status = Command::new(&ffmpeg)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=320x240:d=1",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=44100:cl=mono",
                "-shortest",
                "-c:v",
                "mpeg4",
                "-c:a",
                "aac",
                "-t",
                "1",
                input.to_str().unwrap(),
            ])
            .status()
            .expect("spawn ffmpeg to generate test clip");
        assert!(status.success(), "ffmpeg failed to generate test clip");

        let req = VideoTrimRequest {
            input_path: input.to_string_lossy().into(),
            output_path: output.to_string_lossy().into(),
            start_seconds: 0.1,
            end_seconds: 0.6,
            target_format: format.into(),
            target_resolution: "480p".into(),
            include_audio: true,
            fps: 24,
            quality: "balanced".into(),
        };
        let result = trim_video_stream(&req).expect("trim_video_stream");
        assert!(result.success);
        assert!(output.is_file());
        assert!(result.processed_bytes > 0);
        assert!((result.duration_seconds - 0.5).abs() < 0.01);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn h264_encoder_is_picked_from_the_encoder_list() {
        let both = " V....D libx264              libx264 H.264\n V....D h264_videotoolbox    VideoToolbox H.264 Encoder\n";
        let lgpl = " V....D h264_videotoolbox    VideoToolbox H.264 Encoder\n A....D aac                  AAC\n";
        let none = " V....D mpeg4                MPEG-4 part 2\n";
        assert_eq!(pick_h264_encoder(both), Some(H264Encoder::X264));
        assert_eq!(pick_h264_encoder(lgpl), Some(H264Encoder::VideoToolbox));
        assert_eq!(pick_h264_encoder(none), None);
        // A longer name that merely starts with libx264 is not libx264.
        assert_eq!(pick_h264_encoder(" V....D libx264rgb  x\n"), None);
    }

    #[test]
    fn h264_args_match_the_encoder() {
        let x264 = h264_args(H264Encoder::X264, "high", None);
        assert!(x264.windows(2).any(|w| w == ["-crf", "20"]));
        assert!(x264.contains(&"libx264".to_string()));
        let vt = h264_args(H264Encoder::VideoToolbox, "balanced", None);
        assert!(vt.contains(&"h264_videotoolbox".to_string()));
        assert!(vt.windows(2).any(|w| w == ["-allow_sw", "1"]));
        assert!(!vt.contains(&"-crf".to_string()), "VideoToolbox has no CRF");
        assert!(vt.iter().any(|a| a == "-q:v" || a == "-b:v"));
    }

    #[test]
    fn vaapi_is_picked_only_when_no_software_or_videotoolbox_encoder_is() {
        let vaapi_only = "V....D h264_vaapi           H.264 (VAAPI) (codec h264)\n";
        assert_eq!(pick_h264_encoder(vaapi_only), Some(H264Encoder::VaApi));
        let with_x264 = "V....D libx264              libx264 H.264\n V....D h264_vaapi  H.264 (VAAPI)\n";
        assert_eq!(pick_h264_encoder(with_x264), Some(H264Encoder::X264));
        assert_eq!(pick_h264_encoder("V....D mpeg4  MPEG-4\n"), None);
    }

    #[test]
    fn vaapi_arguments_name_the_gpu_encoder_and_keep_the_quality_scale() {
        let args = h264_args(H264Encoder::VaApi, "high", None);
        assert!(args.windows(2).any(|w| w == ["-c:v", "h264_vaapi"]));
        assert!(args.windows(2).any(|w| w == ["-qp", "20"]), "{args:?}");
        assert!(!args.contains(&"-crf".to_string()) && !args.contains(&"-pix_fmt".to_string()), "frames arrive as nv12 on the GPU: {args:?}");
    }

    #[test]
    fn a_missing_ffmpeg_cannot_encode_h264() {
        assert!(!ffmpeg_can_encode_h264(Path::new("/nonexistent/ffmpeg")));
    }

    #[cfg(not(target_os = "linux"))]
    #[test]
    fn there_is_no_vaapi_device_off_linux() {
        assert_eq!(vaapi_device(Path::new("/nonexistent/ffmpeg")), None);
    }

    #[test]
    fn intel_bitrates_scale_with_the_output_size_and_frame_rate() {
        let hd30 = VideoShape { width: 1920, height: 1080, fps: 30.0 };
        let kbps = |level: &str, shape| videotoolbox_bitrate_kbps(level, shape);
        // 1080p30 matches what was measured: about 29M, 18M, 13M and 7M (0.46, 0.29, 0.21, 0.11 bits per pixel).
        assert_eq!([kbps("lossless", hd30), kbps("high", hd30), kbps("balanced", hd30), kbps("compact", hd30)],
            [28_616, 18_040, 13_064, 6_843]);
        // Levels rise with quality, and anything unknown is Balanced.
        assert!(kbps("lossless", hd30) > kbps("high", hd30) && kbps("high", hd30) > kbps("balanced", hd30)
            && kbps("balanced", hd30) > kbps("compact", hd30));
        assert_eq!(kbps("whatever", hd30), kbps("balanced", hd30));
        // Four times the pixels, four times the bits; twice the frame rate, twice the bits.
        let uhd30 = VideoShape { width: 3840, height: 2160, fps: 30.0 };
        let hd60 = VideoShape { fps: 60.0, ..hd30 };
        assert!((i64::from(kbps("high", uhd30)) - 4 * i64::from(kbps("high", hd30))).abs() <= 2);
        assert!((i64::from(kbps("high", hd60)) - 2 * i64::from(kbps("high", hd30))).abs() <= 1);
        // Tiny pictures keep a floor, and huge ones stay within what the hardware takes.
        assert_eq!(kbps("compact", VideoShape { width: 160, height: 90, fps: 10.0 }), 400);
        assert_eq!(kbps("lossless", VideoShape { width: 7680, height: 4320, fps: 60.0 }), 80_000);
        assert_eq!(kbps("high", VideoShape { width: 1920, height: 1080, fps: 0.0 }), kbps("high", VideoShape { fps: 1.0, ..hd30 }));
    }

    #[test]
    #[cfg(not(target_arch = "aarch64"))]
    fn intel_h264_args_carry_a_scaled_bitrate() {
        let hd = VideoShape { width: 1280, height: 720, fps: 30.0 };
        let vt = h264_args(H264Encoder::VideoToolbox, "high", Some(hd));
        let rate = format!("{}k", videotoolbox_bitrate_kbps("high", hd));
        assert!(vt.windows(2).any(|w| w[0] == "-b:v" && w[1] == rate), "{vt:?}");
        // Without a probed size it falls back to 1080p30.
        let fallback = h264_args(H264Encoder::VideoToolbox, "high", None);
        assert!(fallback.windows(2).any(|w| w == ["-b:v", "18040k"]), "{fallback:?}");
    }

    #[test]
    fn the_video_size_is_read_from_ffmpeg_output() {
        let h264 = "Input #0, mov,mp4, from 'a.mp4':\n  Duration: 00:00:10.00, start: 0.000000, bitrate: 5000 kb/s\n  \
            Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 4900 kb/s, 30 fps, 30 tbr, 15360 tbn (default)\n  \
            Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)\n";
        assert_eq!(parse_video_size(h264), Some((1920, 1080)));
        // The codec tag "0x31637661" and an audio-only file are not sizes.
        assert_eq!(parse_video_size("  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 192 kb/s\n"), None);
        assert_eq!(parse_video_size("  Stream #0:1: Video: mjpeg (Baseline), yuvj420p, 600x600, 90k tbr (attached pic)\n"), None);
        assert_eq!(parse_video_size("Video: vp9 (Profile 0), yuv420p(tv), 854x480, SAR 1:1 DAR 427:240, 24 fps"), Some((854, 480)));
        assert_eq!(parse_video_size(""), None);
    }

    #[test]
    fn probe_reads_what_ffmpeg_says_and_leaves_the_rest_unknown() {
        let mp4 = "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':\n  Duration: 00:01:02.50, start: 0.000000, bitrate: 5168 kb/s\n  \
            Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 5000 kb/s, 29.97 fps, 29.97 tbr, 30k tbn (default)\n  \
            Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)\n";
        let p = parse_probe(mp4);
        assert_eq!((p.width, p.height), (1920, 1080));
        assert_eq!(p.fps, Some(29.97));
        assert_eq!(p.duration_seconds, Some(62.5));
        assert_eq!(p.bitrate_kbps, Some(5168));
        assert_eq!((p.video_codec.as_deref(), p.audio_codec.as_deref()), (Some("H.264"), Some("AAC")));

        // Variable frame rate: only a tbr is given. A phone clip stored sideways swaps width and height.
        let phone = "  Duration: 00:00:10.00, start: 0.0, bitrate: 20000 kb/s\n  \
            Stream #0:0: Video: hevc (Main), yuv420p, 1920x1080, 19000 kb/s, 59.94 tbr, 600 tbn\n      \
            Side data:\n        displaymatrix: rotation of -90.00 degrees\n";
        let p = parse_probe(phone);
        assert_eq!((p.width, p.height), (1080, 1920));
        assert_eq!((p.fps, p.video_codec.as_deref(), p.audio_codec.clone()), (Some(59.94), Some("H.265"), None));

        // Audio only, an unknown duration, and an empty string: nothing is invented.
        let audio = "  Duration: N/A, bitrate: N/A\n  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 192 kb/s\n";
        let p = parse_probe(audio);
        assert_eq!((p.width, p.height, p.fps, p.duration_seconds, p.bitrate_kbps), (0, 0, None, None, None));
        assert_eq!(p.audio_codec.as_deref(), Some("MP3"));
        assert_eq!(parse_probe(""), VideoProbe::default());
    }

    #[test]
    fn the_output_size_follows_the_requested_scaling() {
        assert_eq!(output_size((1920, 1080), "original"), (1920, 1080));
        assert_eq!(output_size((1920, 1080), "720p"), (1280, 720));
        assert_eq!(output_size((1920, 1080), "480p"), (854, 480));
        assert_eq!(output_size((3840, 2160), "1080p"), (1920, 1080));
        // A portrait or odd-shaped source keeps its shape, with an even height.
        assert_eq!(output_size((1080, 1920), "720p"), (1280, 2276));
        assert_eq!(output_size((1000, 333), "480p"), (854, 284));
        // Upscaling is what the filter does, so the bitrate follows it.
        assert_eq!(output_size((640, 360), "1080p"), (1920, 1080));
    }

    #[test]
    #[cfg(target_arch = "aarch64")]
    fn videotoolbox_quality_levels_rise_with_quality() {
        let q = |level: &str| videotoolbox_quality_args(level, None)[1].parse::<u32>().unwrap();
        assert_eq!(videotoolbox_quality_args("high", None)[0], "-q:v");
        assert_eq!([q("lossless"), q("high"), q("balanced"), q("compact")], [80, 72, 66, 56]);
        assert!(q("lossless") > q("high") && q("high") > q("balanced") && q("balanced") > q("compact"));
        assert_eq!(q("anything else"), q("balanced"));
    }

    /// Stream lines of `ffmpeg -i`, for checking what a conversion produced without ffprobe.
    fn describe(ffmpeg: &Path, path: &Path) -> String {
        let out = Command::new(ffmpeg).args(["-hide_banner", "-i"]).arg(path).output().unwrap();
        String::from_utf8_lossy(&out.stderr).into_owned()
    }

    fn has_encoder(ffmpeg: &Path, name: &str) -> bool {
        let out = Command::new(ffmpeg).args(["-hide_banner", "-encoders"]).output().unwrap();
        String::from_utf8_lossy(&out.stdout).lines().any(|l| l.split_whitespace().nth(1) == Some(name))
    }

    /// Every format and quality level, through the real conversion code and whichever ffmpeg is found (set
    /// FFMPEG_PATH to try another). Skips when there is none. Checks codec, size, duration and audio.
    #[test]
    fn video_conversion_covers_every_format_and_level_when_ffmpeg_is_available() {
        let Some((ffmpeg, _)) = which_ffmpeg() else {
            eprintln!("skipping conversion matrix: ffmpeg not found");
            return;
        };
        let dir = std::env::temp_dir().join(format!("cb-conv-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.mp4");
        // 3 s of moving test pattern (640x360) with a tone, in MPEG-4 + AAC: every ffmpeg can make it.
        let status = Command::new(&ffmpeg)
            .args(["-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=3", "-f", "lavfi",
                "-i", "sine=frequency=440:sample_rate=44100:duration=3", "-c:v", "mpeg4", "-q:v", "3", "-c:a", "aac", "-shortest"])
            .arg(&input)
            .status()
            .unwrap();
        assert!(status.success(), "could not make the test clip");

        let convert = |format: &str, resolution: &str, quality: &str, audio: bool, fps: u32| -> (PathBuf, String, u64) {
            let output = dir.join(format!("out-{format}-{resolution}-{quality}-{audio}-{fps}.{format}"));
            let req = VideoTrimRequest {
                input_path: input.to_string_lossy().into(),
                output_path: output.to_string_lossy().into(),
                start_seconds: 0.5,
                end_seconds: 2.5,
                target_format: format.into(),
                target_resolution: resolution.into(),
                include_audio: audio,
                fps,
                quality: quality.into(),
            };
            let result = trim_video_stream(&req).unwrap_or_else(|e| panic!("{format} {resolution} {quality}: {e}"));
            assert!(result.success && (result.duration_seconds - 2.0).abs() < 0.01);
            let info = describe(&ffmpeg, &output);
            (output.clone(), info, std::fs::metadata(&output).unwrap().len())
        };
        let seconds = |info: &str| -> f64 {
            let at = info.find("Duration: ").expect("a duration") + 10;
            let t: Vec<f64> = info[at..at + 11].split(':').map(|p| p.parse().unwrap()).collect();
            t[0] * 3600.0 + t[1] * 60.0 + t[2]
        };

        // H.264 in mp4 and mkv, at each level and resolution, when this ffmpeg can encode it (libx264, VideoToolbox, or a
        // working VA-API GPU). A Linux machine without one must say so plainly instead of failing obscurely.
        if ffmpeg_can_encode_h264(&ffmpeg) {
            // H.264 in mp4 and mkv, at each level and resolution.
            let mut sizes = Vec::new();
            for level in ["lossless", "high", "balanced", "compact"] {
                let (_, info, bytes) = convert("mp4", "original", level, true, 30);
                assert!(info.contains("Video: h264"), "mp4 {level}: {info}");
                assert!(info.contains("Audio: aac"), "mp4 {level} keeps its audio: {info}");
                assert_eq!(parse_video_size(&info), Some((640, 360)), "{level}");
                assert!((seconds(&info) - 2.0).abs() < 0.3, "mp4 {level} duration: {info}");
                sizes.push((level, bytes));
            }
            eprintln!("mp4 sizes by level: {sizes:?}");
            assert!(sizes[0].1 >= sizes[1].1 && sizes[1].1 >= sizes[2].1 && sizes[2].1 >= sizes[3].1,
                "a higher level is never smaller: {sizes:?}");
            // 0 keeps the source's 30 fps; a number changes it.
            let (_, info, _) = convert("mp4", "original", "balanced", true, 0);
            assert_eq!(parse_probe(&info).fps, Some(30.0), "same frame rate: {info}");
            let (_, info, _) = convert("mp4", "original", "balanced", true, 15);
            assert_eq!(parse_probe(&info).fps, Some(15.0), "fixed frame rate: {info}");
            for resolution in ["1080p", "720p", "480p"] {
                let (_, info, _) = convert("mp4", resolution, "balanced", true, 30);
                let expected = output_size((640, 360), resolution);
                assert_eq!(parse_video_size(&info), Some(expected), "{resolution}: {info}");
            }
            let (_, info, _) = convert("mkv", "original", "high", true, 24);
            assert!(info.contains("Video: h264") && info.contains("24 fps"), "mkv: {info}");
            let (_, info, _) = convert("mp4", "original", "high", false, 30);
            assert!(info.contains("Video: h264") && !info.contains("Audio:"), "no audio: {info}");
        } else {
            for format in ["mp4", "mkv"] {
                let req = VideoTrimRequest {
                    input_path: input.to_string_lossy().into(),
                    output_path: dir.join(format!("no-h264.{format}")).to_string_lossy().into(),
                    start_seconds: 0.5,
                    end_seconds: 2.5,
                    target_format: format.into(),
                    target_resolution: "original".into(),
                    include_audio: true,
                    fps: 30,
                    quality: "high".into(),
                };
                let err = trim_video_stream(&req).expect_err("no H.264 encoder: the conversion must be refused").to_string();
                assert!(err.contains("MP4 and MKV are not available"), "{format}: {err}");
            }
            eprintln!("no H.264 encoder on this machine: mp4 and mkv refused with a clear message");
        }

        // Other containers, when this ffmpeg can encode them.
        if has_encoder(&ffmpeg, "libvpx-vp9") {
            let (_, info, _) = convert("webm", "480p", "balanced", true, 30);
            assert!(info.contains("Video: vp9") && info.contains("Audio: opus"), "webm: {info}");
        } else {
            eprintln!("no libvpx-vp9: webm skipped");
        }
        let (_, info, _) = convert("avi", "original", "high", true, 30);
        assert!(info.contains("Video: mpeg4"), "avi: {info}");
        let (_, info, _) = convert("gif", "480p", "high", false, 10);
        assert!(info.contains("Video: gif"), "gif: {info}");
        for (format, codec, needs) in [("aac", "Audio: aac", "aac"), ("wav", "Audio: pcm_s16le", "pcm_s16le"),
            ("flac", "Audio: flac", "flac"), ("mp3", "Audio: mp3", "libmp3lame")] {
            if !has_encoder(&ffmpeg, needs) {
                eprintln!("no {needs}: {format} skipped");
                continue;
            }
            let (_, info, _) = convert(format, "original", "high", true, 30);
            assert!(info.contains(codec) && !info.contains("Video:"), "{format}: {info}");
            assert!((seconds(&info) - 2.0).abs() < 0.3, "{format} duration: {info}");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }
}
