import { useCallback, useRef, useState } from "react";
import { SlideRenderer } from "./SlideRenderer";
import { SAFE_MARGIN, clamp01, type Layer, type PostDesign, type PostSlide } from "@/lib/post-design/schema";
import { cn } from "@/lib/utils";

interface DesignCanvasProps {
  design: PostDesign;
  slide: PostSlide;
  size: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onLayerChange: (id: string, patch: Partial<Layer>) => void;
  onCommit: () => void;
  showSafeZone?: boolean;
  exportRef?: React.RefObject<HTMLDivElement>;
  /** KI-Motiv rendert noch. */
  pendingImage?: boolean;
}


type DragMode = "move" | "resize" | null;

const SNAP = 0.005;

function snap(value: number, targets: number[]): { value: number; hit: number | null } {
  for (const t of targets) {
    if (Math.abs(value - t) < SNAP) return { value: t, hit: t };
  }
  return { value, hit: null };
}

export function DesignCanvas({
  design,
  slide,
  size,
  selectedId,
  onSelect,
  onLayerChange,
  onCommit,
  showSafeZone = true,
  exportRef,
  pendingImage,

}: DesignCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    id: string;
    startX: number;
    startY: number;
    layer: Layer;
  } | null>(null);
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });

  const handlePointerDown = useCallback(
    (event: React.PointerEvent, layer: Layer, mode: DragMode) => {
      if (layer.locked) return;
      event.stopPropagation();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      onSelect(layer.id);
      dragRef.current = { mode, id: layer.id, startX: event.clientX, startY: event.clientY, layer };
    },
    [onSelect],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = (event.clientX - drag.startX) / rect.width;
      const dy = (event.clientY - drag.startY) / rect.height;

      if (drag.mode === "move") {
        let x = clamp01(drag.layer.x + dx);
        let y = clamp01(drag.layer.y + dy);
        const centerX = snap(x + drag.layer.w / 2, [0.5]);
        const centerY = snap(y + drag.layer.h / 2, [0.5]);
        const edgeX = snap(x, [SAFE_MARGIN, 1 - SAFE_MARGIN - drag.layer.w]);
        const edgeY = snap(y, [SAFE_MARGIN, 1 - SAFE_MARGIN - drag.layer.h]);
        if (centerX.hit !== null) x = 0.5 - drag.layer.w / 2;
        else if (edgeX.hit !== null) x = edgeX.value;
        if (centerY.hit !== null) y = 0.5 - drag.layer.h / 2;
        else if (edgeY.hit !== null) y = edgeY.value;
        setGuides({ v: centerX.hit !== null, h: centerY.hit !== null });
        onLayerChange(drag.id, { x, y } as Partial<Layer>);
      } else if (drag.mode === "resize") {
        const w = Math.min(1, Math.max(0.05, drag.layer.w + dx));
        const h = Math.min(1, Math.max(0.03, drag.layer.h + dy));
        onLayerChange(drag.id, { w, h } as Partial<Layer>);
      }
    },
    [onLayerChange],
  );

  const endDrag = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      setGuides({ v: false, h: false });
      onCommit();
    }
  }, [onCommit]);

  return (
    <div
      ref={containerRef}
      className="relative select-none touch-none"
      style={{ width: size, height: size }}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={() => onSelect(null)}
    >
      <div className="absolute inset-0 rounded-[2px] overflow-hidden shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] ring-1 ring-primary/20">
        <SlideRenderer ref={exportRef} slide={slide} design={design} size={size} />
      </div>

      {showSafeZone && (
        <div
          className="pointer-events-none absolute border border-dashed border-primary/25"
          style={{
            left: `${SAFE_MARGIN * 100}%`,
            top: `${SAFE_MARGIN * 100}%`,
            right: `${SAFE_MARGIN * 100}%`,
            bottom: `${SAFE_MARGIN * 100}%`,
          }}
        />
      )}

      {guides.v && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-primary/70" />}
      {guides.h && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-primary/70" />}

      {slide.layers.map((layer) => {
        const active = layer.id === selectedId;
        return (
          <div
            key={layer.id}
            onPointerDown={(e) => handlePointerDown(e, layer, "move")}
            className={cn(
              "absolute cursor-move transition-colors",
              active ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/40",
            )}
            style={{
              left: `${layer.x * 100}%`,
              top: `${layer.y * 100}%`,
              width: `${layer.w * 100}%`,
              height: `${layer.h * 100}%`,
            }}
          >
            {active && (
              <>
                <span className="absolute -top-6 left-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                  {layer.type}
                </span>
                <span
                  onPointerDown={(e) => handlePointerDown(e, layer, "resize")}
                  className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-background bg-primary"
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
