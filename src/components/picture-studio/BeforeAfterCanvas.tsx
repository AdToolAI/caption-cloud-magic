import { tx } from "@/lib/i18nText";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type CompareMode = "original" | "result" | "split";
type ZoomMode = "fit" | 1 | 2;

interface BeforeAfterCanvasProps {
  originalUrl: string;
  resultUrl?: string | null;
  busy?: boolean;
}

/**
 * Before | After canvas with a draggable split line, zoom and hold-to-compare.
 */
export function BeforeAfterCanvas({ originalUrl, resultUrl, busy }: BeforeAfterCanvasProps) {
  const [mode, setMode] = useState<CompareMode>("split");
  const [zoom, setZoom] = useState<ZoomMode>("fit");
  const [split, setSplit] = useState(50);
  const [holding, setHolding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key.toLowerCase() === "c") setHolding(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "c") setHolding(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const updateSplit = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.min(100, Math.max(0, pct)));
  };

  const effectiveMode: CompareMode = holding || !resultUrl ? "original" : mode;
  const zoomStyle =
    zoom === "fit"
      ? { objectFit: "contain" as const, transform: "none" }
      : { objectFit: "contain" as const, transform: `scale(${zoom})` };

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border border-border/50 bg-muted/20"
        style={{ aspectRatio: "4 / 3" }}
        onMouseMove={(e) => dragging.current && updateSplit(e.clientX)}
        onMouseUp={() => (dragging.current = false)}
        onMouseLeave={() => (dragging.current = false)}
        onTouchMove={(e) => dragging.current && updateSplit(e.touches[0].clientX)}
        onTouchEnd={() => (dragging.current = false)}
      >
        <img
          src={originalUrl}
          alt={tx({ de: "Original", en: "Original", es: "Original" })}
          className="absolute inset-0 h-full w-full transition-transform duration-200"
          style={zoomStyle}
        />

        {resultUrl && effectiveMode !== "original" && (
          <div
            className="absolute inset-0 overflow-hidden"
            style={effectiveMode === "split" ? { clipPath: `inset(0 0 0 ${split}%)` } : undefined}
          >
            <img
              src={resultUrl}
              alt={tx({ de: "Ergebnis", en: "Enhanced", es: "Mejorada" })}
              className="absolute inset-0 h-full w-full transition-transform duration-200"
              style={zoomStyle}
            />
          </div>
        )}

        {resultUrl && effectiveMode === "split" && (
          <div
            className="absolute inset-y-0 z-10 w-0.5 cursor-ew-resize bg-primary"
            style={{ left: `${split}%` }}
            onMouseDown={() => (dragging.current = true)}
            onTouchStart={() => (dragging.current = true)}
          >
            <span className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-background/90" />
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <span className="text-sm text-muted-foreground">
              {tx({ de: "Wird verarbeitet …", en: "Processing …", es: "Procesando …" })}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {(["original", "result", "split"] as CompareMode[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? "default" : "outline"}
              disabled={!resultUrl && m !== "original"}
              onClick={() => setMode(m)}
            >
              {m === "original"
                ? tx({ de: "Original", en: "Original", es: "Original" })
                : m === "result"
                  ? tx({ de: "Ergebnis", en: "Enhanced", es: "Mejorada" })
                  : tx({ de: "Split", en: "Split", es: "Dividido" })}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(["fit", 1, 2] as ZoomMode[]).map((z) => (
            <Button
              key={String(z)}
              size="sm"
              variant={zoom === z ? "default" : "outline"}
              onClick={() => setZoom(z)}
            >
              {z === "fit" ? "Fit" : `${z * 100}%`}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {tx({
          de: "Taste C gedrückt halten, um das Original zu sehen.",
          en: "Hold C to compare with the original.",
          es: "Mantén pulsada la tecla C para ver el original.",
        })}
      </p>
    </div>
  );
}
