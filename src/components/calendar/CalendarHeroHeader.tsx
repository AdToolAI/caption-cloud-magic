import { motion } from "framer-motion";
import { Calendar } from "lucide-react";
import CountUp from "@/components/ui/count-up";
import { useMemo } from "react";

interface CalendarHeroHeaderProps {
  eventCount?: number;
}

function FloatingParticle({ delay, x, size }: { delay: number; x: number; size: number }) {
  return (
    <motion.div
      className="absolute rounded-full bg-primary/20"
      style={{ width: size, height: size, left: `${x}%`, bottom: -10 }}
      animate={{
        y: [-10, -120],
        opacity: [0, 0.6, 0],
        scale: [0.5, 1, 0.3],
      }}
      transition={{
        duration: 4,
        delay,
        repeat: Infinity,
        ease: "easeOut",
      }}
    />
  );
}

export function CalendarHeroHeader({ eventCount = 0 }: CalendarHeroHeaderProps) {
  const particles = useMemo(() => 
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      delay: i * 0.6,
      x: 10 + Math.random() * 80,
      size: 3 + Math.random() * 4,
    })), []
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative flex items-center justify-between px-5 py-3 backdrop-blur-xl bg-card/40 border border-white/10 rounded-xl overflow-hidden"
    >
      {/* Floating particles */}
      {particles.map(p => (
        <FloatingParticle key={p.id} delay={p.delay} x={p.x} size={p.size} />
      ))}

      {/* Subtle radial glow background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,hsl(var(--primary)/0.08),transparent_60%)] pointer-events-none" />

      {/* Left: Badge + Headline */}
      <div className="relative flex items-center gap-4">
        {/* Mission Badge */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-xs font-medium text-primary">Intelligenter Kalender</span>
        </div>

        {/* Shimmer Gradient Headline */}
        <h1 
          className="text-xl md:text-2xl font-bold bg-clip-text text-transparent"
          style={{
            backgroundImage: 'linear-gradient(90deg, hsl(var(--primary)), hsl(43 90% 75%), hsl(190 80% 60%), hsl(var(--primary)))',
            backgroundSize: '200% 100%',
            animation: 'shimmer-text 4s ease-in-out infinite',
          }}
        >
          Content Command Center
        </h1>
      </div>

      {/* Right: Counter with pulsing glow ring */}
      <div className="relative flex items-center gap-2">
        {/* Pulsing glow ring */}
        <div className="relative">
          <motion.div
            className="absolute -inset-1.5 rounded-xl bg-primary/20"
            animate={{ 
              opacity: [0.3, 0.6, 0.3],
              scale: [1, 1.1, 1],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Calendar className="w-4 h-4 text-primary" />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Events:</span>
          <span className="text-lg font-bold text-foreground">
            <CountUp end={eventCount} duration={1} />
          </span>
        </div>
      </div>

      <style>{`
        @keyframes shimmer-text {
          0%, 100% { background-position: -200% 0; }
          50% { background-position: 200% 0; }
        }
      `}</style>
    </motion.div>
  );
}
