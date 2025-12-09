import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Paintbrush } from "lucide-react";
import { motion } from "framer-motion";

interface ActiveBrandSelectorProps {
  brandKits: any[];
  activeKitId: string | null;
  onSelect: (kitId: string) => void;
}

export function ActiveBrandSelector({ brandKits, activeKitId, onSelect }: ActiveBrandSelectorProps) {
  if (brandKits.length === 0) return null;

  const activeKit = brandKits.find(kit => kit.id === activeKitId) || brandKits[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-center gap-4 p-4 backdrop-blur-xl bg-card/60 rounded-xl border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_0_30px_hsla(43,90%,68%,0.12)] transition-all duration-300"
    >
      {/* Animated Icon */}
      <motion.div
        whileHover={{ scale: 1.1, rotate: 10 }}
        className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20"
      >
        <Paintbrush className="h-6 w-6 text-primary" />
      </motion.div>

      {/* Content */}
      <div className="flex-1">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Aktives Marken-Set
        </p>
        <Select value={activeKitId || brandKits[0]?.id} onValueChange={onSelect}>
          <SelectTrigger className="border-0 h-auto p-0 focus:ring-0 font-semibold text-lg hover:text-primary transition-colors">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="backdrop-blur-xl bg-card/95 border border-white/10">
            {brandKits.map(kit => (
              <SelectItem 
                key={kit.id} 
                value={kit.id}
                className="hover:bg-primary/10 focus:bg-primary/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-5 h-5 rounded-md border border-white/20 shadow-[0_0_8px_hsla(43,90%,68%,0.2)]"
                    style={{ backgroundColor: kit.color_palette.primary }}
                  />
                  <span className="font-medium">{kit.brand_name || "Unnamed Brand"}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mood Badge with Glassmorphism */}
      <Badge 
        variant="secondary" 
        className="backdrop-blur-xl bg-primary/10 border border-primary/20 text-primary font-medium px-3 py-1"
      >
        {activeKit?.mood}
      </Badge>
    </motion.div>
  );
}
