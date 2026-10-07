import React from 'react';
import { SidebarSectionKey } from './sidebar/sectionKey';

interface DraggableSidebarSectionProps {
  sectionKey: SidebarSectionKey;
  isDragged: boolean;
  isDragOver: boolean;
  onDragStart: (sectionKey: SidebarSectionKey) => void;
  onDragOver: (sectionKey: SidebarSectionKey) => void;
  onDragEnd: () => void;
  onDrop: (sectionKey: SidebarSectionKey) => void;
  children: React.ReactNode;
}

export const DraggableSidebarSection: React.FC<DraggableSidebarSectionProps> = ({
  sectionKey,
  isDragged,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  children,
}) => {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sectionKey);
    onDragStart(sectionKey);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onDragOver(sectionKey);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only trigger if leaving the actual element, not child elements
    if (e.currentTarget === e.target) {
      // Will be handled by next dragover
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onDrop(sectionKey);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onDragEnd();
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      className={`transition-all duration-150 ${
        isDragged
          ? 'opacity-50'
          : isDragOver
          ? 'scale-102 border-l-2 border-amber-400 pl-2 -ml-2'
          : ''
      }`}
    >
      {children}
    </div>
  );
};
