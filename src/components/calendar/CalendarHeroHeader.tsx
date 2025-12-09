import { motion } from "framer-motion";
import { Calendar } from "lucide-react";
import CountUp from "@/components/ui/count-up";

interface CalendarHeroHeaderProps {
  eventCount?: number;
}

export function CalendarHeroHeader({ eventCount = 0 }: CalendarHeroHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex items-center justify-between px-5 py-3 backdrop-blur-xl bg-card/40 border border-white/10 rounded-xl"
    >
      {/* Left: Badge + Headline */}
      <div className="flex items-center gap-4">
        {/* Mission Badge */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-xs font-medium text-primary">Intelligenter Kalender</span>
        </div>

        {/* Gradient Headline */}
        <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary via-amber-400 to-cyan-400 bg-clip-text text-transparent">
          Content Command Center
        </h1>
      </div>

      {/* Right: Compact Stats */}
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <Calendar className="w-4 h-4 text-primary" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Events:</span>
          <span className="text-lg font-bold text-foreground">
            <CountUp end={eventCount} duration={1} />
          </span>
        </div>
      </div>
    </motion.div>
  );
}
