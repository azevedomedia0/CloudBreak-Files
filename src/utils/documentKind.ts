import { FileItem } from '../types';

const PLAIN_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'csv', 'log', 'xml', 'yaml', 'yml', 'text',
]);

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Badge colors for document format chips in the editor chrome. */
export function formatBadgeClasses(extension: string): string {
  switch (extension.toLowerCase()) {
    case 'pdf':
      return 'bg-red-500/15 border-red-400/30 text-red-300';
    case 'doc':
    case 'docx':
      return 'bg-blue-500/15 border-blue-400/30 text-blue-300';
    case 'odt':
    case 'rtf':
      return 'bg-indigo-500/15 border-indigo-400/30 text-indigo-300';
    case 'md':
    case 'markdown':
      return 'bg-sky-500/15 border-sky-400/30 text-sky-300';
    case 'html':
    case 'htm':
      return 'bg-orange-500/15 border-orange-400/30 text-orange-300';
    case 'txt':
    case 'text':
    case 'log':
      return 'bg-neutral-500/20 border-neutral-400/30 text-neutral-300';
    case 'json':
      return 'bg-amber-500/15 border-amber-400/30 text-amber-300';
    case 'csv':
      return 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300';
    case 'xml':
    case 'yaml':
    case 'yml':
      return 'bg-violet-500/15 border-violet-400/30 text-violet-300';
    default:
      return 'bg-orange-500/15 border-orange-400/25 text-orange-300';
  }
}

/** Plain-text files use Firefox's text editor: no character formatting. */
export function isPlainTextDocument(file: FileItem): boolean {
  return file.mimeType.startsWith('text/') || PLAIN_EXTENSIONS.has(fileExtension(file.name));
}

/** Documents and text files that open in the editor. Photos, video, and archives do not. */
export function isEditableDocument(file: FileItem): boolean {
  if (file.category === 'photo' || file.category === 'video' || file.category === 'archive' || file.category === 'audio') {
    return false;
  }
  if (file.category === 'document' || isPlainTextDocument(file)) return true;
  return ['pdf', 'doc', 'docx', 'rtf', 'html', 'htm', 'odt'].includes(fileExtension(file.name));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
  ));
}

export function initialDocumentBody(file: FileItem): string {
  if (file.documentBody != null) return file.documentBody;
  if (isPlainTextDocument(file)) return '';
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  return `<h1>${escapeHtml(title)}</h1><p><br></p>`;
}

export function countWords(text: string): number {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.split(' ').length : 0;
}

export function htmlWithoutFindMarks(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('mark.doc-find').forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
  clone.normalize();
  return clone.innerHTML;
}
