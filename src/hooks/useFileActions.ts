import React, { useState } from 'react';
import { CloudProviderId, FileItem, FolderItem } from '../types';
import { computeSha256 } from '../utils/crypto';
import {
  classifyUploadCategory,
  isEditableDocument,
  isPlainTextDocument,
  TEXT_UPLOAD_MAX_BYTES,
} from '../utils/documentKind';
import { isZipArchive, unzipArchiveToFileItems } from '../utils/unzipArchive';

interface Options {
  setFiles: React.Dispatch<React.SetStateAction<FileItem[]>>;
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  selectedAccountId: CloudProviderId;
  selectedFolder: FolderItem | null;
  showToast: (msg: string) => void;
  confirmBeforeDelete?: boolean;
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
  setFiles,
  selectedFileId,
  setSelectedFileId,
  selectedAccountId,
  selectedFolder,
  showToast,
  confirmBeforeDelete = true,
}: Options) {
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [clipboardFileIds, setClipboardFileIds] = useState<string[]>([]);

  // Photo Version Save
  const handleSavePhotoVersion = (updatedFile: FileItem, dataUrl: string) => {
    setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
    showToast(`Saved version ${updatedFile.version} to cloud storage`);
  };

  const handleSaveDocument = (updatedFile: FileItem) => {
    setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
    showToast(`Saved ${updatedFile.name}`);
  };

  // Trimmed Video Save
  const handleSaveTrimmedVideo = (newFile: FileItem) => {
    setFiles(prev => [newFile, ...prev]);
    setSelectedFileId(newFile.id);
    showToast(`Added ${newFile.name} to storage bucket`);
  };

  // Encrypt Toggle
  const handleToggleEncrypt = (targetFile: FileItem) => {
    const nextEncrypted = !targetFile.encryption.isEncrypted;
    setFiles(prev =>
      prev.map(f => {
        if (f.id !== targetFile.id) return f;
        return {
          ...f,
          encryption: {
            ...f.encryption,
            isEncrypted: nextEncrypted,
            algorithm: nextEncrypted ? 'AES-256-GCM' : 'None (TLS 1.3)',
            keyFingerprint: nextEncrypted ? 'Pending (demo flag)' : 'Unencrypted Transit',
            zeroKnowledgeVerified: false,
          },
        };
      })
    );

    showToast(
      nextEncrypted
        ? `Marked ${targetFile.name} as encrypted (demo flag, file bytes are not encrypted yet)`
        : `Cleared the encrypted flag on ${targetFile.name}`
    );
  };

  // File Deletion
  const handleDeleteFile = (fileId: string) => {
    if (confirmBeforeDelete && !window.confirm('Remove this file from the library?')) return;
    setFiles(prev => prev.filter(f => f.id !== fileId));
    if (selectedFileId === fileId) {
      setSelectedFileId(null);
    }
    showToast('Asset moved to Trash');
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

  const handleRenameFile = (fileId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
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

  // Batch Delete
  const handleBatchDelete = (fileIds: string[]) => {
    if (fileIds.length === 0) return;
    if (
      confirmBeforeDelete
      && !window.confirm(`Remove ${fileIds.length} file${fileIds.length === 1 ? '' : 's'} from the library?`)
    ) {
      return;
    }
    setFiles(prev => prev.filter(f => !fileIds.includes(f.id)));
    if (selectedFileId && fileIds.includes(selectedFileId)) {
      setSelectedFileId(null);
    }
    showToast(`Removed ${fileIds.length} assets`);
  };

  // SHA-256 of the file. Files over 100 MB are skipped so the whole file is not read into memory.
  const sha256OfFile = async (file: File): Promise<string> => {
    if (file.size > 100 * 1024 * 1024) return 'Not computed (file over 100 MB)';
    return computeSha256(await file.arrayBuffer());
  };

  // Upload Files
  const handleUploadFiles = async (fileList: FileList) => {
    const targetAccountId: CloudProviderId = selectedAccountId === 'all' ? 's3' : selectedAccountId;
    const newItems: FileItem[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const mimeType = file.type || 'application/octet-stream';
      const category = classifyUploadCategory(file.name, mimeType);
      const isVideo = category === 'video';
      const isImage = category === 'photo';
      const blobUrl = URL.createObjectURL(file);

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

      const newItem: FileItem = {
        id: `file-upl-${Date.now()}-${i}`,
        name: file.name,
        accountId: targetAccountId,
        folderPath: selectedFolder ? `/${selectedFolder.name}` : '/Uploads',
        sizeBytes: file.size,
        category,
        mimeType,
        updatedAt: new Date().toISOString(),
        url: blobUrl,
        thumbnailUrl: isImage ? blobUrl : undefined,
        version: 1,
        tags: ['New Upload', tag],
        documentBody,
        // Uploads are local previews only. Nothing is encrypted or sent anywhere yet.
        encryption: {
          isEncrypted: false,
          algorithm: 'None (local preview)',
          keyFingerprint: 'Not encrypted',
          checksumSha256: await sha256OfFile(file),
          zeroKnowledgeVerified: false,
        },
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
    showToast(`Added ${newItems.length} file(s) as a local preview (not encrypted or uploaded yet)`);
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
