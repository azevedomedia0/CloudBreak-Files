import { useState, useCallback } from 'react';
import { SidebarSectionKey } from '../components/sidebar/sectionKey';

type SectionOrder = SidebarSectionKey[];

const DEFAULT_SECTION_ORDER: SectionOrder = [
  'favorites',
  'directories',
  'incomingLibraries',
  'outgoingLibraries',
  'accounts',
  'network',
];

export const useSectionOrder = () => {
  const [sectionOrder, setSectionOrder] = useState<SectionOrder>(() => {
    // Try to load from localStorage
    try {
      const stored = localStorage.getItem('sidebar_section_order');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate that all sections are present
        if (Array.isArray(parsed) && parsed.length === DEFAULT_SECTION_ORDER.length) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load section order:', e);
    }
    return DEFAULT_SECTION_ORDER;
  });

  const [draggedSection, setDraggedSection] = useState<SidebarSectionKey | null>(null);
  const [dragOverSection, setDragOverSection] = useState<SidebarSectionKey | null>(null);

  const saveSectionOrder = useCallback((order: SectionOrder) => {
    try {
      localStorage.setItem('sidebar_section_order', JSON.stringify(order));
      setSectionOrder(order);
    } catch (e) {
      console.error('Failed to save section order:', e);
    }
  }, []);

  const handleDragStart = useCallback((sectionKey: SidebarSectionKey) => {
    setDraggedSection(sectionKey);
  }, []);

  const handleDragOver = useCallback((sectionKey: SidebarSectionKey) => {
    setDragOverSection(sectionKey);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedSection(null);
    setDragOverSection(null);
  }, []);

  const handleDrop = useCallback((targetSection: SidebarSectionKey) => {
    if (!draggedSection || draggedSection === targetSection) {
      setDraggedSection(null);
      setDragOverSection(null);
      return;
    }

    const draggedIndex = sectionOrder.indexOf(draggedSection);
    const targetIndex = sectionOrder.indexOf(targetSection);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedSection(null);
      setDragOverSection(null);
      return;
    }

    const newOrder = [...sectionOrder];
    // Remove dragged item
    newOrder.splice(draggedIndex, 1);
    // Insert at new position
    newOrder.splice(targetIndex, 0, draggedSection);

    saveSectionOrder(newOrder);
    setDraggedSection(null);
    setDragOverSection(null);
  }, [draggedSection, sectionOrder, saveSectionOrder]);

  const resetOrder = useCallback(() => {
    saveSectionOrder(DEFAULT_SECTION_ORDER);
  }, [saveSectionOrder]);

  return {
    sectionOrder,
    draggedSection,
    dragOverSection,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDrop,
    resetOrder,
  };
};
