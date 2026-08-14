import { tx } from "@/lib/i18nText";
/**
 * ProductionWarRoom — fullscreen 2028-style overlay shown while the
 * briefing-deep-parse Edge Function runs (~60-120s). Displays live News
 * Radar items and trending tags so the wait feels productive, not blocking.
 *
 * Lip-Sync safety: this component is pure UI — it never touches scenes,
 * dialog_shots, or any pipeline state.
 */

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, Radio, TrendingUp, ShieldCheck, X } from 'lucide-react';
import { useNewsRadar } from '@/hooks/useNewsRadar';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  /** Overall progress 0..100. Stays at 95 while waiting, jumps to 100 on success. */
  progress: number;
  /** Phase label, e.g. "Pass A · Briefing → Manifest" */
  phaseLabel: string;
  /** Which pass is active. */
  phase: 'A' | 'B' | 'done';
  onCancel?: () => void;
}

const TRENDING_TAGS = [
  { tag: '#ShortFormStorytelling', delta: '↑' },
  { tag: '#LipSyncReels', delta: '↑↑' },
  { tag: 'AI-Avatar-Ads', delta: '↑↑↑' },
  { tag: '#CinematicCuts', delta: '↑' },
  { tag: '#FounderContent', delta: '↑↑' },
  { tag: '#HookFirst', delta: '↑↑↑' },
];

const PRO_TIPS = [
  tx({ de: 'Hooks unter 1.5s halten die ersten 3s der Watch-Time stabil.', en: 'Hooks under 1.5s keep the first 3 seconds of the watch time stable.', es: 'Los ganchos de menos de 1,5 s mantienen estables los primeros 3 segundos del tiempo de visualización.' }),
  tx({ de: 'Die Lippensynchronisation läuft auf echten Szenen — kein Avatar-Brustbild mehr.', en: 'Lip-sync runs on real scenes — no more avatar busts.', es: 'La sincronización labial funciona sobre escenas reales, sin bustos de avatar.' }),
  tx({ de: 'Brand-Charaktere mit Identity-Card sind über alle Provider konsistent.', en: 'Brand characters with Identity-Card are consistent across all providers.', es: 'Los personajes de marca con Identity-Card son consistentes en todos los proveedores.' }),
  tx({ de: 'Negative-Prompts werden auf Szenen-Ebene global injiziert.', en: 'Negative prompts are globally injected at the scene level.', es: 'Los prompts negativos se inyectan globalmente a nivel de escena.' }),
  tx({ de: 'Lip-Sync-aktive Szenen werden vom Plan niemals überschrieben.', en: 'Lip-sync active scenes are never overwritten by the plan.', es: 'Las escenas con sincronización labial activa nunca son sobrescritas por el plan.' }),
];

export default function ProductionWarRoom({ open, progress, phaseLabel, phase, onCancel }: Props) {
  const { news } = useNewsRadar();
  const [newsIdx, setNewsIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Reset timers when opened.
  useEffect(() => {
    if (!open) return;
    setElapsed(0);
    setNewsIdx(0);
    setTipIdx(0);
    const t = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [open]);

  // News autoplay every 4s.
  useEffect(() => {
    if (!open || news.length === 0) return;
    const t = window.setInterval(() => setNewsIdx((i) => (i + 1) % news.length), 4000);
    return () => window.clearInterval(t);
  }, [open, news.length]);

  // Tip autoplay every 6s.
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setTipIdx((i) => (i + 1) % PRO_TIPS.length), 6000);
    return () => window.clearInterval(t);
  }, [open]);

  const mmss = useMemo(() => {
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [elapsed]);

  // Two-phase bars — Pass A 0..60%, Pass B 60..100%.
  const passA = phase === 'A' ? Math.min(progress / 0.6, 99) : 100;
  const passB = phase === 'A' ? 0 : phase === 'done' ? 100 : Math.max(0, (progress - 60) / 0.4);

  return (
    <Dialog open={open} onOpenChange={() => { /* not dismissable via overlay */ }}>
      <DialogContent
        className="max-w-5xl border-amber-300/30 bg-gradient-to-br from-black via-[#0a0a14] to-[#050816] p-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="relative border-b border-amber-300/20 p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,199,106,0.08),transparent_60%)] pointer-events-none" />
          <div className="relative flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-amber-300/70">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
                Production War Room
              </div>
              <h2 className="mt-2 font-serif text-2xl text-amber-100">
                {tx({ de: "Briefing wird zum Drehplan", en: "Turning the briefing into a shooting plan", es: "El briefing se convierte en plan de rodaje" })}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                {tx({ de: "Die KI analysiert dein vollständiges Briefing in zwei Pässen, extrahiert Szenen, Cast, Voice & Captions und legt einen editierbaren Plan an. Qualität geht vor Tempo.", en: "The AI analyzes your full briefing in two passes, extracts scenes, cast, voice & captions and creates an editable plan. Quality over speed.", es: "La IA analiza tu briefing completo en dos pasadas, extrae escenas, reparto, voz y subtítulos, y crea un plan editable. La calidad antes que la velocidad." })}
              </p>
            </div>
            <div className="text-right text-[11px] font-mono text-amber-300/80">
              <div>{mmss} / ~02:00</div>
              <div className="flex items-center gap-1 mt-1 text-emerald-400/80">
                <ShieldCheck className="h-3 w-3" /> {tx({ de: "Lip-Sync sicher", en: "Lip-sync safe", es: "Sincronización labial segura" })}
              </div>
              {onCancel && phase !== 'done' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 h-7 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={onCancel}
                >
                  <X className="h-3 w-3 mr-1" /> {tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Progress phases */}
        <div className="px-6 pt-5 space-y-3">
          <ProgressRow
            label={tx({ de: "Pass A · Briefing → Manifest", en: "Pass A · Briefing → Manifest", es: "Pase A · Briefing → Manifiesto" })}
            value={passA}
            active={phase === 'A'}
            done={phase !== 'A'}
          />
          <ProgressRow
            label={tx({ de: "Pass B · Cast & Locations auflösen", en: "Pass B · Resolving cast & locations", es: "Pase B · Resolviendo reparto y ubicaciones" })}
            value={passB}
            active={phase === 'B'}
            done={phase === 'done'}
          />
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-amber-300" />
            {phaseLabel}
          </div>
        </div>

        {/* Bento — News + Trends */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
          <div className="rounded-xl border border-amber-300/15 bg-white/[0.02] p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-amber-300/70 mb-3">
              <Radio className="h-3 w-3" /> {tx({ de: "News Radar", en: "News Radar", es: "Radar de noticias" })}
            </div>
            <div className="space-y-2 min-h-[120px]">
              {news.slice(0, 6).map((n, i) => (
                <div
                  key={`${n.headline}-${i}`}
                  className={`text-xs transition-all duration-500 ${
                    i === newsIdx % Math.max(news.length, 1)
                      ? 'opacity-100 text-amber-100 translate-x-0'
                      : 'opacity-40 text-muted-foreground'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wide text-amber-300/60 mr-2">
                    {n.source}
                  </span>
                  {n.headline}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-cyan-300/15 bg-white/[0.02] p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-cyan-300/70 mb-3">
              <TrendingUp className="h-3 w-3" /> {tx({ de: "Trend Radar", en: "Trend Radar", es: "Radar de tendencias" })}
            </div>
            <div className="space-y-2">
              {TRENDING_TAGS.map((t) => (
                <div key={t.tag} className="flex items-center justify-between text-xs">
                  <span className="text-cyan-100/80">{t.tag}</span>
                  <span className="font-mono text-emerald-400/80">{t.delta}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pro tip */}
        <div className="px-6 pb-5">
          <div className="rounded-lg border border-amber-300/10 bg-amber-300/[0.03] p-3 text-[11px] italic text-amber-100/70 transition-all duration-500">
{tx({ de: `„Während wir deinen Plan erstellen — ${PRO_TIPS[tipIdx]}"`, en: `"While we build your plan — ${PRO_TIPS[tipIdx]}"`, es: `"Mientras creamos tu plan — ${PRO_TIPS[tipIdx]}"` })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProgressRow({
  label, value, active, done,
}: { label: string; value: number; active: boolean; done: boolean }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className={done ? 'text-emerald-300' : active ? 'text-amber-200' : 'text-muted-foreground'}>
          {done ? '✓ ' : active ? '▸ ' : '◦ '}{label}
        </span>
        <span className="font-mono text-muted-foreground">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className={`h-full transition-all duration-700 ease-out ${
            done
              ? 'bg-gradient-to-r from-emerald-400/60 to-emerald-300'
              : 'bg-gradient-to-r from-amber-400/60 to-amber-300'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
