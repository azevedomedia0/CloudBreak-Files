import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, RotateCw, RotateCcw, FlipHorizontal, FlipVertical,
  Wand2, Download, Save, Undo2, Redo2, Check,
  ZoomIn, ZoomOut, Maximize2, Minimize2, Crop
} from '@/src/icons';
import { FileItem, PhotoAdjustments } from '../types';
import { photoResultToDataUrl, renderPhotoNative } from '../services/mediaBridge';
import { PhotoNav, PhotoNavArrows } from './PhotoNavArrows';
import { EditPhotoIcon } from './file-browser/EditPhotoIcon';
import { renderPhoto } from '../utils/photoPipeline';
import { isTauri } from '@tauri-apps/api/core';

interface PhotoEditorModalProps {
  file: FileItem;
  isOpen: boolean;
  onClose: () => void;
  onSaveAsVersion: (updatedFile: FileItem, dataUrl: string) => void;
  photoNav?: PhotoNav | null;
  /** Fill the center pane instead of floating over the app. */
  embedded?: boolean;
  /** Whether the adjustments sidebar is showing. It stays mounted when hidden, so edits and state are kept. */
  showAdjustments?: boolean;
}

const ZOOM_MIN = 25;
const ZOOM_MAX = 300;
const ZOOM_STEP = 25;

/** Photo toolbar buttons: a 40px target with a 22px icon. */
const TOOL_BTN = 'flex items-center justify-center w-10 h-10 rounded-full active:scale-95 transition';
const TOOL_ICON = 'w-[22px] h-[22px]';
const TOOL_BTN_OFF = 'text-neutral-200 hover:text-white hover:bg-white/10';
const TOOL_BTN_ON = 'text-cyan-400 bg-cyan-400/15 hover:bg-cyan-400/25';

/** Longest side of the on-screen preview. Exports always use the original size. */
const PREVIEW_MAX_EDGE = 1600;

const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  warmth: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  sharpness: 0,
  clarity: 0,
  vignette: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  cropAspect: 'free',
  cropX: 0,
  cropY: 0,
  cropW: 1,
  cropH: 1,
};

type CropAspect = PhotoAdjustments['cropAspect'];
type CropRect = { x: number; y: number; w: number; h: number };

const CROP_ASPECT_OPTIONS: { id: CropAspect; label: string; ratio: number | null }[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
];

function clampCrop(rect: CropRect): CropRect {
  const w = Math.min(1, Math.max(0.05, rect.w));
  const h = Math.min(1, Math.max(0.05, rect.h));
  const x = Math.min(1 - w, Math.max(0, rect.x));
  const y = Math.min(1 - h, Math.max(0, rect.y));
  return { x, y, w, h };
}

/**
 * Largest centered rect of the given picture aspect (width / height in pixels) that fits in the frame.
 * Rects are stored as fractions of the frame, so the aspect is divided by the frame's own aspect first;
 * otherwise "1:1" on a 3:2 photo would come out 3:2.
 */
function cropForAspect(pixelRatio: number | null, current?: CropRect, frameAspect = 1): CropRect {
  if (pixelRatio == null) {
    return current ? clampCrop(current) : { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
  }
  const ratio = pixelRatio / frameAspect;
  // Frame is 1×1 in normalized space; pick max area with aspect (width/height = ratio).
  let w: number;
  let h: number;
  if (ratio >= 1) {
    w = 0.9;
    h = w / ratio;
    if (h > 0.9) {
      h = 0.9;
      w = h * ratio;
    }
  } else {
    h = 0.9;
    w = h * ratio;
    if (w > 0.9) {
      w = 0.9;
      h = w / ratio;
    }
  }
  return clampCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
}

function isFullFrameCrop(a: Pick<PhotoAdjustments, 'cropX' | 'cropY' | 'cropW' | 'cropH'>): boolean {
  return a.cropX <= 0.0005 && a.cropY <= 0.0005 && a.cropW >= 0.9995 && a.cropH >= 0.9995;
}

interface EditSnapshot {
  adjustments: PhotoAdjustments;
  activePreset: string;
}

function adjustmentsEqual(a: PhotoAdjustments, b: PhotoAdjustments): boolean {
  return (Object.keys(a) as (keyof PhotoAdjustments)[]).every(key => a[key] === b[key]);
}

type ExportFormatId = 'jpeg' | 'png' | 'png-alpha' | 'webp' | 'webp-lossless' | 'bmp';

const EXPORT_FORMATS: {
  id: ExportFormatId;
  label: string;
  mime: string;
  ext: string;
  hasQuality: boolean;
  /** Flatten onto white so formats without alpha stay clean. */
  flatten: boolean;
}[] = [
  { id: 'jpeg', label: 'JPEG (Photo)', mime: 'image/jpeg', ext: 'jpg', hasQuality: true, flatten: true },
  { id: 'png', label: 'PNG (Lossless)', mime: 'image/png', ext: 'png', hasQuality: false, flatten: true },
  { id: 'png-alpha', label: 'Transparent PNG', mime: 'image/png', ext: 'png', hasQuality: false, flatten: false },
  { id: 'webp', label: 'WebP (NextGen)', mime: 'image/webp', ext: 'webp', hasQuality: true, flatten: true },
  { id: 'webp-lossless', label: 'WebP (Lossless)', mime: 'image/webp', ext: 'webp', hasQuality: false, flatten: false },
  { id: 'bmp', label: 'BMP (Bitmap)', mime: 'image/bmp', ext: 'bmp', hasQuality: false, flatten: true },
];

function canvasToBmpDataUrl(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const headerSize = 54;
  const buffer = new ArrayBuffer(headerSize + pixelBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // BITMAPFILEHEADER
  view.setUint16(0, 0x4d42, true); // 'BM'
  view.setUint32(2, headerSize + pixelBytes, true);
  view.setUint32(10, headerSize, true);
  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);

  // Pixels bottom-up, BGR
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = headerSize + y * rowSize;
    for (let x = 0; x < width; x++) {
      const si = srcRow + x * 4;
      const di = dstRow + x * 3;
      bytes[di] = imageData.data[si + 2];
      bytes[di + 1] = imageData.data[si + 1];
      bytes[di + 2] = imageData.data[si];
    }
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:image/bmp;base64,${btoa(binary)}`;
}

function canvasToExportDataUrl(
  source: HTMLCanvasElement,
  format: (typeof EXPORT_FORMATS)[number],
  quality: number,
): string {
  let canvas: HTMLCanvasElement = source;
  if (format.flatten) {
    const flat = document.createElement('canvas');
    flat.width = source.width;
    flat.height = source.height;
    const ctx = flat.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, flat.width, flat.height);
      ctx.drawImage(source, 0, 0);
      canvas = flat;
    }
  }

  if (format.id === 'bmp') return canvasToBmpDataUrl(canvas);

  const qualityArg = format.hasQuality ? quality : format.id === 'webp-lossless' ? 1 : undefined;
  return qualityArg === undefined
    ? canvas.toDataURL(format.mime)
    : canvas.toDataURL(format.mime, qualityArg);
}

const PRESETS: { id: string; label: string; desc: string; values: Partial<PhotoAdjustments> }[] = [
  {
    id: 'natural',
    label: 'Clean Slate',
    desc: 'Neutral balance',
    values: { ...DEFAULT_ADJUSTMENTS },
  },
  {
    id: 'portra',
    label: 'Portra 400',
    desc: 'Warm analog skin & soft roll-off',
    values: { exposure: 8, contrast: 12, warmth: 22, saturation: -8, shadows: 15, highlights: -10, clarity: 10, vignette: 12 },
  },
  {
    id: 'teal_orange',
    label: 'Teal & Orange',
    desc: 'Cinematic color contrast',
    values: { exposure: 4, contrast: 25, warmth: 18, tint: -12, saturation: 15, shadows: -10, highlights: -15, clarity: 25, vignette: 20 },
  },
  {
    id: 'mono',
    label: 'High-Key Silver',
    desc: 'Deep blacks & rich silver tones',
    values: { exposure: 10, contrast: 38, saturation: -100, shadows: -15, highlights: 10, clarity: 30, vignette: 28 },
  },
  {
    id: 'nordic',
    label: 'Nordic Fog',
    desc: 'Muted blues & lifted blacks',
    values: { exposure: -4, contrast: -10, warmth: -25, tint: 8, shadows: 25, highlights: -20, saturation: -18, vignette: 8 },
  },
  {
    id: 'golden',
    label: 'Golden Hour',
    desc: 'Lush golden glow & amber tint',
    values: { exposure: 12, contrast: 15, warmth: 38, tint: 12, saturation: 22, shadows: 8, highlights: -12, vignette: 15 },
  },
];

export const PhotoEditorModal: React.FC<PhotoEditorModalProps> = ({
  file,
  isOpen,
  onClose,
  onSaveAsVersion,
  photoNav = null,
  embedded = false,
  showAdjustments = true,
}) => {
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>(DEFAULT_ADJUSTMENTS);
  const [activeTab, setActiveTab] = useState<'adjust' | 'presets' | 'geometry'>('adjust');
  const [activePreset, setActivePreset] = useState<string>('natural');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormatId>('jpeg');
  const [exportQuality, setExportQuality] = useState<number>(0.92);
  const selectedExportFormat = EXPORT_FORMATS.find(f => f.id === exportFormat) ?? EXPORT_FORMATS[0];
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [draftCrop, setDraftCrop] = useState<CropRect>({ x: 0, y: 0, w: 1, h: 1 });
  const [draftAspect, setDraftAspect] = useState<CropAspect>('free');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragRef = useRef<{
    handle: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
    startX: number;
    startY: number;
    origin: CropRect;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  // Zooming enlarges the canvas itself (not a transform), so the scroller around it gets scroll bars.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);
  // The photo's own size in pixels, once it has loaded.
  const [photoSize, setPhotoSize] = useState<{ width: number; height: number } | null>(null);
  const histogramCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const adjustmentsRef = useRef<PhotoAdjustments>(DEFAULT_ADJUSTMENTS);
  const presetRef = useRef('natural');
  const pastRef = useRef<EditSnapshot[]>([]);
  const futureRef = useRef<EditSnapshot[]>([]);
  const sessionRef = useRef<{ key: string; at: number } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // WKWebView in the desktop app often refuses element fullscreen, so fall back to the native window.
  const windowFullscreenRef = useRef(false);

  const setNativeFullscreen = async (on: boolean): Promise<boolean> => {
    if (!isTauri()) return false;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFullscreen(on);
      windowFullscreenRef.current = on;
      setIsFullscreen(on);
      return true;
    } catch {
      return false;
    }
  };

  // Keep the button in step when the user leaves native fullscreen with Esc or the green window button.
  useEffect(() => {
    if (!isTauri()) return;
    const onResize = async () => {
      if (!windowFullscreenRef.current) return;
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        if (!(await getCurrentWindow().isFullscreen())) {
          windowFullscreenRef.current = false;
          setIsFullscreen(false);
        }
      } catch { /* leave the state as it is */ }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Leave native fullscreen when the editor closes.
  useEffect(() => () => {
    if (windowFullscreenRef.current) void setNativeFullscreen(false);
  }, []);

  const toggleFullscreen = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (windowFullscreenRef.current) {
        await setNativeFullscreen(false);
        return;
      }
      if (stage.requestFullscreen) {
        await stage.requestFullscreen();
        if (document.fullscreenElement) return;
      }
    } catch {
      // Fullscreen may be blocked by the web view; try the native window below.
    }
    await setNativeFullscreen(true);
  };

  // Load image on file change. Reopening or switching photos clears history.
  useEffect(() => {
    pastRef.current = [];
    futureRef.current = [];
    sessionRef.current = null;
    setCanUndo(false);
    setCanRedo(false);
    if (!isOpen) return;
    const fresh = { ...DEFAULT_ADJUSTMENTS };
    adjustmentsRef.current = fresh;
    presetRef.current = 'natural';
    setAdjustments(fresh);
    setActivePreset('natural');
    setZoomLevel(100);
    setCropMode(false);
    setDraftCrop({ x: 0, y: 0, w: 1, h: 1 });
    setDraftAspect('free');

    setPhotoSize(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = file.url;
    img.onload = () => {
      imgRef.current = img;
      setPhotoSize({ width: img.naturalWidth, height: img.naturalHeight });
      renderImage();
    };
  }, [file.id, file.url, isOpen]);

  // Re-render when adjustments or crop preview mode changes
  useEffect(() => {
    if (imgRef.current) {
      renderImage();
    }
  }, [adjustments, cropMode]);

  const pushPast = () => {
    pastRef.current.push({
      adjustments: { ...adjustmentsRef.current },
      activePreset: presetRef.current,
    });
    if (pastRef.current.length > 80) pastRef.current.shift();
    futureRef.current = [];
    setCanRedo(false);
  };

  const writeEdit = (next: PhotoAdjustments, preset: string) => {
    adjustmentsRef.current = next;
    presetRef.current = preset;
    setAdjustments(next);
    setActivePreset(preset);
    const top = pastRef.current[pastRef.current.length - 1];
    if (top && adjustmentsEqual(top.adjustments, next) && top.activePreset === preset) {
      pastRef.current.pop();
      sessionRef.current = null;
    }
    setCanUndo(pastRef.current.length > 0);
  };

  const updateAdj = <K extends keyof PhotoAdjustments>(
    key: K,
    value: PhotoAdjustments[K],
    coalesce = false,
  ) => {
    if (adjustmentsRef.current[key] === value) return;
    const now = Date.now();
    const sessionKey = String(key);
    const session = sessionRef.current;
    const continuing = coalesce && session?.key === sessionKey && now - session.at < 700;
    if (!continuing) {
      pushPast();
      sessionRef.current = coalesce ? { key: sessionKey, at: now } : null;
    } else {
      sessionRef.current = { key: sessionKey, at: now };
    }
    const next: PhotoAdjustments = { ...adjustmentsRef.current };
    next[key] = value;
    writeEdit(next, '');
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    const next = { ...adjustmentsRef.current, ...preset.values };
    if (adjustmentsEqual(next, adjustmentsRef.current) && presetRef.current === preset.id) return;
    sessionRef.current = null;
    pushPast();
    writeEdit(next, preset.id);
  };

  const undo = () => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    sessionRef.current = null;
    futureRef.current.push({
      adjustments: { ...adjustmentsRef.current },
      activePreset: presetRef.current,
    });
    adjustmentsRef.current = { ...prev.adjustments };
    presetRef.current = prev.activePreset;
    setAdjustments(adjustmentsRef.current);
    setActivePreset(prev.activePreset);
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
  };

  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    sessionRef.current = null;
    pastRef.current.push({
      adjustments: { ...adjustmentsRef.current },
      activePreset: presetRef.current,
    });
    adjustmentsRef.current = { ...next.adjustments };
    presetRef.current = next.activePreset;
    setAdjustments(adjustmentsRef.current);
    setActivePreset(next.activePreset);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  };

  const resetAdjustments = () => {
    if (adjustmentsEqual(DEFAULT_ADJUSTMENTS, adjustmentsRef.current) && presetRef.current === 'natural') return;
    sessionRef.current = null;
    pushPast();
    writeEdit({ ...DEFAULT_ADJUSTMENTS }, 'natural');
  };

  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  undoRef.current = undo;
  redoRef.current = redo;

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && cropMode) {
        e.preventDefault();
        cancelCropMode();
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redoRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, cropMode]);

  useEffect(() => {
    if (!isOpen || !photoNav) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowLeft' && photoNav.hasPrev) {
        event.preventDefault();
        photoNav.onPrev();
      } else if (event.key === 'ArrowRight' && photoNav.hasNext) {
        event.preventDefault();
        photoNav.onNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, photoNav]);

  /** Width / height of the whole frame as it is now, after any rotation. */
  const frameAspect = (): number => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return 1;
    const quarter = adjustmentsRef.current.rotation === 90 || adjustmentsRef.current.rotation === 270;
    return quarter ? img.naturalHeight / img.naturalWidth : img.naturalWidth / img.naturalHeight;
  };

  const enterCropMode = () => {
    const adj = adjustmentsRef.current;
    const next = isFullFrameCrop(adj)
      ? cropForAspect(CROP_ASPECT_OPTIONS.find(o => o.id === adj.cropAspect)?.ratio ?? null, undefined, frameAspect())
      : clampCrop({ x: adj.cropX, y: adj.cropY, w: adj.cropW, h: adj.cropH });
    setDraftAspect(adj.cropAspect);
    setDraftCrop(next);
    setCropMode(true);
  };

  const cancelCropMode = () => {
    cropDragRef.current = null;
    setCropMode(false);
  };

  const applyCropMode = () => {
    const rect = clampCrop(draftCrop);
    const next: PhotoAdjustments = {
      ...adjustmentsRef.current,
      cropAspect: draftAspect,
      cropX: rect.x,
      cropY: rect.y,
      cropW: rect.w,
      cropH: rect.h,
    };
    if (!adjustmentsEqual(next, adjustmentsRef.current)) {
      sessionRef.current = null;
      pushPast();
      writeEdit(next, '');
    }
    cropDragRef.current = null;
    setCropMode(false);
  };

  const clearCrop = () => {
    const next: PhotoAdjustments = {
      ...adjustmentsRef.current,
      cropAspect: 'free',
      cropX: 0,
      cropY: 0,
      cropW: 1,
      cropH: 1,
    };
    if (!adjustmentsEqual(next, adjustmentsRef.current)) {
      sessionRef.current = null;
      pushPast();
      writeEdit(next, '');
    }
    setDraftCrop({ x: 0, y: 0, w: 1, h: 1 });
    setDraftAspect('free');
    setCropMode(false);
  };

  const setCropAspectOption = (id: CropAspect) => {
    const ratio = CROP_ASPECT_OPTIONS.find(o => o.id === id)?.ratio ?? null;
    setDraftAspect(id);
    setDraftCrop(prev => cropForAspect(ratio, id === 'free' ? prev : undefined, frameAspect()));
  };

  // Draw the picture with the same math the desktop render uses (src/utils/photoPipeline.ts).
  // The preview is capped in size so dragging a slider stays smooth; exports render at full size.
  const renderImage = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // In crop mode show the full frame so the overlay can be edited.
    const rendered = renderPhoto(img, adjustmentsRef.current, { maxEdge: PREVIEW_MAX_EDGE, applyCrop: !cropMode });
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(rendered, 0, 0);
    drawHistogram(ctx, canvas);
  };

  /** Full-size render with the crop applied, for browser exports. */
  const renderForExport = (): HTMLCanvasElement => {
    const img = imgRef.current;
    if (!img) throw new Error('The photo is not loaded yet');
    return renderPhoto(img, adjustmentsRef.current, { applyCrop: true });
  };

  // Draw real-time RGB histogram
  const drawHistogram = (sourceCtx: CanvasRenderingContext2D, sourceCanvas: HTMLCanvasElement) => {
    const histCanvas = histogramCanvasRef.current;
    if (!histCanvas) return;
    const hCtx = histCanvas.getContext('2d');
    if (!hCtx) return;

    hCtx.clearRect(0, 0, histCanvas.width, histCanvas.height);

    try {
      // Downsample for instant performance
      const sampleSize = 120;
      const stepX = Math.max(1, Math.floor(sourceCanvas.width / sampleSize));
      const stepY = Math.max(1, Math.floor(sourceCanvas.height / sampleSize));
      const imgData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
      const data = imgData.data;

      const rHist = new Array(256).fill(0);
      const gHist = new Array(256).fill(0);
      const bHist = new Array(256).fill(0);

      for (let y = 0; y < sourceCanvas.height; y += stepY) {
        for (let x = 0; x < sourceCanvas.width; x += stepX) {
          const idx = (y * sourceCanvas.width + x) * 4;
          rHist[data[idx]]++;
          gHist[data[idx + 1]]++;
          bHist[data[idx + 2]]++;
        }
      }

      const maxVal = Math.max(...rHist, ...gHist, ...bHist) || 1;
      const w = histCanvas.width;
      const h = histCanvas.height;

      // Draw R, G, B channels with smooth opacity
      const channels = [
        { color: 'rgba(239, 68, 68, 0.45)', data: rHist },
        { color: 'rgba(34, 197, 94, 0.45)', data: gHist },
        { color: 'rgba(59, 130, 246, 0.45)', data: bHist },
      ];

      channels.forEach(ch => {
        hCtx.beginPath();
        hCtx.moveTo(0, h);
        for (let i = 0; i < 256; i++) {
          const x = (i / 255) * w;
          const y = h - (ch.data[i] / maxVal) * (h - 2);
          hCtx.lineTo(x, y);
        }
        hCtx.lineTo(w, h);
        hCtx.fillStyle = ch.color;
        hCtx.fill();
      });
    } catch {
      // Cross-origin image read restriction fallback
    }
  };

  const nativeOutputFormat = (): 'jpeg' | 'png' | 'webp' | 'bmp' | null => {
    switch (selectedExportFormat.id) {
      case 'jpeg': return 'jpeg';
      case 'png':
      case 'png-alpha': return 'png';
      case 'webp':
      case 'webp-lossless': return 'webp';
      case 'bmp': return 'bmp';
      default: return null;
    }
  };

  const finishSave = (dataUrl: string, sizeBytes: number) => {
    const updatedFile: FileItem = {
      ...file,
      version: file.version + 1,
      updatedAt: new Date().toISOString(),
      url: dataUrl,
      thumbnailUrl: dataUrl,
      sizeBytes,
    };
    onSaveAsVersion(updatedFile, dataUrl);
    setIsProcessing(false);
    setStatusMessage(`Saved as Version ${updatedFile.version}`);
    setTimeout(() => {
      setStatusMessage(null);
      onClose();
    }, 1200);
  };

  const handleSaveAsVersion = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsProcessing(true);
    setStatusMessage('Rendering high-fidelity raster…');

    try {
      const fmt = nativeOutputFormat();
      if (fmt && fmt !== 'bmp') {
        const sourceBytes = new Uint8Array(await (await fetch(file.url)).arrayBuffer());
        const native = await renderPhotoNative(sourceBytes, adjustments, fmt, exportQuality);
        if (native) {
          finishSave(photoResultToDataUrl(native), native.processedBytes);
          return;
        }
      }
      // Canvas fallback (browser, BMP, or native unavailable)
      const dataUrl = canvasToExportDataUrl(renderForExport(), selectedExportFormat, exportQuality);
      finishSave(dataUrl, Math.round(file.sizeBytes * 1.05));
    } catch (err) {
      // Fall back to canvas if native render fails
      try {
        const dataUrl = canvasToExportDataUrl(renderForExport(), selectedExportFormat, exportQuality);
        finishSave(dataUrl, Math.round(file.sizeBytes * 1.05));
      } catch {
        setIsProcessing(false);
        setStatusMessage(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleExportDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${file.name.replace(/\.[^/.]+$/, '')}_graded_v${file.version + 1}.${selectedExportFormat.ext}`;

    try {
      const fmt = nativeOutputFormat();
      if (fmt && fmt !== 'bmp') {
        const sourceBytes = new Uint8Array(await (await fetch(file.url)).arrayBuffer());
        const native = await renderPhotoNative(sourceBytes, adjustments, fmt, exportQuality);
        if (native) {
          link.href = photoResultToDataUrl(native);
          link.click();
          return;
        }
      }
    } catch {
      /* canvas fallback */
    }
    link.href = canvasToExportDataUrl(renderForExport(), selectedExportFormat, exportQuality);
    link.click();
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setViewport({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen, showAdjustments]);

  // The canvas is redrawn at a new size after a crop or rotate; follow it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && (canvas.width !== canvasSize.w || canvas.height !== canvasSize.h)) {
      setCanvasSize({ w: canvas.width, h: canvas.height });
    }
  });

  // Shown size: the picture fitted into the viewport (never enlarged past its own size at 100%), times the zoom.
  const stagePadding = 32;
  const fitScale = canvasSize.w > 0 && viewport.w > 0
    ? Math.min(1, (viewport.w - stagePadding) / canvasSize.w, (viewport.h - stagePadding) / canvasSize.h)
    : 1;
  const shownScale = Math.max(0.01, fitScale) * (zoomLevel / 100);
  const canvasStyle: React.CSSProperties | undefined = canvasSize.w > 0 && viewport.w > 0
    ? { width: canvasSize.w * shownScale, height: canvasSize.h * shownScale }
    : undefined;

  if (!isOpen) return null;

  return (
    <div className={embedded
      ? 'flex-1 min-w-0 min-h-0 flex'
      : 'fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4'}
    >
      <div className={embedded
        ? 'relative flex flex-col w-full h-full min-h-0 bg-neutral-900 overflow-hidden'
        : 'app-modal-panel relative flex flex-col w-full h-[95vh] max-w-7xl bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl'}
      >
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <EditPhotoIcon className="w-5 h-5" title="Photo Studio" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-neutral-100 truncate max-w-md">
                  {file.name}
                </h2>
              </div>
              <p className="text-xs text-neutral-500">
                {['Studio Grading Suite', photoSize && `${photoSize.width}×${photoSize.height}`, file.photoExif?.camera].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetAdjustments}
              title="Reset adjustments"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-transparent text-neutral-300 hover:text-neutral-100"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              className="flex items-center justify-center p-1.5 text-neutral-400 hover:text-neutral-200 bg-neutral-800/50 border border-neutral-700/60 rounded-lg hover:bg-neutral-800 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
              className="flex items-center justify-center p-1.5 text-neutral-400 hover:text-neutral-200 bg-neutral-800/50 border border-neutral-700/60 rounded-lg hover:bg-neutral-800 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleSaveAsVersion}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div role="status" className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-neutral-950 border border-cyan-500/40 rounded-lg shadow-xl text-xs font-medium text-cyan-300">
            {statusMessage}
          </div>
        )}

        {/* Main Body */}
        <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
          
          {/* Canvas Viewport Area */}
          <div
            ref={stageRef}
            className="flex-1 min-w-0 flex flex-col items-center justify-center p-4 bg-neutral-950/60 relative overflow-hidden select-none"
          >
            {photoNav && <PhotoNavArrows nav={photoNav} />}

            {/* Canvas scroller: scroll bars appear once the zoomed picture is larger than the viewport */}
            <div ref={scrollerRef} className="photo-scroller flex-1 min-h-0 w-full overflow-auto">
              <div className="min-w-full min-h-full flex p-4">
                <div className="relative m-auto shrink-0">
                <canvas
                  ref={canvasRef}
                  style={canvasStyle}
                  className="max-w-none rounded shadow-2xl border border-neutral-800/80 block"
                />
                {cropMode && (
                  <CropOverlay
                    rect={draftCrop}
                    aspect={draftAspect}
                    frameAspect={frameAspect()}
                    onChange={setDraftCrop}
                    dragRef={cropDragRef}
                  />
                )}
                </div>
              </div>
            </div>

            {/* Crop mode toolbar */}
            {cropMode ? (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-20">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-neutral-900/95 border border-neutral-700 rounded-full backdrop-blur-md text-sm text-neutral-300 shadow-2xl">
                  {CROP_ASPECT_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCropAspectOption(opt.id)}
                      className={`px-3.5 py-2 rounded-full font-medium transition-colors ${
                        draftAspect === opt.id
                          ? 'bg-cyan-500/25 text-cyan-300'
                          : 'hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900/95 border border-neutral-700 rounded-full backdrop-blur-md text-sm shadow-2xl">
                  <button
                    type="button"
                    onClick={cancelCropMode}
                    className="px-4 py-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={clearCrop}
                    className="px-4 py-2 rounded-full text-neutral-300 hover:text-white hover:bg-white/10"
                    title="Reset to full frame"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={applyCropMode}
                    className="px-5 py-2 rounded-full font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300"
                  >
                    Apply Crop
                  </button>
                </div>
              </div>
            ) : (
              <div
                role="toolbar"
                aria-label="Photo tools"
                className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-3.5 py-2 bg-neutral-900/90 border border-neutral-700 rounded-full backdrop-blur-md text-sm text-neutral-300 shadow-2xl"
              >
                <div className="flex items-center gap-0.5 pr-2.5 border-r border-neutral-700">
                  <button
                    type="button"
                    onClick={enterCropMode}
                    className={`${TOOL_BTN} ${!isFullFrameCrop(adjustments) ? TOOL_BTN_ON : TOOL_BTN_OFF}`}
                    title="Crop"
                    aria-label="Crop"
                  >
                    <Crop className={TOOL_ICON} />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateAdj('rotation', (adjustmentsRef.current.rotation + 90) % 360)}
                    className={`${TOOL_BTN} ${adjustments.rotation !== 0 ? TOOL_BTN_ON : TOOL_BTN_OFF}`}
                    title="Rotate clockwise 90°"
                    aria-label="Rotate clockwise 90 degrees"
                  >
                    <RotateCw className={TOOL_ICON} />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateAdj('flipH', !adjustmentsRef.current.flipH)}
                    className={`${TOOL_BTN} ${adjustments.flipH ? TOOL_BTN_ON : TOOL_BTN_OFF}`}
                    title="Flip horizontal"
                    aria-label="Flip horizontal"
                    aria-pressed={adjustments.flipH}
                  >
                    <FlipHorizontal className={TOOL_ICON} />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateAdj('flipV', !adjustmentsRef.current.flipV)}
                    className={`${TOOL_BTN} ${adjustments.flipV ? TOOL_BTN_ON : TOOL_BTN_OFF}`}
                    title="Flip vertical"
                    aria-label="Flip vertical"
                    aria-pressed={adjustments.flipV}
                  >
                    <FlipVertical className={TOOL_ICON} />
                  </button>
                </div>

                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setZoomLevel(z => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
                    disabled={zoomLevel <= ZOOM_MIN}
                    className={`${TOOL_BTN} ${TOOL_BTN_OFF} disabled:opacity-35 disabled:pointer-events-none`}
                    title="Zoom out"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className={TOOL_ICON} />
                  </button>
                  <span className="w-14 text-center font-mono text-neutral-200 text-[13px] tabular-nums" aria-live="polite">
                    {zoomLevel}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomLevel(z => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
                    disabled={zoomLevel >= ZOOM_MAX}
                    className={`${TOOL_BTN} ${TOOL_BTN_OFF} disabled:opacity-35 disabled:pointer-events-none`}
                    title="Zoom in"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className={TOOL_ICON} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomLevel(100)}
                    disabled={zoomLevel === 100}
                    className="h-10 px-3 rounded-full text-[13px] font-semibold text-cyan-400 hover:bg-cyan-400/10 active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none"
                    title="Fit to window"
                    aria-label="Fit to window"
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleFullscreen()}
                    className={`${TOOL_BTN} ${isFullscreen ? TOOL_BTN_ON : TOOL_BTN_OFF}`}
                    title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? <Minimize2 className={TOOL_ICON} /> : <Maximize2 className={TOOL_ICON} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Adjustments & Presets Sidebar */}
          <div className={`w-84 md:w-96 h-full min-h-0 flex-col border-l border-neutral-800 bg-neutral-900/95 overflow-y-auto ${showAdjustments ? 'flex' : 'hidden'}`}>
            
            {/* Live RGB Histogram */}
            <div className="p-4 border-b border-neutral-800 bg-neutral-950/40">
              <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
                <span className="font-medium uppercase tracking-wider text-[10px]">Real-Time RGB Spectrum</span>
                <span className="text-[10px] text-neutral-500 font-mono">sRGB / Display P3</span>
              </div>
              <div className="h-28 w-full bg-neutral-950 rounded border border-neutral-800/80 overflow-hidden relative">
                <canvas
                  ref={histogramCanvasRef}
                  width={280}
                  height={112}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-neutral-800 bg-neutral-950/20 text-xs">
              <button
                onClick={() => setActiveTab('adjust')}
                className={`flex-1 py-2.5 font-medium border-b-2 transition-colors ${
                  activeTab === 'adjust'
                    ? 'border-cyan-400 text-cyan-400 bg-neutral-850'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Pro Adjust
              </button>
              <button
                onClick={() => setActiveTab('presets')}
                className={`flex-1 py-2.5 font-medium border-b-2 transition-colors ${
                  activeTab === 'presets'
                    ? 'border-cyan-400 text-cyan-400 bg-neutral-850'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                LUTs & Presets
              </button>
              <button
                onClick={() => setActiveTab('geometry')}
                className={`flex-1 py-2.5 font-medium border-b-2 transition-colors ${
                  activeTab === 'geometry'
                    ? 'border-cyan-400 text-cyan-400 bg-neutral-850'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Export
              </button>
            </div>

            {/* Tab: Pro Adjustments */}
            {activeTab === 'adjust' && (
              <div className="p-4 space-y-6 flex-1">
                {/* Light & Tone Group */}
                <div>
                  <h3 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                    Light & Exposure
                  </h3>
                  <div className="space-y-3.5">
                    <AdjustmentSlider
                      label="Exposure"
                      value={adjustments.exposure}
                      min={-100}
                      max={100}
                      onChange={v => updateAdj('exposure', v, true)}
                    />
                    <AdjustmentSlider
                      label="Brightness"
                      value={adjustments.brightness}
                      min={-100}
                      max={100}
                      onChange={v => updateAdj('brightness', v, true)}
                    />
                    <AdjustmentSlider
                      label="Contrast"
                      value={adjustments.contrast}
                      min={-100}
                      max={100}
                      onChange={v => updateAdj('contrast', v, true)}
                    />
                    <AdjustmentSlider
                      label="Highlights"
                      value={adjustments.highlights}
                      min={-100}
                      max={100}
                      onChange={v => updateAdj('highlights', v, true)}
                    />
                    <AdjustmentSlider
                      label="Shadows"
                      value={adjustments.shadows}
                      min={-100}
                      max={100}
                      onChange={v => updateAdj('shadows', v, true)}
                    />
                  </div>
                </div>

                {/* Color & Temperature Group */}
                <div className="pt-3 border-t border-neutral-800">
                  <h3 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                    Color & White Balance
                  </h3>
                  <div className="space-y-3.5">
                    <AdjustmentSlider
                      label="Temp / Warmth"
                      value={adjustments.warmth}
                      min={-100}
                      max={100}
                      onChange={v => updateAdj('warmth', v, true)}
                    />
                    <AdjustmentSlider
                      label="Tint (Green / Mag)"
                      value={adjustments.tint}
                      min={-100}
                      max={100}
                      onChange={v => updateAdj('tint', v, true)}
                    />
                    <AdjustmentSlider
                      label="Saturation"
                      value={adjustments.saturation}
                      min={-100}
                      max={100}
                      onChange={v => updateAdj('saturation', v, true)}
                    />
                    <AdjustmentSlider
                      label="Vibrance"
                      value={adjustments.vibrance}
                      min={-100}
                      max={100}
                      onChange={v => updateAdj('vibrance', v, true)}
                    />
                  </div>
                </div>

                {/* Optics & Effects */}
                <div className="pt-3 border-t border-neutral-800">
                  <h3 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                    Optics & Detail
                  </h3>
                  <div className="space-y-3.5">
                    <AdjustmentSlider
                      label="Clarity"
                      value={adjustments.clarity}
                      min={0}
                      max={100}
                      onChange={v => updateAdj('clarity', v, true)}
                    />
                    <AdjustmentSlider
                      label="Vignette"
                      value={adjustments.vignette}
                      min={0}
                      max={100}
                      onChange={v => updateAdj('vignette', v, true)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Presets */}
            {activeTab === 'presets' && (
              <div className="p-4 space-y-3 flex-1">
                <p className="text-xs text-neutral-400 mb-2">
                  One-tap professional emulation profiles calibrated for editorial, cinema, and digital masters.
                </p>
                <div className="space-y-2.5">
                  {PRESETS.map(p => {
                    const isSelected = activePreset === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => applyPreset(p)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md shadow-cyan-950/50'
                            : 'bg-neutral-850 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-semibold ${isSelected ? 'text-cyan-300' : 'text-neutral-200'}`}>
                            {p.label}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-0.5">{p.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab: Export Format Settings */}
            {activeTab === 'geometry' && (
              <div className="p-4 flex flex-col gap-5 flex-1">
                <div>
                  <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
                    Export Codec & Format
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {EXPORT_FORMATS.map(fmt => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setExportFormat(fmt.id)}
                        className={`py-2 px-2 text-xs rounded-lg border text-center transition-colors ${
                          exportFormat === fmt.id
                            ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 font-medium'
                            : 'bg-neutral-850 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedExportFormat.hasQuality && (
                  <div>
                    <div className="flex justify-between text-xs text-neutral-300 mb-1">
                      <span>Compression Quality</span>
                      <span className="font-mono text-cyan-400">{Math.round(exportQuality * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.0}
                      step={0.02}
                      value={exportQuality}
                      onChange={e => setExportQuality(parseFloat(e.target.value))}
                      className="w-full custom-range"
                    />
                  </div>
                )}

                <div className="p-3 bg-neutral-950/60 rounded-lg border border-neutral-800 text-xs space-y-2">
                  <div className="flex justify-between text-neutral-400">
                    <span>Source Canvas</span>
                    <span className="font-mono text-neutral-200">
                      {canvasRef.current ? `${canvasRef.current.width} × ${canvasRef.current.height}` : 'Native'}
                    </span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Color Space</span>
                    <span className="text-neutral-200">Display P3 / Rec.709</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Target Storage</span>
                    <span className="text-cyan-400 font-medium">Original Cloud Provider</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportDownload}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors shadow-lg shadow-cyan-500/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

interface CropOverlayProps {
  rect: CropRect;
  aspect: CropAspect;
  /** Width / height of the whole frame, to turn the aspect into a fraction-of-frame ratio. */
  frameAspect: number;
  onChange: (rect: CropRect) => void;
  dragRef: React.MutableRefObject<{
    handle: CropHandle;
    startX: number;
    startY: number;
    origin: CropRect;
  } | null>;
}

const CropOverlay: React.FC<CropOverlayProps> = ({ rect, aspect, frameAspect, onChange, dragRef }) => {
  const pixelRatio = CROP_ASPECT_OPTIONS.find(o => o.id === aspect)?.ratio ?? null;
  const ratio = pixelRatio == null ? null : pixelRatio / frameAspect;

  const onPointerDown = (handle: CropHandle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const host = target.closest('[data-crop-host]') as HTMLElement | null;
    if (!host) return;
    host.setPointerCapture(e.pointerId);
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...rect },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const host = e.currentTarget as HTMLElement;
    const box = host.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    const dx = (e.clientX - drag.startX) / box.width;
    const dy = (e.clientY - drag.startY) / box.height;
    const o = drag.origin;
    let next: CropRect = { ...o };

    const applyAspectFromCorner = (nx: number, ny: number, nw: number, nh: number, corner: 'nw' | 'ne' | 'sw' | 'se') => {
      if (ratio == null) return clampCrop({ x: nx, y: ny, w: nw, h: nh });
      // Prefer width-driven resize; adjust height to match aspect.
      let w = Math.max(0.05, nw);
      let h = w / ratio;
      if (h > 0.05 && (corner === 'nw' || corner === 'ne')) {
        const bottom = o.y + o.h;
        let y = bottom - h;
        if (y < 0) {
          y = 0;
          h = bottom;
          w = h * ratio;
        }
        const x = corner === 'nw' ? o.x + o.w - w : o.x;
        return clampCrop({ x, y, w, h });
      }
      if (h > 0.05 && (corner === 'sw' || corner === 'se')) {
        const x = corner === 'sw' ? o.x + o.w - w : o.x;
        if (o.y + h > 1) {
          h = 1 - o.y;
          w = h * ratio;
        }
        return clampCrop({ x, y: o.y, w, h });
      }
      return clampCrop({ x: nx, y: ny, w: nw, h: nh });
    };

    switch (drag.handle) {
      case 'move':
        next = clampCrop({ x: o.x + dx, y: o.y + dy, w: o.w, h: o.h });
        break;
      case 'e':
        next = ratio == null
          ? clampCrop({ x: o.x, y: o.y, w: o.w + dx, h: o.h })
          : applyAspectFromCorner(o.x, o.y, o.w + dx, o.h, 'se');
        break;
      case 'w': {
        const w = o.w - dx;
        next = ratio == null
          ? clampCrop({ x: o.x + dx, y: o.y, w, h: o.h })
          : applyAspectFromCorner(o.x + dx, o.y, w, o.h, 'sw');
        break;
      }
      case 's':
        if (ratio == null) {
          next = clampCrop({ x: o.x, y: o.y, w: o.w, h: o.h + dy });
        } else {
          const h = Math.max(0.05, o.h + dy);
          const w = h * ratio;
          next = clampCrop({ x: o.x + (o.w - w) / 2, y: o.y, w, h });
        }
        break;
      case 'n':
        if (ratio == null) {
          next = clampCrop({ x: o.x, y: o.y + dy, w: o.w, h: o.h - dy });
        } else {
          const h = Math.max(0.05, o.h - dy);
          const w = h * ratio;
          const bottom = o.y + o.h;
          next = clampCrop({ x: o.x + (o.w - w) / 2, y: bottom - h, w, h });
        }
        break;
      case 'se':
        next = applyAspectFromCorner(o.x, o.y, o.w + dx, o.h + dy, 'se');
        break;
      case 'sw':
        next = applyAspectFromCorner(o.x + dx, o.y, o.w - dx, o.h + dy, 'sw');
        break;
      case 'ne':
        next = applyAspectFromCorner(o.x, o.y + dy, o.w + dx, o.h - dy, 'ne');
        break;
      case 'nw':
        next = applyAspectFromCorner(o.x + dx, o.y + dy, o.w - dx, o.h - dy, 'nw');
        break;
    }
    onChange(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch { /* already released */ }
      dragRef.current = null;
    }
  };

  const handleClass =
    'absolute w-3 h-3 bg-white border border-cyan-400 rounded-sm shadow z-10 -translate-x-1/2 -translate-y-1/2';

  return (
    <div
      data-crop-host
      className="absolute inset-0 z-10 touch-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Dim outside crop */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-0 right-0 top-0 bg-black/55" style={{ height: `${rect.y * 100}%` }} />
        <div className="absolute left-0 right-0 bottom-0 bg-black/55" style={{ height: `${(1 - rect.y - rect.h) * 100}%` }} />
        <div
          className="absolute left-0 bg-black/55"
          style={{ top: `${rect.y * 100}%`, height: `${rect.h * 100}%`, width: `${rect.x * 100}%` }}
        />
        <div
          className="absolute right-0 bg-black/55"
          style={{ top: `${rect.y * 100}%`, height: `${rect.h * 100}%`, width: `${(1 - rect.x - rect.w) * 100}%` }}
        />
      </div>

      {/* Active crop frame */}
      <div
        className="absolute border-2 border-cyan-400/90 box-border cursor-move"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.w * 100}%`,
          height: `${rect.h * 100}%`,
        }}
        onPointerDown={onPointerDown('move')}
      >
        {/* Rule-of-thirds guides */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/80" />
          <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/80" />
          <div className="absolute top-1/3 left-0 right-0 h-px bg-white/80" />
          <div className="absolute top-2/3 left-0 right-0 h-px bg-white/80" />
        </div>

        {/* Edge handles */}
        <div className="absolute left-1/2 top-0 w-8 h-2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize" onPointerDown={onPointerDown('n')} />
        <div className="absolute left-1/2 bottom-0 w-8 h-2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize" onPointerDown={onPointerDown('s')} />
        <div className="absolute top-1/2 left-0 w-2 h-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize" onPointerDown={onPointerDown('w')} />
        <div className="absolute top-1/2 right-0 w-2 h-8 translate-x-1/2 -translate-y-1/2 cursor-ew-resize" onPointerDown={onPointerDown('e')} />

        {/* Corner handles */}
        <div className={`${handleClass} left-0 top-0 cursor-nwse-resize`} onPointerDown={onPointerDown('nw')} />
        <div className={`${handleClass} left-full top-0 cursor-nesw-resize`} onPointerDown={onPointerDown('ne')} />
        <div className={`${handleClass} left-0 top-full cursor-nesw-resize`} onPointerDown={onPointerDown('sw')} />
        <div className={`${handleClass} left-full top-full cursor-nwse-resize`} onPointerDown={onPointerDown('se')} />
      </div>
    </div>
  );
};

interface AdjustmentSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
}

const AdjustmentSlider: React.FC<AdjustmentSliderProps> = ({ label, value, min, max, onChange }) => {
  return (
    <div>
      <div className="flex justify-between items-center text-xs text-neutral-300 mb-1">
        <span>{label}</span>
        <button
          onClick={() => onChange(0)}
          className="font-mono text-[11px] text-neutral-400 hover:text-cyan-400 transition-colors"
          title="Click to reset"
        >
          {value > 0 ? `+${value}` : value}
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-full custom-range cursor-pointer"
      />
    </div>
  );
};
