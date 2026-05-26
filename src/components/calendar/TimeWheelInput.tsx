/**
 * TimeWheelInput — Cockpit-style time picker (Bond 2028 design)
 * - Big Playfair HH:MM display with gold glow
 * - Glass steppers for hour / minute (5-min raster)
 * - Quick-chips for common posting times
 * - Hidden native <input type="time"> for a11y / keyboard
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimeWheelInputProps {
  value: string; // "HH:MM"
  onChange: (v: string) => void;
  disabled?: boolean;
  recommended?: string; // e.g. "19:00"
}

const pad = (n: number) => n.toString().padStart(2, '0');
const QUICK_TIMES = ['09:00', '12:00', '17:00', '19:00', '21:00'];

function parse(v: string): { h: number; m: number } {
  const [hh, mm] = (v || '09:00').split(':').map((x) => parseInt(x, 10) || 0);
  return { h: Math.max(0, Math.min(23, hh)), m: Math.max(0, Math.min(59, mm)) };
}

export function TimeWheelInput({ value, onChange, disabled, recommended }: TimeWheelInputProps) {
  const { h, m } = useMemo(() => parse(value), [value]);

  const set = (nh: number, nm: number) => {
    const wrap = (n: number, mod: number) => ((n % mod) + mod) % mod;
    onChange(`${pad(wrap(nh, 24))}:${pad(wrap(nm, 60))}`);
  };

  const stepH = (d: number) => set(h + d, m);
  const stepM = (d: number) => set(h, m + d * 5 - (m % 5) * (d > 0 ? 0 : 1));
  // simpler: snap to 5-min grid then step ±5
  const stepMinute = (d: number) => {
    const snapped = Math.round(m / 5) * 5;
    set(h, snapped + d * 5);
  };

  return (
    <div className="space-y-4">
      {/* Big display */}
      <div className="relative rounded-2xl border border-primary/20 bg-gradient-to-br from-background/60 via-background/40 to-background/60 backdrop-blur-xl p-5 overflow-hidden">
        {/* gold glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(circle at 50% 0%, hsl(var(--primary) / 0.18), transparent 60%)',
          }}
        />
        <div className="relative flex items-center justify-center gap-2 md:gap-4">
          {/* Hour column */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => stepH(1)}
              disabled={disabled}
              className="h-7 w-12 grid place-items-center rounded-lg bg-white/5 hover:bg-primary/15 border border-white/10 hover:border-primary/40 transition-all disabled:opacity-40"
              aria-label="Stunde erhöhen"
            >
              <ChevronUp className="h-4 w-4 text-primary" />
            </button>
            <motion.div
              key={`h-${h}`}
              initial={{ y: -6, opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="font-serif tabular-nums text-5xl md:text-6xl leading-none text-foreground"
              style={{
                fontFamily: '"Playfair Display", serif',
                textShadow: '0 0 24px hsl(var(--primary) / 0.35)',
              }}
            >
              {pad(h)}
            </motion.div>
            <button
              type="button"
              onClick={() => stepH(-1)}
              disabled={disabled}
              className="h-7 w-12 grid place-items-center rounded-lg bg-white/5 hover:bg-primary/15 border border-white/10 hover:border-primary/40 transition-all disabled:opacity-40"
              aria-label="Stunde verringern"
            >
              <ChevronDown className="h-4 w-4 text-primary" />
            </button>
          </div>

          {/* Colon */}
          <div
            className="font-serif text-5xl md:text-6xl leading-none text-primary/80 -mt-1 select-none"
            style={{ fontFamily: '"Playfair Display", serif' }}
          >
            :
          </div>

          {/* Minute column */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => stepMinute(1)}
              disabled={disabled}
              className="h-7 w-12 grid place-items-center rounded-lg bg-white/5 hover:bg-primary/15 border border-white/10 hover:border-primary/40 transition-all disabled:opacity-40"
              aria-label="Minute erhöhen"
            >
              <ChevronUp className="h-4 w-4 text-primary" />
            </button>
            <motion.div
              key={`m-${m}`}
              initial={{ y: -6, opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.18 }}
              className="font-serif tabular-nums text-5xl md:text-6xl leading-none text-foreground"
              style={{
                fontFamily: '"Playfair Display", serif',
                textShadow: '0 0 24px hsl(var(--primary) / 0.35)',
              }}
            >
              {pad(m)}
            </motion.div>
            <button
              type="button"
              onClick={() => stepMinute(-1)}
              disabled={disabled}
              className="h-7 w-12 grid place-items-center rounded-lg bg-white/5 hover:bg-primary/15 border border-white/10 hover:border-primary/40 transition-all disabled:opacity-40"
              aria-label="Minute verringern"
            >
              <ChevronDown className="h-4 w-4 text-primary" />
            </button>
          </div>
        </div>

        {/* Recommended badge */}
        {recommended && (
          <div className="relative mt-3 flex items-center justify-center">
            <button
              type="button"
              onClick={() => onChange(recommended)}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] uppercase tracking-wider border border-cyan-400/30 bg-cyan-400/5 text-cyan-200 hover:bg-cyan-400/10 transition-all"
            >
              <Sparkles className="h-3 w-3" />
              Empfohlen: {recommended}
            </button>
          </div>
        )}
      </div>

      {/* Quick chips */}
      <div className="flex flex-wrap gap-2 justify-center">
        {QUICK_TIMES.map((q) => {
          const active = q === value;
          return (
            <button
              key={q}
              type="button"
              onClick={() => onChange(q)}
              disabled={disabled}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium tabular-nums border transition-all',
                active
                  ? 'bg-primary/15 border-primary/60 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.35)]'
                  : 'bg-white/5 border-white/10 text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {q}
            </button>
          );
        })}
      </div>

      {/* Accessible hidden native input */}
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="sr-only"
        aria-label="Uhrzeit"
        tabIndex={-1}
      />
    </div>
  );
}
