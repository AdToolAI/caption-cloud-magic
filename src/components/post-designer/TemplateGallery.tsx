import { tx } from '@/lib/i18nText';
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SlideRenderer } from "./SlideRenderer";
import { DESIGN_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/post-design/templates";
import type { PostDesign } from "@/lib/post-design/schema";
import { cn } from "@/lib/utils";

interface TemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image?: string | null;
  onApply: (design: PostDesign) => void;
}

export function TemplateGallery({ open, onOpenChange, image, onApply }: TemplateGalleryProps) {
  const [category, setCategory] = useState<string>("All");

  const templates = useMemo(() => {
    const list = category === "All" ? DESIGN_TEMPLATES : DESIGN_TEMPLATES.filter((t) => t.category === category);
    return list.map((t) => ({ meta: t, design: t.build({ image }) }));
  }, [category, image]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{tx({ de: "Vorlagen", en: "Templates", es: "Plantillas" })}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 pb-2">
          {["All", ...TEMPLATE_CATEGORIES].map((cat) => (
            <Button
              key={cat}
              size="sm"
              variant={category === cat ? "default" : "outline"}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>

        <div className="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto pr-1 md:grid-cols-4">
          {templates.map(({ meta, design }) => (
            <button
              key={meta.id}
              type="button"
              onClick={() => {
                onApply(design);
                onOpenChange(false);
              }}
              className={cn(
                "group overflow-hidden rounded-xl border border-border/60 text-left transition-all",
                "hover:-translate-y-1 hover:border-primary/70 hover:shadow-[0_0_36px_-12px_hsl(var(--primary)/0.5)]",
              )}
            >
              <div className="aspect-square overflow-hidden">
                <SlideRenderer slide={design.slides[0]} design={design} size={220} />
              </div>
              <div className="border-t border-border/60 px-3 py-2">
                <p className="truncate text-xs font-medium">{meta.name}</p>
                <p className="text-[10px] text-muted-foreground">{meta.category}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
