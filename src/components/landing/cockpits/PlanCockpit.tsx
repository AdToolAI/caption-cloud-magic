import { motion, useReducedMotion } from "framer-motion";

// Purely decorative: 7 columns (weekdays) x 4 rows (weeks).
// Highlighted "optimal" slots pulse in gold; the rest breathe softly.
const OPTIMAL = new Set([2, 5, 9, 13, 15, 18, 22, 24, 27]);

export const PlanCockpit = () => {
  const reduce = useReducedMotion();
  const cells = Array.from({ length: 28 });

  return (
    <div
      role="img"
      aria-label="Content-Planungs-Heatmap Vorschau"
      className="relative h-[170px] w-full rounded-xl border border-border/40 bg-gradient-to-br from-background/40 to-card/20 p-3 overflow-hidden"
    >
      {/* Weekday header dots */}
      <div className="mb-2 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-1 rounded-full bg-border/60" />
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((_, i) => {
          const isOptimal = OPTIMAL.has(i);
          return (
            <motion.div
              key={i}
              initial={{ opacity: isOptimal ? 0.35 : 0.15 }}
              animate={
                reduce
                  ? undefined
                  : isOptimal
                  ? { opacity: [0.4, 1, 0.4], boxShadow: [
                      "0 0 0px hsl(var(--primary) / 0)",
                      "0 0 12px hsl(var(--primary) / 0.6)",
                      "0 0 0px hsl(var(--primary) / 0)",
                    ] }
                  : { opacity: [0.15, 0.3, 0.15] }
              }
              transition={{
                duration: isOptimal ? 2.4 : 3.2,
                repeat: Infinity,
                delay: (i % 7) * 0.15 + Math.floor(i / 7) * 0.1,
                ease: "easeInOut",
              }}
              className={`h-4 rounded-sm ${
                isOptimal
                  ? "bg-gradient-to-br from-primary to-gold-dark"
                  : "bg-foreground/10"
              }`}
            />
          );
        })}
      </div>

      {/* corner label */}
      <div className="absolute top-2 right-3 text-[9px] uppercase tracking-widest text-muted-foreground/60 font-mono">
        M T W T F S S
      </div>
    </div>
  );
};
