import { useState } from 'react';

interface Options {
  initial: number;
  min: number;
  /** A function lets the limit follow the window size, evaluated on every drag move. */
  max: number | (() => number);
  /** 'right' grows when dragged right (left-side panel). 'left' grows when dragged left (right-side panel). */
  grow: 'right' | 'left';
}

/** Width state and a mouse-down handler for a drag-to-resize panel edge. */
export function useResizablePanel({ initial, min, max, grow }: Options) {
  const [width, setWidth] = useState<number>(initial);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const initialWidth = width;
    const resolveMax = () => (typeof max === 'function' ? max() : max);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = grow === 'right' ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      setWidth(Math.min(resolveMax(), Math.max(min, initialWidth + delta)));
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const reset = () => setWidth(initial);

  return { width, isResizing, startResize, reset };
}
