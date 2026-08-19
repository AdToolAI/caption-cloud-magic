/**
 * ConciergeTipHost — global bottom-left Concierge card.
 *
 * Renders the coach's active tip inside a cinematic ConciergeStage with a
 * per-persona signet. Whisper/spotlight/ovation reveal modes are picked from
 * the trigger category. Idle cost is zero — nothing mounts until a tip fires.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCompanionCoach } from '@/hooks/useCompanionCoach';
import { cn } from '@/lib/utils';
import { ConciergeStage } from './ConciergeStage';
import { PersonaSignature } from './PersonaSignature';

const ACCENT_CLASS: Record<string, string> = {
  gold: 'from-[#F5C76A]/45 via-[#F5C76A]/10 to-transparent border-[#F5C76A]/40',
  cyan: 'from-cyan-400/45 via-cyan-400/10 to-transparent border-cyan-400/40',
  amber: 'from-amber-400/45 via-amber-400/10 to-transparent border-amber-400/40',
  violet: 'from-violet-400/45 via-violet-400/10 to-transparent border-violet-400/40',
};

const ACCENT_BUTTON: Record<string, string> = {
  gold: 'bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90',
  cyan: 'bg-cyan-400 text-black hover:bg-cyan-400/90',
  amber: 'bg-amber-400 text-black hover:bg-amber-400/90',
  violet: 'bg-violet-400 text-black hover:bg-violet-400/90',
};

export function ConciergeTipHost() {
  const { activeTip, dismiss, convert } = useCompanionCoach();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const handleCta = () => {
    if (!activeTip) return;
    void convert();
    if (activeTip.ctaHref) navigate(activeTip.ctaHref);
  };

  return (
    <AnimatePresence>
      {activeTip && (
        <div
          key={activeTip.trigger.key}
          className="fixed bottom-6 left-6 z-[85] w-[22rem] max-w-[calc(100vw-3rem)]"
          role="dialog"
          aria-live="polite"
          aria-label={activeTip.title}
        >
          <ConciergeStage
            entryKey={activeTip.trigger.key}
            revealMode={activeTip.revealMode}
            accent={activeTip.persona.accent}
          >
            <div
              className={cn(
                'relative overflow-hidden rounded-2xl border bg-black/85 backdrop-blur-xl shadow-2xl',
                'bg-gradient-to-br',
                ACCENT_CLASS[activeTip.persona.accent] ?? ACCENT_CLASS.gold,
              )}
            >
              {/* Ambient film-grain wash — 3% opacity, no repaint after mount */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")",
                }}
              />
              <div className="relative flex items-start gap-3 p-5">
                <PersonaSignature pace={activeTip.persona.id} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <motion.h3
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.32, delay: 0.1 }}
                      className="truncate text-sm font-semibold text-white"
                    >
                      {activeTip.title}
                    </motion.h3>
                    <button
                      type="button"
                      onClick={() => void dismiss()}
                      className="rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
                      aria-label="Dismiss tip"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <motion.p
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.32, delay: 0.16 }}
                    className="text-[13px] leading-relaxed text-white/75"
                  >
                    {activeTip.body}
                  </motion.p>
                  {activeTip.cta && (
                    <motion.div
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.32, delay: 0.24 }}
                      className="mt-3 flex items-center gap-2"
                    >
                      <Button
                        size="sm"
                        onClick={handleCta}
                        className={cn(
                          'h-8 px-3 text-xs font-medium',
                          ACCENT_BUTTON[activeTip.persona.accent] ?? ACCENT_BUTTON.gold,
                        )}
                      >
                        {activeTip.cta}
                      </Button>
                      <button
                        type="button"
                        onClick={() => void dismiss()}
                        className="text-[11px] text-white/50 transition hover:text-white/80"
                      >
                        später
                      </button>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </ConciergeStage>
        </div>
      )}
    </AnimatePresence>
  );
}
