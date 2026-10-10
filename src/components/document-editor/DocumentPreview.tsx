import React, { useMemo } from 'react';
import { FileText } from '@/src/icons';
import { FileItem } from '../../types';
import { editorHtmlFromFile, isEditableDocument } from '../../utils/documentKind';

interface DocumentPreviewProps {
  file: FileItem;
  className?: string;
  /** Tighter paper scale for grid / list thumbnails. */
  compact?: boolean;
}

/** Compact read-only preview of a document for the inspector / cards. */
export const DocumentPreview: React.FC<DocumentPreviewProps> = ({ file, className = '', compact = false }) => {
  const html = useMemo(() => editorHtmlFromFile(file), [file.id, file.documentBody, file.name, file.mimeType]);

  if (!isEditableDocument(file)) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center text-neutral-500 gap-2 ${className}`}>
        <FileText className="w-10 h-10 text-sky-400" />
        <span className="text-xs font-mono text-neutral-400">Binary Document</span>
      </div>
    );
  }

  return (
    <div className={`w-full h-full overflow-hidden bg-neutral-900/50 relative ${className}`}>
      <div
        className={`absolute inset-0 flex items-start justify-center overflow-hidden ${
          compact ? 'pt-1 px-1.5' : 'pt-2 px-3 pb-0'
        }`}
      >
        <div
          className={`doc-page origin-top bg-[#faf6f1] text-[#1c1917] shadow-md rounded-sm pointer-events-none select-none ${
            compact
              ? 'w-[280%] scale-[0.36] px-5 py-4'
              : 'w-[210%] scale-[0.48] px-8 py-6'
          }`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
};
