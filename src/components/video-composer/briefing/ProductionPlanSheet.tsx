/**
 * ProductionPlanSheet — the editable "Drehbuch"-Formular shown after the
 * deep-parser returns. The user can correct cast/location mappings, tweak
 * scene fields, then apply the plan to the storyboard.
 *
 * Lipsync safety: this UI displays — but never directly writes to —
 * lipsync DB tables. Apply runs through `useApplyProductionPlan` which
 * itself respects the protection filter.
 */

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Shield, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useUnifiedMentionLibrary } from '@/hooks/useUnifiedMentionLibrary';
import { useApplyProductionPlan } from '@/hooks/useApplyProductionPlan';
import { ProductionPlan, type TProductionPlan } from '@/lib/video-composer/briefing/productionPlan';
import { extractFunctionsErrorDetails } from '@/lib/functionsError';
import type {
  ComposerScene,
  AssemblyConfig,
  ComposerBriefing,
} from '@/types/video-composer';

type Step = 'paste' | 'parsing' | 'review';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string | undefined;
  language: string;
  currentScenes: ComposerScene[];
  currentAssembly: AssemblyConfig | undefined;
  currentBriefing: ComposerBriefing;
  onUpdateBriefing: (patch: Partial<ComposerBriefing>) => void;
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  onApplyAssembly: (next: AssemblyConfig) => void;
  onApplied?: () => void;
  /**
   * Pre-loaded plan from the War Room flow. When set, the sheet opens
   * directly on the review step — the legacy paste-and-parse UI is
   * skipped. Used by the Briefing → Storyboard auto-analyse handoff.
   */
  initialPlan?: TProductionPlan | null;
}

export default function ProductionPlanSheet({
  open, onOpenChange,
  projectId, language,
  currentScenes, currentAssembly, currentBriefing,
  onUpdateBriefing, onUpdateScenes, onApplyAssembly,
  onApplied,
  initialPlan,
}: Props) {
  const [step, setStep] = useState<Step>(initialPlan ? 'review' : 'paste');
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<TProductionPlan | null>(initialPlan ?? null);
  const [progress, setProgress] = useState<'A' | 'B' | null>(null);
  const [progressLabel, setProgressLabel] = useState('');
  const { characters, locations } = useUnifiedMentionLibrary();
  const applyPlan = useApplyProductionPlan();
  const [applying, setApplying] = useState(false);

  // When a new initialPlan arrives (subsequent re-opens), refresh local state.
  useEffect(() => {
    if (initialPlan) {
      setPlan(initialPlan);
      setStep('review');
    }
  }, [initialPlan]);

  const charOptions = useMemo(
    () => (characters ?? []).map((c: any) => ({ id: c.id, name: c.name })),
    [characters],
  );
  const locOptions = useMemo(
    () => (locations ?? []).map((l: any) => ({ id: l.id, name: l.name })),
    [locations],
  );

  // Identify which existing scenes are lipsync-protected (display only).
  const protectedSceneIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of currentScenes) {
      const a = s as any;
      if (
        (s.clipStatus && s.clipStatus !== 'pending') ||
        s.clipUrl ||
        a.lipSyncStatus ||
        a.dialogLockedAt ||
        a.lockReferenceUrl
      ) set.add(s.id);
    }
    return set;
  }, [currentScenes]);

  useEffect(() => {
    if (!open) {
      // Reset after closing.
      setTimeout(() => {
        setStep('paste');
        setText('');
        setPlan(null);
        setProgress(null);
      }, 200);
    }
  }, [open]);

  const handleParse = async () => {
    const briefing = text.trim();
    if (briefing.length < 40) {
      toast({
        title: 'Briefing zu kurz',
        description: 'Mindestens ein paar Sätze einfügen.',
        variant: 'destructive',
      });
      return;
    }
    setStep('parsing');
    setProgress('A');
    setProgressLabel('Pass A · Strukturextraktion');

    // Fake progress switch so the user sees the 2 phases moving.
    const phaseTimer = setTimeout(() => {
      setProgress('B');
      setProgressLabel('Pass B · Validierung & Resolver');
    }, 30_000);

    try {
      const { data, error } = await supabase.functions.invoke('briefing-deep-parse', {
        body: { briefing, projectId, language },
      });
      clearTimeout(phaseTimer);
      if (error) throw error;
      const parsed = ProductionPlan.safeParse(data?.plan);
      if (!parsed.success) {
        console.warn('[ProductionPlanSheet] plan validation failed', parsed.error);
        throw new Error('Plan-Validierung fehlgeschlagen');
      }
      setPlan(parsed.data);
      setStep('review');
    } catch (e: any) {
      clearTimeout(phaseTimer);
      const details = await extractFunctionsErrorDetails(e);
      const msg = details.message || 'Deep-Parse fehlgeschlagen';
      const status = details.status;
      console.error('[ProductionPlanSheet] deep-parse failed', { status, msg, body: details.body });
      toast({
        title: 'Briefing konnte nicht verarbeitet werden',
        description: status === 402 || /402/.test(msg) ? 'Keine AI-Credits mehr.'
          : status === 429 || /429/.test(msg) ? 'Zu viele Anfragen — bitte kurz warten.'
          : status ? `${status}: ${msg}` : msg,
        variant: 'destructive',
      });
      setStep('paste');
      setProgress(null);
    }
  };

  const handleApply = async () => {
    if (!plan) return;
    setApplying(true);
    try {
      const result = await applyPlan({
        plan,
        projectId,
        language,
        currentScenes,
        currentAssembly,
        currentBriefing,
        onUpdateBriefing,
        onUpdateScenes,
        onApplyAssembly,
      });
      toast({
        title: 'Plan übernommen',
        description: `${result.scenesNew} neu · ${result.scenesReplaced} ersetzt · ${result.scenesProtected} geschützt`,
      });
      onApplied?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Plan konnte nicht angewendet werden',
        description: e?.message ?? String(e),
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  // ── Plan editing ────────────────────────────────────────────────────────
  const updateScene = (index: number, patch: Partial<TProductionPlan['scenes'][number]>) => {
    setPlan((p) => p && {
      ...p,
      scenes: p.scenes.map((s) => (s.index === index ? { ...s, ...patch } : s)),
    });
  };
  const updateSceneCastChar = (sceneIndex: number, castIdx: number, characterId: string | null) => {
    setPlan((p) => p && {
      ...p,
      scenes: p.scenes.map((s) => {
        if (s.index !== sceneIndex) return s;
        const cast = [...(s.cast ?? [])];
        const c = cast[castIdx];
        if (!c) return s;
        const matched = charOptions.find((x) => x.id === characterId);
        cast[castIdx] = {
          ...c,
          characterId,
          characterName: matched?.name ?? c.characterName,
        };
        return { ...s, cast };
      }),
    });
  };
  const updateSceneLocation = (sceneIndex: number, locationId: string | null) => {
    setPlan((p) => p && {
      ...p,
      scenes: p.scenes.map((s) => {
        if (s.index !== sceneIndex) return s;
        const matched = locOptions.find((x) => x.id === locationId);
        return {
          ...s,
          location: s.location
            ? { ...s.location, locationId, locationName: matched?.name ?? s.location.locationName }
            : (matched ? { mentionKey: matched.name, locationId, locationName: matched.name } : s.location),
        };
      }),
    });
  };

  const totalPlanSec = useMemo(
    () => (plan?.scenes ?? []).reduce((a, s) => a + Number(s.durationSec || 0), 0),
    [plan],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-hidden flex flex-col p-4 gap-3">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-amber-300" />
            Production Plan — Briefing analysieren & übernehmen
          </DialogTitle>
          <DialogDescription className="text-xs">
            Editierbarer Drehplan aus deinem Briefing. Bereits gerenderte oder Lip-Sync-aktive Szenen werden nie überschrieben.
          </DialogDescription>
        </DialogHeader>

        {step === 'paste' && (
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Füge dein komplettes Briefing ein.\nAuch lang ok — Tabellen, VO-Skript, Voice-Settings, Captions, Negative Prompt.\nDie KI extrahiert deterministisch alle Felder.`}
              className="flex-1 min-h-[320px] font-mono text-xs"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {text.length.toLocaleString()} Zeichen ·
                ~{Math.ceil(text.length / 4).toLocaleString()} Tokens
                {text.length > 120_000 && <span className="text-destructive ml-2">— zu lang (max ~120k)</span>}
              </span>
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3" /> Lip-Sync-Pipeline geschützt
              </span>
            </div>
          </div>
        )}

        {step === 'parsing' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-amber-300" />
            <div className="text-sm font-medium">{progressLabel}</div>
            <div className="text-xs text-muted-foreground max-w-md text-center">
              Die KI liest dein Briefing in zwei Durchgängen. Das kann 1–2 Minuten dauern —
              Qualität geht vor Geschwindigkeit.
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant={progress === 'A' ? 'default' : 'outline'}>A · Extraktion</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant={progress === 'B' ? 'default' : 'outline'}>B · Resolver</Badge>
            </div>
          </div>
        )}

        {step === 'review' && plan && (
          <ScrollArea className="flex-1 min-h-0 pr-3">
            <div className="space-y-3">
              {/* Projekt */}
              <SectionCard title="Projekt">
                <Row label="Name" value={plan.project?.name} />
                <Row label="Format" value={plan.project?.aspectRatio} />
                <Row label="FPS" value={plan.project?.fps?.toString()} />
                <Row label="Gesamtdauer" value={plan.project?.totalDurationSec ? `${plan.project.totalDurationSec}s` : undefined} />
                <Row label="Plattformen" value={plan.project?.platforms?.join(', ')} />
                <Row
                  label="Summe Szenen"
                  value={`${totalPlanSec}s (${plan.scenes.length} Szenen)`}
                  highlight={plan.project?.totalDurationSec ? totalPlanSec !== plan.project.totalDurationSec : false}
                />
              </SectionCard>

              {/* Szenen */}
              <SectionCard title={`Szenen (${plan.scenes.length})`}>
                {plan.scenes.length === 0 ? (
                  <div className="rounded border border-amber-300/40 bg-amber-300/[0.05] p-4 text-xs space-y-2">
                    <div className="font-medium text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Briefing zu dünn — keine Szenen geplant
                    </div>
                    <div className="text-muted-foreground">
                      Bitte zurück zum Briefing gehen und mindestens Produktname + 1–2 USPs oder
                      eine Szenenbeschreibung ergänzen. Optional ein oder mehrere Charaktere im
                      Briefing auswählen — die KI plant dann automatisch ein vollständiges Drehbuch.
                    </div>
                    <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
                      Zurück zu Briefing
                    </Button>
                  </div>
                ) : (
                <div className="space-y-3">
                  {plan.scenes.map((s) => (
                    <div key={s.index} className="rounded border border-border/40 p-3 space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">S{String(s.index).padStart(2, '0')}</Badge>
                        <span className="font-medium">{s.label ?? s.beat ?? '—'}</span>
                        <Badge variant="secondary" className="text-[10px] ml-auto">{s.engine ?? 'auto'}</Badge>
                        {s.lipSync && (
                          <Badge variant="outline" className="text-[10px] border-amber-300/40 text-amber-300">
                            Lip-Sync
                          </Badge>
                        )}
                        <span className="text-muted-foreground">{s.durationSec}s</span>
                      </div>

                      {s.voiceover?.text && (
                        <div className="italic text-muted-foreground">
                          "{s.voiceover.text.slice(0, 200)}{s.voiceover.text.length > 200 ? '…' : ''}"
                        </div>
                      )}

                      {/* Director's vision — anchor prompt (the scene itself) */}
                      {s.anchorPromptEN && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Szene (Director's Vision)</Label>
                          <div className="rounded border border-amber-300/20 bg-amber-300/[0.03] p-2 text-[11px] text-foreground/90">
                            {s.anchorPromptEN}
                          </div>
                        </div>
                      )}

                      {/* Performance: Mimik / Gestik / Blick / Energy */}
                      {s.performance && (s.performance.mimik || s.performance.gestik || s.performance.blick || s.performance.energy) && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Performance</Label>
                          <div className="flex flex-wrap gap-1">
                            {s.performance.mimik && <Badge variant="outline" className="text-[10px]">Mimik: {s.performance.mimik}</Badge>}
                            {s.performance.gestik && <Badge variant="outline" className="text-[10px]">Gestik: {s.performance.gestik}</Badge>}
                            {s.performance.blick && <Badge variant="outline" className="text-[10px]">Blick: {s.performance.blick}</Badge>}
                            {s.performance.energy != null && <Badge variant="outline" className="text-[10px]">Energy: {s.performance.energy}/5</Badge>}
                          </div>
                        </div>
                      )}

                      {/* Dialog turns (multi-speaker, lipsync-ready) */}
                      {(s.dialogTurns ?? []).length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Dialog ({s.dialogTurns!.length} Turn{s.dialogTurns!.length === 1 ? '' : 's'})
                          </Label>
                          <div className="rounded border border-amber-300/20 bg-amber-300/[0.04] p-2 space-y-1 font-mono text-[11px]">
                            {s.dialogTurns!.map((t, i) => (
                              <div key={i}>
                                <span className="text-amber-300">
                                  {t.speakerMentionKey.replace(/^@/, '').toUpperCase()}
                                  {t.mood ? ` — ${t.mood.toUpperCase()}` : ''}:
                                </span>{' '}
                                <span className="text-muted-foreground">{t.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Stage-2 plan extras: brollHints / brandAnchor / continuity / music / per-scene negative */}
                      {(s.brollHints?.length || s.brandAnchor || s.musicCue || s.continuityHint || s.negativePromptScene) && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Plan-Extras</Label>
                          <div className="flex flex-wrap gap-1">
                            {(s.brollHints ?? []).map((h, i) => (
                              <Badge key={`br-${i}`} variant="outline" className="text-[10px]">B-Roll: {h}</Badge>
                            ))}
                            {s.brandAnchor?.logoEndcard && (
                              <Badge variant="outline" className="text-[10px] border-amber-300/40 text-amber-300">Logo-Endcard</Badge>
                            )}
                            {s.brandAnchor?.primaryColorOverride && (
                              <Badge variant="outline" className="text-[10px]">Brand-Color: {s.brandAnchor.primaryColorOverride}</Badge>
                            )}
                            {s.brandAnchor?.fontOverride && (
                              <Badge variant="outline" className="text-[10px]">Font: {s.brandAnchor.fontOverride}</Badge>
                            )}
                            {s.musicCue?.energy && (
                              <Badge variant="outline" className="text-[10px]">♪ {s.musicCue.energy}{s.musicCue.marker ? ` · ${s.musicCue.marker}` : ''}</Badge>
                            )}
                            {s.continuityHint && (
                              <Badge variant="outline" className="text-[10px]">Continuity: {s.continuityHint}</Badge>
                            )}
                            {s.negativePromptScene && (
                              <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">--no {s.negativePromptScene.slice(0, 60)}{s.negativePromptScene.length > 60 ? '…' : ''}</Badge>
                            )}
                          </div>
                          {s.brandAnchor?.note && (
                            <div className="text-[11px] italic text-muted-foreground">Brand-Note: {s.brandAnchor.note}</div>
                          )}
                          {s.musicCue?.note && (
                            <div className="text-[11px] italic text-muted-foreground">Music: {s.musicCue.note}</div>
                          )}
                        </div>
                      )}


                      {s.shotDirector && (
                        <div className="flex flex-wrap gap-1">
                          {s.shotDirector.framing && <Badge variant="secondary" className="text-[10px]">{s.shotDirector.framing}</Badge>}
                          {s.shotDirector.angle && <Badge variant="secondary" className="text-[10px]">{s.shotDirector.angle}</Badge>}
                          {s.shotDirector.movement && <Badge variant="secondary" className="text-[10px]">{s.shotDirector.movement}</Badge>}
                          {s.shotDirector.lighting && <Badge variant="secondary" className="text-[10px]">{s.shotDirector.lighting}</Badge>}
                        </div>
                      )}

                      {/* Cast resolver */}
                      {(s.cast ?? []).length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Cast</Label>
                          {s.cast.map((c, i) => (
                            <div key={`${c.mentionKey}-${i}`} className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">{c.mentionKey}</Badge>
                              <Select
                                value={c.characterId ?? '__none__'}
                                onValueChange={(v) => updateSceneCastChar(s.index, i, v === '__none__' ? null : v)}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="Library-Avatar wählen…" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— nicht zugeordnet —</SelectItem>
                                  {charOptions.map((o) => (
                                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {c.voiceName && <Badge variant="secondary" className="text-[10px]">🎙 {c.voiceName}</Badge>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Location resolver */}
                      {s.location && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Location</Label>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{s.location.mentionKey}</Badge>
                            <Select
                              value={s.location.locationId ?? '__none__'}
                              onValueChange={(v) => updateSceneLocation(s.index, v === '__none__' ? null : v)}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="Library-Location wählen…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— nicht zugeordnet —</SelectItem>
                                {locOptions.map((o) => (
                                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {/* Per-scene quick edits */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Dauer (s)</Label>
                          <Input
                            type="number" min={1} max={60}
                            value={s.durationSec}
                            onChange={(e) => updateScene(s.index, { durationSec: Number(e.target.value) || s.durationSec })}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Engine</Label>
                          <Select
                            value={s.engine}
                            onValueChange={(v) => updateScene(s.index, { engine: v as any })}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['auto','broll','heygen','sync-polish','cinematic-sync','sync-segments','native-dialogue'].map((e) => (
                                <SelectItem key={e} value={e}>{e}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </SectionCard>

              {/* Voice */}
              {plan.voice && (
                <SectionCard title="Voiceover (ElevenLabs)">
                  <Row label="Voice" value={plan.voice.voiceName ?? plan.voice.voiceId} />
                  <Row label="Model" value={plan.voice.model} />
                  <Row label="Stability" value={plan.voice.stability?.toString()} />
                  <Row label="Similarity Boost" value={plan.voice.similarityBoost?.toString()} />
                  <Row label="Style" value={plan.voice.style?.toString()} />
                  <Row label="Speaker Boost" value={plan.voice.speakerBoost?.toString()} />
                  <Row label="Speed" value={plan.voice.speed?.toString()} />
                  <Row label="Request-Stitching" value={plan.voice.requestStitching ? 'an' : 'aus'} />
                </SectionCard>
              )}

              {/* Captions */}
              {plan.captions && (
                <SectionCard title="Captions">
                  <Row label="Font" value={plan.captions.font} />
                  <Row label="Größe" value={plan.captions.sizePx ? `${plan.captions.sizePx}px` : undefined} />
                  <Row label="Farbe" value={plan.captions.color} />
                  <Row label="Highlight" value={plan.captions.highlightColor} />
                  <Row label="Position" value={plan.captions.position} />
                  <Row label="Safe-Zone" value={plan.captions.safeZonePct ? `${plan.captions.safeZonePct}%` : undefined} />
                  <Row label="Burn-In" value={plan.captions.burnIn ? 'an' : 'aus'} />
                  {!!plan.captions.highlightWords?.length && (
                    <Row label="Highlight-Words" value={plan.captions.highlightWords.join(', ')} />
                  )}
                </SectionCard>
              )}

              {/* Negative Prompt */}
              {plan.negativePrompt && (
                <SectionCard title="Negative Prompt">
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap">{plan.negativePrompt}</div>
                </SectionCard>
              )}

              {/* Protection panel */}
              {protectedSceneIds.size > 0 && (
                <div className="rounded-lg border border-amber-300/40 bg-amber-300/[0.06] p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1 font-medium text-amber-300">
                    <Shield className="h-3 w-3" /> {protectedSceneIds.size} bestehende Szene{protectedSceneIds.size === 1 ? '' : 'n'} geschützt
                  </div>
                  <div className="text-muted-foreground">
                    Diese Szenen sind bereits gerendert oder Lip-Sync-aktiv und werden vom Plan nicht überschrieben.
                    Die neuen Plan-Szenen werden dahinter angefügt.
                  </div>
                </div>
              )}

              {/* Unresolved */}
              {plan.unresolved.length > 0 && (
                <div className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-3 space-y-1 text-xs">
                  <div className="font-medium text-amber-300 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {plan.unresolved.length} offene{plan.unresolved.length === 1 ? 'r' : ''} Punkt{plan.unresolved.length === 1 ? '' : 'e'}
                  </div>
                  <ul className="space-y-1">
                    {plan.unresolved.map((u, i) => (
                      <li key={i} className="text-muted-foreground">
                        <span className="text-amber-300">{u.field}:</span> {u.reason}
                        {u.suggestion && <span className="ml-1 italic">— {u.suggestion}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          {step === 'paste' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button onClick={handleParse} disabled={text.length < 40} className="gap-2">
                <Sparkles className="h-4 w-4" /> Briefing analysieren
              </Button>
            </>
          )}
          {step === 'review' && plan && (
            <>
              <Button variant="outline" onClick={() => setStep('paste')}>Zurück</Button>
              <Button onClick={handleApply} disabled={applying} className="gap-2">
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Plan anwenden
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/40 p-3">
      <div className="font-medium text-sm mb-2">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className={highlight ? 'text-amber-300 font-medium' : ''}>{value}</span>
    </div>
  );
}
