import { zipSync, type Zippable } from 'fflate';
import { FileItem } from '../types';
import { localFs } from '../services/localFsBridge';

/** Formats that are already compressed; storing them is faster and avoids growing the archive. */
const ALREADY_COMPRESSED = /\.(zip|gz|7z|rar|dmg|jpe?g|png|gif|webp|heic|heif|avif|mp[34]|m4[av]|mov|mkv|webm|aac|flac|ogg)$/i;

/** Stops a huge selection from freezing the app; the zip is built in memory. */
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;

export interface ZipResult {
  name: string;
  bytes: Uint8Array;
  /** Files that went into the archive. */
  added: number;
  /** Names of files whose data could not be read. */
  skipped: string[];
  /** Combined size of the files before compressing. */
  originalBytes: number;
}

export function archiveNameFor(sources: Pick<FileItem, 'name'>[]): string {
  if (sources.length === 1) {
    const name = sources[0].name;
    return `${name.replace(/\.[^./]+$/, '') || name}.zip`;
  }
  return 'Archive.zip';
}

/** `name`, or `name 2.ext`, `name 3.ext`, ... when `taken` already has it. */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let n = 2;
  while (taken.has(`${stem} ${n}${ext}`)) n += 1;
  return `${stem} ${n}${ext}`;
}

async function readBytes(file: FileItem): Promise<Uint8Array> {
  if (file.localPath && localFs.available()) return localFs.readBytes(file.localPath);
  if (!file.url || file.url === '#') throw new Error('no data');
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Read the files and build a real ZIP in memory. */
export async function zipFiles(sources: FileItem[]): Promise<ZipResult> {
  const entries: Zippable = {};
  const used = new Set<string>();
  const skipped: string[] = [];
  let originalBytes = 0;

  for (const file of sources) {
    let data: Uint8Array;
    try {
      data = await readBytes(file);
    } catch {
      skipped.push(file.name);
      continue;
    }
    originalBytes += data.length;
    if (originalBytes > MAX_TOTAL_BYTES) {
      throw new Error('That selection is too large to compress here (limit 512 MB).');
    }
    const entryName = uniqueName(file.name, used);
    used.add(entryName);
    const modified = Date.parse(file.updatedAt);
    entries[entryName] = [
      data,
      {
        level: ALREADY_COMPRESSED.test(file.name) ? 0 : 6,
        mtime: Number.isFinite(modified) ? new Date(modified) : new Date(),
      },
    ];
  }

  const added = Object.keys(entries).length;
  return {
    name: archiveNameFor(sources),
    bytes: added ? zipSync(entries) : new Uint8Array(0),
    added,
    skipped,
    originalBytes,
  };
}
