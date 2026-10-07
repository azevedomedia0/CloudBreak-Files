import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, RotateCw, RotateCcw, FlipHorizontal, FlipVertical,
  Sliders, Wand2, Download, Save, Undo2, Redo2, Check,
  Sparkles, Layers, ZoomIn, ZoomOut, Maximize2, ShieldCheck, Crop
} from 'lucide-react';
import { FileItem, PhotoAdjustments } from '../types';

interface PhotoEditorModalProps {
  file: FileItem;
  isOpen: boolean;
  onClose: () => void;
  onSaveAsVersion: (updatedFile: FileItem, dataUrl: string) => void;
}

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
};

interface EditSnapshot {
  adjustments: PhotoAdjustments;
  activePreset: string;
}

function adjustmentsEqual(a: PhotoAdjustments, b: PhotoAdjustments): boolean {
  return (Object.keys(a) as (keyof PhotoAdjustments)[]).every(key => a[key] === b[key]);
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
}) => {
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>(DEFAULT_ADJUSTMENTS);
  const [activeTab, setActiveTab] = useState<'adjust' | 'presets' | 'geometry'>('adjust');
  const [activePreset, setActivePreset] = useState<string>('natural');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [exportFormat, setExportFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [exportQuality, setExportQuality] = useState<number>(0.92);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const histogramCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const adjustmentsRef = useRef<PhotoAdjustments>(DEFAULT_ADJUSTMENTS);
  const presetRef = useRef('natural');
  const pastRef = useRef<EditSnapshot[]>([]);
  const futureRef = useRef<EditSnapshot[]>([]);
  const sessionRef = useRef<{ key: string; at: number } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Load image on file change
  useEffect(() => {
    if (!isOpen) return;
    pastRef.current = [];
    futureRef.current = [];
    sessionRef.current = null;
    adjustmentsRef.current = DEFAULT_ADJUSTMENTS;
    presetRef.current = 'natural';
    setCanUndo(false);
    setCanRedo(false);
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setActivePreset('natural');
    setZoomLevel(100);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = file.url;
    img.onload = () => {
      imgRef.current = img;
      renderImage();
    };
  }, [file.id, file.url, isOpen]);

  // Re-render when adjustments or compare mode changes
  useEffect(() => {
    if (imgRef.current) {
      renderImage();
    }
  }, [adjustments]);

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

  const updateAdj = (
    key: keyof PhotoAdjustments,
    value: PhotoAdjustments[keyof PhotoAdjustments],
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
    writeEdit({ ...adjustmentsRef.current, [key]: value }, '');
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
  }, [isOpen]);

  // Render Image onto canvas with CSS filter & pixel transformations
  const renderImage = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Handle rotation dimensions
    const isRotated90or270 = adjustments.rotation === 90 || adjustments.rotation === 270;
    const targetWidth = isRotated90or270 ? img.naturalHeight : img.naturalWidth;
    const targetHeight = isRotated90or270 ? img.naturalWidth : img.naturalHeight;

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.save();
    ctx.clearRect(0, 0, targetWidth, targetHeight);

    // Coordinate transforms
    ctx.translate(targetWidth / 2, targetHeight / 2);
    ctx.rotate((adjustments.rotation * Math.PI) / 180);
    ctx.scale(adjustments.flipH ? -1 : 1, adjustments.flipV ? -1 : 1);

    // Apply color and tone filters
    const exp = 1 + adjustments.exposure / 100;
    const bright = Math.max(0, 1 + adjustments.brightness / 100);
    const cont = Math.max(0, 1 + adjustments.contrast / 100);
    const sat = Math.max(0, 1 + adjustments.saturation / 100);

    // Warmth / temp via hue and sepia mix
    let filterString = `brightness(${bright * exp}) contrast(${cont}) saturate(${sat})`;
    if (adjustments.warmth !== 0) {
      if (adjustments.warmth > 0) {
        filterString += ` sepia(${adjustments.warmth * 0.4}%)`;
      } else {
        filterString += ` hue-rotate(${adjustments.warmth * 0.4}deg)`;
      }
    }
    if (adjustments.tint !== 0) {
      filterString += ` hue-rotate(${adjustments.tint * 0.5}deg)`;
    }

    ctx.filter = filterString;
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();

    // Apply Vignette if enabled
    if (adjustments.vignette > 0) {
      const gradient = ctx.createRadialGradient(
        targetWidth / 2,
        targetHeight / 2,
        (Math.min(targetWidth, targetHeight) / 2) * (1 - adjustments.vignette / 120),
        targetWidth / 2,
        targetHeight / 2,
        Math.max(targetWidth, targetHeight) * 0.8
      );
      const alpha = (adjustments.vignette / 100) * 0.8;
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    drawHistogram(ctx, canvas);
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

  const handleSaveAsVersion = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsProcessing(true);
    setStatusMessage('Rendering high-fidelity raster...');

    setTimeout(() => {
      const dataUrl = canvas.toDataURL(exportFormat, exportQuality);
      const updatedFile: FileItem = {
        ...file,
        version: file.version + 1,
        updatedAt: new Date().toISOString(),
        url: dataUrl,
        thumbnailUrl: dataUrl,
        sizeBytes: Math.round(file.sizeBytes * 1.05),
      };

      onSaveAsVersion(updatedFile, dataUrl);
      setIsProcessing(false);
      setStatusMessage('Saved as Version ' + updatedFile.version + ' to cloud storage!');
      setTimeout(() => {
        setStatusMessage(null);
        onClose();
      }, 1200);
    }, 400);
  };

  const handleExportDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    const ext = exportFormat === 'image/jpeg' ? 'jpg' : exportFormat === 'image/png' ? 'png' : 'webp';
    link.download = `${file.name.replace(/\.[^/.]+$/, '')}_graded_v${file.version + 1}.${ext}`;
    link.href = canvas.toDataURL(exportFormat, exportQuality);
    link.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4">
      <div className="relative flex flex-col w-full h-[95vh] max-w-7xl bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-neutral-100 truncate max-w-md">
                  {file.name}
                </h2>
                {file.encryption.isEncrypted && (
                  <span className="flex items-center gap-1 text-[11px] text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-2 py-0.5 rounded">
                    <ShieldCheck className="w-3 h-3" /> E2EE Active
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500">
                Studio Grading Suite · {file.photoExif?.dimensions?.width || '4K'}×{file.photoExif?.dimensions?.height || 'HD'} · {file.photoExif?.camera || 'Pro RAW'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetAdjustments}
              title="Reset adjustments"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-750"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-800/50 border border-neutral-700/60 rounded-lg hover:bg-neutral-800 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-800/50 border border-neutral-700/60 rounded-lg hover:bg-neutral-800 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span>Redo</span>
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
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-neutral-950 border border-cyan-500/40 rounded-lg shadow-xl text-xs font-medium text-cyan-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-spin" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Main Body */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Canvas Viewport Area */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 bg-neutral-950/60 relative overflow-hidden select-none">
            
            {/* Canvas Container with dynamic zoom */}
            <div 
              className="flex items-center justify-center w-full h-full transition-transform duration-100 ease-out"
              style={{ transform: `scale(${zoomLevel / 100})` }}
            >
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-full object-contain rounded shadow-2xl border border-neutral-800/80"
              />
            </div>

            {/* Bottom Viewport Bar (Zoom & Geometry Quick Actions) */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-neutral-900/90 border border-neutral-800 rounded-full backdrop-blur-md text-xs text-neutral-300 shadow-xl">
              <div className="flex items-center gap-1 pr-3 border-r border-neutral-800">
                <button
                  onClick={() => console.log('Crop mode')}
                  className="p-1 hover:text-white rounded"
                  title="Crop"
                >
                  <Crop className="w-4 h-4" />
                </button>
                <button
                  onClick={() => updateAdj('rotation', (adjustments.rotation + 90) % 360)}
                  className="p-1 hover:text-white rounded"
                  title="Rotate CW 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => updateAdj('flipH', !adjustments.flipH)}
                  className={`p-1 rounded ${adjustments.flipH ? 'text-cyan-400' : 'hover:text-white'}`}
                  title="Flip Horizontal"
                >
                  <FlipHorizontal className="w-4 h-4" />
                </button>
                <button
                  onClick={() => updateAdj('flipV', !adjustments.flipV)}
                  className={`p-1 rounded ${adjustments.flipV ? 'text-cyan-400' : 'hover:text-white'}`}
                  title="Flip Vertical"
                >
                  <FlipVertical className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoomLevel(Math.max(25, zoomLevel - 25))}
                  className="p-1 hover:text-white rounded"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-mono text-neutral-400">{zoomLevel}%</span>
                <button
                  onClick={() => setZoomLevel(Math.min(300, zoomLevel + 25))}
                  className="p-1 hover:text-white rounded"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setZoomLevel(100)}
                  className="text-[11px] text-cyan-400 hover:underline ml-1"
                >
                  Fit
                </button>
              </div>
            </div>
          </div>

          {/* Right Adjustments & Presets Sidebar */}
          <div className="w-84 md:w-96 h-full min-h-0 flex flex-col border-l border-neutral-800 bg-neutral-900/95 overflow-y-auto">
            
            {/* Live RGB Histogram */}
            <div className="p-4 border-b border-neutral-800 bg-neutral-950/40">
              <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
                <span className="font-medium uppercase tracking-wider text-[10px]">Real-Time RGB Spectrum</span>
                <span className="text-[10px] text-neutral-500 font-mono">sRGB / Display P3</span>
              </div>
              <div className="h-16 w-full bg-neutral-950 rounded border border-neutral-800/80 overflow-hidden relative">
                <canvas
                  ref={histogramCanvasRef}
                  width={280}
                  height={64}
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
                Format
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
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'image/jpeg', label: 'JPEG (Photo)' },
                      { id: 'image/png', label: 'PNG (Lossless)' },
                      { id: 'image/webp', label: 'WebP (NextGen)' },
                    ].map(fmt => (
                      <button
                        key={fmt.id}
                        onClick={() => setExportFormat(fmt.id as any)}
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

                {exportFormat !== 'image/png' && (
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
                  className="mt-auto flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 rounded-lg transition-colors"
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
