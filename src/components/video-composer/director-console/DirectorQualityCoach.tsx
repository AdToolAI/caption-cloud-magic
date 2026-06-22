/**
 * DirectorQualityCoach — gold-rimmed score badge + collapsible coach tips.
 *
 * Reads the same `composeFinalPrompt` output the Director Console preview
 * uses, then runs `evaluateSceneQuality` to surface concrete fixes the user
 * can apply in 1-click. Mirrors the Artlist "screenplay scorecard" UX.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Lightbulb, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  composeFinalPrompt,
  type DirectorLanguage,
} from '@/lib/motion-studio/composeFinalPrompt';
import { evaluateSceneQuality, type Severity } from '@/lib/motion-studio/qualityScore';
import { derivePerformanceEntries } from '@/lib/motion-studio/buildPerformanceBlock';
import type { ComposerScene } from '@/types/video-composer';

interface Props {
  scene: Pick<
    ComposerScene,
    | 'aiPrompt'
    | 'directorModifiers'
    | 'shotDirector'
    | 'cinematicPresetSlug'
    | 'audioPlan'
    | 'dialogLockedAt'
    | 'dialogScript'
    | 'characterShot'
    | 'characterShots'
    | 'performance'
  >;
  /** Project cast — used to derive the [4 PERFORMANCE] block for preview/score. */
  characters?: Array<{ id: string; name: string }>;
  language?: DirectorLanguage;
  className?: string;
}


const TONE: Record<Severity, { ring: string; chip: string; icon: string }> = {
  pass: {
    ring: 'border-emerald-400/40',
    chip: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30',
    icon: 'text-emerald-300',
  },
  warn: {
    ring: 'border-amber-400/40',
    chip: 'bg-amber-400/10 text-amber-300 border-amber-400/30',
    icon: 'text-amber-300',
  },
  fail: {
    ring: 'border-rose-500/50',
    chip: 'bg-rose-500/10 text-rose-300 border-rose-500/40',
    icon: 'text-rose-300',
  },
};

function scoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-300';
  if (score >= 65) return 'text-amber-300';
  return 'text-rose-300';
}

const HEADINGS = {
  en: { title: 'Director Score', good: 'Ready for camera', mid: 'Needs polish', bad: 'Director would re-shoot', fix: 'Coach tips' },
  de: { title: 'Director Score', good: 'Drehbereit', mid: 'Braucht Feinschliff', bad: 'Regisseur würde neu drehen', fix: 'Coach-Tipps' },
  es: { title: 'Director Score', good: 'Lista para rodar', mid: 'Requiere pulido', bad: 'Habría que volver a rodar', fix: 'Consejos del coach' },
} as const;

export default function DirectorQualityCoach({ scene, characters, language = 'en', className }: Props) {
  const [open, setOpen] = useState(false);

  const composed = useMemo(
    () =>
      composeFinalPrompt({
        rawPrompt: scene.aiPrompt || '',
        directorModifiers: scene.directorModifiers,
        shotDirector: scene.shotDirector,
        cinematicStylePresetId: scene.cinematicPresetSlug,
        audioPlan: scene.audioPlan,
        performanceEntries: derivePerformanceEntries(scene, characters),
        language,
      }),
    [scene.aiPrompt, scene.directorModifiers, scene.shotDirector, scene.cinematicPresetSlug, scene.audioPlan, scene.performance, characters, language],
  );


  const result = useMemo(
    () =>
      evaluateSceneQuality({
        scene,
        finalPrompt: composed.finalPrompt,
        negativePrompt: composed.negativePrompt || '',
        language,
      }),
    [scene, composed.finalPrompt, composed.negativePrompt, language],
  );

  const L = HEADINGS[language] ?? HEADINGS.en;
  const verdict = result.score >= 85 ? L.good : result.score >= 65 ? L.mid : L.bad;
  const ringColor =
    result.score >= 85 ? 'border-emerald-400/40 shadow-[0_0_24px_-8px_rgba(52,211,153,0.6)]'
    : result.score >= 65 ? 'border-amber-400/40 shadow-[0_0_24px_-8px_rgba(245,199,106,0.55)]'
    : 'border-rose-500/40 shadow-[0_0_24px_-8px_rgba(244,63,94,0.55)]';

  const failCount = result.tips.filter((t) => t.severity === 'fail').length;
  const warnCount = result.tips.filter((t) => t.severity === 'warn').length;
  // Phase E — single coach sentence: surface the most-severe tip in the
  // collapsed header so users see the *one* thing to fix without expanding.
  const topTip =
    result.tips.find((t) => t.severity === 'fail') ??
    result.tips.find((t) => t.severity === 'warn') ??
    null;
  const allClearLabel =
    language === 'de' ? 'Alles bereit — keine offenen Notizen vom Regisseur.'
    : language === 'es' ? 'Todo listo — sin notas pendientes del director.'
    : 'All clear — no open notes from the director.';

  return (
    <div
      className={cn(
        'rounded-xl border bg-gradient-to-b from-background/70 to-background/30 backdrop-blur-sm overflow-hidden',
        ringColor,
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Numeric ring */}
          <div className={cn(
            'h-10 w-10 rounded-full border-2 flex items-center justify-center font-mono text-sm font-bold tabular-nums shrink-0',
            result.score >= 85 ? 'border-emerald-400/60' : result.score >= 65 ? 'border-amber-400/60' : 'border-rose-500/60',
            scoreColor(result.score),
          )}>
            {result.score}
          </div>
          <div className="flex flex-col items-start min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{L.title}</span>
              <span className={cn('text-[10px] font-medium', scoreColor(result.score))}>· {verdict}</span>
            </span>
            {/* One coach sentence — the single most important fix */}
            <span className={cn(
              'text-[11px] leading-snug truncate w-full',
              topTip ? (topTip.severity === 'fail' ? 'text-rose-200/90' : 'text-amber-200/90') : 'text-emerald-300/80',
            )}>
              {topTip ? `${topTip.label} — ${topTip.hint}` : allClearLabel}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {failCount + warnCount > 0 && (
            <Badge
              variant="outline"
              className={cn(
                'h-5 gap-1 text-[10px]',
                failCount > 0
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                  : 'border-amber-400/40 bg-amber-400/10 text-amber-300',
              )}
            >
              {failCount > 0 ? <AlertTriangle className="h-2.5 w-2.5" /> : <Lightbulb className="h-2.5 w-2.5" />}
              {failCount + warnCount}
            </Badge>
          )}
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="px-3 py-3 border-t border-border/30 space-y-2.5">
          {/* Axis chips */}
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(result.axes) as Array<[keyof typeof result.axes, Severity]>).map(([axis, sev]) => (
              <Badge
                key={axis}
                variant="outline"
                className={cn('h-5 text-[10px] capitalize border', TONE[sev].chip)}
              >
                {axis}
              </Badge>
            ))}
          </div>

          {/* Tips */}
          {result.tips.length > 0 ? (
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground pt-1">{L.fix}</div>
          ) : null}
          <ul className="space-y-1.5">
            {result.tips.map((tip, i) => (
              <li
                key={`${tip.axis}-${i}`}
                className={cn(
                  'flex items-start gap-2 rounded-md border px-2 py-1.5 text-[11px] leading-snug',
                  TONE[tip.severity].chip,
                )}
              >
                {tip.severity === 'fail' ? (
                  <AlertTriangle className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', TONE[tip.severity].icon)} />
                ) : (
                  <Lightbulb className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', TONE[tip.severity].icon)} />
                )}
                <div className="flex-1">
                  <div className="font-semibold">{tip.label}</div>
                  <div className="text-foreground/80">{tip.hint}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
