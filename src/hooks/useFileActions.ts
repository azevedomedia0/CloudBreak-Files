import React, { useState } from 'react';
import { CloudProviderId, FileItem, FolderItem } from '../types';
import { computeSha256 } from '../utils/crypto';
import {
  classifyUploadCategory,
  isEditableDocument,
  isPlainTextDocument,
  localFileContents,
  TEXT_UPLOAD_MAX_BYTES,
} from '../utils/documentKind';
import {
  clearEncryption,
  decryptFileItem,
  encryptFileItem,
  encryptUploadBytes,
  hasEncryptedPayload,
} from '../utils/fileEncryption';
import { isZipArchive, unzipArchiveToFileItems } from '../utils/unzipArchive';
import { rustBridge } from '../services/rustBridge';
import { dataUrlToBytes, localFs } from '../services/localFsBridge';

interface Options {
  files: FileItem[];
  setFiles: React.Dispatch<React.SetStateAction<FileItem[]>>;
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  selectedAccountId: CloudProviderId;
  selectedFolder: FolderItem | null;
  showToast: (msg: string) => void;
  confirmBeforeDelete?: boolean;
  /** When true, new uploads are encrypted with the vault session key. */
  isVaultUnlocked?: boolean;
}

const IMAGE_EXTENSIONS_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/bmp': 'bmp',
};

function directoryOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

/** "photo.jpg" -> "photo edited.png", or "photo edited 2.png" if that name is taken. */
function editedCopyName(original: string, ext: string, taken: Set<string>): string {
  const dot = original.lastIndexOf('.');
  const stem = dot > 0 ? original.slice(0, dot) : original;
  const first = `${stem} edited.${ext}`;
  if (!taken.has(first)) return first;
  let n = 2;
  while (taken.has(`${stem} edited ${n}.${ext}`)) n += 1;
  return `${stem} edited ${n}.${ext}`;
}

function nextCopyName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const hasExt = dot > 0 && dot < name.length - 1;
  const base = hasExt ? name.slice(0, dot) : name;
  const ext = hasExt ? name.slice(dot) : '';
  const first = `${base} copy${ext}`;
  if (!taken.has(first)) return first;
  let n = 2;
  while (taken.has(`${base} copy ${n}${ext}`)) n += 1;
  return `${base} copy ${n}${ext}`;
}

/** File list actions: save versions, encrypt flags, delete, upload and drag-and-drop. */
export function useFileActions({
  files,
  setFiles,
  selectedFileId,
  setSelectedFileId,
  selectedAccountId,
  selectedFolder,
  showToast,
  confirmBeforeDelete = true,
  isVaultUnlocked = false,
}: Options) {
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [clipboardFileIds, setClipboardFileIds] = useState<string[]>([]);

  // Photo Version Save
  const handleSavePhotoVersion = async (updatedFile: FileItem, dataUrl: string) => {
    if (!updatedFile.localPath || !localFs.available()) {
      setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
      showToast(`Saved version ${updatedFile.version} (kept in this session)`);
      return;
    }
    // A local photo is never overwritten: the edit is saved as a new file next to it.
    try {
      const { bytes, mime } = dataUrlToBytes(dataUrl);
      const ext = IMAGE_EXTENSIONS_BY_MIME[mime] ?? 'png';
      const dir = directoryOf(updatedFile.localPath);
      const taken = new Set(files.filter(f => f.localPath && directoryOf(f.localPath) === dir).map(f => f.name));
      const name = editedCopyName(updatedFile.name, ext, taken);
      const info = await localFs.writeBytes(`${dir}/${name}`, bytes);
      const copy: FileItem = {
        ...updatedFile,
        id: `file-local-${info.path}`,
        name: info.name,
        localPath: info.path,
        url: localFs.assetUrl(info.path),
        thumbnailUrl: localFs.assetUrl(info.path),
        sizeBytes: info.sizeBytes,
        mimeType: mime,
        version: 1,
        updatedAt: new Date(info.modifiedMs).toISOString(),
      };
      setFiles(prev => [copy, ...prev]);
      setSelectedFileId(copy.id);
      showToast(`Saved “${info.name}” next to the original`);
    } catch (err) {
      showToast(`Could not save the edited photo: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveDocument = async (updatedFile: FileItem) => {
    if (!updatedFile.localPath || !localFs.available()) {
      setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
      showToast(`Saved ${updatedFile.name} (kept in this session)`);
      return;
    }
    const contents = localFileContents(updatedFile);
    if (contents === null) {
      setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
      showToast(`Saved in Cloudbreak only. ${updatedFile.name} can’t be written back to disk yet`);
      return;
    }
    try {
      const info = await localFs.writeText(updatedFile.localPath, contents);
      setFiles(prev => prev.map(f => (
        f.id === updatedFile.id
          ? { ...updatedFile, sizeBytes: info.sizeBytes, updatedAt: new Date(info.modifiedMs).toISOString() }
          : f
      )));
      showToast(`Saved ${updatedFile.name} to disk`);
    } catch (err) {
      setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
      showToast(`Could not save ${updatedFile.name} to disk: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Trimmed Video Save
  const handleSaveTrimmedVideo = (newFile: FileItem) => {
    setFiles(prev => [newFile, ...prev]);
    setSelectedFileId(newFile.id);
    showToast(`Added ${newFile.name} to storage bucket`);
  };

  // Encrypt / decrypt with the vault session key (held in Rust, not JS).
  const handleToggleEncrypt = async (targetFile: FileItem) => {
    if (targetFile.encryption.isEncrypted) {
      if (!hasEncryptedPayload(targetFile.encryption)) {
        setFiles(prev =>
          prev.map(f => {
            if (f.id !== targetFile.id) return f;
            return {
              ...f,
              encryption: clearEncryption(f.encryption.checksumSha256 || ''),
            };
          })
        );
        showToast(`Cleared encryption flag on ${targetFile.name} (no ciphertext on this file)`);
        return;
      }

      try {
        const unlocked = await rustBridge.isVaultUnlocked();
        if (!unlocked) {
          showToast('Unlock the vault to decrypt this file');
          return;
        }
        showToast(`Decrypting ${targetFile.name}…`);
        const decrypted = await decryptFileItem(targetFile);
        setFiles(prev => prev.map(f => (f.id === targetFile.id ? decrypted : f)));
        showToast(`Decrypted ${targetFile.name}`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    try {
      const unlocked = await rustBridge.isVaultUnlocked();
      if (!unlocked) {
        showToast('Unlock the vault to encrypt files');
        return;
      }
      showToast(`Encrypting ${targetFile.name}…`);
      const encrypted = await encryptFileItem(targetFile);
      setFiles(prev => prev.map(f => (f.id === targetFile.id ? encrypted : f)));
      showToast(`Encrypted ${targetFile.name} with AES-256-GCM`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  // Move local files to the Trash. Returns the ids that were moved; a failure is reported and that file stays.
  const trashLocalFiles = async (targets: FileItem[]): Promise<string[]> => {
    const moved: string[] = [];
    const failures: string[] = [];
    for (const target of targets) {
      try {
        await localFs.trashFile(target.localPath as string);
        moved.push(target.id);
      } catch (err) {
        failures.push(`${target.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failures.length) showToast(`Could not move to the Trash. ${failures[0]}`);
    return moved;
  };

  const removeFromList = (ids: string[]) => {
    if (!ids.length) return;
    setFiles(prev => prev.filter(f => !ids.includes(f.id)));
    if (selectedFileId && ids.includes(selectedFileId)) setSelectedFileId(null);
  };

  // File Deletion. Local files go to the Trash; everything else is only removed from the library.
  const handleDeleteFile = async (fileId: string) => {
    const target = files.find(f => f.id === fileId);
    if (target?.localPath && localFs.available()) {
      if (confirmBeforeDelete && !window.confirm(`Move “${target.name}” to the Trash?`)) return;
      const moved = await trashLocalFiles([target]);
      removeFromList(moved);
      if (moved.length) showToast(`Moved “${target.name}” to the Trash`);
      return;
    }
    if (confirmBeforeDelete && !window.confirm('Remove this file from the library?')) return;
    removeFromList([fileId]);
    showToast('Removed from the library');
  };

  // Batch Restore — put selected Trash items back into Downloads
  const handleBatchRestore = (fileIds: string[]) => {
    const idSet = new Set(fileIds);
    const isInTrash = (f: FileItem) =>
      f.folderId === 'f-trash'
      || (f.folderPath || '').toLowerCase().replace(/\\/g, '/').includes('/trash');

    let restored = 0;
    setFiles(prev => {
      restored = prev.filter(f => idSet.has(f.id) && isInTrash(f)).length;
      if (!restored) return prev;
      return prev.map(f => {
        if (!idSet.has(f.id) || !isInTrash(f)) return f;
        return {
          ...f,
          folderId: 'f-downloads',
          folderPath: '/Downloads',
          tags: f.tags.filter(tag => {
            const lower = tag.toLowerCase();
            return lower !== 'trash' && lower !== 'outdated' && lower !== 'temp';
          }),
          updatedAt: new Date().toISOString(),
        };
      });
    });

    if (restored === 0) showToast('Select items in Trash to restore them');
    else showToast(`Restored ${restored} item${restored === 1 ? '' : 's'} to Downloads`);
  };

  const handleRenameFile = async (fileId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const target = files.find(f => f.id === fileId);
    if (target?.localPath && localFs.available()) {
      try {
        const info = await localFs.rename(target.localPath, trimmed);
        setFiles(prev => prev.map(f => (
          f.id === fileId
            ? {
                ...f,
                name: info.name,
                localPath: info.path,
                url: f.url.startsWith('data:') || f.url.startsWith('blob:') ? f.url : localFs.assetUrl(info.path),
                thumbnailUrl: f.category === 'photo' && f.thumbnailUrl && !f.thumbnailUrl.startsWith('data:') && !f.thumbnailUrl.startsWith('blob:')
                  ? localFs.assetUrl(info.path)
                  : f.thumbnailUrl,
                updatedAt: new Date(info.modifiedMs).toISOString(),
              }
            : f
        )));
      } catch (err) {
        showToast(`Could not rename: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    setFiles(prev => prev.map(f => (
      f.id === fileId ? { ...f, name: trimmed, updatedAt: new Date().toISOString() } : f
    )));
  };

  const handleDuplicateFiles = (sources: FileItem[]): string[] => {
    const createdIds: string[] = [];
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      const copies = sources.map((file, index) => {
        const name = nextCopyName(file.name, names);
        names.add(name);
        const id = `file-copy-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
        createdIds.push(id);
        return {
          ...file,
          id,
          name,
          updatedAt: new Date().toISOString(),
          version: 1,
          starred: false,
          tags: [...file.tags],
          encryption: { ...file.encryption },
        };
      });
      const insertAt = Math.max(0, ...sources.map(source => prev.findIndex(f => f.id === source.id)));
      const next = [...prev];
      next.splice(insertAt + 1, 0, ...copies);
      return next;
    });
    if (createdIds[0]) setSelectedFileId(createdIds[0]);
    showToast(sources.length === 1 ? `Duplicated ${sources[0].name}` : `Duplicated ${sources.length} items`);
    return createdIds;
  };

  const handleCopyFileNames = async (sources: FileItem[]) => {
    const text = sources.map(file => file.name).join('\n');
    setClipboardFileIds(sources.map(file => file.id));
    try {
      await navigator.clipboard.writeText(text);
      showToast(sources.length === 1 ? `Copied “${sources[0].name}”` : `Copied ${sources.length} items`);
    } catch {
      showToast(sources.length === 1 ? `Copied “${sources[0].name}”` : `Copied ${sources.length} items`);
    }
  };

  const handlePasteFiles = (target?: { folderId?: string; folderPath?: string; accountId?: CloudProviderId }) => {
    if (clipboardFileIds.length === 0) {
      showToast('Clipboard is empty — copy a file first');
      return;
    }
    let pastedCount = 0;
    let firstId: string | null = null;
    let firstName = '';
    setFiles(prev => {
      const sources = prev.filter(file => clipboardFileIds.includes(file.id));
      if (!sources.length) return prev;
      const names = new Set(prev.map(f => f.name));
      const copies = sources.map((file, index) => {
        const name = nextCopyName(file.name, names);
        names.add(name);
        const id = `file-paste-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
        if (!firstId) {
          firstId = id;
          firstName = name;
        }
        return {
          ...file,
          id,
          name,
          folderId: target?.folderId ?? selectedFolder?.id ?? file.folderId,
          folderPath: target?.folderPath
            ?? (selectedFolder ? `/${selectedFolder.name}` : file.folderPath),
          accountId: target?.accountId ?? selectedFolder?.accountId ?? file.accountId,
          updatedAt: new Date().toISOString(),
          version: 1,
          starred: false,
          tags: [...file.tags],
          encryption: { ...file.encryption },
        };
      });
      pastedCount = copies.length;
      return [...copies, ...prev];
    });
    if (firstId) setSelectedFileId(firstId);
    if (pastedCount === 1) showToast(`Pasted “${firstName}”`);
    else if (pastedCount > 1) showToast(`Pasted ${pastedCount} items`);
  };

  const handleMoveFile = (fileId: string, folder: FolderItem) => {
    setFiles(prev => prev.map(file => (
      file.id === fileId
        ? {
            ...file,
            folderId: folder.id,
            folderPath: `/${folder.name}`,
            accountId: folder.accountId,
            updatedAt: new Date().toISOString(),
          }
        : file
    )));
    showToast(`Moved to ${folder.name}`);
  };

  const handleCompressFile = (file: FileItem) => {
    const base = file.name.replace(/\.[^.]+$/, '') || file.name;
    const zipName = `${base}.zip`;
    const id = `file-zip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const archive: FileItem = {
      ...file,
      id,
      name: zipName,
      category: 'archive',
      mimeType: 'application/zip',
      sizeBytes: Math.max(1024, Math.round(file.sizeBytes * 0.72)),
      thumbnailUrl: undefined,
      url: file.url,
      updatedAt: new Date().toISOString(),
      version: 1,
      starred: false,
      tags: [...file.tags.filter(t => t.toLowerCase() !== 'zip'), 'zip'],
      encryption: {
        ...file.encryption,
        isEncrypted: false,
        zeroKnowledgeVerified: false,
      },
      photoExif: undefined,
      videoMeta: undefined,
      documentBody: undefined,
    };
    setFiles(prev => {
      const idx = prev.findIndex(f => f.id === file.id);
      const next = [...prev];
      next.splice(idx >= 0 ? idx + 1 : 0, 0, archive);
      return next;
    });
    setSelectedFileId(id);
    showToast(`Compressed to “${zipName}” (local preview archive)`);
  };

  const handleToggleTag = (fileIds: string[], tag: string) => {
    setFiles(prev => {
      const targets = prev.filter(file => fileIds.includes(file.id));
      const allHave = targets.length > 0 && targets.every(file => file.tags.includes(tag));
      return prev.map(file => {
        if (!fileIds.includes(file.id)) return file;
        const tags = allHave
          ? file.tags.filter(item => item !== tag)
          : file.tags.includes(tag) ? file.tags : [...file.tags, tag];
        return { ...file, tags };
      });
    });
  };

  // Batch Delete. Local files go to the Trash; everything else is only removed from the library.
  const handleBatchDelete = async (fileIds: string[]) => {
    if (fileIds.length === 0) return;
    const targets = files.filter(f => fileIds.includes(f.id));
    const local = localFs.available() ? targets.filter(f => f.localPath) : [];
    const count = fileIds.length;
    const noun = `${count} item${count === 1 ? '' : 's'}`;
    if (confirmBeforeDelete) {
      const question = local.length
        ? `Move ${local.length === count ? noun : `${local.length} of ${noun}`} to the Trash and remove the rest from the library?`
        : `Remove ${noun} from the library?`;
      if (!window.confirm(question)) return;
    }
    const moved = local.length ? await trashLocalFiles(local) : [];
    const localIds = new Set(local.map(f => f.id));
    const toRemove = [...fileIds.filter(id => !localIds.has(id)), ...moved];
    removeFromList(toRemove);
    if (local.length && moved.length) {
      showToast(`Moved ${moved.length} to the Trash${toRemove.length > moved.length ? ` and removed ${toRemove.length - moved.length} from the library` : ''}`);
    } else if (!local.length) {
      showToast(`Removed ${noun}`);
    }
  };

  // SHA-256 of the file. Files over 100 MB are skipped so the whole file is not read into memory.
  const sha256OfFile = async (file: File): Promise<string> => {
    if (file.size > 100 * 1024 * 1024) return 'Not computed (file over 100 MB)';
    return computeSha256(await file.arrayBuffer());
  };

  // Upload Files — encrypt with the vault session key when the vault is unlocked.
  const handleUploadFiles = async (fileList: FileList) => {
    const targetAccountId: CloudProviderId = selectedAccountId === 'all' ? 's3' : selectedAccountId;
    const newItems: FileItem[] = [];
    const unlocked = isVaultUnlocked || (await rustBridge.isVaultUnlocked());
    let encryptedCount = 0;
    let plainCount = 0;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const mimeType = file.type || 'application/octet-stream';
      const category = classifyUploadCategory(file.name, mimeType);
      const isVideo = category === 'video';
      const isImage = category === 'photo';

      const probe = { name: file.name, mimeType, category };
      let documentBody: string | undefined;
      if (
        isEditableDocument(probe)
        && file.size <= TEXT_UPLOAD_MAX_BYTES
        && (isPlainTextDocument(probe) || /\.html?$/i.test(file.name) || mimeType === 'text/html')
      ) {
        try {
          documentBody = await file.text();
        } catch {
          documentBody = undefined;
        }
      }

      const tag =
        isVideo ? 'Video'
          : isImage ? 'Photo'
            : category === 'audio' ? 'Audio'
              : category === 'archive' ? 'Archive'
                : 'Doc';

      const checksum = await sha256OfFile(file);
      let url = URL.createObjectURL(file);
      let sizeBytes = file.size;
      let thumbnailUrl: string | undefined = isImage ? url : undefined;
      let encryption = clearEncryption(checksum);

      if (unlocked) {
        try {
          if (file.size > rustBridge.getMaxSessionBytes()) {
            showToast(`${file.name} is too large to encrypt (>${rustBridge.getMaxSessionBytes() / (1024 * 1024)} MB); added as plaintext preview`);
            plainCount += 1;
          } else {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const sealed = await encryptUploadBytes(bytes, mimeType);
            URL.revokeObjectURL(url);
            url = sealed.url;
            sizeBytes = sealed.sizeBytes;
            thumbnailUrl = undefined;
            encryption = sealed.encryption;
            encryptedCount += 1;
          }
        } catch (err) {
          showToast(
            err instanceof Error
              ? `${file.name}: ${err.message}`
              : `Could not encrypt ${file.name}`
          );
          plainCount += 1;
        }
      } else {
        plainCount += 1;
      }

      const newItem: FileItem = {
        id: `file-upl-${Date.now()}-${i}`,
        name: file.name,
        accountId: targetAccountId,
        folderPath: selectedFolder ? `/${selectedFolder.name}` : '/Uploads',
        sizeBytes,
        category,
        mimeType,
        updatedAt: new Date().toISOString(),
        url,
        thumbnailUrl,
        version: 1,
        tags: ['New Upload', tag],
        documentBody: encryption.isEncrypted ? undefined : documentBody,
        encryption,
        videoMeta: isVideo
          ? {
              durationSeconds: 15,
              dimensions: { width: 1920, height: 1080 },
              framerate: 30,
              codec: 'H.264',
              bitrate: '24 Mbps',
              audioCodec: 'AAC',
            }
          : undefined,
        photoExif: isImage
          ? {
              camera: 'Direct Upload',
              dimensions: { width: 3840, height: 2160 },
              colorSpace: 'sRGB',
            }
          : undefined,
      };

      newItems.push(newItem);
    }

    setFiles(prev => [...newItems, ...prev]);
    setSelectedFileId(newItems[0]?.id || null);

    if (encryptedCount > 0 && plainCount === 0) {
      showToast(`Encrypted and added ${encryptedCount} file(s) with AES-256-GCM`);
    } else if (encryptedCount > 0) {
      showToast(`Added ${newItems.length} file(s): ${encryptedCount} encrypted, ${plainCount} plaintext preview`);
    } else if (unlocked) {
      showToast(`Added ${newItems.length} file(s) as a local preview`);
    } else {
      showToast(`Added ${newItems.length} file(s) as a local preview (unlock the vault to encrypt uploads)`);
    }
  };

  const handleUnzipFile = async (archive: FileItem) => {
    if (!isZipArchive(archive)) {
      showToast('Only .zip archives can be extracted');
      return;
    }
    try {
      showToast(`Extracting ${archive.name}…`);
      const { files: extracted, extractedCount } = await unzipArchiveToFileItems(archive);
      setFiles(prev => [...extracted, ...prev]);
      setSelectedFileId(extracted[0]?.id ?? selectedFileId);
      showToast(`Extracted ${extractedCount} item${extractedCount === 1 ? '' : 's'} from ${archive.name}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  // Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files);
    }
  };

  return {
    isDraggingOver,
    handleSavePhotoVersion,
    handleSaveDocument,
    handleSaveTrimmedVideo,
    handleToggleEncrypt,
    handleDeleteFile,
    handleRenameFile,
    handleDuplicateFiles,
    handleCopyFileNames,
    handlePasteFiles,
    handleMoveFile,
    handleCompressFile,
    clipboardFileIds,
    handleToggleTag,
    handleBatchRestore,
    handleBatchDelete,
    handleUploadFiles,
    handleUnzipFile,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
