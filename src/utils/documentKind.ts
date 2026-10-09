import { FileCategory, FileItem } from '../types';

/** Extensions edited as plain text (no rich formatting chrome). */
const PLAIN_EXTENSIONS = new Set([
  // prose / notes
  'txt', 'text', 'md', 'markdown', 'mdx', 'rst', 'adoc', 'asciidoc', 'org',
  // data / config
  'json', 'jsonc', 'json5', 'csv', 'tsv', 'xml', 'yaml', 'yml', 'toml',
  'ini', 'cfg', 'conf', 'env', 'properties', 'plist',
  // code / markup (HTML is rich — listed separately)
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'cts', 'mts',
  'css', 'scss', 'sass', 'less', 'styl',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'm', 'mm',
  'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'cs', 'fs', 'fsx',
  'php', 'pl', 'pm', 'lua', 'r', 'jl', 'scala', 'groovy',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'sql', 'graphql', 'gql', 'proto', 'thrift',
  'vue', 'svelte', 'astro',
  'dockerfile', 'makefile', 'cmake', 'gradle',
  'log', 'diff', 'patch', 'gitignore', 'gitattributes', 'editorconfig',
  'lock', 'map', 'svg',
]);

/** Word-processor / rich surfaces (contentEditable). */
const RICH_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'rtf', 'odt', 'pages', 'html', 'htm', 'xhtml',
]);

const ARCHIVE_EXTENSIONS = new Set([
  'zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'lz', 'lz4', 'zst',
  'dmg', 'iso', 'cab', 'pkg',
]);

const AUDIO_EXTENSIONS = new Set([
  'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'oga', 'wma', 'aiff', 'aif', 'opus',
]);

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'wmv', 'flv', 'mpeg', 'mpg', 'm2ts', 'ts',
]);

const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'ico',
]);

const BINARY_EXTENSIONS = new Set([
  ...ARCHIVE_EXTENSIONS,
  'exe', 'dll', 'so', 'dylib', 'bin', 'wasm', 'apk', 'ipa', 'deb', 'rpm', 'msi',
  'psd', 'ai', 'sketch', 'fig', 'xd',
  'sqlite', 'db', 'pak', 'dat', 'class', 'o', 'obj', 'lib', 'a',
]);

const PLAIN_MIME = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  'application/x-javascript',
  'application/x-typescript',
  'application/x-sh',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
  'application/sql',
  'application/graphql',
  'application/x-httpd-php',
]);

const RICH_MIME_PREFIXES = [
  'application/pdf',
  'application/msword',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml',
];

/** Max bytes to load into the editor from an uploaded text file. */
export const TEXT_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export function fileExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  // Dotfiles like `.gitignore` — treat the whole name as the extension key.
  if (base.startsWith('.') && !base.slice(1).includes('.')) {
    return base.slice(1).toLowerCase();
  }
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/** Badge colors for document format chips in the editor chrome. */
export function formatBadgeClasses(extension: string): string {
  switch (extension.toLowerCase()) {
    case 'pdf':
      return 'bg-red-500/15 border-red-400/30 text-red-300';
    case 'doc':
    case 'docx':
    case 'pages':
      return 'bg-blue-500/15 border-blue-400/30 text-blue-300';
    case 'odt':
    case 'rtf':
      return 'bg-indigo-500/15 border-indigo-400/30 text-indigo-300';
    case 'md':
    case 'markdown':
    case 'mdx':
      return 'bg-sky-500/15 border-sky-400/30 text-sky-300';
    case 'html':
    case 'htm':
    case 'xhtml':
      return 'bg-orange-500/15 border-orange-400/30 text-orange-300';
    case 'txt':
    case 'text':
    case 'log':
      return 'bg-neutral-500/20 border-neutral-400/30 text-neutral-300';
    case 'json':
    case 'jsonc':
      return 'bg-amber-500/15 border-amber-400/30 text-amber-300';
    case 'csv':
    case 'tsv':
      return 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300';
    case 'xml':
    case 'yaml':
    case 'yml':
    case 'toml':
      return 'bg-violet-500/15 border-violet-400/30 text-violet-300';
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'mjs':
    case 'cjs':
    case 'css':
    case 'scss':
    case 'py':
    case 'rs':
    case 'go':
    case 'java':
    case 'rb':
    case 'php':
    case 'sh':
    case 'sql':
      return 'bg-cyan-500/15 border-cyan-400/30 text-cyan-300';
    default:
      return 'bg-orange-500/15 border-orange-400/25 text-orange-300';
  }
}

function isRichMime(mimeType: string): boolean {
  const mime = mimeType.toLowerCase();
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return true;
  return RICH_MIME_PREFIXES.some(prefix => mime.startsWith(prefix));
}

/** Plain-text files use the monospace editor: no character formatting. */
export function isPlainTextDocument(file: Pick<FileItem, 'name' | 'mimeType'>): boolean {
  const ext = fileExtension(file.name);
  if (RICH_EXTENSIONS.has(ext) || isRichMime(file.mimeType)) return false;
  if (BINARY_EXTENSIONS.has(ext)) return false;
  const mime = file.mimeType.toLowerCase();
  if (mime.startsWith('text/')) return true;
  if (mime === 'image/svg+xml') return true;
  if (PLAIN_MIME.has(mime)) return true;
  if (mime.endsWith('+json') || mime.endsWith('+xml')) return true;
  return PLAIN_EXTENSIONS.has(ext);
}

/**
 * Any file that should open in the document / text editor.
 * Photos, video, audio, and archives stay in their own viewers.
 */
export function isEditableDocument(file: Pick<FileItem, 'name' | 'mimeType' | 'category'>): boolean {
  if (
    file.category === 'photo'
    || file.category === 'video'
    || file.category === 'archive'
    || file.category === 'audio'
  ) {
    return false;
  }

  const ext = fileExtension(file.name);
  if (BINARY_EXTENSIONS.has(ext)) return false;
  if (IMAGE_EXTENSIONS.has(ext)) return false;
  if (VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)) return false;

  if (isPlainTextDocument(file)) return true;
  if (RICH_EXTENSIONS.has(ext) || isRichMime(file.mimeType)) return true;

  // Uploads / library items tagged as documents that are not known binaries.
  if (file.category === 'document') return true;

  return false;
}

/** Category for a newly uploaded File from its mime type and name. */
export function classifyUploadCategory(name: string, mimeType: string): FileCategory {
  const ext = fileExtension(name);
  const mime = mimeType.toLowerCase();

  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) return 'video';
  if ((mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) && ext !== 'svg') return 'photo';
  // SVG is text — treat as a document so the text editor opens it.
  if (ext === 'svg' || mime === 'image/svg+xml') return 'document';
  if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (
    ARCHIVE_EXTENSIONS.has(ext)
    || mime.includes('zip')
    || mime.includes('compressed')
    || mime.includes('archive')
    || mime === 'application/x-tar'
    || mime === 'application/gzip'
  ) {
    return 'archive';
  }
  return 'document';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
  ));
}

function looksLikeHtml(value: string): boolean {
  return /^\s*</.test(value) && /<\/[a-z][\w:-]*>/i.test(value);
}

/** Wrap plain text as paragraph HTML for the rich editor. */
export function plainTextToEditorHtml(text: string): string {
  if (!text) return '<p><br></p>';
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => (line.length ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>'))
    .join('');
}

export function initialDocumentBody(file: FileItem): string {
  if (file.documentBody != null) return file.documentBody;
  if (isPlainTextDocument(file)) return '';
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  return `<h1>${escapeHtml(title)}</h1><p><br></p>`;
}

/**
 * HTML for the contentEditable surface. Plain-text library bodies are wrapped as
 * paragraphs so every editable format gets the same formatting toolbar.
 */
export function editorHtmlFromFile(file: FileItem): string {
  const raw = file.documentBody;
  if (raw == null) {
    if (isPlainTextDocument(file)) return '<p><br></p>';
    return initialDocumentBody(file);
  }
  if (looksLikeHtml(raw)) return raw;
  return plainTextToEditorHtml(raw);
}

/** Turn the document editor's HTML back into the plain text it was made from (see `plainTextToEditorHtml`). */
export function editorHtmlToPlainText(html: string): string {
  const text = html
    .replace(/<(p|div)(\s[^>]*)?>\s*<br\s*\/?>\s*<\/\1>/gi, '<$1></$1>')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}

/**
 * What to write to disk when a local file is saved from the document editor.
 * Returns `null` for formats the editor cannot produce (Word, PDF, ...), which must not be overwritten.
 */
export function localFileContents(file: FileItem): string | null {
  const body = file.documentBody;
  if (body == null) return null;
  const ext = fileExtension(file.name);
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml') return body;
  if (isPlainTextDocument(file)) return editorHtmlToPlainText(body);
  return null;
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
