import React, { useRef, useState } from 'react';
import { SidebarSectionKey } from './sidebar/sectionKey';
import { DropTarget } from '../hooks/useSectionOrder';

const DRAG_THRESHOLD_PX = 4;

interface DraggableSidebarSectionProps {
  sectionKey: SidebarSectionKey;
  isDragging: boolean;
  dropPosition: 'before' | 'after' | null;
  onDragStart: (key: SidebarSectionKey) => void;
  onDropTargetChange: (target: DropTarget | null) => void;
  onDragEnd: (commit: boolean) => void;
  children: React.ReactNode;
}

/**
 * Lets a sidebar section be reordered by dragging its header. Uses pointer events rather than
 * HTML5 drag-and-drop so it never triggers the app's file-drop overlay. A click on the header
 * (no movement) still reaches the section and collapses it.
 */
export const DraggableSidebarSection: React.FC<DraggableSidebarSectionProps> = ({
  sectionKey,
  isDragging,
  dropPosition,
  onDragStart,
  onDropTargetChange,
  onDragEnd,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ startY: number; pointerId: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [offsetY, setOffsetY] = useState(0);

  const isOnHeader = (target: EventTarget) => {
    const header = ref.current?.firstElementChild?.firstElementChild;
    const node = target as HTMLElement;
    return !!header && header.contains(node) && !node.closest('button');
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !isOnHeader(e.target)) return;
    gesture.current = { startY: e.clientY, pointerId: e.pointerId, active: false };
  };

  const findDropTarget = (pointerY: number): DropTarget | null => {
    const siblings = Array.from(ref.current?.parentElement?.children ?? []).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== ref.current && !!el.dataset.sectionKey,
    );
    if (siblings.length === 0) return null;
    for (const el of siblings) {
      const rect = el.getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) {
        return { key: el.dataset.sectionKey as SidebarSectionKey, position: 'before' };
      }
    }
    return { key: siblings[siblings.length - 1].dataset.sectionKey as SidebarSectionKey, position: 'after' };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dy = e.clientY - g.startY;
    if (!g.active) {
      if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      g.active = true;
      ref.current?.setPointerCapture(g.pointerId);
      onDragStart(sectionKey);
    }
    setOffsetY(dy);
    onDropTargetChange(findDropTarget(e.clientY));
  };

  const finishGesture = (e: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.active) return;
    if (ref.current?.hasPointerCapture(g.pointerId)) ref.current.releasePointerCapture(g.pointerId);
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    setOffsetY(0);
    onDragEnd(commit);
  };

  return (
    <div
      ref={ref}
      data-section-key={sectionKey}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={e => finishGesture(e, true)}
      onPointerCancel={e => finishGesture(e, false)}
      onClickCapture={e => {
        if (suppressClick.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      style={isDragging ? { transform: `translateY(${offsetY}px)` } : undefined}
      className={`relative ${
        isDragging ? 'z-50 opacity-80 shadow-2xl shadow-black/60 rounded-lg bg-neutral-900/80 cursor-grabbing' : ''
      }`}
    >
      {dropPosition && (
        <div
          className={`pointer-events-none absolute inset-x-0 h-0.5 rounded bg-amber-400 ${
            dropPosition === 'before' ? '-top-2' : '-bottom-2'
          }`}
        />
      )}
      {children}
    </div>
  );
};
