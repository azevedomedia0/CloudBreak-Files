/**
 * pdf.js for the PDF editor: opens a PDF's bytes and draws its pages. The library, its worker and its data
 * (fonts, character maps, decoders in public/pdfjs) all ship with the app, so nothing is fetched from the internet.
 * It is loaded on first use so the editor's weight is only paid when a PDF is opened.
 */
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

function loadPdfjs() {
  pdfjsPromise ??= (async () => {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    return pdfjs;
  })();
  return pdfjsPromise;
}

const DATA = `${import.meta.env.BASE_URL}pdfjs/`;

export interface OpenedPdf {
  doc: PDFDocumentProxy;
  /** Free the document and its worker. */
  destroy: () => void;
}

/** Open a PDF. `bytes` is copied: pdf.js takes ownership of what it is given, and the caller keeps its own. */
export async function openPdf(bytes: Uint8Array): Promise<OpenedPdf> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    // The fonts, character maps and decoders come from the app itself (public/pdfjs).
    cMapUrl: `${DATA}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${DATA}standard_fonts/`,
    wasmUrl: `${DATA}wasm/`,
    iccUrl: `${DATA}iccs/`,
  });
  const doc = await task.promise;
  return { doc, destroy: () => { void task.destroy(); } };
}

/**
 * The page's size in points with its own /Rotate applied: the editor's "content space". (pdf.js takes a viewport's
 * rotation as absolute, so the page's own turn is passed in explicitly.)
 */
export function contentSizeOf(page: PDFPageProxy): { w: number; h: number } {
  const v = page.getViewport({ scale: 1, rotation: page.rotate });
  return { w: v.width, h: v.height };
}

export interface PageRender { cancel: () => void; done: Promise<void> }

/**
 * Draw a page into a canvas at `scale` (device pixels per point), turned clockwise by `extraRotation` on top of
 * its own /Rotate. Cancelling a draw that has been superseded is not an error.
 */
export function renderPage(page: PDFPageProxy, canvas: HTMLCanvasElement, scale: number, extraRotation: number): PageRender {
  const viewport = page.getViewport({ scale, rotation: (page.rotate + extraRotation) % 360 });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const task = page.render({ canvas, viewport });
  return {
    cancel: () => task.cancel(),
    done: task.promise.then(() => undefined, err => {
      if ((err as { name?: string })?.name === 'RenderingCancelledException') return;
      throw err;
    }),
  };
}
