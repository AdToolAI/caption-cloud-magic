/**
 * ConciergeIntroScreen — one-shot cinematic first-login concierge.
 *
 * Mounts globally in App.tsx. Renders only for authenticated users whose
 * `companion_user_preferences.preferences.concierge_completed` is falsy. Asks
 * three questions (learning pace, primary goal, ready?) and then persists the
 * answers via `useCompanionCoach.completeConcierge`. Full-screen curtain-open
 * on entry, curtain-close on finish — GPU-only.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCompanionCoach } from '@/hooks/useCompanionCoach';
import {
  DEFAULT_LEARNING_PACE,
  PERSONA_PROFILES,
  type LearningPace,
} from '@/lib/companion/personaProfiles';
import { Button } from '@/components/ui/button';
import { PersonaSignature } from './PersonaSignature';
import { cn } from '@/lib/utils';

const GOALS: Array<{ id: string; labelDe: string; hintDe: string }> = [
  { id: 'quick_spot', labelDe: 'Schneller Spot', hintDe: 'Ein einzelnes Video, so schnell wie möglich.' },
  { id: 'ensemble', labelDe: 'Ensemble & Serie', hintDe: 'Wiederkehrende Charaktere, konsistente Welt.' },
  { id: 'explore', labelDe: 'Erstmal erkunden', hintDe: 'Nur schauen, was die Plattform kann.' },
];

export function ConciergeIntroScreen() {
  const { user } = useAuth();
  const { conciergeCompleted, completeConcierge } = useCompanionCoach();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [pace, setPace] = useState<LearningPace>(DEFAULT_LEARNING_PACE);
  const [goal, setGoal] = useState<string>('quick_spot');
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);

  // Small delay so the app frame paints first — never blocks initial render.
  useEffect(() => {
    if (!user || conciergeCompleted !== false) return;
    const t = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(t);
  }, [user, conciergeCompleted]);

  const shouldShow = ready && user && conciergeCompleted === false && visible;

  const finish = async () => {
    setVisible(false);
    await completeConcierge({ pace, primaryGoal: goal });
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key="concierge-intro"
          initial={reduce ? { opacity: 0 } : { opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 p-4 backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-label="AdTool Concierge"
        >
          {/* Corner-drapes for the "curtain open" effect */}
          {!reduce && (
            <>
              <motion.div
                initial={{ x: 0 }}
                animate={{ x: '-100%' }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-black to-black/0"
              />
              <motion.div
                initial={{ x: 0 }}
                animate={{ x: '100%' }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-black to-black/0"
              />
            </>
          )}

          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-[#F5C76A]/30 bg-gradient-to-br from-black via-[#0b0910] to-black p-8 shadow-2xl"
          >
            {/* faint film grain */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")",
              }}
            />

            <div className="relative">
              <div className="mb-4 flex items-center gap-3">
                <PersonaSignature pace={pace} size={44} />
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#F5C76A]/80">
                    AdTool Concierge
                  </div>
                  <div className="text-lg font-semibold text-white">Willkommen an Bord.</div>
                </div>
              </div>

              <AnimatePresence mode="wait">
                {step === 0 && (
                  <motion.div
                    key="step-0"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="mb-5 text-sm leading-relaxed text-white/70">
                      Ich begleite dich diskret durch AdTool AI — nur so viel wie du willst.
                      Wähle das Tempo, mit dem ich dir Hinweise geben soll:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.keys(PERSONA_PROFILES) as LearningPace[]).map((id) => {
                        const p = PERSONA_PROFILES[id];
                        const selected = pace === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setPace(id)}
                            className={cn(
                              'group rounded-xl border p-3 text-left transition',
                              selected
                                ? 'border-[#F5C76A]/60 bg-[#F5C76A]/10 shadow-[0_0_0_1px_rgba(245,199,106,0.35)]'
                                : 'border-white/10 bg-white/[0.02] hover:border-white/25',
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <PersonaSignature pace={id} size={30} />
                              <div className="text-sm font-semibold text-white">{p.labelDe}</div>
                            </div>
                            <div className="mt-2 text-[11px] leading-relaxed text-white/55">
                              {p.descriptionDe}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-6 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => setStep(1)}
                        className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90"
                      >
                        Weiter
                      </Button>
                    </div>
                  </motion.div>
                )}

                {step === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="mb-5 text-sm leading-relaxed text-white/70">
                      Was steht als Nächstes an? Ich richte meine Tipps danach aus.
                    </p>
                    <div className="space-y-2">
                      {GOALS.map((g) => {
                        const selected = goal === g.id;
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setGoal(g.id)}
                            className={cn(
                              'w-full rounded-xl border p-3 text-left transition',
                              selected
                                ? 'border-[#F5C76A]/60 bg-[#F5C76A]/10'
                                : 'border-white/10 bg-white/[0.02] hover:border-white/25',
                            )}
                          >
                            <div className="text-sm font-semibold text-white">{g.labelDe}</div>
                            <div className="mt-1 text-[11px] text-white/55">{g.hintDe}</div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-6 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setStep(0)}
                        className="text-xs text-white/50 hover:text-white/80"
                      >
                        zurück
                      </button>
                      <Button
                        size="sm"
                        onClick={() => setStep(2)}
                        className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90"
                      >
                        Weiter
                      </Button>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="mb-5 text-sm leading-relaxed text-white/70">
                      Fertig. Ich melde mich, wenn du ein Studio zum ersten Mal betrittst oder
                      wenn etwas Aufmerksamkeit braucht. Du kannst mich in den Einstellungen
                      jederzeit umstimmen.
                    </p>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center gap-3">
                        <PersonaSignature pace={pace} size={40} />
                        <div className="text-sm text-white/85">
                          <div className="font-medium">{PERSONA_PROFILES[pace].labelDe}</div>
                          <div className="text-[11px] text-white/50">
                            Ziel: {GOALS.find((g) => g.id === goal)?.labelDe}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="text-xs text-white/50 hover:text-white/80"
                      >
                        zurück
                      </button>
                      <Button
                        size="sm"
                        onClick={() => void finish()}
                        className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90"
                      >
                        Loslegen
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
