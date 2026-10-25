/**
 * Checks that the canvas photo pipeline (src/utils/photoPipeline.ts) matches the Rust one (src-tauri/src/media.rs).
 * The expected numbers were produced by the Rust functions on the same inputs. Run: npx tsx scripts/photo-pipeline-test.mts
 */
import {
  applyClarity, applySharpen, applyToneAndColor, applyVignette, type PipelineAdjustments,
} from '../src/utils/photoPipeline.ts';

const base: PipelineAdjustments = {
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, warmth: 0, tint: 0, saturation: 0,
  vibrance: 0, sharpness: 0, clarity: 0, vignette: 0, rotation: 0, flipH: false, flipV: false,
  cropX: 0, cropY: 0, cropW: 1, cropH: 1,
};
const PIXELS = [[0,0,0],[255,255,255],[128,128,128],[200,40,40],[30,160,90],[60,80,200],[250,240,10],[12,200,220],[90,90,10],[240,200,190]];
const golden = {"p1": [118, 118, 118, 255, 255, 255, 255, 255, 255, 255, 175, 175, 177, 255, 249, 206, 230, 255, 255, 255, 157, 155, 255, 255, 244, 244, 148, 255, 255, 255], "p2": [31, 0, 6, 255, 242, 235, 177, 111, 105, 255, 16, 12, 26, 160, 54, 89, 63, 236, 255, 231, 0, 5, 197, 219, 125, 78, 0, 255, 180, 157], "p3": [38, 38, 38, 132, 132, 132, 43, 43, 43, 76, 43, 43, 46, 62, 46, 40, 40, 73, 124, 120, 70, 56, 89, 98, 38, 38, 38, 112, 96, 91], "clarity": [0, 255, 0, 37, 218, 50, 74, 181, 100, 111, 144, 150, 148, 107, 200, 185, 70, 250, 222, 33, 44, 91, 164, 20, 149, 105, 70, 208, 46, 120, 255, 0, 170, 0, 254, 237, 67, 187, 0, 135, 120, 64, 182, 73, 40, 255, 0, 90, 17, 237, 140, 106, 148, 198, 186, 68, 255, 255, 0, 16, 48, 207, 84, 17, 238, 60, 84, 170, 110, 177, 77, 160, 255, 0, 227, 39, 215, 0, 141, 114, 45, 217, 38, 104, 108, 147, 80, 222, 32, 130, 0, 255, 180, 110, 144, 255, 225, 29, 0, 15, 239, 74, 130, 125, 124, 199, 56, 100, 45, 210, 150, 147, 108, 200, 249, 6, 250, 95, 160, 44, 197, 58, 94, 43, 212, 144], "sharpen": [0, 255, 0, 37, 218, 50, 74, 181, 100, 111, 144, 150, 148, 107, 200, 185, 70, 250, 222, 33, 44, 91, 164, 20, 141, 114, 70, 229, 25, 120, 255, 0, 170, 0, 255, 255, 46, 208, 0, 135, 120, 64, 182, 73, 40, 255, 0, 90, 0, 255, 140, 76, 178, 190, 216, 38, 255, 255, 0, 0, 48, 207, 84, 17, 238, 60, 54, 200, 110, 207, 47, 160, 255, 0, 248, 0, 255, 0, 141, 114, 54, 217, 38, 104, 108, 147, 80, 255, 0, 130, 0, 255, 180, 80, 174, 255, 255, 0, 0, 0, 255, 74, 130, 125, 124, 199, 56, 100, 45, 210, 150, 147, 108, 200, 249, 6, 250, 95, 160, 44, 197, 58, 94, 43, 212, 144], "vignette": [0, 103, 0, 25, 147, 34, 61, 150, 83, 100, 129, 134, 133, 96, 179, 154, 58, 208, 150, 22, 30, 58, 104, 13, 122, 99, 61, 186, 62, 117, 241, 14, 170, 35, 220, 220, 83, 165, 14, 117, 104, 55, 138, 55, 30, 233, 10, 86, 52, 203, 140, 115, 140, 190, 178, 77, 240, 241, 14, 34, 46, 197, 80, 14, 189, 48, 90, 158, 107, 169, 86, 160, 245, 10, 210, 65, 190, 4, 141, 114, 54, 211, 37, 101, 82, 111, 61, 187, 55, 124, 30, 225, 180, 119, 136, 230, 208, 47, 24, 41, 214, 74, 124, 119, 118, 126, 35, 63, 39, 182, 130, 143, 105, 194, 249, 6, 250, 95, 160, 44, 192, 56, 91, 37, 183, 125], "source": [0, 255, 0, 37, 218, 50, 74, 181, 100, 111, 144, 150, 148, 107, 200, 185, 70, 250, 222, 33, 44, 91, 164, 20, 141, 114, 70, 191, 64, 120, 241, 14, 170, 35, 220, 220, 85, 170, 14, 135, 120, 64, 182, 73, 40, 245, 10, 90, 52, 203, 140, 115, 140, 190, 178, 77, 240, 241, 14, 34, 48, 207, 84, 17, 238, 60, 93, 162, 110, 169, 86, 160, 245, 10, 210, 65, 190, 4, 141, 114, 54, 217, 38, 104, 108, 147, 80, 197, 58, 130, 30, 225, 180, 119, 136, 230, 208, 47, 24, 41, 214, 74, 130, 125, 124, 199, 56, 100, 45, 210, 150, 147, 108, 200, 249, 6, 250, 95, 160, 44, 197, 58, 94, 43, 212, 144]} as Record<string, number[]>;

let failures = 0;
let worst = 0;
function compare(name: string, got: number[], want: number[]) {
  let max = 0;
  want.forEach((w, i) => { max = Math.max(max, Math.abs(w - got[i])); });
  worst = Math.max(worst, max);
  const ok = got.length === want.length && max <= 1;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  (largest difference ${max})`);
}

const profiles: Record<string, Partial<PipelineAdjustments>> = {
  p1: { exposure: 30, contrast: 20, highlights: -40, shadows: 50 },
  p2: { warmth: 40, tint: -30, saturation: 25, vibrance: 60 },
  p3: { brightness: -20, exposure: -25, contrast: -30, saturation: -40 },
};
for (const [name, patch] of Object.entries(profiles)) {
  const rgba = new Uint8ClampedArray(PIXELS.flatMap(([r, g, b]) => [r, g, b, 255]));
  applyToneAndColor(rgba, { ...base, ...patch });
  const rgb = PIXELS.flatMap((_, i) => [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
  compare(`tone and color ${name}`, rgb, golden[name]);
}

const W = 7, H = 6;
const source = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const v = (x * 37 + y * 91 + x * y * 13) % 256;
  const i = (y * W + x) * 4;
  source[i] = v; source[i + 1] = 255 - v; source[i + 2] = (x * 50 + y * 20) % 256; source[i + 3] = 255;
}
const rgbOf = (a: Uint8ClampedArray) => Array.from({ length: W * H }, (_, i) => [a[i * 4], a[i * 4 + 1], a[i * 4 + 2]]).flat();
compare('test image', rgbOf(source), golden.source);
const run = (fn: (d: Uint8ClampedArray) => void) => { const d = new Uint8ClampedArray(source); fn(d); return rgbOf(d); };
compare('clarity 60', run(d => applyClarity(d, W, H, 60)), golden.clarity);
compare('sharpen 50', run(d => applySharpen(d, W, H, 50)), golden.sharpen);
compare('vignette 70', run(d => applyVignette(d, W, H, 70)), golden.vignette);

console.log(failures ? `\n${failures} check(s) failed` : `\nAll checks match Rust (largest difference ${worst} level)`);
process.exit(failures ? 1 : 0);
