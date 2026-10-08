import React, { useState } from 'react';
import { Image as ImageIcon, Video, FileText, Archive, Music, Play } from 'lucide-react';
import { FileItem } from '../../types';
import { DocumentPreview } from '../document-editor/DocumentPreview';
import { isEditableDocument } from '../../utils/documentKind';
import { isZipArchive } from '../../utils/unzipArchive';

interface FileThumbnailProps {
  file: FileItem;
  className?: string;
  iconClassName?: string;
  hoverZoom?: boolean;
  compact?: boolean;
  onContextMenu?: (event: React.MouseEvent) => void;
}

const DOC_STYLES: Record<string, { badge: string; tint: string; label: string }> = {
  pdf: { badge: 'bg-red-500', tint: 'from-red-500/20', label: 'PDF' },
  doc: { badge: 'bg-blue-500', tint: 'from-blue-500/20', label: 'DOC' },
  docx: { badge: 'bg-blue-500', tint: 'from-blue-500/20', label: 'DOC' },
  pages: { badge: 'bg-orange-400', tint: 'from-orange-400/20', label: 'PAGES' },
  xls: { badge: 'bg-emerald-500', tint: 'from-emerald-500/20', label: 'XLS' },
  xlsx: { badge: 'bg-emerald-500', tint: 'from-emerald-500/20', label: 'XLS' },
  csv: { badge: 'bg-emerald-500', tint: 'from-emerald-500/20', label: 'CSV' },
  numbers: { badge: 'bg-emerald-500', tint: 'from-emerald-500/20', label: 'NUM' },
  ppt: { badge: 'bg-orange-500', tint: 'from-orange-500/20', label: 'PPT' },
  pptx: { badge: 'bg-orange-500', tint: 'from-orange-500/20', label: 'PPT' },
  key: { badge: 'bg-sky-500', tint: 'from-sky-500/20', label: 'KEY' },
  txt: { badge: 'bg-neutral-500', tint: 'from-neutral-400/15', label: 'TXT' },
  md: { badge: 'bg-neutral-500', tint: 'from-neutral-400/15', label: 'MD' },
  rtf: { badge: 'bg-neutral-500', tint: 'from-neutral-400/15', label: 'RTF' },
  zip: { badge: 'bg-pink-500', tint: 'from-pink-500/20', label: 'ZIP' },
};

const CATEGORY_WELL: Record<string, { tint: string; icon: string }> = {
  photo: { tint: 'from-sky-500/18 via-neutral-900/40 to-neutral-950/90', icon: 'text-sky-300/90' },
  video: { tint: 'from-yellow-400/16 via-neutral-900/40 to-neutral-950/90', icon: 'text-yellow-300/90' },
  document: { tint: 'from-blue-500/16 via-neutral-900/40 to-neutral-950/90', icon: 'text-blue-300/90' },
  archive: { tint: 'from-pink-500/18 via-neutral-900/40 to-neutral-950/90', icon: 'text-pink-300/90' },
  audio: { tint: 'from-violet-500/18 via-neutral-900/40 to-neutral-950/90', icon: 'text-violet-300/90' },
};

const DocumentPage: React.FC<{ name: string; compact: boolean }> = ({ name, compact }) => {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const style = DOC_STYLES[ext] ?? { badge: 'bg-sky-500', tint: 'from-sky-500/20', label: ext.slice(0, 4).toUpperCase() || 'FILE' };

  return (
    <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${style.tint} to-neutral-950/80`}>
      <div
        className={`relative aspect-[3/4] rounded-md bg-[#f7f4ef] shadow-[0_8px_24px_-6px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden ${
          compact ? 'h-[88%]' : 'h-[82%]'
        }`}
      >
        {/* Soft folded corner */}
        <div
          className="absolute top-0 right-0 w-[26%] aspect-square bg-gradient-to-bl from-neutral-200 to-neutral-300/90"
          style={{ clipPath: 'polygon(0 0, 100% 100%, 0 100%)' }}
        />
        <div
          className="absolute top-0 right-0 w-[26%] aspect-square bg-gradient-to-tr from-transparent to-black/25"
          style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }}
        />
        {!compact && (
          <div className="absolute inset-x-[16%] top-[24%] space-y-[8%]">
            <div className="h-[2.5px] rounded-full bg-neutral-400/70 w-[55%]" />
            <div className="h-[2.5px] rounded-full bg-neutral-300/90 w-full" />
            <div className="h-[2.5px] rounded-full bg-neutral-300/90 w-[94%]" />
            <div className="h-[2.5px] rounded-full bg-neutral-300/90 w-full" />
            <div className="h-[2.5px] rounded-full bg-neutral-300/90 w-[72%]" />
            <div className="h-[2.5px] rounded-full bg-neutral-300/90 w-[88%]" />
          </div>
        )}
        <div
          className={`absolute left-1.5 right-1.5 bottom-1.5 ${style.badge} text-white font-semibold text-center leading-none rounded-sm shadow-sm ${
            compact ? 'text-[5px] py-[2px]' : 'text-[8px] py-1 tracking-[0.08em]'
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
  document: FileText,
  archive: Archive,
  audio: Music,
} as const;

const ThumbnailWell: React.FC<{
  category: string;
  iconClassName: string;
  children?: React.ReactNode;
}> = ({ category, iconClassName, children }) => {
  const well = CATEGORY_WELL[category] ?? CATEGORY_WELL.document;
  const Icon = FALLBACK_ICONS[category as keyof typeof FALLBACK_ICONS] ?? FileText;
  return (
    <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${well.tint}`}>
      {children ?? <Icon className={`${iconClassName} ${well.icon}`} strokeWidth={1.5} />}
    </div>
  );
};

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

  const mediaClass = `w-full h-full object-cover ${
    hoverZoom ? 'transition-transform duration-500 ease-out group-hover:scale-[1.04]' : ''
  }`;
  const hasRealUrl = file.url && file.url !== '#';

  const handleContextMenu = onContextMenu
    ? (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(event);
      }
    : undefined;

  let content: React.ReactNode;
  if (file.thumbnailUrl && !posterFailed) {
    content = (
      <>
        <img
          src={file.thumbnailUrl}
          alt={file.name}
          className={mediaClass}
          onError={() => setPosterFailed(true)}
          loading="lazy"
          onContextMenu={handleContextMenu}
        />
        {file.category === 'video' && !compact && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span className="w-9 h-9 rounded-full bg-black/55 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-lg">
              <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
            </span>
          </div>
        )}
      </>
    );
  } else if (file.category === 'video' && hasRealUrl && !videoFailed) {
    content = (
      <>
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
        {!compact && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span className="w-9 h-9 rounded-full bg-black/55 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-lg">
              <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
            </span>
          </div>
        )}
      </>
    );
  } else if (isZipArchive(file) || file.category === 'archive') {
    content = (
      <ThumbnailWell category="archive" iconClassName={iconClassName}>
        <Archive className={`${iconClassName} text-pink-300/90`} strokeWidth={1.5} />
      </ThumbnailWell>
    );
  } else if (isEditableDocument(file)) {
    content = <DocumentPreview file={file} compact={compact} className="w-full h-full" />;
  } else if (file.category === 'document') {
    content = <DocumentPage name={file.name} compact={compact} />;
  } else {
    content = <ThumbnailWell category={file.category} iconClassName={iconClassName} />;
  }

  return (
    <div className={`file-thumbnail relative ${className} overflow-hidden`} onContextMenu={handleContextMenu}>
      {content}
    </div>
  );
};
