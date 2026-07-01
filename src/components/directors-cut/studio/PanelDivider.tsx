import React, { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface PanelDividerProps {
  /** Current width of the target panel in px. */
  width: number;
  onWidthChange: (next: number) => void;
  /** Which side the divider grabs from: 'left' = drag right increases width, 'right' = drag left increases width. */
  side: 'left' | 'right';
  min?: number;
  max?: number;
}

/**
 * Slim 4px vertical drag handle used between Library / Preview / Inspector panels.
 * Welle 5 — Layout-Shell. Persists via caller through localStorage.
 */
export const PanelDivider: React.FC<PanelDividerProps> = ({
  width,
  onWidthChange,
  side,
  min = 220,
  max = 560,
}) => {
  const startXRef = useRef(0);
  const startWRef = useRef(0);
  const draggingRef = useRef(false);

  const onMove = useCallback((e: MouseEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - startXRef.current;
    const delta = side === 'left' ? dx : -dx;
    const next = Math.min(max, Math.max(min, startWRef.current + delta));
    onWidthChange(next);
  }, [max, min, onWidthChange, side]);

  const onUp = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }, [onMove]);

  const onDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWRef.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [onMove, onUp, width]);

  useEffect(() => () => onUp(), [onUp]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onDown}
      onDoubleClick={() => onWidthChange(side === 'left' ? 384 : 288)}
      className={cn(
        'group relative w-1 flex-shrink-0 cursor-col-resize',
        'bg-transparent hover:bg-[#F5C76A]/20 transition-colors'
      )}
      title="Ziehen zum Anpassen · Doppelklick zurücksetzen"
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-[#F5C76A]/10 group-hover:bg-[#F5C76A]/40" />
    </div>
  );
};
