/**
 * ConciergeStage — cinematic reveal container for the Concierge card.
 *
 * Three reveal modes chosen from the trigger category:
 *   - whisper   → soft slide+blur-off (route + intent)
 *   - spotlight → curtain wipe with vignette pulse (critical intents)
 *   - ovation   → iris-open + 8-particle gold confetti (milestones)
 *
 * All animations use only transform / opacity / filter to stay on the GPU.
 * `will-change` is added only during animation and cleared afterwards. When
 * `prefers-reduced-motion` is on, every mode collapses to a 200ms fade.
 */
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type RevealMode = 'whisper' | 'spotlight' | 'ovation';

interface Props {
  revealMode: RevealMode;
  accent: 'gold' | 'cyan' | 'amber' | 'violet';
  children: ReactNode;
  /** unique key so remounting swaps the reveal */
  entryKey: string;
}

const ACCENT_HEX: Record<Props['accent'], string> = {
  gold: '#F5C76A',
  cyan: '#60E7FF',
  amber: '#FFB25C',
  violet: '#B191FF',
};

function useRevealVariants(mode: RevealMode, reduce: boolean): Variants {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0.2 } },
      exit: { opacity: 0, transition: { duration: 0.15 } },
    };
  }
  switch (mode) {
    case 'spotlight':
      return {
        initial: { opacity: 0, y: 40, filter: 'blur(6px)' },
        animate: {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          transition: { duration: 0.48, ease: [0.22, 1, 0.36, 1] },
        },
        exit: { opacity: 0, y: 20, transition: { duration: 0.2 } },
      };
    case 'ovation':
      return {
        initial: { opacity: 0, scale: 0.7, y: 24 },
        animate: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: { duration: 0.9, ease: [0.34, 1.4, 0.5, 1] },
        },
        exit: { opacity: 0, scale: 0.95, transition: { duration: 0.25 } },
      };
    case 'whisper':
    default:
      return {
        initial: { opacity: 0, y: 18, filter: 'blur(4px)' },
        animate: {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
        },
        exit: { opacity: 0, y: 10, transition: { duration: 0.18 } },
      };
  }
}

/** Eight-particle gold confetti — lifted, staggered, disposed after 900ms. */
function OvationConfetti({ accent }: { accent: Props['accent'] }) {
  const color = ACCENT_HEX[accent];
  // Fixed offsets so the render is deterministic (no per-mount RNG cost).
  const particles = [
    { x: -80, y: -40, r: 3, d: 0.05 },
    { x: 80, y: -50, r: 2, d: 0.1 },
    { x: -110, y: 10, r: 2.5, d: 0.08 },
    { x: 110, y: 20, r: 3, d: 0.12 },
    { x: -60, y: -80, r: 2, d: 0.15 },
    { x: 60, y: -90, r: 2.5, d: 0.18 },
    { x: -30, y: -110, r: 2, d: 0.22 },
    { x: 30, y: -100, r: 3, d: 0.2 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: p.r * 2,
            height: p.r * 2,
            background: color,
            boxShadow: `0 0 8px ${color}`,
          }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0, 1, 0.6] }}
          transition={{ duration: 0.85, delay: p.d, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  );
}

/** Bottom-anchored light sweep for spotlight mode. */
function SpotlightSweep({ accent }: { accent: Props['accent'] }) {
  const color = ACCENT_HEX[accent];
  return (
    <motion.div
      className="pointer-events-none absolute -inset-x-8 -bottom-8 h-24 rounded-full blur-2xl"
      style={{ background: `radial-gradient(closest-side, ${color}55, transparent 70%)` }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: [0, 0.9, 0.35], scale: 1 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
    />
  );
}

/** Top diagonal shimmer for ovation mode. */
function OvationSweep({ accent }: { accent: Props['accent'] }) {
  const color = ACCENT_HEX[accent];
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left"
      style={{
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
      }}
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0] }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
    />
  );
}

export function ConciergeStage({ revealMode, accent, entryKey, children }: Props) {
  const reduce = useReducedMotion() ?? false;
  const variants = useRevealVariants(revealMode, reduce);
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    setAnimating(true);
    const t = window.setTimeout(() => setAnimating(false), 1000);
    return () => window.clearTimeout(t);
  }, [entryKey]);

  return (
    <motion.div
      key={entryKey}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="relative"
      style={{ willChange: animating ? 'transform, opacity, filter' : 'auto' }}
    >
      {!reduce && revealMode === 'spotlight' && <SpotlightSweep accent={accent} />}
      {!reduce && revealMode === 'ovation' && (
        <>
          <OvationConfetti accent={accent} />
          <OvationSweep accent={accent} />
        </>
      )}
      <div className={cn('relative')}>{children}</div>
    </motion.div>
  );
}
