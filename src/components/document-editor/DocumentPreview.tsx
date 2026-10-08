import React, { useMemo } from 'react';
import { FileText } from 'lucide-react';
import { FileItem } from '../../types';
import { initialDocumentBody, isEditableDocument, isPlainTextDocument } from '../../utils/documentKind';

interface DocumentPreviewProps {
  file: FileItem;
  className?: string;
}

/** Compact read-only preview of a document for the inspector / cards. */
export const DocumentPreview: React.FC<DocumentPreviewProps> = ({ file, className = '' }) => {
  const body = useMemo(() => initialDocumentBody(file), [file.id, file.documentBody, file.name]);
  const plain = isPlainTextDocument(file);

  if (!isEditableDocument(file)) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center text-neutral-500 gap-2 ${className}`}>
        <FileText className="w-10 h-10 text-sky-400" />
        <span className="text-xs font-mono text-neutral-400">Binary Document</span>
      </div>
    );
  }

  if (plain) {
    const text = body.trim() || 'Empty document';
    return (
      <div className={`w-full h-full overflow-hidden bg-[#faf6f1] relative ${className}`}>
        <pre className="absolute inset-0 p-3 text-[9px] leading-[1.35] text-stone-800 font-mono whitespace-pre-wrap break-words overflow-hidden select-none">
          {text}
        </pre>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#faf6f1] to-transparent" />
      </div>
    );
  }

  return (
    <div className={`w-full h-full overflow-hidden bg-stone-800/40 relative ${className}`}>
      <div className="absolute inset-0 flex items-start justify-center pt-2 px-3 pb-0 overflow-hidden">
        <div
          className="doc-page w-[210%] origin-top scale-[0.48] bg-[#faf6f1] text-[#1c1917] shadow-md rounded-sm px-8 py-6 pointer-events-none select-none"
          dangerouslySetInnerHTML={{ __html: body }}
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-stone-900/50 to-transparent" />
    </div>
  );
};
