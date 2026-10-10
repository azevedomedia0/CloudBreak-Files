/**
 * Native file previews (desktop macOS): Quick Look / sips → JPEG, then asset URL.
 *
 * Thumbnail IPC is queued (max 4 concurrent) so opening large folders does not
 * spawn hundreds of qlmanage/sips processes at once.
 */

import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { FileItem } from '../types';
import { needsNativeRaster, needsNativeThumbnail } from '../utils/documentKind';

interface PreviewResult {
  path: string;
  widthHint: number;
}

/** App .icns/sips work is cheap; keep a modest ceiling so PDF/QL jobs still share the queue. */
const THUMB_CONCURRENCY = 6;

const thumbCache = new Map<string, string>();
const rasterCache = new Map<string, string>();
const rasterInflight = new Map<string, Promise<string | null>>();

type Waiter = {
  resolve: (url: string | null) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

type QueueJob = {
  key: string;
  localPath: string;
  maxEdge: number;
  waiters: Waiter[];
};

/** Jobs waiting or running, keyed by path::edge. */
const jobs = new Map<string, QueueJob>();
const queue: QueueJob[] = [];
let activeCount = 0;

function cacheKey(path: string, edge: number): string {
  return `${path}::${edge}`;
}

async function invokeThumbnail(localPath: string, maxEdge: number): Promise<string | null> {
  try {
    const result = await invoke<PreviewResult>('local_file_thumbnail', {
      path: localPath,
      maxEdge,
    });
    const url = convertFileSrc(result.path);
    thumbCache.set(cacheKey(localPath, maxEdge), url);
    return url;
  } catch {
    return null;
  }
}

function settleJob(job: QueueJob, url: string | null): void {
  for (const w of job.waiters) {
    if (w.signal && w.onAbort) {
      w.signal.removeEventListener('abort', w.onAbort);
    }
    w.resolve(url);
  }
  job.waiters = [];
  jobs.delete(job.key);
}

function dropWaiter(job: QueueJob, waiter: Waiter): void {
  const idx = job.waiters.indexOf(waiter);
  if (idx >= 0) job.waiters.splice(idx, 1);
  if (job.waiters.length > 0) return;

  // No one wants this result — drop from queue if not started.
  const qIdx = queue.indexOf(job);
  if (qIdx >= 0) {
    queue.splice(qIdx, 1);
    jobs.delete(job.key);
  }
}

function pumpThumbQueue(): void {
  while (activeCount < THUMB_CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!;
    if (job.waiters.length === 0) {
      jobs.delete(job.key);
      continue;
    }
    activeCount += 1;
    void invokeThumbnail(job.localPath, job.maxEdge)
      .then(url => settleJob(job, url))
      .finally(() => {
        activeCount -= 1;
        pumpThumbQueue();
      });
  }
}

function enqueueThumbnail(
  localPath: string,
  maxEdge: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const key = cacheKey(localPath, maxEdge);
  const hit = thumbCache.get(key);
  if (hit) return Promise.resolve(hit);
  if (signal?.aborted) return Promise.resolve(null);

  return new Promise<string | null>(resolve => {
    let job = jobs.get(key);
    if (!job) {
      job = { key, localPath, maxEdge, waiters: [] };
      jobs.set(key, job);
      queue.push(job);
    }

    const waiter: Waiter = { resolve, signal };
    waiter.onAbort = () => {
      dropWaiter(job!, waiter);
      resolve(null);
    };
    job.waiters.push(waiter);

    if (signal) {
      signal.addEventListener('abort', waiter.onAbort, { once: true });
    }
    pumpThumbQueue();
  });
}

export const previewBridge = {
  available(): boolean {
    return isTauri();
  },

  /**
   * JPEG thumbnail asset URL for grid / list / inspector.
   * Pass an AbortSignal to drop the request if the tile unmounts before work starts.
   */
  thumbnailUrl(localPath: string, maxEdge = 512, signal?: AbortSignal): Promise<string | null> {
    return enqueueThumbnail(localPath, maxEdge, signal);
  },

  /** Larger JPEG for Quick Look / Photo Studio when HEIC/RAW/TIFF won't decode in the web view. */
  async rasterUrl(localPath: string, maxEdge = 2048): Promise<string | null> {
    const key = cacheKey(localPath, maxEdge);
    const hit = rasterCache.get(key);
    if (hit) return hit;
    const pending = rasterInflight.get(key);
    if (pending) return pending;

    const work = (async () => {
      try {
        const result = await invoke<PreviewResult>('local_file_raster', {
          path: localPath,
          maxEdge,
        });
        const url = convertFileSrc(result.path);
        rasterCache.set(key, url);
        thumbCache.set(cacheKey(localPath, 512), url);
        return url;
      } catch {
        return null;
      } finally {
        rasterInflight.delete(key);
      }
    })();
    rasterInflight.set(key, work);
    return work;
  },

  /** Open with Preview / Word / Pages / Excel / etc. */
  openWithDefault(localPath: string): Promise<void> {
    return invoke<void>('local_open_with_default', { path: localPath });
  },
};

/** Attach a native thumbnail URL onto a file item when needed. */
export async function withNativeThumbnail(file: FileItem): Promise<FileItem> {
  if (!file.localPath || !previewBridge.available() || !needsNativeThumbnail(file)) {
    return file;
  }
  if (file.thumbnailUrl && !needsNativeRaster(file)) {
    // Standard JPEG/PNG photos already use the asset URL as the thumb.
    return file;
  }
  const thumbnailUrl = await previewBridge.thumbnailUrl(file.localPath);
  if (!thumbnailUrl) return file;
  return { ...file, thumbnailUrl };
}

/** Rasterize HEIC/RAW/TIFF for in-app open (Photo Studio / Quick Look). */
export async function withNativeRaster(file: FileItem): Promise<FileItem> {
  if (!file.localPath || !previewBridge.available() || !needsNativeRaster(file)) {
    return file;
  }
  const url = await previewBridge.rasterUrl(file.localPath);
  if (!url) return file;
  return { ...file, url, thumbnailUrl: file.thumbnailUrl || url };
}
