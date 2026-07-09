/**
 * BriefingPlanSummary — sticky "Pre-Apply Summary" footer for the
 * ProductionPlanSheet review step. Surfaces three things at a glance:
 *
 *   1. Briefing-Modus (storytelling / brand / product / educational)
 *      that the parser detected, with a confidence chip.
 *   2. Research-Bullets the AI used to enrich missing fields.
 *   3. Counter of AI-filled fields across all scenes (✨ Sparkle badge)
 *      so creators see how much of the plan is their input vs. AI fill.
 *
 * Lipsync-safety: pure presentation. Reads `plan._meta` only; never
 * touches dialog_shots / syncso_* / composer_scenes.dialog_*.
 */

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Lightbulb, Sparkles, Compass, FileCheck2 } from 'lucide-react';
import type { TProductionPlan } from '@/lib/video-composer/briefing/productionPlan';

interface Props {
  plan: TProductionPlan;
}

const MODE_LABEL: Record<string, string> = {
  storytelling: 'Storytelling',
  brand: 'Brand / Identity',
  product: 'Produkt / SaaS',
  educational: 'Educational',
  other: 'Generisch',
};

export default function BriefingPlanSummary({ plan }: Props) {
  const meta = plan._meta;

  const aiFilledCount = useMemo(() => {
    let n = (meta?.aiFilled?.length ?? 0);
    for (const s of plan.scenes ?? []) {
      const af = (s as any)?._meta?.aiFilled;
      if (Array.isArray(af)) n += af.length;
    }
    return n;
  }, [plan, meta]);

  const totalUserFields = useMemo(() => {
    // Rough denominator: each scene contributes ~6 user-relevant slots
    // (anchor, framing, lighting, performance, music, dialog).
    return Math.max(1, (plan.scenes?.length ?? 0) * 6);
  }, [plan]);

  const aiFillPct = Math.min(100, Math.round((aiFilledCount / totalUserFields) * 100));

  const mode = meta?.mode ?? null;
  const research = meta?.research ?? [];
  const fidelity = (meta as any)?.fidelity as
    | { mode: 'literal' | 'auto'; repairedTexts?: number; repairedSpeakers?: number; scenesMatched?: number; scenesInScript?: number }
    | undefined;

  // Nothing meaningful to render → keep the footer minimal.
  if (!mode && !research.length && aiFilledCount === 0 && !fidelity) return null;

  return (
    <div className="rounded-lg border border-amber-300/30 bg-gradient-to-br from-amber-300/[0.06] to-transparent p-2.5 space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {mode && (
            <Badge variant="outline" className="border-amber-300/40 text-amber-300 gap-1">
              <Compass className="h-3 w-3" />
              {MODE_LABEL[mode] ?? mode}
              {meta?.modeConfidence != null && (
                <span className="opacity-60">· {Math.round(meta.modeConfidence * 100)}%</span>
              )}
            </Badge>
          )}
          {aiFilledCount > 0 && (
            <HoverCard openDelay={120}>
              <HoverCardTrigger asChild>
                <Badge variant="outline" className="gap-1 cursor-help">
                  <Sparkles className="h-3 w-3 text-amber-300" />
                  {aiFilledCount} AI-Felder ergänzt
                  <span className="opacity-60">· ~{aiFillPct}%</span>
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent side="top" className="w-[320px] text-[11px]">
                <div className="font-medium mb-1">Was hat die KI ergänzt?</div>
                <div className="text-muted-foreground space-y-1">
                  {meta?.aiFilled?.length ? (
                    <div>
                      <span className="text-foreground">Plan-Ebene:</span>{' '}
                      {meta.aiFilled.join(', ')}
                    </div>
                  ) : null}
                  {plan.scenes.map((s, i) => {
                    const af = (s as any)?._meta?.aiFilled as string[] | undefined;
                    if (!af?.length) return null;
                    return (
                      <div key={i}>
                        <span className="text-foreground">S{String(s.index).padStart(2, '0')}:</span>{' '}
                        {af.join(', ')}
                      </div>
                    );
                  })}
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
        </div>
        <span className="text-muted-foreground text-[10px]">
          ✨ markiert = von der KI auf Basis deines Briefings ergänzt.
        </span>
      </div>

      {research.length > 0 && (
        <div className="rounded border border-border/40 bg-background/40 p-2 space-y-1">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Lightbulb className="h-3 w-3 text-amber-300" />
            Research / Annahmen ({research.length})
          </div>
          <ul className="space-y-0.5 list-disc list-inside text-[11px] text-foreground/85">
            {research.slice(0, 6).map((r, i) => (
              <li key={i}>
                {r.fact}
                {r.source && <span className="text-muted-foreground"> — {r.source}</span>}
              </li>
            ))}
            {research.length > 6 && (
              <li className="list-none text-muted-foreground italic">
                +{research.length - 6} weitere
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
