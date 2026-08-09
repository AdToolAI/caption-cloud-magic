import { tx } from "@/lib/i18nText";
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
import { Lightbulb, Sparkles, Compass, FileCheck2, Bug, Clock, Timer } from 'lucide-react';
import type { TProductionPlan } from '@/lib/video-composer/briefing/productionPlan';
import { CLIENT_PIPELINE_VERSION } from '@/config/pipelineVersion';

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
    // G8 — denominator counts every fillable prompt slot per scene:
    // anchor, framing, angle, movement, lighting, performance (mimik+gestik
    // +blick+energy = 4), music, dialog, transition, voiceover, textOverlay
    // ≈ 12. With a fully-briefed prompt <10% should read as AI-filled.
    return Math.max(1, (plan.scenes?.length ?? 0) * 12);
  }, [plan]);

  const aiFillPct = Math.min(100, Math.round((aiFilledCount / totalUserFields) * 100));

  const mode = meta?.mode ?? null;
  const research = meta?.research ?? [];
  const fidelity = (meta as any)?.fidelity as
    | { mode: 'literal' | 'auto'; repairedTexts?: number; repairedSpeakers?: number; scenesMatched?: number; scenesInScript?: number }
    | undefined;

  const scriptTiming = (meta as any)?.script_timing as
    | { mode: 'SHOT_MARKERS' | 'SPEAKER_BLOCKS' | 'FREETEXT'; shots: number; source: 'verbatim' | 'briefing' | 'none' }
    | null
    | undefined;
  const scriptTimingActive =
    !!scriptTiming && scriptTiming.mode !== 'FREETEXT' && (scriptTiming.shots ?? 0) > 0;

  const debug = (meta as any)?.debug as Record<string, any> | undefined;
  const canonicalTiming = debug?.canonical_timing as
    | { durationSec?: number; sceneCount?: number; source?: string }
    | undefined;
  const canonicalDuration = typeof canonicalTiming?.durationSec === 'number'
    ? canonicalTiming.durationSec
    : undefined;
  const normalization = debug?.normalization as
    | { totalDurationSec?: number; durationSource?: string; previousTotal?: number; previousSum?: number; consistent?: boolean }
    | undefined;
  const appliedDuration = typeof normalization?.totalDurationSec === 'number'
    ? normalization.totalDurationSec
    : typeof plan.project?.totalDurationSec === 'number'
      ? plan.project.totalDurationSec
      : Math.round((plan.scenes ?? []).reduce((acc, scene) => acc + Number(scene.durationSec || 0), 0) * 10) / 10;
  const canonicalTimingActive = typeof canonicalDuration === 'number'
    && canonicalDuration > 0
    && normalization?.durationSource === 'canonical-briefing'
    && Math.abs(canonicalDuration - appliedDuration) < 0.5;
  const sceneSumTimingActive = !!normalization
    && normalization.durationSource === 'scene-sum'
    && typeof appliedDuration === 'number'
    && appliedDuration > 0
    && (typeof canonicalDuration !== 'number' || Math.abs(canonicalDuration - appliedDuration) >= 0.5);

  const durationExtend = (meta as any)?.duration_auto_extend as
    | Array<{ scene: number; from: number; to: number; speechSec: number }>
    | undefined;
  const extendCount = Array.isArray(durationExtend) ? durationExtend.length : 0;

  const debugEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try { return new URLSearchParams(window.location.search).get('debug') === '1'; }
    catch { return false; }
  }, []);
  // P4: show the debug chip whenever ?debug=1 is set — even if the
  // server did not return a `debug` block — so the client pipeline
  // version is always attributable in bug reports.
  const showDebug = debugEnabled;

  // Nothing meaningful to render → keep the footer minimal.
  if (!mode && !research.length && aiFilledCount === 0 && !fidelity && !scriptTimingActive && !canonicalTimingActive && !sceneSumTimingActive && extendCount === 0 && !showDebug) return null;

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
          {fidelity?.mode === 'literal' && (
            <HoverCard openDelay={120}>
              <HoverCardTrigger asChild>
                <Badge variant="outline" className="border-emerald-400/40 text-emerald-300 gap-1 cursor-help">
                  <FileCheck2 className="h-3 w-3" />
                  {tx({ de: 'Skript 1:1 übernommen', en: 'Script applied 1:1', es: 'Guion aplicado 1:1' })}
                  {(fidelity.repairedTexts ?? 0) + (fidelity.repairedSpeakers ?? 0) > 0 && (
                    <span className="opacity-70">· {(fidelity.repairedTexts ?? 0) + (fidelity.repairedSpeakers ?? 0)} repariert</span>
                  )}
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent side="top" className="w-[320px] text-[11px]">
                <div className="font-medium mb-1">{tx({ de: 'Briefing-Treue (LITERAL)', en: 'Briefing Fidelity (LITERAL)', es: 'Fidelidad de las instrucciones (LITERAL)' })}</div>
                <div className="text-muted-foreground space-y-0.5">
                  <div>{tx({ de: "Szenen im Skript:", en: "Scenes in the script:", es: "Escenas del guión:" })} <span className="text-foreground">{fidelity.scenesInScript ?? 0}</span></div>
                  <div>{tx({ de: "Szenen gematcht:", en: "Scenes matched:", es: "Escenas coincidentes:" })} <span className="text-foreground">{fidelity.scenesMatched ?? 0}</span></div>
                  <div>{tx({ de: 'Dialog-Texte repariert:', en: 'Dialog texts repaired:', es: 'Textos de diálogo reparados:' })} <span className="text-foreground">{fidelity.repairedTexts ?? 0}</span></div>
                  <div>{tx({ de: 'Sprecher neu zugeordnet:', en: 'Speakers reassigned:', es: 'Altavoces reasignados:' })} <span className="text-foreground">{fidelity.repairedSpeakers ?? 0}</span></div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {tx({ de: 'Dein Skript wurde wörtlich übernommen. Die KI hat nur Visuals & Meta ergänzt.', en: 'Your script was taken literally. The AI ​​only added visuals & meta.', es: 'Tu guion fue tomado literalmente. La IA solo agregó elementos visuales y metadatos.' })}
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
          {scriptTimingActive && (
            <HoverCard openDelay={120}>
              <HoverCardTrigger asChild>
                <Badge variant="outline" className="border-sky-400/40 text-sky-300 gap-1 cursor-help">
                  <Clock className="h-3 w-3" />
                  {tx({ de: 'Skript-Timing verwendet', en: 'Script timing used', es: 'Se utilizó el tiempo de guion' })}
                  {/* J7 — chip reflects the ACTUAL rendered scene count (post-reducer),
                      not the raw detector output, so it can never disagree with the sheet. */}
                  <span className="opacity-70">· {plan.scenes?.length ?? 0} {tx({ de: (plan.scenes?.length ?? 0) === 1 ? 'Shot' : 'Shots', en: (plan.scenes?.length ?? 0) === 1 ? 'Shot' : 'Shots', es: (plan.scenes?.length ?? 0) === 1 ? 'Escena' : 'Escenas' })}</span>
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent side="top" className="w-[320px] text-[11px]">
                <div className="font-medium mb-1">{tx({ de: 'Skript gewinnt vor Board-Dauer', en: 'Script wins over board duration', es: 'El guion gana sobre la duración del tablero' })}</div>
                <div className="text-muted-foreground">
                  Dein Skript enthält {scriptTiming!.mode === 'SHOT_MARKERS' ? 'explizite Shot-Marker' : 'strukturierte Sprecher-Blöcke'}.
                  {tx({ de: 'Die im Board eingetragene Gesamtdauer wurde ignoriert und die Szenen folgen dem Skript.', en: 'The total duration entered in the board was ignored and the scenes follow the script.', es: 'Se ignoró la duración total ingresada en el tablero y las escenas siguen el guion.' })}
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
          {canonicalTimingActive && (
            <HoverCard openDelay={120}>
              <HoverCardTrigger asChild>
                <Badge variant="outline" className="border-sky-400/40 text-sky-300 gap-1 cursor-help">
                  <Clock className="h-3 w-3" />
                  {meta?.source === 'local-fallback' ? tx({ de: 'Lokaler Fallback', en: 'Local Fallback', es: 'Reserva local' }) : tx({ de: 'Skript-Dauer verwendet', en: 'Script duration used', es: 'Duración del guion utilizada' })}
                  <span className="opacity-70">· {canonicalDuration}s</span>
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent side="top" className="w-[320px] text-[11px]">
                <div className="font-medium mb-1">{tx({ de: 'Briefing-Dauer gewinnt', en: 'Briefing duration wins', es: 'La duración del briefing gana' })}</div>
                <div className="text-muted-foreground">
                  {tx({ de: 'Die Gesamtdauer wurde direkt aus dem Briefing gelesen und vor dem Board-Wert angewendet.', en: 'The total duration was read directly from the briefing and applied before the board value.', es: 'La duración total se leyó directamente del briefing y se aplicó antes del valor del tablero.' })}
                  {canonicalTiming?.sceneCount ? tx({ de: ` Erkannte Struktur: ${canonicalTiming.sceneCount} Szenen.`, en: `Detected structure: ${canonicalTiming.sceneCount} Scenes.`, es: `Estructura detectada: ${canonicalTiming.sceneCount} Escenas.` }) : ''}
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
          {sceneSumTimingActive && (
            <HoverCard openDelay={120}>
              <HoverCardTrigger asChild>
                <Badge variant="outline" className="border-emerald-400/40 text-emerald-300 gap-1 cursor-help">
                  <Clock className="h-3 w-3" />
                  {tx({ de: 'Szenensumme verwendet', en: 'Scene sum used', es: 'Suma de escenas utilizada' })}
                  <span className="opacity-70">· {appliedDuration}s</span>
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent side="top" className="w-[340px] text-[11px]">
                <div className="font-medium mb-1">{tx({ de: 'Widersprüchliche Dauer repariert', en: 'Conflicting duration repaired', es: 'Duración en conflicto reparada' })}</div>
                <div className="text-muted-foreground">
                  {tx({ de: 'Die sichtbaren Szenendauern wurden als Wahrheit verwendet, weil die erkannte Dauer nicht zur Szenensumme passte.', en: 'The visible scene durations were used as truth because the detected duration did not match the sum of scenes.', es: 'Las duraciones de las escenas visibles se utilizaron como verdad porque la duración detectada no coincidía con la suma de las escenas.' })}
                  {typeof canonicalDuration === 'number' ? ` Ignorierter Wert: ${canonicalDuration}s.` : ''}
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
          {extendCount > 0 && (
            <HoverCard openDelay={120}>
              <HoverCardTrigger asChild>
                <Badge variant="outline" className="border-orange-400/40 text-orange-300 gap-1 cursor-help">
                  <Timer className="h-3 w-3" />
                  {tx({ de: 'Auto-Extend', en: 'Auto-Extend', es: 'Extensión automática' })}
                  <span className="opacity-70">· {extendCount} {tx({ de: extendCount === 1 ? 'Szene' : 'Szenen', en: extendCount === 1 ? 'Scene' : 'Scenes', es: extendCount === 1 ? 'Escena' : 'Escenas' })}</span>
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent side="top" className="w-[340px] text-[11px]">
                <div className="font-medium mb-1">{tx({ de: 'Dauer automatisch verlängert', en: 'Duration automatically extended', es: 'Duración extendida automáticamente' })}</div>
                <div className="text-muted-foreground space-y-0.5">
                  {(durationExtend ?? []).slice(0, 6).map((d, i) => (
                    <div key={i}>
                      S{String(d.scene).padStart(2, '0')}:{' '}
                      <span className="text-foreground">{d.from}s → {d.to}s</span>
                      <span className="opacity-70"> · Sprechdauer ~{d.speechSec}s</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {tx({ de: 'Skript ist länger als die geplante Dauer — die Szene wurde um 1s über die Sprechdauer verlängert, damit die VO nicht abgeschnitten wird.', en: 'The script is longer than the planned duration — the scene was extended by 1s over the speaking duration so that the VO is not cut off.', es: 'El guion es más largo que la duración prevista: la escena se amplió 1 s por encima de la duración del habla para que la voz en off no se corte.' })}
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
          {aiFilledCount > 0 && (
            <HoverCard openDelay={120}>
              <HoverCardTrigger asChild>
                <Badge variant="outline" className="gap-1 cursor-help">
                  <Sparkles className="h-3 w-3 text-amber-300" />
                  {aiFilledCount} {tx({ de: 'AI-Felder ergänzt', en: 'AI fields added', es: 'Campos de IA añadidos' })}
                  <span className="opacity-60">· ~{aiFillPct}%</span>
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent side="top" className="w-[320px] text-[11px]">
                <div className="font-medium mb-1">{tx({ de: "Was hat die KI ergänzt?", en: "What did the AI ​​add?", es: "¿Qué añadió la IA?" })}</div>
                <div className="text-muted-foreground space-y-1">
                  {meta?.aiFilled?.length ? (
                    <div>
                      <span className="text-foreground">{tx({ de: 'Plan-Ebene:', en: 'Plan Level:', es: 'Nivel del plan:' })}</span>{' '}
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
          {showDebug && (
            <HoverCard openDelay={80}>
              <HoverCardTrigger asChild>
                <Badge variant="outline" className="border-fuchsia-400/50 text-fuchsia-300 gap-1 cursor-help">
                  <Bug className="h-3 w-3" />
                  Debug
                  {debug?.passA_model && (
                    <span className="opacity-70">· {String(debug.passA_model).replace('google/gemini-2.5-', 'g25-')}</span>
                  )}
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent side="top" className="w-[380px] text-[11px] font-mono">
                <div className="font-sans font-medium mb-1.5 text-foreground">{tx({ de: 'Parser-Diagnostik', en: 'Parser Diagnostics', es: 'Diagnóstico del analizador' })}</div>
                <div className="space-y-1 text-muted-foreground">
                  <div>
                    <span className="text-foreground">Pass A:</span>{' '}
                    {debug?.passA_model ?? '—'}
                    {debug?.timings?.passA_ms != null && (
                      <span className="opacity-70"> · {debug.timings.passA_ms}ms</span>
                    )}
                    {debug?.passA_error && (
                      <div className="text-rose-300 pl-3 truncate" title={String(debug.passA_error)}>
                        err: {String(debug.passA_error).slice(0, 80)}
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-foreground">Pass B:</span>{' '}
                    {debug?.passB_model ?? '—'}
                    {debug?.timings?.passB_ms != null && (
                      <span className="opacity-70"> · {debug.timings.passB_ms}ms</span>
                    )}
                    {debug?.passB_error && (
                      <div className="text-rose-300 pl-3 truncate" title={String(debug.passB_error)}>
                        err: {String(debug.passB_error).slice(0, 80)}
                      </div>
                    )}
                  </div>
                  {debug?.ensemble_repair && (
                    <div>
                      <span className="text-foreground">Ensemble:</span>{' '}
                      repaired={debug.ensemble_repair.repaired ?? 0}
                      {' · '}required={debug.ensemble_repair.required ?? 0}
                    </div>
                  )}
                  {debug?.strict_cast && (
                    <div>
                      <span className="text-foreground">Strict-Cast:</span>{' '}
                      dropped={debug.strict_cast.dropped ?? 0}
                      {' · '}backfilled={debug.strict_cast.backfilled ?? 0}
                      {' · '}kept={debug.strict_cast.kept ?? 0}
                    </div>
                  )}
                  {debug?.fidelity && (
                    <div>
                      <span className="text-foreground">Fidelity:</span>{' '}
                      mode={debug.fidelity.mode}
                      {' · '}scenes={debug.fidelity.scenesMatched ?? 0}/{debug.fidelity.scenesInScript ?? 0}
                      {' · '}texts={debug.fidelity.repairedTexts ?? 0}
                      {' · '}speakers={debug.fidelity.repairedSpeakers ?? 0}
                    </div>
                  )}
                  <div>
                    <span className="text-foreground">Version:</span>{' '}
                    Client v{CLIENT_PIPELINE_VERSION}
                    {debug?.version != null && (
                      <span className="opacity-70"> · Server v{debug.version}</span>
                    )}
                  </div>
                  {debug?.timings?.total_ms != null && (
                    <div><span className="text-foreground">Total:</span> {debug.timings.total_ms}ms</div>
                  )}
                </div>
                <div className="mt-2 pt-2 border-t border-border/40 text-[10px] font-sans text-muted-foreground">
                  Nur sichtbar mit <code>?debug=1</code>.
                </div>
              </HoverCardContent>
            </HoverCard>
          )}
        </div>
        <span className="text-muted-foreground text-[10px]">
          {tx({ de: '✨ markiert = von der KI auf Basis deines Briefings ergänzt.', en: '✨ marked = added by the AI ​​based on your briefing.', es: '✨ marcado = añadido por la IA basándose en tus instrucciones.' })}
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
