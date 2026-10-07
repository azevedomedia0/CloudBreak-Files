import React, { useState } from 'react';
import { Image as ImageIcon, Video, FileText, Lock } from 'lucide-react';
import { FileItem } from '../../types';

interface FileThumbnailProps {
  file: FileItem;
  className?: string;
  iconClassName?: string;
  hoverZoom?: boolean;
  compact?: boolean;
}

const DOC_STYLES: Record<string, { badge: string; label: string }> = {
  pdf: { badge: 'bg-red-500', label: 'PDF' },
  doc: { badge: 'bg-blue-500', label: 'DOC' },
  docx: { badge: 'bg-blue-500', label: 'DOC' },
  pages: { badge: 'bg-orange-400', label: 'PAGES' },
  xls: { badge: 'bg-emerald-500', label: 'XLS' },
  xlsx: { badge: 'bg-emerald-500', label: 'XLS' },
  csv: { badge: 'bg-emerald-500', label: 'CSV' },
  numbers: { badge: 'bg-emerald-500', label: 'NUM' },
  ppt: { badge: 'bg-orange-500', label: 'PPT' },
  pptx: { badge: 'bg-orange-500', label: 'PPT' },
  key: { badge: 'bg-sky-500', label: 'KEY' },
  txt: { badge: 'bg-neutral-500', label: 'TXT' },
  md: { badge: 'bg-neutral-500', label: 'MD' },
  rtf: { badge: 'bg-neutral-500', label: 'RTF' },
};

const DocumentPage: React.FC<{ name: string; compact: boolean }> = ({ name, compact }) => {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const style = DOC_STYLES[ext] ?? { badge: 'bg-sky-500', label: ext.slice(0, 4).toUpperCase() || 'FILE' };

  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-neutral-800/70 to-neutral-900/70">
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
  document: FileText,
  archive: Lock,
} as const;

export const FileThumbnail: React.FC<FileThumbnailProps> = ({ file, className = 'w-full h-full', iconClassName = 'w-10 h-10', hoverZoom = false, compact = false }) => {
  const [posterFailed, setPosterFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  const mediaClass = `w-full h-full object-cover ${hoverZoom ? 'transition-transform duration-300 group-hover:scale-105' : ''}`;
  const hasRealUrl = file.url && file.url !== '#';

  let content: React.ReactNode;
  if (file.thumbnailUrl && !posterFailed) {
    content = <img src={file.thumbnailUrl} alt={file.name} className={mediaClass} onError={() => setPosterFailed(true)} loading="lazy" />;
  } else if (file.category === 'video' && hasRealUrl && !videoFailed) {
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
      />
    );
  } else if (file.category === 'document') {
    content = <DocumentPage name={file.name} compact={compact} />;
  } else {
    const Icon = FALLBACK_ICONS[file.category as keyof typeof FALLBACK_ICONS] ?? FileText;
    content = (
      <div className="w-full h-full flex items-center justify-center text-neutral-500">
        <Icon className={`${iconClassName} ${file.category === 'archive' ? 'text-cyan-400' : file.category === 'video' ? 'text-amber-400' : ''}`} />
      </div>
    );
  }

  return <div className={`${className} overflow-hidden`}>{content}</div>;
};
