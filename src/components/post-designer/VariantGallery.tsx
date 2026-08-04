import { motion } from "framer-motion";
import { SlideRenderer } from "./SlideRenderer";
import type { PostDesign } from "@/lib/post-design/schema";
import { cn } from "@/lib/utils";
import { Dices, Sparkles } from "lucide-react";

interface VariantGalleryProps {
  variants: PostDesign[];
  loading?: boolean;
  stage?: string;
  onPick: (design: PostDesign) => void;
  onShuffle?: (index: number) => void;
}

const STAGES = ["Motiv", "Typografie", "Marke", "Feinschliff"];

export function VariantGallery({ variants, loading, stage, onPick, onShuffle }: VariantGalleryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="space-y-2">
            <div className="relative aspect-square overflow-hidden rounded-2xl border border-primary/15 bg-card/60">
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
              <motion.div
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/20 to-transparent"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.14, ease: "linear" }}
              />
            </div>
            <p className="text-center text-[11px] tracking-wide text-muted-foreground">
              {stage ?? STAGES[i % STAGES.length]}
            </p>
          </div>
        ))}
      </div>
    );
  }

  if (!variants.length) return null;

  return (
    <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
      {variants.map((variant, i) => (
        <motion.div
          key={`${variant.variantName ?? "v"}-${i}`}
          layout
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: i * 0.06, type: "spring", stiffness: 220, damping: 26 }}
          className="group relative"
          style={{ perspective: 1200 }}
        >
          <button
            type="button"
            onClick={() => onPick(variant)}
            className={cn(
              "relative block w-full overflow-hidden rounded-2xl border border-border/60 bg-card/60 text-left",
              "transition-all duration-300 will-change-transform",
              "hover:-translate-y-1.5 hover:border-primary/70",
              "hover:shadow-[0_0_60px_-16px_hsl(var(--primary)/0.6)]",
            )}
          >
            <div className="aspect-square w-full overflow-hidden transition-transform duration-500 group-hover:scale-[1.02]">
              <SlideRenderer slide={variant.slides[0]} design={variant} size={280} className="w-full" />
            </div>

            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-[3.1rem] h-16 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{
                background: "linear-gradient(to top, hsl(var(--primary) / 0.22), transparent)",
              }}
            />

            <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
              <span className="truncate text-xs font-medium">{variant.variantName ?? `Variante ${i + 1}`}</span>
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </button>

          {onShuffle && (
            <button
              type="button"
              title="Neue Copy für diese Vorlage"
              onClick={(e) => {
                e.stopPropagation();
                onShuffle(i);
              }}
              className={cn(
                "absolute right-2 top-2 rounded-full border border-primary/40 bg-background/80 p-1.5",
                "opacity-0 backdrop-blur transition-all group-hover:opacity-100 hover:border-primary hover:text-primary",
              )}
            >
              <Dices className="h-3.5 w-3.5" />
            </button>
          )}
        </motion.div>
      ))}
    </div>
  );
}
