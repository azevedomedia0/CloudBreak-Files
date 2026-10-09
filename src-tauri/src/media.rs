//! Photo adjustments (image crate) and video trim/transcode (ffmpeg on PATH).

use crate::crypto::compute_sha256;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use image::{DynamicImage, ImageFormat, ImageReader, Rgba, RgbaImage};
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
    #[serde(default = "default_fps")]
    pub fps: u32,
    /// lossless | high | balanced | compact
    #[serde(default = "default_quality")]
    pub quality: String,
}

fn default_true() -> bool {
    true
}
fn default_fps() -> u32 {
    30
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
    #[error("ffmpeg was not found on PATH — install ffmpeg to trim or transcode video")]
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
    out
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

pub(crate) fn find_ffmpeg() -> Result<PathBuf, MediaError> {
    which_ffmpeg().ok_or(MediaError::FfmpegMissing)
}

fn which_ffmpeg() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("FFMPEG_PATH") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Some(path);
        }
    }
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    // Common install locations first — GUI apps often get a stripped PATH.
    let bundled = [
        PathBuf::from("/opt/homebrew/bin").join(name),
        PathBuf::from("/usr/local/bin").join(name),
        PathBuf::from("/usr/bin").join(name),
    ];
    for candidate in &bundled {
        if candidate.is_file() {
            return Some(candidate.clone());
        }
    }
    std::env::var_os("PATH").and_then(|paths| {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
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
    let fps = req.fps.clamp(1, 120);

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
            "fps={fps},{scale}:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse"
        );
        args.extend(["-vf".into(), vf, "-loop".into(), "0".into()]);
    } else {
        let mut vf_parts: Vec<String> = Vec::new();
        if let Some(scale) = scale_filter(&req.target_resolution) {
            vf_parts.push(scale.to_string());
        }
        vf_parts.push(format!("fps={fps}"));
        args.extend(["-vf".into(), vf_parts.join(",")]);

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
                args.extend([
                    "-c:v".into(),
                    "libx264".into(),
                    "-preset".into(),
                    "medium".into(),
                    "-crf".into(),
                    crf.into(),
                    "-pix_fmt".into(),
                    "yuv420p".into(),
                ]);
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
        let Some(ffmpeg) = which_ffmpeg() else {
            eprintln!("skipping ffmpeg trim test — ffmpeg not found");
            return;
        };

        let dir = std::env::temp_dir().join(format!("cb-vid-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.mp4");
        let output = dir.join("out.mp4");

        // 1s color bars, silent audio, H.264
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
                "libx264",
                "-pix_fmt",
                "yuv420p",
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
            target_format: "mp4".into(),
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
}
