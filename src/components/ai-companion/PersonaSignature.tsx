/**
 * PersonaSignature — animated persona signet for the Concierge card.
 *
 * Four inline SVG signets, one per learning pace. Each animates ONCE on mount
 * (via framer-motion), then rests statically. No loops, no filters — pure
 * transform/opacity so the GPU handles everything.
 */
import { motion, useReducedMotion } from 'framer-motion';
import type { LearningPace } from '@/lib/companion/personaProfiles';

interface Props {
  pace: LearningPace;
  size?: number;
}

export function PersonaSignature({ pace, size = 40 }: Props) {
  const reduce = useReducedMotion();
  const t = (v: number) => (reduce ? 0 : v);

  const wrapClass =
    'relative flex items-center justify-center rounded-xl bg-black/40 ring-1 ring-white/10';

  switch (pace) {
    case 'espresso':
      return (
        <div className={wrapClass} style={{ width: size, height: size }}>
          <svg viewBox="0 0 40 40" width={size * 0.65} height={size * 0.65}>
            <motion.line
              x1="20"
              y1="8"
              x2="20"
              y2="32"
              stroke="hsl(190 90% 60%)"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: t(0.5), ease: 'easeOut' }}
            />
            <motion.circle
              cx="20"
              cy="20"
              r="3"
              fill="hsl(190 90% 60%)"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.4, 1] }}
              transition={{ duration: t(0.45), delay: t(0.25) }}
            />
          </svg>
        </div>
      );

    case 'guided':
      return (
        <div className={wrapClass} style={{ width: size, height: size }}>
          <svg viewBox="0 0 40 40" width={size * 0.7} height={size * 0.7}>
            <circle cx="20" cy="20" r="14" stroke="hsl(38 90% 60%)" strokeWidth="1.2" fill="none" opacity="0.4" />
            <motion.g
              initial={{ rotate: -140 }}
              animate={{ rotate: 45 }}
              transition={{ duration: t(0.8), ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: '20px 20px' }}
            >
              <polygon points="20,7 22,20 20,22 18,20" fill="hsl(38 95% 65%)" />
              <polygon points="20,33 22,20 20,18 18,20" fill="hsl(38 40% 40%)" />
            </motion.g>
            <circle cx="20" cy="20" r="1.6" fill="hsl(38 95% 70%)" />
          </svg>
        </div>
      );

    case 'playful':
      return (
        <div className={wrapClass} style={{ width: size, height: size }}>
          <svg viewBox="0 0 40 40" width={size * 0.72} height={size * 0.72}>
            <motion.path
              d="M20 6 L22 18 L34 20 L22 22 L20 34 L18 22 L6 20 L18 18 Z"
              fill="hsl(270 85% 68%)"
              initial={{ scale: 0, rotate: -25 }}
              animate={{ scale: [0, 1.15, 1], rotate: 0 }}
              transition={{ duration: t(0.55), ease: [0.34, 1.56, 0.64, 1] }}
              style={{ transformOrigin: '20px 20px' }}
            />
            <motion.circle
              cx="30"
              cy="10"
              r="1.5"
              fill="hsl(270 85% 78%)"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: t(0.3), delay: t(0.4) }}
            />
          </svg>
        </div>
      );

    case 'balanced':
    default:
      return (
        <div className={wrapClass} style={{ width: size, height: size }}>
          <svg viewBox="0 0 40 40" width={size * 0.7} height={size * 0.7}>
            <motion.g
              initial={{ rotate: -30, scale: 0.4, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ duration: t(0.6), ease: [0.22, 1, 0.36, 1] }}
              style={{ transformOrigin: '20px 20px' }}
            >
              <path
                d="M20 4 L23 17 L36 20 L23 23 L20 36 L17 23 L4 20 L17 17 Z"
                fill="hsl(43 78% 68%)"
              />
              <circle cx="30" cy="10" r="1.6" fill="hsl(43 90% 80%)" />
              <circle cx="10" cy="30" r="1" fill="hsl(43 60% 55%)" />
            </motion.g>
          </svg>
        </div>
      );
  }
}
