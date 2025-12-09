import { Progress } from "@/components/ui/progress";
import type { Provider } from "@/types/publish";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CharacterCounterProps {
  text: string;
  channels: Provider[];
}

// Platform-specific progress bar colors
const platformProgressColors: Record<Provider, string> = {
  instagram: "bg-gradient-to-r from-pink-500 to-purple-500",
  facebook: "bg-[#1877F2]",
  x: "bg-zinc-700",
  linkedin: "bg-emerald-500",
  tiktok: "bg-black",
  youtube: "bg-red-600",
};

export function CharacterCounter({ text, channels }: CharacterCounterProps) {
  const limits: Record<Provider, number> = {
    x: 25000,
    instagram: 2200,
    linkedin: 3000,
    facebook: 5000,
    tiktok: 2200,
    youtube: 5000,
  };

  return (
    <div className="space-y-2 p-3 rounded-lg bg-muted/20 backdrop-blur-sm border border-white/10">
      {channels.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-1">
          Wählen Sie Channels aus, um Zeichenlimits zu sehen
        </div>
      ) : (
        channels.map((channel, index) => {
          const limit = limits[channel];
          const percentage = (text.length / limit) * 100;
          const isOver = percentage > 100;
          const isWarning = percentage > 90 && percentage <= 100;
          
          return (
            <motion.div
              key={channel}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center gap-3"
            >
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium capitalize">{channel}</span>
                  <motion.span
                    key={text.length}
                    initial={{ scale: 1.2 }}
                    animate={{ scale: 1 }}
                    className={cn(
                      "text-xs font-mono transition-colors",
                      isOver 
                        ? "text-destructive font-semibold" 
                        : isWarning 
                          ? "text-yellow-500" 
                          : "text-emerald-500"
                    )}
                  >
                    {text.length}/{limit}
                  </motion.span>
                </div>
                <div className="relative h-1.5 bg-muted/50 rounded-full overflow-hidden">
                  <motion.div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isOver 
                        ? "bg-destructive shadow-[0_0_10px_hsla(0,80%,50%,0.5)]"
                        : isWarning
                          ? "bg-yellow-500 shadow-[0_0_10px_hsla(45,90%,50%,0.4)]"
                          : platformProgressColors[channel]
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(percentage, 100)}%` }}
                    transition={{ type: "spring", stiffness: 100 }}
                  />
                </div>
              </div>
              {isOver && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="text-xs"
                >
                  ⚠️
                </motion.span>
              )}
            </motion.div>
          );
        })
      )}
    </div>
  );
}
