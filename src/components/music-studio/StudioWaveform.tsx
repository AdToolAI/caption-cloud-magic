import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface StudioWaveformProps {
  bars?: number;
  active?: boolean;
  className?: string;
  height?: number;
}

/**
 * Decorative animated waveform — Ableton/Logic-style level meter row.
 * Idle: gentle breathing. Active: taller, faster, more variance.
 */
export function StudioWaveform({ bars = 64, active = false, className, height = 56 }: StudioWaveformProps) {
  // Seeded pseudo-random pattern so bars have consistent character heights
  const seeds = useMemo(() => {
    return Array.from({ length: bars }, (_, i) => {
      const s = Math.sin(i * 12.9898) * 43758.5453;
      return Math.abs(s - Math.floor(s));
    });
  }, [bars]);

  return (
    <div
      className={className}
      style={{ height, display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}
      aria-hidden
    >
      {seeds.map((seed, i) => {
        const base = 0.15 + seed * 0.55;
        const peak = active ? 0.4 + seed * 0.6 : base + 0.15;
        const delay = (i / bars) * 1.2;
        return (
          <motion.span
            key={i}
            style={{
              flex: 1,
              minWidth: 2,
              borderRadius: 999,
              background:
                'linear-gradient(to top, hsl(var(--primary) / 0.25), hsl(var(--primary) / 0.9))',
              transformOrigin: 'center',
              boxShadow: active ? '0 0 8px hsl(var(--primary) / 0.35)' : 'none',
            }}
            animate={{
              scaleY: [base, peak, base],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: active ? 0.9 + seed * 0.6 : 2.2 + seed * 1.4,
              repeat: Infinity,
              ease: 'easeInOut',
              delay,
            }}
            initial={{ scaleY: base, opacity: 0.6 }}
          />
        );
      })}
    </div>
  );
}
