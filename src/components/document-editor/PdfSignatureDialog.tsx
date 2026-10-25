import React, { useEffect, useRef, useState } from 'react';
import { X } from '@/src/icons';

const INK = '#16213e';
const STYLES = [
  { label: 'Script', stack: '"Snell Roundhand", "Segoe Script", "Apple Chancery", cursive', size: 64 },
  { label: 'Marker', stack: '"Bradley Hand", "Chalkboard SE", "Comic Sans MS", cursive', size: 58 },
  { label: 'Formal', stack: '"Zapfino", "Brush Script MT", "Lucida Handwriting", cursive', size: 52 },
];

/** Crop a canvas to the pixels that are not transparent, with a little margin, and give back a PNG. */
async function trimmedPng(source: HTMLCanvasElement): Promise<{ png: Uint8Array; w: number; h: number } | null> {
  const g = source.getContext('2d')!;
  const { width, height } = source;
  const data = g.getImageData(0, 0, width, height).data;
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const w = Math.min(width, maxX + pad) - x0;
  const h = Math.min(height, maxY + pad) - y0;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(source, x0, y0, w, h, 0, 0, w, h);
  const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return { png: new Uint8Array(await blob.arrayBuffer()), w, h };
}

/** Make a signature from typed text or a drawing. It becomes an image the person then places on the page. */
export const PdfSignatureDialog: React.FC<{
  onCancel: () => void;
  onPlace: (png: Uint8Array, aspect: number) => void;
}> = ({ onCancel, onPlace }) => {
  const [tab, setTab] = useState<'type' | 'draw'>('type');
  const [name, setName] = useState('');
  const [styleIndex, setStyleIndex] = useState(0);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const pad = useRef<HTMLCanvasElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  // Typed signature preview.
  useEffect(() => {
    const c = preview.current;
    if (!c || tab !== 'type') return;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    const style = STYLES[styleIndex];
    g.fillStyle = INK;
    g.font = `${style.size}px ${style.stack}`;
    g.textBaseline = 'middle';
    g.fillText(name, 20, c.height / 2, c.width - 40);
  }, [name, styleIndex, tab]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };

  const place = async () => {
    setBusy(true);
    try {
      const result = await trimmedPng(tab === 'type' ? preview.current! : pad.current!);
      if (result) onPlace(result.png, result.w / result.h);
    } finally {
      setBusy(false);
    }
  };

  const ready = tab === 'type' ? name.trim().length > 0 : hasInk;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onMouseDown={onCancel}>
      <div className="app-modal-panel w-full max-w-md macos-window rounded-2xl overflow-hidden border border-white/15" onMouseDown={e => e.stopPropagation()} role="dialog" aria-label="Create a signature">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
          <h3 className="text-sm font-semibold text-white">Sign</h3>
          <button type="button" onClick={onCancel} className="text-neutral-400 hover:text-white p-1" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-1.5">
            {(['type', 'draw'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 h-7 rounded-md text-xs font-medium border ${tab === t ? 'bg-orange-500/20 border-orange-400/40 text-orange-200' : 'border-white/10 text-neutral-300 hover:bg-white/5'}`}
              >
                {t === 'type' ? 'Type' : 'Draw'}
              </button>
            ))}
          </div>
          {tab === 'type' ? (
            <>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="w-full h-9 px-3 rounded-lg bg-neutral-950/80 border border-white/10 text-sm text-neutral-100 focus:outline-none focus:border-orange-400/50"
              />
              <div className="flex gap-1.5">
                {STYLES.map((s, i) => (
                  <button key={s.label} type="button" onClick={() => setStyleIndex(i)} className={`px-2.5 h-7 rounded-md text-xs border ${styleIndex === i ? 'bg-white/15 border-white/30 text-white' : 'border-white/10 text-neutral-300 hover:bg-white/5'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              <canvas ref={preview} width={720} height={170} className="w-full rounded-lg bg-white" />
            </>
          ) : (
            <>
              <canvas
                ref={pad}
                width={720}
                height={240}
                className="w-full rounded-lg bg-white touch-none cursor-crosshair"
                onPointerDown={e => {
                  drawing.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const g = e.currentTarget.getContext('2d')!;
                  const p = at(e);
                  g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
                  g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + 0.01, p.y); g.stroke();
                  setHasInk(true);
                }}
                onPointerMove={e => {
                  if (!drawing.current) return;
                  const g = e.currentTarget.getContext('2d')!;
                  const p = at(e);
                  g.lineTo(p.x, p.y); g.stroke();
                }}
                onPointerUp={() => { drawing.current = false; }}
                onPointerCancel={() => { drawing.current = false; }}
              />
              <button
                type="button"
                onClick={() => { const c = pad.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setHasInk(false); }}
                className="text-[11px] text-neutral-400 hover:text-neutral-200"
              >
                Clear
              </button>
            </>
          )}
          <p className="text-[11px] text-neutral-500">The signature is placed on the page as a picture. Drag it where it belongs.</p>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/10 bg-white/5">
          <button type="button" onClick={onCancel} className="h-8 px-3 rounded-lg text-xs text-neutral-300 hover:bg-white/10">Cancel</button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => { void place(); }}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-40"
          >
            Place on page
          </button>
        </div>
      </div>
    </div>
  );
};
