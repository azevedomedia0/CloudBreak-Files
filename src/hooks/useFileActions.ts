import React, { useState } from 'react';
import { CloudProviderId, FileCategory, FileItem, FolderItem } from '../types';
import { computeSha256 } from '../utils/crypto';

interface Options {
  setFiles: React.Dispatch<React.SetStateAction<FileItem[]>>;
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  selectedAccountId: CloudProviderId;
  selectedFolder: FolderItem | null;
  showToast: (msg: string) => void;
}

/** File list actions: save versions, encrypt flags, delete, upload and drag-and-drop. */
export function useFileActions({
  setFiles,
  selectedFileId,
  setSelectedFileId,
  selectedAccountId,
  selectedFolder,
  showToast,
}: Options) {
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Photo Version Save
  const handleSavePhotoVersion = (updatedFile: FileItem, dataUrl: string) => {
    setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
    showToast(`Saved version ${updatedFile.version} to cloud storage`);
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
    setFiles(prev => prev.filter(f => f.id !== fileId));
    if (selectedFileId === fileId) {
      setSelectedFileId(null);
    }
    showToast('Asset moved to Trash');
  };

  // Batch Encrypt
  const handleBatchEncrypt = (fileIds: string[]) => {
    setFiles(prev =>
      prev.map(f => {
        if (!fileIds.includes(f.id)) return f;
        return {
          ...f,
          encryption: {
            ...f.encryption,
            isEncrypted: true,
            algorithm: 'AES-256-GCM',
            keyFingerprint: 'Pending (demo flag)',
            zeroKnowledgeVerified: false,
          },
        };
      })
    );
    showToast(`Marked ${fileIds.length} assets as encrypted (demo flag, file bytes are not encrypted yet)`);
  };

  // Batch Delete
  const handleBatchDelete = (fileIds: string[]) => {
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
      const isVideo = file.type.startsWith('video');
      const isImage = file.type.startsWith('image');
      const category: FileCategory = isVideo ? 'video' : isImage ? 'photo' : 'document';
      const blobUrl = URL.createObjectURL(file);

      const newItem: FileItem = {
        id: `file-upl-${Date.now()}-${i}`,
        name: file.name,
        accountId: targetAccountId,
        folderPath: selectedFolder ? `/${selectedFolder.name}` : '/Uploads',
        sizeBytes: file.size,
        category,
        mimeType: file.type || 'application/octet-stream',
        updatedAt: new Date().toISOString(),
        url: blobUrl,
        thumbnailUrl: isImage ? blobUrl : undefined,
        version: 1,
        tags: ['New Upload', isVideo ? 'Video' : isImage ? 'Photo' : 'Doc'],
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
    handleSaveTrimmedVideo,
    handleToggleEncrypt,
    handleDeleteFile,
    handleBatchEncrypt,
    handleBatchDelete,
    handleUploadFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
