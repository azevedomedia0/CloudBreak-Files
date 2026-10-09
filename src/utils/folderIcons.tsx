import React from 'react';
import {
  Download, FileText, Folder, Monitor, Music2, Trash2,
} from '@/src/icons';
import { ApplicationsIcon } from '../components/file-browser/ApplicationsIcon';
import { PhotosIcon } from '../components/file-browser/PhotosIcon';
import { VideosIcon } from '../components/file-browser/VideosIcon';

/** Same icons as the Local Files sidebar, keyed by folder display name. */
export function getFolderIcon(name: string, isSelected = false, sizeClass = 'w-4 h-4'): React.ReactNode {
  const iconClass = `${sizeClass} shrink-0 ${isSelected ? 'text-sky-400' : 'text-sky-400/80'}`;
  switch (name.toLowerCase()) {
    case 'desktop':
      return <Monitor className={iconClass} />;
    case 'documents':
      return <FileText className={iconClass} />;
    case 'photos':
      return <PhotosIcon className={iconClass} title="Photos" />;
    case 'videos':
      return <VideosIcon className={iconClass} title="Videos" />;
    case 'music':
      return <Music2 className={iconClass} />;
    case 'downloads':
      return <Download className={iconClass} />;
    case 'applications':
      return <ApplicationsIcon className={iconClass} title="Applications" />;
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
