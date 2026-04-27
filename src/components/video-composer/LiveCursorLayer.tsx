import { useEffect, useRef } from 'react';
import type { PresenceUser } from '@/hooks/useComposerCollaboration';

interface Props {
  peers: PresenceUser[];
  /** Called when local mouse moves — coordinates are normalized 0..1 of the container. */
  onLocalMove: (x: number | null, y: number | null) => void;
  children: React.ReactNode;
}

/**
 * Wraps a region (e.g. the composer canvas) and overlays remote cursors.
 * Coordinates from peers are normalized 0..1 so different viewports map correctly.
 */
export default function LiveCursorLayer({ peers, onLocalMove, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) {
        onLocalMove(null, null);
        return;
      }
      onLocalMove(x, y);
    };
    const handleLeave = () => onLocalMove(null, null);
    el.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseleave', handleLeave);
    return () => {
      el.removeEventListener('mousemove', handleMove);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, [onLocalMove]);

  return (
    <div ref={containerRef} className="relative">
      {children}
      <div className="pointer-events-none absolute inset-0 z-50">
        {peers.map((p) => {
          if (p.cursor_x == null || p.cursor_y == null) return null;
          return (
            <div
              key={p.user_id}
              className="absolute transition-transform duration-75 ease-out"
              style={{
                left: `${p.cursor_x * 100}%`,
                top: `${p.cursor_y * 100}%`,
                transform: 'translate(-2px, -2px)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M2 2 L18 9 L9 11 L7 18 Z"
                  fill={p.color}
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth="1"
                />
              </svg>
              <div
                className="ml-3 -mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-medium shadow-md whitespace-nowrap"
                style={{ background: p.color, color: '#0a0a0a' }}
              >
                {p.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
