import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { STOCK_VIDEO_COLLECTIONS, type StockVideoCollection } from "@/config/stockVideoCollections";
import { cn } from "@/lib/utils";

interface EditorialCollectionsProps {
  activeId: string | null;
  onSelect: (collection: StockVideoCollection) => void;
}

export function EditorialCollections({ activeId, onSelect }: EditorialCollectionsProps) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-foreground mb-3">
        Editorial Collections
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STOCK_VIDEO_COLLECTIONS.map((c, i) => {
          const active = activeId === c.id;
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
            >
              <Card
                onClick={() => onSelect(c)}
                className={cn(
                  "relative cursor-pointer overflow-hidden p-4 h-28 flex flex-col justify-between border-yellow-500/15 bg-black/50 backdrop-blur-md hover:border-yellow-500/50 transition-all",
                  active && "border-yellow-400/80 ring-1 ring-yellow-400/40",
                )}
              >
                <div className={cn("absolute inset-0 bg-gradient-to-br opacity-70 group-hover:opacity-100 transition-opacity", c.gradient)} />
                <div className="relative flex items-start justify-between">
                  <span className="text-2xl">{c.emoji}</span>
                </div>
                <div className="relative">
                  <p className="text-sm font-semibold text-foreground leading-tight">{c.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{c.description}</p>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
