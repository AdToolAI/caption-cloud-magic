/**
 * ConciergeTipHost — global floating card that renders the coach's active tip.
 *
 * Mounted once in App.tsx. Subscribes to `useCompanionCoach` and shows an
 * elegant, non-modal card in the bottom-left corner (opposite side from the
 * AI Companion widget). Fully dismissable, respects reduced-motion.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCompanionCoach } from '@/hooks/useCompanionCoach';
import { cn } from '@/lib/utils';

const ACCENT_CLASS: Record<string, string> = {
  gold: 'from-[#F5C76A]/40 via-[#F5C76A]/10 to-transparent border-[#F5C76A]/40',
  cyan: 'from-cyan-400/40 via-cyan-400/10 to-transparent border-cyan-400/40',
  amber: 'from-amber-400/40 via-amber-400/10 to-transparent border-amber-400/40',
  violet: 'from-violet-400/40 via-violet-400/10 to-transparent border-violet-400/40',
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
        <motion.div
          key={activeTip.trigger.key}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-6 left-6 z-[85] w-[22rem] max-w-[calc(100vw-3rem)]"
          role="dialog"
          aria-live="polite"
          aria-label={activeTip.title}
        >
          <div
            className={cn(
              'relative overflow-hidden rounded-2xl border bg-black/85 backdrop-blur-xl shadow-2xl',
              'bg-gradient-to-br',
              ACCENT_CLASS[activeTip.persona.accent] ?? ACCENT_CLASS.gold,
            )}
          >
            <div className="relative flex items-start gap-3 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5C76A]/15 ring-1 ring-[#F5C76A]/30">
                <Sparkles className="h-5 w-5 text-[#F5C76A]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-white">
                    {activeTip.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => void dismiss()}
                    className="rounded-md p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
                    aria-label="Dismiss tip"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[13px] leading-relaxed text-white/75">{activeTip.body}</p>
                {activeTip.cta && (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleCta}
                      className="h-8 bg-[#F5C76A] px-3 text-xs font-medium text-black hover:bg-[#F5C76A]/90"
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
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
