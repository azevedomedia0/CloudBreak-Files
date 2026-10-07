import { useState, useCallback, useRef } from 'react';
import { SidebarSectionKey } from '../components/sidebar/sectionKey';

export type DropTarget = { key: SidebarSectionKey; position: 'before' | 'after' };

const STORAGE_KEY = 'sidebar_section_order';

const DEFAULT_SECTION_ORDER: SidebarSectionKey[] = [
  'favorites',
  'directories',
  'incomingLibraries',
  'outgoingLibraries',
  'accounts',
  'network',
];

const loadOrder = (): SidebarSectionKey[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (
      Array.isArray(parsed) &&
      parsed.length === DEFAULT_SECTION_ORDER.length &&
      DEFAULT_SECTION_ORDER.every(key => parsed.includes(key))
    ) {
      return parsed;
    }
  } catch {
    // unreadable storage falls back to the default order
  }
  return DEFAULT_SECTION_ORDER;
};

export const useSectionOrder = () => {
  const [sectionOrder, setSectionOrder] = useState<SidebarSectionKey[]>(loadOrder);
  const [draggingKey, setDraggingKey] = useState<SidebarSectionKey | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const draggingRef = useRef<SidebarSectionKey | null>(null);
  const targetRef = useRef<DropTarget | null>(null);

  const startDrag = useCallback((key: SidebarSectionKey) => {
    draggingRef.current = key;
    setDraggingKey(key);
  }, []);

  const updateDropTarget = useCallback((target: DropTarget | null) => {
    targetRef.current = target;
    setDropTarget(target);
  }, []);

  const endDrag = useCallback((commit: boolean) => {
    const dragged = draggingRef.current;
    const target = targetRef.current;
    draggingRef.current = null;
    targetRef.current = null;
    setDraggingKey(null);
    setDropTarget(null);

    if (!commit || !dragged || !target || target.key === dragged) return;

    setSectionOrder(prev => {
      const next = prev.filter(key => key !== dragged);
      const targetIndex = next.indexOf(target.key);
      if (targetIndex === -1) return prev;
      next.splice(targetIndex + (target.position === 'after' ? 1 : 0), 0, dragged);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // order still applies for this session
      }
      return next;
    });
  }, []);

  return { sectionOrder, draggingKey, dropTarget, startDrag, updateDropTarget, endDrag };
};
