import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Video, FileText, Archive, Music2, AppWindow } from '@/src/icons';
import { FileItem } from '../../types';
import { DocumentPreview } from '../document-editor/DocumentPreview';
import {
  isEditableDocument,
  isMacAppBundle,
  isPdfDocument,
  isSystemPreviewDocument,
  needsNativeThumbnail,
} from '../../utils/documentKind';
import { isZipArchive } from '../../utils/unzipArchive';
import { previewBridge } from '../../services/previewBridge';
import { useNearViewport } from '../../hooks/useNearViewport';
import { emitFileContextMenu } from '../../utils/fileContextMenuBus';
import { ZipFileIcon } from './ZipFileIcon';

interface FileThumbnailProps {
  file: FileItem;
  className?: string;
  iconClassName?: string;
  hoverZoom?: boolean;
  compact?: boolean;
  /** Override; by default every thumbnail opens the shared file context menu. */
  onContextMenu?: (event: React.MouseEvent) => void;
}

const DOC_STYLES: Record<string, { badge: string; label: string }> = {
  pdf: { badge: 'bg-red-500', label: 'PDF' },
  doc: { badge: 'bg-blue-500', label: 'DOC' },
  docx: { badge: 'bg-blue-500', label: 'DOC' },
  pages: { badge: 'bg-orange-400', label: 'PAGES' },
  odt: { badge: 'bg-indigo-500', label: 'ODT' },
  rtf: { badge: 'bg-neutral-500', label: 'RTF' },
  xls: { badge: 'bg-emerald-500', label: 'XLS' },
  xlsx: { badge: 'bg-emerald-500', label: 'XLS' },
  csv: { badge: 'bg-emerald-500', label: 'CSV' },
  numbers: { badge: 'bg-emerald-500', label: 'NUM' },
  ppt: { badge: 'bg-orange-500', label: 'PPT' },
  pptx: { badge: 'bg-orange-500', label: 'PPT' },
  key: { badge: 'bg-sky-500', label: 'KEY' },
  csf: { badge: 'bg-fuchsia-500', label: 'CSF' },
  txt: { badge: 'bg-neutral-500', label: 'TXT' },
  md: { badge: 'bg-neutral-500', label: 'MD' },
  zip: { badge: 'bg-pink-500', label: 'ZIP' },
};

const DocumentPage: React.FC<{ name: string; compact: boolean }> = ({ name, compact }) => {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const style = DOC_STYLES[ext] ?? { badge: 'bg-sky-500', label: ext.slice(0, 4).toUpperCase() || 'FILE' };

  return (
    <div className="w-full h-full flex items-center justify-center bg-neutral-900/80">
      <div className="relative h-[84%] aspect-[3/4] rounded-[3px] bg-neutral-100 shadow-lg shadow-black/50 overflow-hidden">
        <div className="absolute top-0 right-0 w-[22%] aspect-square bg-neutral-300" style={{ clipPath: 'polygon(0 0, 100% 100%, 0 100%)' }} />
        <div className="absolute top-0 right-0 w-[22%] aspect-square bg-neutral-900/80" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} />
        {!compact && (
          <div className="absolute inset-x-[14%] top-[22%] space-y-[7%]">
            <div className="h-[3px] rounded bg-neutral-400/80 w-[70%]" />
            <div className="h-[3px] rounded bg-neutral-300 w-full" />
            <div className="h-[3px] rounded bg-neutral-300 w-[92%]" />
            <div className="h-[3px] rounded bg-neutral-300 w-full" />
            <div className="h-[3px] rounded bg-neutral-300 w-[60%]" />
          </div>
        )}
        <div
          className={`absolute left-0 bottom-0 ${style.badge} text-white font-bold text-center leading-none ${
            compact ? 'inset-x-0 text-[5px] py-[1.5px]' : 'inset-x-0 text-[9px] py-1 tracking-wide'
          }`}
        >
          {style.label}
        </div>
      </div>
    </div>
  );
};

const FALLBACK_ICONS = {
  photo: ImageIcon,
  video: Video,
  audio: Music2,
  document: FileText,
  archive: Archive,
} as const;

export const FileThumbnail: React.FC<FileThumbnailProps> = ({
  file,
  className = 'w-full h-full',
  iconClassName = 'w-10 h-10',
  hoverZoom = false,
  compact = false,
  onContextMenu,
}) => {
  const [posterFailed, setPosterFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [nativeThumb, setNativeThumb] = useState<string | null>(null);
  const { ref, near } = useNearViewport<HTMLDivElement>('200px');

  const wantsNative = needsNativeThumbnail(file) && !!file.localPath && previewBridge.available();
  const isApp = isMacAppBundle(file);
  const hasRealUrl = file.url && file.url !== '#';
  const wantsVideoPoster = file.category === 'video' && hasRealUrl;

  useEffect(() => {
    setPosterFailed(false);
    setNativeThumb(null);
    if (!near || !wantsNative || !file.localPath) return;
    const ac = new AbortController();
    const edge = isApp ? 256 : 512;
    void previewBridge.thumbnailUrl(file.localPath, edge, ac.signal).then(url => {
      if (!ac.signal.aborted && url) setNativeThumb(url);
    });
    return () => {
      ac.abort();
    };
  }, [file.id, file.localPath, wantsNative, near, isApp]);

  const mediaClass = `w-full h-full ${isApp ? 'object-contain p-[6%]' : 'object-cover'} ${hoverZoom ? 'transition-transform duration-300 group-hover:scale-105' : ''}`;

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (onContextMenu) {
      onContextMenu(event);
      return;
    }
    emitFileContextMenu(file, event.clientX, event.clientY);
  };

  // Prefer native Quick Look / sips JPEG for HEIC, PDF, Office, .app icons, etc.
  const posterSrc =
    nativeThumb
    || file.thumbnailUrl
    || (!wantsNative && file.category === 'photo' && hasRealUrl ? file.url : undefined);

  let content: React.ReactNode;
  if (posterSrc && !posterFailed) {
    content = (
      <img
        src={posterSrc}
        alt={file.name}
        className={mediaClass}
        onError={() => setPosterFailed(true)}
        loading="lazy"
        onContextMenu={handleContextMenu}
      />
    );
  } else if (isApp) {
    content = (
      <div className="w-full h-full flex items-center justify-center bg-transparent">
        <AppWindow className={`${iconClassName} text-sky-300/80`} />
      </div>
    );
  } else if (wantsVideoPoster && near && !videoFailed) {
    content = (
      <video
        src={`${file.url}#t=0.1`}
        className={mediaClass}
        preload="metadata"
        muted
        playsInline
        tabIndex={-1}
        aria-label={file.name}
        onError={() => setVideoFailed(true)}
        onContextMenu={handleContextMenu}
      />
    );
  } else if (wantsVideoPoster && !near) {
    content = (
      <div className="w-full h-full flex items-center justify-center text-neutral-500">
        <Video className={`${iconClassName} text-amber-400`} />
      </div>
    );
  } else if (isZipArchive(file) || file.category === 'archive') {
    content = (
      <div className="w-full h-full flex items-center justify-center bg-neutral-950/80">
        <ZipFileIcon className={`${iconClassName} text-pink-400`} title="ZIP archive" />
      </div>
    );
  } else if (isPdfDocument(file) || isSystemPreviewDocument(file)) {
    content = <DocumentPage name={file.name} compact={compact} />;
  } else if (isEditableDocument(file)) {
    content = <DocumentPreview file={file} compact={compact} className="w-full h-full" />;
  } else if (file.category === 'document') {
    content = <DocumentPage name={file.name} compact={compact} />;
  } else {
    const Icon = FALLBACK_ICONS[file.category as keyof typeof FALLBACK_ICONS] ?? FileText;
    content = (
      <div className="w-full h-full flex items-center justify-center text-neutral-500">
        <Icon className={`${iconClassName} ${
          file.category === 'video' ? 'text-amber-400' : file.category === 'audio' ? 'text-violet-400' : ''
        }`} />
      </div>
    );
  }

  return (
    <div ref={ref} className={`${className} overflow-hidden`} onContextMenu={handleContextMenu}>
      {content}
    </div>
  );
};
