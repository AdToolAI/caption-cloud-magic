import { motion, useReducedMotion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

// Purely decorative sparkline + rising bars. No numeric KPIs.
const SPARK_PATH = "M0,40 L15,32 L30,36 L45,24 L60,28 L75,18 L90,22 L105,10 L120,14 L135,4";

export const SignalCockpit = () => {
  const reduce = useReducedMotion();
  const { t } = useTranslation();
  const bars = [0.4, 0.65, 0.55, 0.85];
  const labels = [
    t("landing.mission.cockpit.signal.reach"),
    t("landing.mission.cockpit.signal.ctr"),
    t("landing.mission.cockpit.signal.watch"),
  ];

  return (
    <div
      role="img"
      aria-label="Performance-Signal Vorschau"
      className="relative h-[170px] w-full rounded-xl border border-border/40 bg-gradient-to-br from-background/40 to-card/20 p-3 overflow-hidden"
    >
      {/* Sparkline */}
      <svg viewBox="0 0 135 50" className="w-full h-[70px]" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d={`${SPARK_PATH} L135,50 L0,50 Z`}
          fill="url(#sparkFill)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.4 }}
        />
        <motion.path
          d={SPARK_PATH}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={reduce ? { pathLength: 1 } : { pathLength: [0, 1] }}
          transition={{
            duration: 2.6,
            repeat: reduce ? 0 : Infinity,
            repeatType: "loop",
            ease: "easeInOut",
            repeatDelay: 1.2,
          }}
        />
      </svg>

      {/* KPI labels — qualitative only */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {labels.map((label, i) => (
          <div key={label} className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/80">
              <TrendingUp className="h-2.5 w-2.5 text-primary" />
              {label}
            </div>
            <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${bars[i] * 100}%` }}
                transition={{ duration: 1.4, delay: 0.6 + i * 0.15, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-primary to-gold-dark"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
