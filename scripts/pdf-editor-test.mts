/**
 * The PDF editor's maths and its save step, checked end to end: edits are written with pdf-lib, the result is
 * drawn by pdf.js, and pixels are sampled where each annotation should be (on plain, /Rotate and offset-crop pages).
 * Run: npx tsx scripts/pdf-editor-test.mts
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { PDFDocument, degrees, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  contentSize, contentToPdf, displaySize, newHistory, pushHistory, redoHistory, rotatePoint,
  undoHistory, unrotatePoint, annotationAt, translateAnnotation, annotationBounds,
  type PageEntry, type PdfAnnotation, type Pt, type Rot,
} from '../src/utils/pdfGeometry.ts';
import { buildEditedPdf, readFormFields, editedPdfName } from '../src/utils/pdfEdit.ts';

let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failed += 1;
}

// ---- geometry
console.log('Coordinate maths');
{
  const rots: Rot[] = [0, 90, 180, 270];
  let round = true;
  for (const rot of rots) {
    for (const p of [{ x: 10, y: 20 }, { x: 0, y: 0 }, { x: 300, y: 200 }]) {
      const d = displaySize(300, 200, rot);
      const back = unrotatePoint(rotatePoint(p, 300, 200, rot), d.w, d.h, rot);
      if (Math.abs(back.x - p.x) > 1e-9 || Math.abs(back.y - p.y) > 1e-9) round = false;
    }
  }
  check('turning a point and turning it back gives the same point, for every rotation', round);
  const c = rotatePoint({ x: 0, y: 0 }, 300, 200, 90);
  check('a 90° turn puts the top-left corner at the top-right', c.x === 200 && c.y === 0, JSON.stringify(c));
  const view: [number, number, number, number] = [50, 60, 350, 260];
  const tl = contentToPdf({ x: 0, y: 0 }, view, 0);
  const br = contentToPdf({ x: 300, y: 200 }, view, 0);
  check('content top-left is the PDF box top-left, bottom-right the bottom-right', tl.x === 50 && tl.y === 260 && br.x === 350 && br.y === 60, `${JSON.stringify(tl)} ${JSON.stringify(br)}`);
  check('a page with its own /Rotate 90 swaps its content size', JSON.stringify(contentSize([0, 0, 300, 500], 90)) === '{"w":500,"h":300}');
  const r90 = contentToPdf({ x: 0, y: 0 }, [0, 0, 300, 500], 90);
  check('/Rotate 90: the content top-left is the PDF bottom-left corner', r90.x === 0 && r90.y === 0, JSON.stringify(r90));
}

console.log('Selecting and undo');
{
  const list: PdfAnnotation[] = [
    { id: 'a', kind: 'rect', x: 10, y: 10, w: 100, h: 100, color: '#ff0000', width: 2 },
    { id: 'b', kind: 'ink', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: '#0000ff', width: 4 },
    { id: 'c', kind: 'line', x1: 0, y1: 50, x2: 100, y2: 50, color: '#000000', width: 2, arrow: false },
  ];
  check('the topmost annotation under a point is picked', annotationAt(list, { x: 50, y: 50 })?.id === 'c');
  check('a point on nothing picks nothing', annotationAt(list, { x: 400, y: 400 }) === undefined);
  check('a stroke is picked near its line, not far from it', annotationAt(list, { x: 50, y: 2 })?.id === 'b' && annotationAt(list, { x: 50, y: 20 })?.id === 'a');
  const moved = translateAnnotation(list[1], 5, 7);
  check('moving an annotation moves every point', moved.kind === 'ink' && moved.points[1].x === 105 && moved.points[1].y === 7);
  check('bounds cover a stroke', JSON.stringify(annotationBounds(list[1])) === '{"x":0,"y":0,"w":100,"h":0}');
  let h = newHistory(1);
  h = pushHistory(h, 2); h = pushHistory(h, 3);
  check('undo steps back, redo steps forward', undoHistory(undoHistory(h)).present === 1 && redoHistory(undoHistory(h)).present === 3);
  check('a new change clears redo', pushHistory(undoHistory(h), 9).future.length === 0);
  check('pushing the same snapshot adds no step', pushHistory(h, h.present) === h);
}

// ---- rendering with pdf.js (Node)
const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
async function renderPixels(bytes: Uint8Array, pageNumber: number) {
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes), useSystemFonts: false,
    standardFontDataUrl: path.join(pdfjsRoot, 'standard_fonts') + path.sep,
    verbosity: 0,
  });
  const doc = await task.promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const { canvas, context } = (doc as unknown as { canvasFactory: { create: (w: number, h: number) => { canvas: unknown; context: CanvasRenderingContext2D } } })
    .canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: context, canvas: canvas as HTMLCanvasElement, viewport }).promise;
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const data = context.getImageData(0, 0, width, height).data;
  await task.destroy();
  return {
    width, height,
    at: (x: number, y: number): [number, number, number] => {
      const i = (Math.round(y) * width + Math.round(x)) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    },
    dark: (x: number, y: number, w: number, h: number) => {
      let n = 0;
      for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
        for (let xx = Math.round(x); xx < Math.round(x + w); xx++) {
          const i = (yy * width + xx) * 4;
          if (data[i] < 110 && data[i + 1] < 110 && data[i + 2] < 110) n++;
        }
      }
      return n;
    },
  };
}
const near = (c: [number, number, number], want: [number, number, number], tol = 40) =>
  Math.abs(c[0] - want[0]) <= tol && Math.abs(c[1] - want[1]) <= tol && Math.abs(c[2] - want[2]) <= tol;
const isRed = (c: [number, number, number]) => c[0] > 190 && c[1] < 90 && c[2] < 90;
const isBlue = (c: [number, number, number]) => c[2] > 190 && c[0] < 90 && c[1] < 90;
const isGreen = (c: [number, number, number]) => c[1] > 150 && c[0] < 90 && c[2] < 90;
const isHighlight = (c: [number, number, number]) => c[0] > 235 && c[1] > 225 && c[2] > 120 && c[2] < 200;

async function pngBytes(color: [number, number, number]): Promise<Uint8Array> {
  const { createCanvas } = await import('@napi-rs/canvas');
  const c = createCanvas(20, 20);
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${color.join(',')})`;
  g.fillRect(0, 0, 20, 20);
  return new Uint8Array(c.toBuffer('image/png'));
}

console.log('Saving edits (rendered with pdf.js and sampled)');
{
  const base = await PDFDocument.create();
  base.addPage([400, 300]);                                // 0: plain
  const rotated = base.addPage([300, 500]);                // 1: its own /Rotate 90 (content 500x300)
  rotated.setRotation(degrees(90));
  const cropped = base.addPage([400, 300]);                // 2: offset crop box (content 300x200)
  cropped.setCropBox(50, 60, 300, 200);
  const baseBytes = new Uint8Array(await base.save());

  const extra = await PDFDocument.create();
  extra.addPage([200, 200]);
  const extraBytes = new Uint8Array(await extra.save());

  const green = await pngBytes([0, 170, 0]);
  const entries: PageEntry[] = [
    { id: 'p0', srcId: 'base', srcIndex: 0, rotation: 0 },
    { id: 'p1', srcId: 'base', srcIndex: 1, rotation: 90 },   // 90 own + 90 extra = 180
    { id: 'p2', srcId: 'base', srcIndex: 2, rotation: 0 },
    { id: 'px', srcId: 'extra', srcIndex: 0, rotation: 270 },
  ];
  const annotations: Record<string, PdfAnnotation[]> = {
    p0: [
      { id: 'h', kind: 'highlight', x: 50, y: 50, w: 100, h: 40, color: '#ffeb33' },
      { id: 'r', kind: 'rect', x: 200, y: 100, w: 100, h: 60, color: '#ff0000', width: 4 },
      { id: 'i', kind: 'ink', points: [{ x: 20, y: 200 }, { x: 180, y: 220 }], color: '#0000ff', width: 6 },
      { id: 'img', kind: 'image', x: 300, y: 20, w: 40, h: 40, png: green },
      { id: 't', kind: 'text', x: 30, y: 250, text: 'Hello PDF', size: 24, color: '#000000' },
      { id: 'e', kind: 'ellipse', x: 150, y: 130, w: 80, h: 50, color: '#ff0000', width: 4 },
    ],
    p1: [
      { id: 'h1', kind: 'highlight', x: 100, y: 100, w: 100, h: 50, color: '#ffeb33' },
      { id: 'r1', kind: 'rect', x: 300, y: 50, w: 100, h: 80, color: '#ff0000', width: 4 },
      { id: 'i1', kind: 'image', x: 50, y: 200, w: 60, h: 60, png: green },
      { id: 't1', kind: 'text', x: 200, y: 200, text: 'Turned', size: 28, color: '#000000' },
    ],
    p2: [
      { id: 'h2', kind: 'highlight', x: 10, y: 10, w: 50, h: 30, color: '#ffeb33' },
      { id: 'r2', kind: 'rect', x: 100, y: 100, w: 100, h: 60, color: '#ff0000', width: 4 },
    ],
  };
  const out = await buildEditedPdf([{ id: 'base', bytes: baseBytes }, { id: 'extra', bytes: extraBytes }], entries, annotations);

  const reread = await PDFDocument.load(out);
  check('four pages come out, in the asked order, with the inserted page last', reread.getPageCount() === 4 && reread.getPage(3).getWidth() === 200);
  check('extra turns are added to a page\'s own /Rotate', reread.getPage(1).getRotation().angle === 180 && reread.getPage(3).getRotation().angle === 270 && reread.getPage(0).getRotation().angle === 0);

  // Where an annotation lands on screen: content point turned by the person's extra rotation only
  // (the page's own /Rotate is already part of content space; pdf.js draws the final /Rotate).
  const onScreen = (p: Pt, cw: number, ch: number, own: Rot, extraTurn: Rot): Pt => {
    // pdf.js draws the saved page at (own + extra); content space is at "own", so turn by extra.
    void own;
    return rotatePoint(p, cw, ch, extraTurn);
  };

  const p0 = await renderPixels(out, 1);
  check('page 1 draws at its own size', p0.width === 400 && p0.height === 300);
  check('highlight tints the page yellow', isHighlight(p0.at(100, 70)), JSON.stringify(p0.at(100, 70)));
  check('highlight leaves the page outside it white', near(p0.at(100, 120), [255, 255, 255], 6), JSON.stringify(p0.at(100, 120)));
  check('rectangle border is red on its edge and the inside is empty', isRed(p0.at(250, 100)) && near(p0.at(250, 130), [255, 255, 255], 6), `${JSON.stringify(p0.at(250, 100))} ${JSON.stringify(p0.at(250, 130))}`);
  check('ink draws a blue stroke along its path', isBlue(p0.at(100, 210)), JSON.stringify(p0.at(100, 210)));
  check('an image (signature) lands in its box', isGreen(p0.at(320, 40)) && near(p0.at(320, 80), [255, 255, 255], 6), `${JSON.stringify(p0.at(320, 40))} ${JSON.stringify(p0.at(320, 80))}`);
  check('text writes dark pixels in its place', p0.dark(30, 250, 130, 30) > 40, String(p0.dark(30, 250, 130, 30)));
  check('an ellipse is outlined, not filled', isRed(p0.at(190, 130)) && near(p0.at(190, 155), [255, 255, 255], 6), `${JSON.stringify(p0.at(190, 130))} ${JSON.stringify(p0.at(190, 155))}`);

  const p1 = await renderPixels(out, 2);   // content 500x300, shown turned 90 clockwise -> 300x500
  check('a turned page is drawn at its turned size', p1.width === 300 && p1.height === 500, `${p1.width}x${p1.height}`);
  const hc = onScreen({ x: 150, y: 125 }, 500, 300, 90, 90);
  check('highlight follows the page when it is turned', isHighlight(p1.at(hc.x, hc.y)), `${JSON.stringify(hc)} ${JSON.stringify(p1.at(hc.x, hc.y))}`);
  const rc = onScreen({ x: 350, y: 50 }, 500, 300, 90, 90);
  check('rectangle follows the page when it is turned', isRed(p1.at(rc.x, rc.y)), `${JSON.stringify(rc)} ${JSON.stringify(p1.at(rc.x, rc.y))}`);
  const ic = onScreen({ x: 80, y: 230 }, 500, 300, 90, 90);
  check('image follows the page when it is turned', isGreen(p1.at(ic.x, ic.y)), `${JSON.stringify(ic)} ${JSON.stringify(p1.at(ic.x, ic.y))}`);
  const tc = onScreen({ x: 220, y: 215 }, 500, 300, 90, 90);
  check('text is turned with the page', p1.dark(tc.x - 25, tc.y - 40, 50, 80) > 25, String(p1.dark(tc.x - 25, tc.y - 40, 50, 80)));

  const p2 = await renderPixels(out, 3);   // crop box 300x200 at an offset
  check('a cropped page draws at the crop size', p2.width === 300 && p2.height === 200, `${p2.width}x${p2.height}`);
  check('highlight sits right on a cropped page', isHighlight(p2.at(35, 25)), JSON.stringify(p2.at(35, 25)));
  check('rectangle sits right on a cropped page', isRed(p2.at(150, 100)), JSON.stringify(p2.at(150, 100)));

  check('an edited name keeps the extension', editedPdfName('report.PDF') === 'report (edited).pdf' && editedPdfName('a') === 'a (edited).pdf');
}

console.log('Pages left out, forms');
{
  const base = await PDFDocument.create();
  [100, 200, 300].forEach(w => base.addPage([w, 100]));
  const bytes = new Uint8Array(await base.save());
  const out = await buildEditedPdf([{ id: 's', bytes }], [
    { id: 'a', srcId: 's', srcIndex: 2, rotation: 0 },
    { id: 'b', srcId: 's', srcIndex: 0, rotation: 0 },
  ], {});
  const re = await PDFDocument.load(out);
  check('a deleted page is gone and the rest are reordered', re.getPageCount() === 2 && re.getPage(0).getWidth() === 300 && re.getPage(1).getWidth() === 100);

  const f = await PDFDocument.create();
  const page = f.addPage([300, 200]);
  const form = f.getForm();
  const name = form.createTextField('name');
  name.addToPage(page, { x: 20, y: 140, width: 160, height: 24 });
  name.setText('Original');
  const agree = form.createCheckBox('agree');
  agree.addToPage(page, { x: 20, y: 100, width: 16, height: 16 });
  const color = form.createDropdown('color');
  color.addOptions(['Red', 'Green']);
  color.addToPage(page, { x: 20, y: 60, width: 100, height: 20 });
  const formBytes = new Uint8Array(await f.save());
  const fields = await readFormFields(formBytes);
  check('form fields are found with their values', fields.length === 3 && fields.find(x => x.name === 'name')?.value === 'Original' && fields.find(x => x.name === 'agree')?.value === false
    && JSON.stringify(fields.find(x => x.name === 'color')?.options) === '["Red","Green"]', JSON.stringify(fields));
  const filled = await buildEditedPdf([{ id: 'f', bytes: formBytes }], [{ id: 'p', srcId: 'f', srcIndex: 0, rotation: 0 }], {}, { name: 'Ada Lovelace', agree: true, color: 'Green', missing: 'ignored' });
  const after = await readFormFields(filled);
  check('filled values are saved and the PDF is still a form', after.find(x => x.name === 'name')?.value === 'Ada Lovelace' && after.find(x => x.name === 'agree')?.value === true && after.find(x => x.name === 'color')?.value === 'Green', JSON.stringify(after));
  const shown = await renderPixels(filled, 1);
  check('the filled text is drawn on the page', shown.dark(22, 32, 150, 24) > 20, String(shown.dark(22, 32, 150, 24)));
  check('a PDF with no form has no fields', (await readFormFields(bytes)).length === 0);
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll PDF editor checks passed');
void rgb;
