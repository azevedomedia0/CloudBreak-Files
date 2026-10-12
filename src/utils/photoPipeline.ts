/**
 * Photo adjustments on the canvas, ported from `src-tauri/src/media.rs` so the live preview, the browser
 * export and the desktop save all produce the same picture. Keep the two in step when changing either.
 */

export interface PipelineAdjustments {
  exposure: number;
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  warmth: number;
  tint: number;
  saturation: number;
  vibrance: number;
  sharpness: number;
  clarity: number;
  vignette: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const luminance = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function isFullFrame(a: Pick<PipelineAdjustments, 'cropX' | 'cropY' | 'cropW' | 'cropH'>): boolean {
  return a.cropX <= 0.0005 && a.cropY <= 0.0005 && a.cropW >= 0.9995 && a.cropH >= 0.9995;
}

/** True when no tone or color slider is moved, so the per-pixel pass can be skipped. */
function toneIsNeutral(adj: PipelineAdjustments): boolean {
  return adj.exposure === 0 && adj.brightness === 0 && adj.contrast === 0 && adj.highlights === 0
    && adj.shadows === 0 && adj.warmth === 0 && adj.tint === 0 && adj.saturation === 0 && adj.vibrance === 0;
}

/** Tone and color for every pixel (RGBA bytes; alpha is left alone). Same math as `calculate_adjusted_pixel`. */
export function applyToneAndColor(data: Uint8ClampedArray, adj: PipelineAdjustments): void {
  if (toneIsNeutral(adj)) return;
  const lift = (adj.brightness / 100) * 0.5 + (adj.exposure / 100) * 1.5;
  const contrast = 1 + adj.contrast / 100;
  const highlightAmt = (adj.highlights / 100) * 0.35;
  const shadowAmt = (adj.shadows / 100) * 0.35;
  const temp = (adj.warmth / 100) * 0.2;
  const tint = (adj.tint / 100) * 0.15;
  const sat = 1 + adj.saturation / 100;
  const vib = adj.vibrance / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = clamp01(data[i] / 255 + lift);
    let g = clamp01(data[i + 1] / 255 + lift);
    let b = clamp01(data[i + 2] / 255 + lift);

    r = clamp01((r - 0.5) * contrast + 0.5);
    g = clamp01((g - 0.5) * contrast + 0.5);
    b = clamp01((b - 0.5) * contrast + 0.5);

    const lum = luminance(r, g, b);
    if (adj.highlights !== 0 && lum > 0.5) {
      const amount = highlightAmt * clamp01((lum - 0.5) / 0.5);
      r = clamp01(r - amount);
      g = clamp01(g - amount);
      b = clamp01(b - amount);
    }
    if (adj.shadows !== 0 && lum < 0.5) {
      const amount = shadowAmt * clamp01(1 - lum / 0.5);
      r = clamp01(r + amount);
      g = clamp01(g + amount);
      b = clamp01(b + amount);
    }

    r = clamp01(r + temp);
    b = clamp01(b - temp);
    g = clamp01(g + tint);
    r = clamp01(r - tint * 0.5);
    b = clamp01(b - tint * 0.5);

    const gray = luminance(r, g, b);
    r = clamp01(gray + (r - gray) * sat);
    g = clamp01(gray + (g - gray) * sat);
    b = clamp01(gray + (b - gray) * sat);

    if (adj.vibrance !== 0) {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const satAmt = max > 1e-6 ? (max - min) / max : 0;
      const v = 1 + vib * (1 - satAmt);
      const g2 = luminance(r, g, b);
      r = clamp01(g2 + (r - g2) * v);
      g = clamp01(g2 + (g - g2) * v);
      b = clamp01(g2 + (b - g2) * v);
    }

    data[i] = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
  }
}

const toByte = (v: number): number => Math.floor(v < 0 ? 0 : v > 255 ? 255 : v);

/** Local contrast: pushes each pixel away from the average of its 8 neighbours. */
export function applyClarity(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (Math.abs(amount) < 0.5) return;
  const strength = (amount / 100) * 0.45;
  const src = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            sum += src[((y + dy) * width + (x + dx)) * 4 + c];
          }
        }
        const blur = Math.trunc(sum / 8);
        const center = src[i + c];
        data[i + c] = toByte((center - blur) * strength + center);
      }
    }
  }
}

/** Sharpen with the four direct neighbours. */
export function applySharpen(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount < 0.5) return;
  const a = (amount / 100) * 1.2;
  const src = new Uint8ClampedArray(data);
  const stride = width * 4;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * stride + x * 4;
      for (let c = 0; c < 3; c++) {
        const around = src[i - stride + c] + src[i + stride + c] + src[i + 4 + c] + src[i - 4 + c];
        data[i + c] = toByte(src[i + c] * (1 + a) - a * 0.25 * around);
      }
    }
  }
}

/** Darken toward the corners. Measured on the picture as shown (after any crop). */
export function applyVignette(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount < 0.5) return;
  const cx = width / 2;
  const cy = height / 2;
  const maxD = Math.max(Math.hypot(cx, cy), 1);
  const strength = (amount / 100) * 0.85;
  const inner = 1 - amount / 120;
  const span = Math.max(1 - inner, 0.01);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = clamp01(Math.hypot(x - cx, y - cy) / maxD);
      const t = clamp01((d - inner) / span);
      const darken = 1 - strength * t * t;
      const i = (y * width + x) * 4;
      data[i] = Math.round(data[i] * darken);
      data[i + 1] = Math.round(data[i + 1] * darken);
      data[i + 2] = Math.round(data[i + 2] * darken);
    }
  }
}

export interface RenderOptions {
  /** Longest side of the result in pixels; omit for full resolution. Used to keep slider drags quick. */
  maxEdge?: number;
  /** Apply the saved crop. False while the crop overlay is being edited, so the whole frame shows. */
  applyCrop: boolean;
}

type DrawableImage = CanvasImageSource & { naturalWidth: number; naturalHeight: number };

/** Rotate and flip, crop, then run the tone and detail passes. Returns a new canvas. */
export function renderPhoto(img: DrawableImage, adj: PipelineAdjustments, opts: RenderOptions): HTMLCanvasElement {
  const quarter = adj.rotation === 90 || adj.rotation === 270;
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const fullW = quarter ? srcH : srcW;
  const fullH = quarter ? srcW : srcH;
  const scale = opts.maxEdge ? Math.min(1, opts.maxEdge / Math.max(fullW, fullH)) : 1;
  const w = Math.max(1, Math.round(fullW * scale));
  const h = Math.max(1, Math.round(fullH * scale));

  // Flip first, then rotate clockwise, the same order the desktop render uses.
  const geo = document.createElement('canvas');
  geo.width = w;
  geo.height = h;
  const gctx = geo.getContext('2d', { willReadFrequently: true });
  if (!gctx) throw new Error('Canvas is not available');
  gctx.translate(w / 2, h / 2);
  gctx.rotate((adj.rotation * Math.PI) / 180);
  gctx.scale(adj.flipH ? -1 : 1, adj.flipV ? -1 : 1);
  const dw = quarter ? h : w;
  const dh = quarter ? w : h;
  gctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);

  let out = geo;
  if (opts.applyCrop && !isFullFrame(adj)) {
    const cw = Math.min(Math.max(adj.cropW, 0.01), 1);
    const ch = Math.min(Math.max(adj.cropH, 0.01), 1);
    const cx = Math.min(Math.max(adj.cropX, 0), 1 - cw);
    const cy = Math.min(Math.max(adj.cropY, 0), 1 - ch);
    const x = Math.round(cx * w);
    const y = Math.round(cy * h);
    if (x < w && y < h) {
      const width = Math.max(1, Math.min(Math.round(cw * w), w - x));
      const height = Math.max(1, Math.min(Math.round(ch * h), h - y));
      const cropped = document.createElement('canvas');
      cropped.width = width;
      cropped.height = height;
      const cctx = cropped.getContext('2d', { willReadFrequently: true });
      if (cctx) {
        cctx.drawImage(geo, x, y, width, height, 0, 0, width, height);
        out = cropped;
      }
    }
  }

  const needsPixels = !toneIsNeutral(adj) || adj.clarity !== 0 || adj.sharpness !== 0 || adj.vignette > 0;
  if (needsPixels) {
    const ctx = out.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const frame = ctx.getImageData(0, 0, out.width, out.height);
      applyToneAndColor(frame.data, adj);
      applyClarity(frame.data, out.width, out.height, adj.clarity);
      applySharpen(frame.data, out.width, out.height, adj.sharpness);
      applyVignette(frame.data, out.width, out.height, adj.vignette);
      ctx.putImageData(frame, 0, 0);
    }
  }
  return out;
}
