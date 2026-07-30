/**
 * Director's Table — the Autopilot cockpit.
 *
 * Three moments, nothing more: the user states what they want, approves a
 * treatment, and watches the production run. Everything technical (prompt
 * grammar, rhythm weights, negative clauses) stays hidden — the customer sees
 * a storyboard, not a machine.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Loader2, Clapperboard, Sparkles, Camera, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { GENRE_LIST, getRecipe } from '@/lib/autopilot/genres';
import { applyRhythm, diversifyCameraMoves } from '@/lib/autopilot/rhythm';
import { preflightTreatment, blockingFindings } from '@/lib/autopilot/preflight';
import { planSoundDesign } from '@/lib/autopilot/soundDesign';
import {
  describeScene,
  compileAnchorPrompt,
  compileMotionPrompt,
  clampPromptWords,
} from '@/lib/autopilot/promptGrammar';
import { estimateProductionCost, formatEuro } from '@/lib/autopilot/costEstimate';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAutopilotProduction } from '@/hooks/useAutopilotProduction';
import { ProductionLounge } from '@/components/autopilot/ProductionLounge';
import { StageProgressBar } from '@/components/autopilot/StageProgressBar';
import {
  loadCast,
  resolveVoices,
  resolveNarratorVoice,
  type CastMember,
  type ResolvedVoice,
} from '@/lib/autopilot/autoVoice';
import type { AutopilotTreatment, AutopilotGenre, AutopilotAspect } from '@/lib/autopilot/types';
import { cn } from '@/lib/utils';

const ASPECTS: Array<{ value: AutopilotAspect; label: string }> = [
  { value: '9:16', label: 'Hochkant 9:16 — Reels, Shorts, TikTok' },
  { value: '16:9', label: 'Quer 16:9 — YouTube, Website' },
  { value: '1:1', label: 'Quadrat 1:1 — Feed' },
  { value: '4:5', label: 'Portrait 4:5 — Feed' },
];

const LANGUAGES = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'Englisch' },
  { value: 'es', label: 'Spanisch' },
];

const TREATMENT_PHASES = [
  'Briefing wird gelesen …',
  'Konzept und Dramaturgie …',
  'Szenen werden gebaut …',
  'Dialoge und Besetzung …',
  'Letzter Feinschliff …',
];

const BEAT_LABEL: Record<string, string> = {
  hook: 'Aufhänger',
  problem: 'Problem',
  reveal: 'Lösung',
  proof: 'Beweis',
  benefit: 'Nutzen',
  emotion: 'Emotion',
  cta: 'Abbinder',
};

export interface DirectorsTableBriefing {
  brief: string;
  genre?: AutopilotGenre;
  aspect?: AutopilotAspect;
  language?: string;
  duration?: number;
  /** Cast & World characters the idea was built around — hard lock. */
  characters?: Array<{ id: string; name: string; description?: string }>;
}

export function DirectorsTable({ briefing }: { briefing?: DirectorsTableBriefing } = {}) {
  const { toast } = useToast();

  const [brief, setBrief] = useState(briefing?.brief ?? '');
  const [genre, setGenre] = useState<AutopilotGenre | 'auto'>(briefing?.genre ?? 'auto');
  const [aspect, setAspect] = useState<AutopilotAspect>(briefing?.aspect ?? '9:16');
  const [language, setLanguage] = useState(briefing?.language ?? 'de');
  const [duration, setDuration] = useState(briefing?.duration ?? 20);


  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  /** Phase text shown next to the loading bar while the treatment is written. */
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!loading) {
      setPhase(0);
      return;
    }
    const id = window.setInterval(() => setPhase((p) => (p + 1) % TREATMENT_PHASES.length), 2600);
    return () => window.clearInterval(id);
  }, [loading]);

  const [approved, setApproved] = useState(false);
  const [productionId, setProductionId] = useState<string | null>(null);
  const [treatment, setTreatment] = useState<AutopilotTreatment | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [walletEuros, setWalletEuros] = useState<number | null>(null);

  const { production, scenes: producedScenes, log } = useAutopilotProduction(
    productionId,
    approved,
  );

  /**
   * Casting & voices are resolved automatically: the character's Cast & World
   * voice first, then a library voice matching language and gender. The
   * customer never has to assign anything — "keine Zuordnung" cannot happen.
   */
  const [castById, setCastById] = useState<Record<string, CastMember>>({});
  const [voiceByCharacter, setVoiceByCharacter] = useState<Record<string, ResolvedVoice>>({});
  const [narratorVoice, setNarratorVoice] = useState<ResolvedVoice | null>(null);
  const [castingBusy, setCastingBusy] = useState(false);

  useEffect(() => {
    if (!treatment) return;
    const ids = Array.from(
      new Set((treatment.scenes ?? []).flatMap((scene) => scene.characterIds ?? [])),
    );
    let cancelled = false;
    setCastingBusy(true);
    void (async () => {
      try {
        const cast = ids.length > 0 ? await loadCast(ids) : {};
        const members = Object.values(cast);
        const voices = members.length > 0
          ? await resolveVoices(members, treatment.language)
          : {};
        const needsNarrator =
          members.length === 0 &&
          (treatment.scenes ?? []).some((s) => !!s.dialogue || (s.turns?.length ?? 0) > 0);
        const narrator = needsNarrator ? await resolveNarratorVoice(treatment.language) : null;
        if (cancelled) return;
        setCastById(cast);
        setVoiceByCharacter(voices);
        setNarratorVoice(narrator);
      } finally {
        if (!cancelled) setCastingBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [treatment]);

  /**
   * The model delivers structure; the planner owns time and camera variety.
   * Doing this on the client keeps the storyboard instantly re-plannable when
   * the user drags the duration slider after approval.
   */
  const plannedTreatment = useMemo(() => {
    if (!treatment) return null;
    const scenes = diversifyCameraMoves(
      applyRhythm(treatment.scenes, treatment.totalDurationSeconds),
    ).map((scene) => {
      const characterIds = [...(scene.characterIds ?? [])];
      const turns = (scene.turns ?? []).map((turn) => {
        const speakerId = turn.speakerCharacterId;
        if (speakerId && !characterIds.includes(speakerId)) characterIds.push(speakerId);
        const cast = speakerId ? castById[speakerId] : undefined;
        const resolved = speakerId ? voiceByCharacter[speakerId] : undefined;
        const voice = resolved ?? narratorVoice ?? undefined;
        return {
          ...turn,
          speakerName: turn.speakerName ?? cast?.name ?? 'Erzähler',
          voiceId: turn.voiceId ?? voice?.voiceId,
          voiceName: voice?.voiceName,
          autoVoice: !turn.voiceId && (voice?.auto ?? false),
          language: turn.language ?? scene.voiceLanguage ?? treatment.language,
        };
      });
      const soloId = scene.speakerCharacterId;
      if (soloId && !characterIds.includes(soloId)) characterIds.push(soloId);
      const soloVoice = (soloId ? voiceByCharacter[soloId] : undefined) ?? narratorVoice ?? undefined;
      return {
        ...scene,
        characterIds,
        turns: turns.length > 0 ? turns : undefined,
        voiceId:
          scene.voiceId ?? (turns.length > 0 ? turns[0].voiceId : soloVoice?.voiceId),
        autoVoiceName:
          turns.length > 0
            ? undefined
            : !scene.voiceId && soloVoice?.auto
              ? soloVoice.voiceName
              : undefined,
      };
    });
    return { ...treatment, scenes };
  }, [treatment, castById, voiceByCharacter, narratorVoice]);



  const preflight = useMemo(
    () => (plannedTreatment ? preflightTreatment(plannedTreatment) : null),
    [plannedTreatment],
  );

  const mixPlan = useMemo(
    () =>
      plannedTreatment
        ? planSoundDesign(plannedTreatment.scenes, plannedTreatment.genre)
        : null,
    [plannedTreatment],
  );

  const blockers = preflight ? blockingFindings(preflight) : [];

  /** Cost preview — same price table the billing path uses. */
  const cost = useMemo(() => {
    if (!plannedTreatment) return null;
    const scenes = plannedTreatment.scenes ?? [];
    const speakingScenes = scenes.filter(
      (scene) => !!scene.dialogue || (scene.turns?.length ?? 0) > 0,
    );
    const totalSeconds = scenes.reduce((acc, scene) => acc + (scene.durationSeconds || 0), 0);
    // One Sync.so pass per speaker: count distinct speakers across all turns.
    const speakerIds = new Set<string>();
    for (const scene of speakingScenes) {
      if (scene.turns?.length) {
        for (const turn of scene.turns) speakerIds.add(turn.speakerCharacterId ?? turn.id);
      } else {
        speakerIds.add(scene.speakerCharacterId ?? 'x');
      }
    }
    return estimateProductionCost({
      sceneCount: scenes.length,
      totalDurationSeconds: totalSeconds,
      voiceoverEnabled: speakingScenes.length > 0,
      lipSyncEnabled: speakingScenes.length > 0,
      lipSyncSpeakers: speakerIds.size,

      speakingSeconds: speakingScenes.reduce((acc, scene) => acc + (scene.durationSeconds || 0), 0),
      musicEnabled: true,
    });
  }, [plannedTreatment]);

  const openConfirm = async () => {
    setConfirmOpen(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return;
    const { data } = await supabase
      .from('ai_video_wallets')
      .select('balance_euros')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    setWalletEuros(Number(data?.balance_euros ?? 0));
  };

  /** Distinct room tones across the film — shown as a one-line sound summary. */
  const ambienceCues = useMemo(
    () =>
      Array.from(
        new Set(
          (mixPlan?.layers ?? [])
            .map((layer) => layer.ambiencePrompt)
            .filter((cue): cue is string => Boolean(cue)),
        ),
      ),
    [mixPlan],
  );

  const handleDevelop = async () => {
    if (brief.trim().length < 8) {
      toast({
        title: 'Noch zu knapp',
        description: 'Beschreibe in einem Satz, worum es im Video gehen soll.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setTreatment(null);
    try {
      const { data, error } = await supabase.functions.invoke('autopilot-treatment', {
        body: {
          brief: brief.trim(),
          genre: genre === 'auto' ? undefined : genre,
          aspect_ratio: aspect,
          language,
          target_duration_seconds: duration,
          characters: briefing?.characters ?? [],

        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setProductionId(data.production_id);
      setTreatment(data.treatment as AutopilotTreatment);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({
        title: 'Treatment fehlgeschlagen',
        description:
          message === 'credits_exhausted'
            ? 'Dein KI-Guthaben ist aufgebraucht.'
            : message === 'rate_limited'
              ? 'Zu viele Anfragen — bitte kurz warten.'
              : message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Approval hands the compiled grammar to the orchestrator. Prompts are
   * compiled here so the client's storyboard and the server's render can never
   * drift apart — there is exactly one grammar implementation.
   */
  const handleStartProduction = async () => {
    if (!plannedTreatment || !productionId) return;
    setStarting(true);
    try {
      const characterIds = Array.from(
        new Set(plannedTreatment.scenes.flatMap((scene) => scene.characterIds ?? [])),
      );

      const portraitById = new Map<string, { url: string | null; name: string }>();
      if (characterIds.length) {
        const { data } = await supabase
          .from('brand_characters')
          .select('id, name, portrait_url, reference_image_url')
          .in('id', characterIds);
        for (const row of data ?? []) {
          portraitById.set(row.id, {
            url: row.portrait_url ?? row.reference_image_url ?? null,
            name: row.name ?? '',
          });
        }
      }

      const { data, error } = await supabase.functions.invoke('autopilot-orchestrate', {
        body: {
          production_id: productionId,
          aspect_ratio: plannedTreatment.aspect,
          scenes: plannedTreatment.scenes.map((scene) => {
            const cast = (scene.characterIds ?? [])
              .map((id) => portraitById.get(id))
              .filter(Boolean) as Array<{ url: string | null; name: string }>;
            return {
              id: scene.id,
              orderIndex: scene.orderIndex,
              beat: scene.beat,
              durationSeconds: scene.durationSeconds,
              anchorPrompt: clampPromptWords(compileAnchorPrompt(scene)),
              motionPrompt: clampPromptWords(compileMotionPrompt(scene, { hasAnchor: true }), 60),
              dialogue: scene.dialogue ?? null,
              turns: (scene.turns ?? []).map((turn, i) => ({
                id: turn.id || `${scene.id}:${i}`,
                text: turn.text,
                speakerCharacterId: turn.speakerCharacterId ?? null,
                speakerName: turn.speakerName ?? null,
                voiceId: turn.voiceId ?? null,
                language: turn.language ?? scene.voiceLanguage ?? plannedTreatment.language,
              })),
              speakerCharacterId: scene.speakerCharacterId ?? null,
              voiceId: scene.voiceId ?? null,
              voiceLanguage: scene.voiceLanguage ?? plannedTreatment.language,

              characterIds: scene.characterIds ?? [],
              portraitUrls: cast.map((entry) => entry.url).filter(Boolean),
              characterNames: cast.map((entry) => entry.name).filter(Boolean),
              soundDesign: { foleyHint: scene.foleyHint ?? null },
              grammar: scene as unknown as Record<string, unknown>,
            };
          }),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setApproved(true);
      toast({
        title: 'Produktion läuft',
        description:
          'Jede Szene wird erst als Standbild geprüft und nur dann animiert — du kannst live zuschauen.',
      });
    } catch (err) {
      toast({
        title: 'Produktion konnte nicht starten',
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- Briefing */}
      <Card className="border-primary/20 bg-card/60 p-6 backdrop-blur">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Clapperboard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-serif text-xl">Regietisch</h2>
            <p className="text-sm text-muted-foreground">
              Sag, was du brauchst. Die KI entwickelt Konzept, Storyboard und Film.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="autopilot-brief">Was soll entstehen?</Label>
            <Textarea
              id="autopilot-brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              rows={3}
              placeholder="z. B. Ein Werbevideo für unsere neue Espressomaschine — Zielgruppe Berufstätige, die morgens keine Zeit haben."
              className="resize-none"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Art des Videos</Label>
              <Select value={genre} onValueChange={(value) => setGenre(value as AutopilotGenre | 'auto')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatisch erkennen</SelectItem>
                  {GENRE_LIST.map((recipe) => (
                    <SelectItem key={recipe.id} value={recipe.id}>
                      {recipe.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={aspect} onValueChange={(value) => setAspect(value as AutopilotAspect)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECTS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sprache</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Länge</Label>
              <span className="text-sm font-medium text-primary">{duration} Sekunden</span>
            </div>
            <Slider
              value={[duration]}
              onValueChange={([value]) => setDuration(value)}
              min={8}
              max={60}
              step={1}
            />
          </div>

          {genre !== 'auto' && (
            <p className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {getRecipe(genre).description}
            </p>
          )}

          <Button onClick={handleDevelop} disabled={loading} size="lg" className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Regie denkt nach…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Treatment entwickeln
              </>
            )}
          </Button>

          {loading && <StageProgressBar label={TREATMENT_PHASES[phase]} />}

        </div>
      </Card>

      {/* -------------------------------------------------------- Storyboard */}
      {plannedTreatment && (
        <Card className="border-primary/20 bg-card/60 p-6 backdrop-blur">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{getRecipe(plannedTreatment.genre).label}</Badge>
            <Badge variant="outline">{plannedTreatment.aspect}</Badge>
            <Badge variant="outline">{plannedTreatment.scenes.length} Szenen</Badge>
            <Badge variant="outline">
              {Math.round(
                plannedTreatment.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
              )}
              s
            </Badge>
          </div>

          <h3 className="font-serif text-2xl">{plannedTreatment.title}</h3>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {plannedTreatment.logline}
          </p>

          {castingBusy && (
            <div className="mt-4">
              <StageProgressBar label="Besetzung und Stimmen werden zugeordnet …" />
            </div>
          )}

          {blockers.length > 0 && (
            <div className="mt-4 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              {blockers.map((finding, index) => (
                <div key={index} className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{finding.message}</span>
                </div>
              ))}
            </div>
          )}



          <div className="mt-6 space-y-3">
            {plannedTreatment.scenes.map((scene, index) => (
              <div
                key={scene.id}
                className={cn(
                  'rounded-xl border border-border/50 bg-background/40 p-4',
                  'transition-colors hover:border-primary/40',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {BEAT_LABEL[scene.beat] ?? scene.beat}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {scene.durationSeconds.toFixed(1)}s
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Camera className="h-3.5 w-3.5" />
                    {describeScene(scene)}
                  </span>
                </div>

                <p className="mt-2 text-sm">{scene.action}</p>
                <p className="text-xs text-muted-foreground">{scene.environment}</p>

                {(scene.turns?.length ?? 0) > 0 ? (
                  <div className="mt-2 space-y-1.5 border-l-2 border-primary/40 pl-3">
                    {scene.turns!.map((turn, turnIndex) => (
                      <p key={turn.id} className="text-sm">
                        <span className="mr-2 font-medium text-primary">
                          {turn.speakerName ?? `Sprecher ${turnIndex + 1}`}
                        </span>
                        <span className="italic">„{turn.text}“</span>
                        {!turn.voiceId && (
                          <span className="ml-2 text-xs text-destructive">Stimme fehlt</span>
                        )}
                      </p>
                    ))}
                  </div>
                ) : scene.dialogue ? (
                  <p className="mt-2 border-l-2 border-primary/40 pl-3 text-sm italic">
                    „{scene.dialogue}“
                  </p>
                ) : null}

              </div>
            ))}
          </div>

          {mixPlan && (
            <div className="mt-5 rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Sounddesign: </span>
              {plannedTreatment.musicMood || getRecipe(plannedTreatment.genre).musicMood}
              {ambienceCues.length ? ` · Atmo: ${ambienceCues.slice(0, 3).join(', ')}` : ''}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              size="lg"
              disabled={blockers.length > 0 || !productionId || starting || approved}
              onClick={openConfirm}
            >
              {starting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Produktion startet …
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Freigeben und produzieren
                </>
              )}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleDevelop}
              disabled={loading || starting || approved}
            >
              Neu entwickeln
            </Button>
          </div>

          {starting && <StageProgressBar label="Produktion wird gestartet …" />}

        </Card>
      )}

      {/* --------------------------------------------------- Freigabedialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Produktion freigeben</AlertDialogTitle>
            <AlertDialogDescription>
              Abgerechnet wird stufenweise. Was nicht geliefert wird, bekommst du automatisch
              zurück.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {cost && (
            <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-4 text-sm">
              {cost.lines.map((entry) => (
                <div key={entry.label} className="flex items-baseline justify-between gap-4">
                  <span>
                    {entry.label}
                    <span className="ml-2 text-xs text-muted-foreground">{entry.detail}</span>
                  </span>
                  <span className="font-mono">{formatEuro(entry.euros)}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between border-t border-border/50 pt-2 font-medium">
                <span>Gesamt</span>
                <span className="font-mono">
                  {formatEuro(cost.totalEuros)} · {cost.totalCredits} Cr
                </span>
              </div>
              {walletEuros !== null && (
                <p
                  className={cn(
                    'text-xs',
                    walletEuros < cost.totalEuros ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  Guthaben: {formatEuro(walletEuros)}
                  {walletEuros < cost.totalEuros && ' — reicht nicht für den kompletten Film.'}
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void handleStartProduction();
              }}
            >
              Kostenpflichtig produzieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ------------------------------------------------------- Produktion */}
      {approved && production && (
        <ProductionLounge production={production} scenes={producedScenes} log={log} />
      )}
    </div>
  );
}

