/**
 * The document editor shows plain-text files as HTML paragraphs. Saving a local file must give back
 * exactly the text that was loaded, and must never write HTML into a plain-text file.
 * Run: npx tsx scripts/editor-text-roundtrip-test.mts
 */
import { editorHtmlToPlainText, localFileContents, plainTextToEditorHtml } from '../src/utils/documentKind.ts';
import type { FileItem } from '../src/types/index.ts';

let failed = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failed += 1;
}

const samples: Record<string, string> = {
  'one line': 'hello',
  'several lines': 'a\nb\nc',
  'blank lines': 'a\n\nb',
  'trailing newline': 'a\nb\n',
  'empty': '',
  'special characters': 'a < b && c > "d" \'e\'',
  'markdown': '# Title\n\n- one\n- two\n',
  'json': '{\n  "a": 1,\n  "b": "x & y"\n}\n',
};

console.log('Plain text survives the editor and back');
for (const [label, text] of Object.entries(samples)) {
  const back = editorHtmlToPlainText(plainTextToEditorHtml(text));
  check(label, back === text, `got ${JSON.stringify(back)} expected ${JSON.stringify(text)}`);
}

const base = { folderPath: '/', accountId: 'all', sizeBytes: 0, mimeType: '', updatedAt: '', url: '', tags: [], encryption: {}, version: 1 };
const file = (name: string, mimeType: string, body?: string, category = 'document') =>
  ({ ...base, id: name, name, mimeType, category, documentBody: body }) as unknown as FileItem;

console.log('What gets written to disk');
check('plain text file gets plain text, not HTML',
  localFileContents(file('notes.txt', 'text/plain', '<p>a</p><p>b</p>')) === 'a\nb');
check('markdown file gets plain text',
  localFileContents(file('readme.md', 'text/markdown', '<p># T</p>')) === '# T');
check('html file keeps its HTML',
  localFileContents(file('page.html', 'text/html', '<h1>Hi</h1>')) === '<h1>Hi</h1>');
check('Word file is never written', localFileContents(file('report.docx', '', '<p>x</p>')) === null);
check('PDF is never written', localFileContents(file('paper.pdf', 'application/pdf', '<p>x</p>')) === null);
check('nothing to write without a body', localFileContents(file('empty.txt', 'text/plain')) === null);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nEditor text round-trip checks passed.');
