/**
 * Video details the app shows. A detail that has not been read from the file is 0 or "—", never a guess, and the
 * screens show it as "—".
 */
import type { VideoMetadata } from '../types';

/** What ffmpeg reported for a file (the Rust `VideoProbe`). */
export interface VideoProbe {
  width: number;
  height: number;
  fps: number | null;
  durationSeconds: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrateKbps: number | null;
}

/** Details for a video nothing has been read from yet. */
export function unknownVideoMeta(durationSeconds = 0): VideoMetadata {
  return { durationSeconds, dimensions: { width: 0, height: 0 }, framerate: 0, codec: '—', bitrate: '—', audioCodec: '—' };
}

export function bitrateLabel(kbps: number | null | undefined): string {
  if (!kbps || kbps <= 0) return '—';
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`;
}

/** `meta` with whatever the probe could read filled in; what it could not read stays as it was. */
export function mergeProbe(meta: VideoMetadata, probe: VideoProbe | null): VideoMetadata {
  if (!probe) return meta;
  return {
    durationSeconds: probe.durationSeconds && probe.durationSeconds > 0 ? probe.durationSeconds : meta.durationSeconds,
    dimensions: probe.width > 0 && probe.height > 0 ? { width: probe.width, height: probe.height } : meta.dimensions,
    framerate: probe.fps && probe.fps > 0 ? probe.fps : meta.framerate,
    codec: probe.videoCodec ?? meta.codec,
    bitrate: probe.bitrateKbps ? bitrateLabel(probe.bitrateKbps) : meta.bitrate,
    audioCodec: probe.audioCodec ?? meta.audioCodec,
  };
}

export function sizeLabel(meta: VideoMetadata | undefined): string | null {
  const d = meta?.dimensions;
  return d && d.width > 0 && d.height > 0 ? `${d.width}×${d.height}` : null;
}

export function fpsLabel(meta: VideoMetadata | undefined): string | null {
  const f = meta?.framerate ?? 0;
  if (f <= 0) return null;
  return `${Number.isInteger(f) ? f : f.toFixed(2).replace(/0+$/, '')} fps`;
}

export function knownText(value: string | undefined): string | null {
  return value && value !== '—' && value.toLowerCase() !== 'unknown' ? value : null;
}
