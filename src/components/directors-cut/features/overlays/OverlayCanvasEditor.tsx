import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextOverlay } from '@/types/directors-cut';
import { OverlayGraphic } from '@/remotion/components/OverlayGraphic';
import { clampBox } from '@/lib/directors-cut/overlayModel';

interface OverlayCanvasEditorProps {
  videoUrl?: string;
  currentTime: number;
  overlays: TextOverlay[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<TextOverlay>) => void;
  showSafeZones?: boolean;
}

const SNAP = 0.005;
const GUIDES = [0, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1];

function snap(value: number, targets: number[]) {
  for (const t of targets) {
    if (Math.abs(value - t) < SNAP) return t;
  }
  return value;
}

type DragMode = 'move' | 'resize' | null;

/**
 * Direktes Positionieren der Overlays auf dem Videobild.
 * Alle Koordinaten sind relativ (0..1) — dadurch sieht der Export
 * in 1080p/4K exakt so aus wie die Vorschau.
 */
export function OverlayCanvasEditor({
  videoUrl,
  currentTime,
  overlays,
  selectedId,
  onSelect,
  onChange,
  showSafeZones = true,
}: OverlayCanvasEditorProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [width, setWidth] = useState(640);
  const [drag, setDrag] = useState<DragMode>(null);
  const [activeGuides, setActiveGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const startRef = useRef<{ px: number; py: number; box: { x: number; y: number; w: number; h: number } } | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 640);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Standbild an der aktuellen Zeitmarke
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoUrl) return;
    if (Math.abs(v.currentTime - currentTime) > 0.12) {
      try {
        v.currentTime = currentTime;
      } catch {
        /* seek noch nicht möglich */
      }
    }
  }, [currentTime, videoUrl]);

  const visible = overlays.filter(
    (o) => currentTime >= o.startTime && (o.endTime == null || currentTime <= o.endTime),
  );

  const beginDrag = useCallback(
    (e: React.PointerEvent, overlay: TextOverlay, mode: DragMode) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect || !overlay.box) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      startRef.current = {
        px: (e.clientX - rect.left) / rect.width,
        py: (e.clientY - rect.top) / rect.height,
        box: { ...overlay.box },
      };
      setDrag(mode);
      onSelect(overlay.id);
    },
    [onSelect],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag || !selectedId || !startRef.current) return;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const dx = px - startRef.current.px;
      const dy = py - startRef.current.py;
      const s = startRef.current.box;

      let box = { ...s };
      const gx: number[] = [];
      const gy: number[] = [];

      if (drag === 'move') {
        box.x = s.x + dx;
        box.y = s.y + dy;
        const centerX = snap(box.x + box.w / 2, GUIDES);
        const centerY = snap(box.y + box.h / 2, GUIDES);
        if (centerX !== box.x + box.w / 2) {
          box.x = centerX - box.w / 2;
          gx.push(centerX);
        }
        if (centerY !== box.y + box.h / 2) {
          box.y = centerY - box.h / 2;
          gy.push(centerY);
        }
        const left = snap(box.x, [0.06, 0.5 - box.w / 2]);
        if (left !== box.x) {
          box.x = left;
          gx.push(left);
        }
      } else {
        box.w = Math.max(0.06, s.w + dx);
        box.h = Math.max(0.04, s.h + dy);
      }

      setActiveGuides({ x: gx, y: gy });
      onChange(selectedId, { box: clampBox(box) });
    },
    [drag, selectedId, onChange],
  );

  const endDrag = useCallback(() => {
    setDrag(null);
    startRef.current = null;
    setActiveGuides({ x: [], y: [] });
  }, []);

  return (
    <div
      ref={stageRef}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={() => onSelect(null)}
      className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black select-none touch-none"
    >
      {videoUrl ? (
        <video ref={videoRef} src={videoUrl} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-contain" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">Kein Video geladen</div>
      )}

      {/* Sicherheitszonen */}
      {showSafeZones && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute border border-dashed border-white/15" style={{ inset: '6%' }} />
          <div className="absolute left-0 right-0 top-0 h-[12%] bg-gradient-to-b from-white/5 to-transparent" />
          <div className="absolute left-0 right-0 bottom-0 h-[16%] bg-gradient-to-t from-white/5 to-transparent" />
        </div>
      )}

      {/* Overlay-Ebene */}
      <div className="absolute inset-0 pointer-events-none">
        {visible.map((o) => (
          <OverlayGraphic
            key={o.id}
            overlay={o}
            t={Math.max(0, currentTime - o.startTime)}
            duration={o.endTime != null ? Math.max(0.1, o.endTime - o.startTime) : Number.POSITIVE_INFINITY}
            canvasWidth={width}
          />
        ))}
      </div>

      {/* Interaktions-Rahmen */}
      {visible.map((o) => {
        const box = o.box;
        if (!box) return null;
        const active = o.id === selectedId;
        return (
          <div
            key={`hit-${o.id}`}
            onPointerDown={(e) => beginDrag(e, o, 'move')}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(o.id);
            }}
            className={`absolute cursor-move rounded-md transition-colors ${
              active ? 'border-2 border-primary bg-primary/5' : 'border border-transparent hover:border-white/40'
            }`}
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
            }}
          >
            {active && (
              <div
                onPointerDown={(e) => beginDrag(e, o, 'resize')}
                className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-sm bg-primary cursor-nwse-resize"
              />
            )}
          </div>
        );
      })}

      {/* Ausrichtungslinien */}
      {activeGuides.x.map((g) => (
        <div key={`gx-${g}`} className="absolute top-0 bottom-0 w-px bg-primary/70 pointer-events-none" style={{ left: `${g * 100}%` }} />
      ))}
      {activeGuides.y.map((g) => (
        <div key={`gy-${g}`} className="absolute left-0 right-0 h-px bg-primary/70 pointer-events-none" style={{ top: `${g * 100}%` }} />
      ))}
    </div>
  );
}
