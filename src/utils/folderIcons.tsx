import React from 'react';
import {
  Download, FileText, Folder, Image as ImageIcon, LayoutGrid, Monitor, Music2, Trash2, Video,
} from 'lucide-react';

/** Same icons as the Local Files sidebar, keyed by folder display name. */
export function getFolderIcon(name: string, isSelected = false, sizeClass = 'w-4 h-4'): React.ReactNode {
  const iconClass = `${sizeClass} shrink-0 ${isSelected ? 'text-sky-400' : 'text-sky-400/80'}`;
  switch (name.toLowerCase()) {
    case 'desktop':
      return <Monitor className={iconClass} />;
    case 'documents':
      return <FileText className={iconClass} />;
    case 'photos':
      return <ImageIcon className={iconClass} />;
    case 'videos':
      return <Video className={iconClass} />;
    case 'music':
      return <Music2 className={iconClass} />;
    case 'downloads':
      return <Download className={iconClass} />;
    case 'applications':
      return <LayoutGrid className={iconClass} />;
    case 'trash':
      return (
        <Trash2
          className={`${sizeClass} shrink-0 ${isSelected ? 'text-rose-400' : 'text-neutral-400 group-hover:text-rose-300'}`}
        />
      );
    default:
      return <Folder className={iconClass} />;
  }
}
