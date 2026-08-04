import { motion } from "framer-motion";
import { SlideRenderer } from "./SlideRenderer";
import type { PostDesign } from "@/lib/post-design/schema";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface VariantGalleryProps {
  variants: PostDesign[];
  loading?: boolean;
  stage?: string;
  onPick: (design: PostDesign) => void;
}

const STAGES = ["Bildanalyse", "Typografie", "Markenfarben", "Feinschliff"];

export function VariantGallery({ variants, loading, stage, onPick }: VariantGalleryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="relative aspect-square overflow-hidden rounded-xl border border-primary/15 bg-card/60">
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
              <motion.div
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/15 to-transparent"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.18, ease: "linear" }}
              />
            </div>
            <p className="text-center text-[11px] text-muted-foreground">{stage ?? STAGES[i % STAGES.length]}</p>
          </div>
        ))}
      </div>
    );
  }

  if (!variants.length) return null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {variants.map((variant, i) => (
        <motion.button
          key={variant.variantName ?? i}
          type="button"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
          onClick={() => onPick(variant)}
          className={cn(
            "group relative overflow-hidden rounded-xl border border-border/60 bg-card/60 text-left",
            "transition-all hover:-translate-y-1 hover:border-primary/60 hover:shadow-[0_0_40px_-12px_hsl(var(--primary)/0.55)]",
          )}
        >
          <div className="aspect-square w-full overflow-hidden">
            <div className="origin-top-left" style={{ width: "100%" }}>
              <SlideRenderer slide={variant.slides[0]} design={variant} size={260} className="w-full" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
            <span className="truncate text-xs font-medium">{variant.variantName ?? `Variante ${i + 1}`}</span>
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </motion.button>
      ))}
    </div>
  );
}
