/**
 * In-app self-test. It runs inside the real desktop web view, so it checks what unit tests cannot:
 * the security policy, the asset protocol, vault.json on disk, and local file saves.
 *
 * Development builds only: App.tsx loads this behind `import.meta.env.DEV`, so it is not in release bundles.
 * Run it with a throwaway app data folder (see src-tauri/src/selftest.rs).
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { rustBridge } from './services/rustBridge';
import { dataUrlToBytes, localFs } from './services/localFsBridge';
import { discardTempOutput, trimAndTranscode } from './services/mediaBridge';
import { importLocalFolderAtPath } from './utils/importLocalFolder';
import { localFileContents } from './utils/documentKind';
import type { FileItem } from './types';

interface Fixtures {
  dir: string; text: string; html: string; markdown: string; word: string; png: string; video: string; audio: string;
}

const lines: string[] = [];
let failures = 0;

function pass(name: string, detail = '') {
  lines.push(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
}
function fail(name: string, detail: string) {
  failures += 1;
  lines.push(`FAIL  ${name}  (${detail})`);
}
async function check(name: string, run: () => Promise<string | void>) {
  try {
    pass(name, (await run()) || '');
  } catch (err) {
    fail(name, err instanceof Error ? err.message : String(err));
  }
}
function expect(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
async function rejects(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error('expected an error but it succeeded');
}

const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const appFile = (name: string) => invoke<string | null>('selftest_read_app_file', { name });

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

function loadMediaDuration(kind: 'video' | 'audio', src: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind);
    el.preload = 'metadata';
    const timer = setTimeout(() => reject(new Error(`${kind} metadata did not load in 10s`)), 10000);
    el.onloadedmetadata = () => { clearTimeout(timer); resolve(el.duration); };
    el.onerror = () => { clearTimeout(timer); reject(new Error(`${kind} failed to load`)); };
    el.src = src;
  });
}

async function run(fx: Fixtures) {
  // ---- vault: unlock, vault.json on disk, wrong passphrase
  const pass1 = 'selftest passphrase one';
  await check('vault starts locked', async () => {
    expect(!(await rustBridge.isVaultUnlocked()), 'vault was already unlocked');
    expect((await appFile('vault.json')) === null, 'vault.json existed before the first unlock');
  });
  await check('first unlock succeeds and writes vault.json', async () => {
    await rustBridge.unlockVault(pass1);
    expect(await rustBridge.isVaultUnlocked(), 'not unlocked after unlockVault');
    const raw = await appFile('vault.json');
    expect(raw, 'vault.json was not written');
    const json = JSON.parse(raw);
    expect(typeof json.salt === 'string' && typeof json.hash === 'string' && json.iterations > 0, 'unexpected vault.json shape');
    expect(!raw.includes(pass1), 'vault.json contains the passphrase');
    return `iterations ${json.iterations}`;
  });
  await check('lock, wrong passphrase rejected, right passphrase accepted', async () => {
    await rustBridge.lockVault();
    expect(!(await rustBridge.isVaultUnlocked()), 'still unlocked after lock');
    await rejects(() => rustBridge.unlockVault('definitely the wrong one'));
    await rustBridge.unlockVault(pass1);
    expect(await rustBridge.isVaultUnlocked(), 'right passphrase was rejected');
  });
  await check('session encryption round trip in the desktop app', async () => {
    const plain = new TextEncoder().encode('secret bytes 123');
    const enc = await rustBridge.encryptWithSession(plain);
    expect(enc && enc.ciphertext, 'no ciphertext');
    const back = await rustBridge.decryptWithSession(enc);
    expect(decode(back) === 'secret bytes 123', 'decrypted bytes differ');
  });

  // ---- local folder: allow, scan, import
  await check('allow a folder and import it', async () => {
    await invoke('selftest_allow_folder', { path: fx.dir });
    const listed = await localFs.listFolders();
    expect(listed.some(f => f.path.endsWith('/files')), 'folder not listed as remembered');
    const imported = await importLocalFolderAtPath(listed.find(f => f.path.endsWith('/files'))!);
    const names = imported.files.map(f => f.name).sort();
    expect(names.join(',') === 'clip.mp4,inner.md,notes.txt,page.html,photo.png,report.docx,song.wav', `files: ${names.join(',')}`);
    expect(imported.folders.length === 2, `folders: ${imported.folders.length}`);
    const byName = (n: string) => imported.files.find(f => f.name === n)!;
    expect(byName('notes.txt').documentBody === 'line one\nline two\n', 'notes.txt body not read');
    expect(byName('page.html').documentBody?.includes('<h1>'), 'page.html body not read');
    expect(byName('photo.png').category === 'photo' && byName('clip.mp4').category === 'video' && byName('song.wav').category === 'audio', 'categories wrong');
    expect(byName('report.docx').documentBody === undefined, 'docx should not have an editable body');
    (globalThis as { __imported?: FileItem[] }).__imported = imported.files;
    return `${imported.files.length} files, ${imported.folders.length} folders`;
  });

  // ---- asset protocol + CSP
  await check('asset URL fetch returns the real file (connect-src + scope)', async () => {
    const res = await fetch(localFs.assetUrl(fx.png));
    expect(res.ok, `status ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const direct = await localFs.readBytes(fx.png);
    expect(bytes.length === direct.length && bytes.length > 50, `fetched ${bytes.length} bytes, read ${direct.length}`);
    return `${bytes.length} bytes`;
  });
  await check('image loads from the asset URL and exports from a canvas (img-src + CORS)', async () => {
    const img = await loadImage(localFs.assetUrl(fx.png));
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    const url = canvas.toDataURL('image/png');
    expect(url.startsWith('data:image/png;base64,'), 'canvas export failed');
    return `${img.naturalWidth}x${img.naturalHeight}`;
  });
  await check('video plays from the asset URL (media-src, range requests)', async () => {
    const d = await loadMediaDuration('video', localFs.assetUrl(fx.video));
    expect(d > 2 && d < 4, `duration ${d}`);
    return `${d.toFixed(1)}s`;
  });
  await check('audio loads from the asset URL', async () => {
    const d = await loadMediaDuration('audio', localFs.assetUrl(fx.audio));
    expect(d > 0.5 && d < 2, `duration ${d}`);
    return `${d.toFixed(1)}s`;
  });

  // ---- access limits
  await check('files outside added folders are refused', async () => {
    await rejects(() => localFs.readText('/etc/hosts'));
    await rejects(() => localFs.writeText('/tmp/cloudbreak-selftest-escape.txt', 'x'));
    await rejects(() => localFs.readText(`${fx.dir}/../report.txt`));
    await rejects(() => localFs.trashFile('/etc/hosts'));
    await rejects(() => localFs.scanFolder('/etc'));
  });
  await check('asset URL for a file outside added folders is refused', async () => {
    let ok = false;
    try { ok = (await fetch(localFs.assetUrl('/etc/hosts'))).ok; } catch { ok = false; }
    expect(!ok, '/etc/hosts was readable through the asset protocol');
  });
  await check('media commands refuse paths outside the temp media folder', async () => {
    await rejects(() => invoke('media_read_temp', { req: { path: '/etc/hosts' } }));
    await rejects(() => invoke('media_read_temp', { req: { path: fx.text } }));
    await rejects(() => invoke('media_cleanup_temp', { req: { path: fx.text } }));
    expect((await localFs.readText(fx.text)) === 'line one\nline two\n', 'notes.txt was changed or deleted');
  });

  // ---- edits
  await check('plain text document saves as plain text, in place', async () => {
    const file = (globalThis as { __imported?: FileItem[] }).__imported!.find(f => f.name === 'notes.txt')!;
    const edited: FileItem = { ...file, documentBody: '<p>line one</p><p>line two, edited</p>' };
    const contents = localFileContents(edited);
    expect(contents === 'line one\nline two, edited', `contents ${JSON.stringify(contents)}`);
    const info = await localFs.writeText(file.localPath!, contents);
    expect((await localFs.readText(fx.text)) === 'line one\nline two, edited', 'disk content differs');
    expect(info.sizeBytes === 25, `size ${info.sizeBytes}`);
  });
  await check('Word file is not written back', async () => {
    const file = (globalThis as { __imported?: FileItem[] }).__imported!.find(f => f.name === 'report.docx')!;
    expect(localFileContents({ ...file, documentBody: '<p>x</p>' }) === null, 'docx would be overwritten');
    expect(decode(await localFs.readBytes(fx.word)) === 'PK-not-really-a-docx', 'docx changed');
  });
  await check('edited photo saves as a new file next to the original', async () => {
    const img = await loadImage(localFs.assetUrl(fx.png));
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    const { bytes, mime } = dataUrlToBytes(canvas.toDataURL('image/png'));
    expect(mime === 'image/png' && bytes.length > 50, 'bad image bytes');
    const original = await localFs.readBytes(fx.png);
    const info = await localFs.writeBytes(`${fx.dir}/photo edited.png`, bytes);
    expect(info.name === 'photo edited.png', info.name);
    const after = await localFs.readBytes(fx.png);
    expect(after.length === original.length, 'original photo changed');
  });
  await check('rename happens on disk and refuses unsafe names', async () => {
    const info = await localFs.rename(fx.markdown, 'renamed.md');
    expect(info.name === 'renamed.md', info.name);
    expect((await localFs.readText(`${fx.dir}/sub/renamed.md`)) === '# Inner\n', 'content missing after rename');
    await rejects(() => localFs.rename(`${fx.dir}/sub/renamed.md`, '../escape.md'));
    await rejects(() => localFs.rename(`${fx.dir}/sub/renamed.md`, 'notes.txt'.replace('notes', 'sub/x')));
  });
  await check('delete moves a file to the Trash', async () => {
    await localFs.writeText(`${fx.dir}/to-trash.txt`, 'bye');
    await localFs.trashFile(`${fx.dir}/to-trash.txt`);
    const scan = await localFs.scanFolder(fx.dir);
    expect(!scan.entries.some(e => e.name === 'to-trash.txt'), 'file still in the folder');
    await rejects(() => localFs.trashFile(`${fx.dir}/sub`));
  });

  // ---- video trim from a local file, then save to a folder
  await check('trim a local video in place and save it to a folder', async () => {
    const result = await trimAndTranscode({
      sourceUrl: localFs.assetUrl(fx.video),
      sourcePath: fx.video,
      startSeconds: 0.5, endSeconds: 2,
      format: 'mp4', resolution: 'original', quality: 'balanced', fps: 30, includeAudio: true,
    });
    expect(result.outputPath, 'output path was not kept');
    expect(result.sizeBytes > 500, `output ${result.sizeBytes} bytes`);
    const first = await localFs.saveFromTemp(result.outputPath, 'trimmed.mp4', fx.dir);
    expect(first && first.name === 'trimmed.mp4' && first.sizeBytes === result.sizeBytes, `first ${JSON.stringify(first)}`);
    const second = await localFs.saveFromTemp(result.outputPath, 'trimmed.mp4', fx.dir);
    expect(second && second.name === 'trimmed 2.mp4', `second ${JSON.stringify(second)}`);
    const d = await loadMediaDuration('video', localFs.assetUrl(first.path));
    expect(d > 1 && d < 2, `trimmed duration ${d}`);
    expect((await localFs.readBytes(fx.video)).length > 1000, 'source video missing');
    await discardTempOutput(result.outputPath);
    await rejects(() => invoke('media_read_temp', { req: { path: result.outputPath } }));
    return `${first.sizeBytes} bytes, ${d.toFixed(1)}s`;
  });
  await check('save from temp refuses a file that is not in the temp folder', async () => {
    await rejects(() => localFs.saveFromTemp(fx.text, 'x.txt', fx.dir));
  });

  // ---- persistence
  await check('added folder is remembered in local_roots.json', async () => {
    const raw = await appFile('local_roots.json');
    expect(raw && raw.includes('/files'), `local_roots.json: ${raw}`);
  });
}

async function runWindowChecks() {
  await check('window drag permission is granted', async () => {
    // Outside a real mouse press this may do nothing or fail for another reason. Only a permission error counts.
    try {
      await invoke('plugin:window|start_dragging');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(!/not allowed|permission/i.test(msg), msg);
    }
  });
  await check('toolbar has draggable empty space and buttons stay clickable', async () => {
    const bar = document.querySelector('[data-tauri-drag-region]') as HTMLElement | null;
    expect(bar, 'no drag region found');
    const rect = bar.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    let draggable = 0;
    let samples = 0;
    let buttonsHit = 0;
    for (let x = rect.left + 70; x < rect.right - 4; x += 4) {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el) continue;
      samples += 1;
      if (el.hasAttribute('data-tauri-drag-region')) draggable += 1;
      else if (el.closest('button, input, [role="button"]')) buttonsHit += 1;
    }
    const pct = Math.round((draggable / samples) * 100);
    expect(pct >= 15, `only ${pct}% of the toolbar is draggable`);
    expect(buttonsHit > 0, 'no buttons found along the toolbar');
    return `${pct}% draggable, ${buttonsHit} samples on controls`;
  });
  await check('toolbar leaves room for the native window buttons', async () => {
    const buttons = await invoke<{ minX: number; maxX: number; windowWidth: number }>('selftest_window_buttons');
    const back = document.querySelector('button[title="Back"]') as HTMLElement | null;
    expect(back, 'back button not found');
    const left = back.getBoundingClientRect().left;
    expect(buttons.maxX > 20, `unexpected button position ${JSON.stringify(buttons)}`);
    expect(left >= buttons.maxX + 4, `back button starts at ${left}px but the window buttons end at ${buttons.maxX}px`);
    return `window buttons end at ${buttons.maxX}px, first toolbar button at ${Math.round(left)}px (gap ${Math.round(left - buttons.maxX)}px)`;
  });
}

/** Called once at startup in development builds. Does nothing unless the self-test is switched on. */
export async function maybeRunSelfTest(): Promise<void> {
  if (!isTauri()) return;
  let dir: string | null = null;
  try {
    dir = await invoke<string | null>('selftest_dir');
  } catch {
    return;
  }
  if (!dir) return;

  lines.push(`Cloudbreak in-app self-test  ${new Date().toISOString()}`);
  lines.push(`origin ${location.origin}  userAgent ${navigator.userAgent}`);
  try {
    const fx = await invoke<Fixtures>('selftest_make_fixtures');
    await run(fx);
    await runWindowChecks();
  } catch (err) {
    fail('setup', err instanceof Error ? err.message : String(err));
  }
  lines.push('');
  lines.push(failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED');
  await invoke('selftest_finish', { report: lines.join('\n') + '\n' });
}
