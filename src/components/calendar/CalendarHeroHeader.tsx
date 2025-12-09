import { motion } from "framer-motion";
import { Calendar, Sparkles } from "lucide-react";
import CountUp from "@/components/ui/count-up";

interface CalendarHeroHeaderProps {
  eventCount?: number;
}

export function CalendarHeroHeader({ eventCount = 0 }: CalendarHeroHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl backdrop-blur-xl bg-card/40 border border-white/10 p-8 mb-6"
    >
      {/* Background Glow Orbs */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      
      {/* Floating Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-primary/40 rounded-full"
            style={{
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: 3 + i * 0.5,
              repeat: Infinity,
              delay: i * 0.3,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        {/* Left: Badge + Headline */}
        <div className="space-y-3">
          {/* Mission Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full backdrop-blur-md bg-primary/10 border border-primary/30"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-sm font-medium text-primary">Intelligenter Kalender</span>
          </motion.div>

          {/* Gradient Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary via-amber-400 to-cyan-400 bg-clip-text text-transparent"
          >
            Content Command Center
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-muted-foreground max-w-md"
          >
            Plane, organisiere und publiziere deinen Content strategisch mit KI-Unterstützung.
          </motion.p>
        </div>

        {/* Right: Stats Counter */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-4"
        >
          <div className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6 shadow-[0_0_30px_hsla(43,90%,68%,0.1)]">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Geplante Events</p>
                <p className="text-3xl font-bold text-foreground">
                  <CountUp end={eventCount} duration={1.5} />
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}