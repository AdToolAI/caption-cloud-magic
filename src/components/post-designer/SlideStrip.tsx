import { Button } from "@/components/ui/button";
import { SlideRenderer } from "./SlideRenderer";
import type { PostDesign } from "@/lib/post-design/schema";
import { cn } from "@/lib/utils";
import { Copy, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

interface SlideStripProps {
  design: PostDesign;
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}

export function SlideStrip({
  design,
  activeIndex,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
}: SlideStripProps) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto px-4 py-3">
      {design.slides.map((slide, index) => (
        <div key={slide.id} className="group relative shrink-0">
          <button
            type="button"
            onClick={() => onSelect(index)}
            className={cn(
              "relative block overflow-hidden rounded-lg border transition-all",
              index === activeIndex
                ? "border-primary shadow-[0_0_24px_-6px_hsl(var(--primary)/0.6)]"
                : "border-border/60 opacity-70 hover:opacity-100",
            )}
          >
            <SlideRenderer slide={slide} design={design} size={72} />
            <span className="absolute bottom-0 left-0 rounded-tr bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold">
              {index + 1}
            </span>
          </button>
          <div className="absolute -top-2 right-0 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="secondary" size="icon" className="h-5 w-5" onClick={() => onMove(index, -1)}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button variant="secondary" size="icon" className="h-5 w-5" onClick={() => onMove(index, 1)}>
              <ChevronRight className="h-3 w-3" />
            </Button>
            <Button variant="secondary" size="icon" className="h-5 w-5" onClick={() => onDuplicate(index)}>
              <Copy className="h-3 w-3" />
            </Button>
            {design.slides.length > 1 && (
              <Button variant="secondary" size="icon" className="h-5 w-5 text-destructive" onClick={() => onDelete(index)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-primary/40 text-primary transition-colors hover:bg-primary/10"
      >
        <Plus className="h-4 w-4" />
        <span className="text-[10px]">Slide</span>
      </button>
    </div>
  );
}
