import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cpu, Lightbulb, Palette, Gauge, Check } from "lucide-react";

interface AISuggestion {
  productType: string;
  suggestedCategory: string;
  suggestedLighting: string;
  suggestedIntensity: number;
  reasoning: string;
}

interface ProductInsightBannerProps {
  suggestion: AISuggestion;
  onApply: (suggestion: AISuggestion) => void;
  applied?: boolean;
}

const categoryLabels: Record<string, string> = {
  workspace: 'Arbeitsplatz',
  outdoor: 'Outdoor/Natur',
  urban: 'Urban',
  studio: 'Studio/Minimal',
  wellness: 'Wellness',
  tech: 'Tech',
  luxury: 'Luxury'
};

export function ProductInsightBanner({ suggestion, onApply, applied = false }: ProductInsightBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative overflow-hidden rounded-xl mb-6"
    >
      {/* Glow backdrop */}
      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-primary/10 to-cyan-500/10 blur-xl" />
      
      <div className="relative backdrop-blur-xl bg-card/60 border border-cyan-500/20 rounded-xl p-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20"
          >
            <Cpu className="h-5 w-5 text-cyan-400" />
          </motion.div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold">KI-Produkterkennung</h4>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-cyan-500/30 text-cyan-400">
                v3
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Erkannt: <span className="text-foreground font-medium">{suggestion.productType}</span>
            </p>
          </div>
        </div>

        {/* Suggestions grid */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-white/5">
            <Palette className="h-3.5 w-3.5 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground">Kategorie</p>
              <p className="text-xs font-medium">{categoryLabels[suggestion.suggestedCategory] || suggestion.suggestedCategory}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-white/5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
            <div>
              <p className="text-[10px] text-muted-foreground">Licht</p>
              <p className="text-xs font-medium capitalize">{suggestion.suggestedLighting}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-white/5">
            <Gauge className="h-3.5 w-3.5 text-cyan-400" />
            <div>
              <p className="text-[10px] text-muted-foreground">Intensität</p>
              <p className="text-xs font-medium">{suggestion.suggestedIntensity}/10</p>
            </div>
          </div>
        </div>

        {/* Reasoning */}
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{suggestion.reasoning}</p>

        {/* Apply button */}
        <Button
          onClick={() => onApply(suggestion)}
          disabled={applied}
          size="sm"
          variant={applied ? "secondary" : "default"}
          className={applied ? "" : "bg-gradient-to-r from-cyan-500 to-primary border-0 hover:from-cyan-500/90 hover:to-primary/90"}
        >
          {applied ? (
            <>
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Übernommen
            </>
          ) : (
            "Empfehlung übernehmen"
          )}
        </Button>
      </div>
    </motion.div>
  );
}
