import React, { useEffect, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import { renderPage } from '../../services/pdfEngine';
import { displaySize, type Rot } from '../../utils/pdfGeometry';

/** A small picture of a page for the page list. Drawn only when it scrolls into view. */
export const PdfThumb: React.FC<{
  page: PDFPageProxy | null;
  size: { w: number; h: number };
  rotation: Rot;
  width?: number;
}> = ({ page, size, rotation, width = 112 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const d = displaySize(size.w, size.h, rotation);
  const scale = width / d.w;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(list => setVisible(list.some(e => e.isIntersecting)), { rootMargin: '300px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !page || !canvas.current) return;
    const job = renderPage(page, canvas.current, scale * (window.devicePixelRatio || 1), rotation);
    job.done.catch(() => { /* leave it blank */ });
    return () => job.cancel();
  }, [visible, page, scale, rotation]);

  return (
    <div ref={ref} className="bg-white shadow-md mx-auto" style={{ width, height: d.h * scale }}>
      <canvas ref={canvas} className="w-full h-full block" />
    </div>
  );
};
