/**
 * Native media bridge — photo render + video trim/transcode via Tauri + ffmpeg.
 * Browser mode falls back to canvas (photo) / MediaRecorder (video).
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import type { PhotoAdjustments, VideoConvertOptions } from '../types';

export interface PhotoRenderResult {
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
  processedBytes: number;
  sha256Checksum: string;
}

export interface MediaProcessResult {
  success: boolean;
  outputPath: string;
  processedBytes: number;
  durationSeconds: number;
  sha256Checksum: string;
}

export interface TrimTranscodeOptions {
  sourceUrl: string;
  /** Suggested extension of the source (mp4, mov, …). */
  sourceExtension?: string;
  startSeconds: number;
  endSeconds: number;
  format: VideoConvertOptions['format'];
  resolution: VideoConvertOptions['resolution'];
  quality: VideoConvertOptions['quality'];
  fps: number;
  includeAudio: boolean;
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function mimeForFormat(format: string): string {
  switch (format) {
    case 'gif': return 'image/gif';
    case 'mp3': return 'audio/mpeg';
    case 'aac': return 'audio/aac';
    case 'wav': return 'audio/wav';
    case 'flac': return 'audio/flac';
    case 'mkv': return 'video/x-matroska';
    case 'avi': return 'video/x-msvideo';
    case 'webm': return 'video/webm';
    default: return 'video/mp4';
  }
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read media (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

function extFromUrlOrName(url: string, fallback: string): string {
  try {
    const path = url.split('?')[0];
    const m = path.match(/\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
  } catch { /* ignore */ }
  return fallback;
}

/** Apply photo adjustments with the Rust image pipeline (Tauri) or return null to use canvas. */
export async function renderPhotoNative(
  imageBytes: Uint8Array,
  adjustments: PhotoAdjustments,
  outputFormat: 'jpeg' | 'png' | 'webp' | 'bmp',
  quality: number
): Promise<PhotoRenderResult | null> {
  if (!isTauri()) return null;
  // BMP isn't in the native encoder set — caller should use canvas.
  if (outputFormat === 'bmp') return null;

  const result = (await invoke('process_photo_render', {
    req: {
      imageBase64: bytesToBase64(imageBytes),
      adjustments: {
        exposure: adjustments.exposure,
        brightness: adjustments.brightness,
        contrast: adjustments.contrast,
        highlights: adjustments.highlights,
        shadows: adjustments.shadows,
        warmth: adjustments.warmth,
        tint: adjustments.tint,
        saturation: adjustments.saturation,
        vibrance: adjustments.vibrance,
        sharpness: adjustments.sharpness,
        clarity: adjustments.clarity,
        vignette: adjustments.vignette,
        rotation: adjustments.rotation,
        flipH: adjustments.flipH,
        flipV: adjustments.flipV,
      },
      outputFormat,
      quality: Math.round(Math.min(1, Math.max(0.01, quality)) * 100),
    },
  })) as PhotoRenderResult;

  return result;
}

export function photoResultToDataUrl(result: PhotoRenderResult): string {
  return `data:${result.mimeType};base64,${result.imageBase64}`;
}

export function photoResultToBlobUrl(result: PhotoRenderResult): string {
  const bytes = base64ToBytes(result.imageBase64);
  return URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: result.mimeType }));
}

/**
 * Trim + transcode. Uses ffmpeg via Tauri when available; otherwise MediaRecorder
 * for webm/mp4-ish browser capture of the trim window.
 */
export async function trimAndTranscode(
  opts: TrimTranscodeOptions,
  onProgress?: (pct: number) => void
): Promise<{ blobUrl: string; mimeType: string; sizeBytes: number; checksum?: string; engine: string }> {
  onProgress?.(5);

  if (isTauri()) {
    return trimWithFfmpeg(opts, onProgress);
  }
  return trimWithMediaRecorder(opts, onProgress);
}

async function trimWithFfmpeg(
  opts: TrimTranscodeOptions,
  onProgress?: (pct: number) => void
): Promise<{ blobUrl: string; mimeType: string; sizeBytes: number; checksum?: string; engine: string }> {
  onProgress?.(10);
  const bytes = await fetchBytes(opts.sourceUrl);
  onProgress?.(25);

  const srcExt = opts.sourceExtension || extFromUrlOrName(opts.sourceUrl, 'mp4');
  const inputPath = (await invoke('media_stage_temp', {
    req: { dataBase64: bytesToBase64(bytes), extension: srcExt },
  })) as string;

  const outExt = opts.format;
  // Stage an empty placeholder path by writing a tiny stub then overwriting via ffmpeg output_path.
  const stub = (await invoke('media_stage_temp', {
    req: { dataBase64: bytesToBase64(new Uint8Array([0])), extension: outExt },
  })) as string;

  onProgress?.(40);
  try {
    const result = (await invoke('trim_video_stream', {
      req: {
        inputPath,
        outputPath: stub,
        startSeconds: opts.startSeconds,
        endSeconds: opts.endSeconds,
        targetFormat: opts.format,
        targetResolution: opts.resolution,
        includeAudio: opts.includeAudio,
        fps: opts.fps,
        quality: opts.quality,
      },
    })) as MediaProcessResult;

    onProgress?.(80);
    const outB64 = (await invoke('media_read_temp', {
      req: { path: result.outputPath },
    })) as string;
    const outBytes = base64ToBytes(outB64);
    const mimeType = mimeForFormat(opts.format);
    const blobUrl = URL.createObjectURL(
      new Blob([Uint8Array.from(outBytes)], { type: mimeType })
    );
    onProgress?.(100);
    return {
      blobUrl,
      mimeType,
      sizeBytes: outBytes.byteLength,
      checksum: result.sha256Checksum,
      engine: 'ffmpeg',
    };
  } finally {
    try {
      await invoke('media_cleanup_temp', { req: { path: inputPath } });
    } catch { /* ignore */ }
    try {
      await invoke('media_cleanup_temp', { req: { path: stub } });
    } catch { /* ignore */ }
  }
}

/** Browser fallback: record the trim window from a hidden video element. */
async function trimWithMediaRecorder(
  opts: TrimTranscodeOptions,
  onProgress?: (pct: number) => void
): Promise<{ blobUrl: string; mimeType: string; sizeBytes: number; engine: string }> {
  if (['mp3', 'aac', 'wav', 'flac', 'gif', 'mkv', 'avi'].includes(opts.format)) {
    throw new Error(
      `Browser mode can’t export ${opts.format}. Open the desktop app (with ffmpeg) or pick MP4.`
    );
  }

  const preferWebm = !MediaRecorder.isTypeSupported('video/mp4');
  const mimeType = preferWebm
    ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm')
    : 'video/mp4';

  onProgress?.(15);
  const video = document.createElement('video');
  video.src = opts.sourceUrl;
  video.muted = !opts.includeAudio;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Could not load video for browser trim'));
  });

  const start = Math.max(0, opts.startSeconds);
  const end = Math.min(video.duration || opts.endSeconds, opts.endSeconds);
  if (end <= start) throw new Error('Invalid trim range');

  video.currentTime = start;
  await new Promise<void>(resolve => {
    video.onseeked = () => resolve();
  });

  // CaptureStream is widely available for HTMLVideoElement in Chromium / Safari.
  const stream: MediaStream | undefined = (
    video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }
  ).captureStream?.()
    ?? (video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream?.();

  if (!stream) {
    throw new Error('This browser can’t capture video for trimming. Use the desktop app with ffmpeg.');
  }

  onProgress?.(30);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>(resolve => {
    recorder.onstop = () => resolve();
  });

  recorder.start(200);
  await video.play();

  const clipMs = (end - start) * 1000;
  const tick = window.setInterval(() => {
    const elapsed = (video.currentTime - start) / Math.max(0.001, end - start);
    onProgress?.(30 + Math.min(60, elapsed * 60));
  }, 200);

  await new Promise<void>((resolve, reject) => {
    const onTime = () => {
      if (video.currentTime >= end - 0.05) {
        video.pause();
        video.removeEventListener('timeupdate', onTime);
        resolve();
      }
    };
    video.addEventListener('timeupdate', onTime);
    window.setTimeout(() => {
      video.pause();
      video.removeEventListener('timeupdate', onTime);
      resolve();
    }, clipMs + 500);
    video.onerror = () => reject(new Error('Playback failed during trim'));
  });

  window.clearInterval(tick);
  if (recorder.state !== 'inactive') recorder.stop();
  await stopped;
  stream.getTracks().forEach(t => t.stop());
  video.removeAttribute('src');
  video.load();

  onProgress?.(95);
  const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
  if (blob.size === 0) throw new Error('Trim produced an empty file');
  onProgress?.(100);
  return {
    blobUrl: URL.createObjectURL(blob),
    mimeType: blob.type || mimeType.split(';')[0],
    sizeBytes: blob.size,
    engine: 'MediaRecorder',
  };
}
