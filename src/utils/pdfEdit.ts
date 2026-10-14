/**
 * Writes the PDF editor's changes into a PDF with pdf-lib: page order, deleted and turned pages, pages inserted
 * from other PDFs, form values, and annotations drawn onto the pages. The document being edited is kept as the
 * base (so its form, bookmarks and metadata survive); nothing is sent anywhere.
 */
import {
  BlendMode, LineCapStyle, PDFCheckBox, PDFDocument, PDFDropdown, PDFField, PDFOptionList, PDFPage,
  PDFRadioGroup, PDFTextField, StandardFonts, degrees, rgb,
} from 'pdf-lib';
import {
  contentToPdf, hexToRgb01, normalizeRect, normalizeRot,
  type PageEntry, type PageView, type PdfAnnotation, type Pt, type Rot,
} from './pdfGeometry';

export interface EditSource { id: string; bytes: Uint8Array }

export type FormValue = string | boolean | string[];

export interface FormFieldInfo {
  name: string;
  kind: 'text' | 'checkbox' | 'dropdown' | 'radio' | 'list';
  value: FormValue;
  options?: string[];
  readOnly: boolean;
  multiline?: boolean;
}

/** Fields of the first source's form, with their current values. A PDF with no form gives an empty list. */
export async function readFormFields(bytes: Uint8Array): Promise<FormFieldInfo[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  let fields: PDFField[];
  try {
    fields = doc.getForm().getFields();
  } catch {
    return [];
  }
  const out: FormFieldInfo[] = [];
  for (const field of fields) {
    const name = field.getName();
    const readOnly = field.isReadOnly();
    if (field instanceof PDFTextField) {
      out.push({ name, kind: 'text', value: field.getText() ?? '', readOnly, multiline: field.isMultiline() });
    } else if (field instanceof PDFCheckBox) {
      out.push({ name, kind: 'checkbox', value: field.isChecked(), readOnly });
    } else if (field instanceof PDFDropdown) {
      out.push({ name, kind: 'dropdown', value: field.getSelected()[0] ?? '', options: field.getOptions(), readOnly });
    } else if (field instanceof PDFRadioGroup) {
      out.push({ name, kind: 'radio', value: field.getSelected() ?? '', options: field.getOptions(), readOnly });
    } else if (field instanceof PDFOptionList) {
      out.push({ name, kind: 'list', value: field.getSelected(), options: field.getOptions(), readOnly });
    }
  }
  return out;
}

/** The page box pdf.js shows (the crop box; pdf-lib falls back to the media box). */
function pageView(page: PDFPage): PageView {
  const box = page.getCropBox();
  return [box.x, box.y, box.x + box.width, box.y + box.height];
}

/** Text that the built-in Helvetica can write: anything else becomes "?" instead of failing the save. */
function writable(text: string, supported: Set<number>): string {
  let out = '';
  for (const ch of text) out += supported.has(ch.codePointAt(0)!) ? ch : '?';
  return out;
}

async function drawAnnotations(
  doc: PDFDocument,
  page: PDFPage,
  list: PdfAnnotation[],
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  supported: Set<number>,
): Promise<void> {
  if (list.length === 0) return;
  const view = pageView(page);
  const pageRotate = normalizeRot(page.getRotation().angle);
  const P = (p: Pt) => contentToPdf(p, view, pageRotate);
  // Which way "right" in content space points in PDF space: text and images are turned to match.
  const o = P({ x: 0, y: 0 });
  const r = P({ x: 1, y: 0 });
  const angle = (Math.atan2(r.y - o.y, r.x - o.x) * 180) / Math.PI;
  const sideways = pageRotate === 90 || pageRotate === 270;
  const color = (hex: string) => {
    const [cr, cg, cb] = hexToRgb01(hex);
    return rgb(cr, cg, cb);
  };
  /** Axis-aligned box in PDF space covering a content-space rectangle. */
  const box = (x: number, y: number, w: number, h: number) => {
    const a = P({ x, y });
    const b = P({ x: x + w, y: y + h });
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
  };

  for (const a of list) {
    switch (a.kind) {
      case 'highlight':
        page.drawRectangle({ ...box(a.x, a.y, a.w, a.h), color: color(a.color), opacity: 0.45, blendMode: BlendMode.Multiply });
        break;
      case 'rect':
        page.drawRectangle({ ...box(a.x, a.y, a.w, a.h), borderColor: color(a.color), borderWidth: a.width });
        break;
      case 'ellipse': {
        const b = box(a.x, a.y, a.w, a.h);
        page.drawEllipse({
          x: b.x + b.width / 2, y: b.y + b.height / 2, xScale: b.width / 2, yScale: b.height / 2,
          borderColor: color(a.color), borderWidth: a.width,
        });
        break;
      }
      case 'line': {
        const start = P({ x: a.x1, y: a.y1 });
        const end = P({ x: a.x2, y: a.y2 });
        const opts = { thickness: a.width, color: color(a.color), lineCap: LineCapStyle.Round };
        page.drawLine({ start, end, ...opts });
        if (a.arrow) {
          const head = Math.max(8, a.width * 4);
          const theta = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
          for (const turn of [Math.PI * 0.85, -Math.PI * 0.85]) {
            const tip = P({ x: a.x2 + head * Math.cos(theta + turn), y: a.y2 + head * Math.sin(theta + turn) });
            page.drawLine({ start: end, end: tip, ...opts });
          }
        }
        break;
      }
      case 'ink': {
        const opts = { thickness: a.width, color: color(a.color), lineCap: LineCapStyle.Round };
        if (a.points.length === 1) {
          const c = P(a.points[0]);
          page.drawCircle({ x: c.x, y: c.y, size: a.width / 2, color: color(a.color) });
          break;
        }
        for (let i = 1; i < a.points.length; i++) {
          page.drawLine({ start: P(a.points[i - 1]), end: P(a.points[i]), ...opts });
        }
        break;
      }
      case 'text': {
        const lines = a.text.split('\n');
        lines.forEach((line, i) => {
          const at = P({ x: a.x, y: a.y + a.size * 0.9 + i * a.size * 1.2 });
          page.drawText(writable(line, supported), {
            x: at.x, y: at.y, size: a.size, font, color: color(a.color), rotate: degrees(angle),
          });
        });
        break;
      }
      case 'image': {
        const image = await doc.embedPng(a.png);
        const at = P({ x: a.x, y: a.y + a.h });
        page.drawImage(image, { x: at.x, y: at.y, width: a.w, height: a.h, rotate: degrees(angle) });
        break;
      }
    }
  }
  void sideways;
}

/**
 * Build the edited PDF. `pages` is the final order (a page left out is deleted); the first source is the base
 * document. Annotations are keyed by page entry id.
 */
export async function buildEditedPdf(
  sources: EditSource[],
  pages: PageEntry[],
  annotations: Record<string, PdfAnnotation[]>,
  formValues: Record<string, FormValue> = {},
): Promise<Uint8Array> {
  if (sources.length === 0) throw new Error('There is no document to save.');
  const [baseSource, ...others] = sources;
  const doc = await PDFDocument.load(baseSource.bytes, { ignoreEncryption: true, updateMetadata: false });

  // Form values first, on the base document, so its form stays a form.
  if (Object.keys(formValues).length > 0) {
    const form = doc.getForm();
    for (const [name, value] of Object.entries(formValues)) {
      let field: PDFField;
      try {
        field = form.getField(name);
      } catch {
        continue;
      }
      if (field.isReadOnly()) continue;
      if (field instanceof PDFTextField) field.setText(String(value));
      else if (field instanceof PDFCheckBox) (value ? field.check() : field.uncheck());
      else if (field instanceof PDFDropdown && typeof value === 'string') (value ? field.select(value) : field.clear());
      else if (field instanceof PDFRadioGroup && typeof value === 'string') { if (value) field.select(value); }
      else if (field instanceof PDFOptionList) {
        field.clear();
        const wanted = Array.isArray(value) ? value : [String(value)];
        if (wanted.length) field.select(wanted);
      }
    }
    form.updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  }

  // Gather the pages in the new order: the base document's own, and copies from the other sources.
  const baseCount = doc.getPageCount();
  const basePages = doc.getPages();
  const loaded = new Map<string, PDFDocument>();
  for (const s of others) loaded.set(s.id, await PDFDocument.load(s.bytes, { ignoreEncryption: true, updateMetadata: false }));
  const ordered: PDFPage[] = [];
  for (const entry of pages) {
    if (entry.srcId === baseSource.id) {
      if (entry.srcIndex < 0 || entry.srcIndex >= baseCount) throw new Error('A page of the document is missing.');
      ordered.push(basePages[entry.srcIndex]);
    } else {
      const src = loaded.get(entry.srcId);
      if (!src) throw new Error('A page was inserted from a document that is no longer open.');
      const [copy] = await doc.copyPages(src, [entry.srcIndex]);
      ordered.push(copy);
    }
  }

  // Re-seat the pages: take them all out, then add the wanted ones back in order.
  for (let i = baseCount - 1; i >= 0; i--) doc.removePage(i);
  ordered.forEach(p => doc.addPage(p));

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const supported = new Set(font.getCharacterSet());
  for (let i = 0; i < pages.length; i++) {
    const page = ordered[i];
    // Draw on the page as it is stored (its own /Rotate), then give it the person's extra turn.
    await drawAnnotations(doc, page, annotations[pages[i].id] ?? [], font, supported);
    const extra = pages[i].rotation as Rot;
    if (extra !== 0) page.setRotation(degrees(normalizeRot(page.getRotation().angle + extra)));
  }
  return doc.save();
}

/** A suggested name for the saved copy: "report.pdf" -> "report (edited).pdf". */
export function editedPdfName(name: string): string {
  const base = name.replace(/\.pdf$/i, '');
  return `${base} (edited).pdf`;
}

export { normalizeRect };
