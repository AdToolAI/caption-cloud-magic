/**
 * SceneDialogStudio — Inline per-scene "screenplay" editor.
 *
 * Lets the user write a multi-speaker dialog for ONE scene. On generation,
 * each line becomes its own HeyGen lip-sync clip and is auto-spawned as a
 * sub-scene right after this one (Shot-Reverse-Shot).
 *
 * Visible only when:
 *   - scene.clipSource starts with "ai-" AND
 *   - the scene's cast (characterShots) has >= 2 characters
 *
 * Persistence: scene.dialogScript + scene.dialogVoices are stored on
 * composer_scenes (added in migration 20260507-…).
 */

import { forwardRef, useEffect, useMemo, useState } from 'react';
import { Mic, Sparkles, User, Loader2, ImageOff, Volume2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTalkingHead } from '@/hooks/useTalkingHead';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { supabase } from '@/integrations/supabase/client';
import { parseDialogScript, uniqueSpeakers } from '@/lib/talking-head/parseDialogScript';
import type {
  ComposerCharacter,
  ComposerScene,
  CharacterShot,
} from '@/types/video-composer';

interface SceneDialogStudioProps {
  scene: ComposerScene;
  cast: CharacterShot[];
  characters: ComposerCharacter[];
  projectId?: string;
  language: 'de' | 'en' | 'es';
  onUpdate: (updates: Partial<ComposerScene>) => void;
  onAddScene?: (partial: Partial<ComposerScene>) => Promise<string | undefined> | void;
  /** Controlled open/close — when explicitly false, renders nothing. */
  open?: boolean;
  /** Close-handler used by the in-card X button. */
  onClose?: () => void;
}

const PRESET_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (warm female)' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (deep male)' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam (young male)' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda (clear female)' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica (energetic)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (narrator)' },
];

const T = {
  de: {
    title: 'Szenen-Skript',
    subtitle: 'Schreibe ein Drehbuch — der Dialog läuft als Voiceover in DIESER Szene.',
    subtitleMono: 'Monolog — der Charakter spricht zur Kamera. Läuft als Voiceover in dieser Szene.',
    script: 'Drehbuch',
    voices: 'Stimme pro Sprecher',
    pickVoice: 'Stimme wählen',
    aiBtn: 'Skript via AI',
    genBtn: 'Voiceover generieren',
    genBtnSrs: 'Lip-Sync-Clips generieren',
    generating: 'Generiere…',
    blocks: (n: number) => `${n} Block${n === 1 ? '' : 'e'}`,
    speakers: (n: number) => `${n} Sprecher`,
    sec: (n: number) => `~${n}s`,
    needCast: 'Mindestens 1 Charakter im Cast nötig.',
    voiceMissing: (name: string) => `Wähle eine Stimme für „${name}".`,
    parseEmpty: 'Kein gültiges Skript. Format: "Sarah: Hallo!"',
    success: (n: number) => `${n} Lip-Sync-Clip${n === 1 ? '' : 's'} werden generiert (1–3 Min).`,
    successInline: (n: number) => `${n} Voiceover-Block${n === 1 ? '' : 'blöcke'} an diese Szene gehängt.`,
    failed: 'Generierung fehlgeschlagen',
    aiFailed: 'KI-Skript konnte nicht erstellt werden',
    srsLabel: 'Erweitert: Als separate Shot-Reverse-Shot-Szenen rendern',
    srsHint: 'Standard: Dialog läuft als Voiceover in dieser Szene — keine extra Szenen.',
    close: 'Schließen',
  },
  en: {
    title: 'Scene Script',
    subtitle: 'Write a screenplay — the dialog plays as voiceover IN this scene.',
    subtitleMono: 'Monologue — the character speaks to camera. Plays as voiceover in this scene.',
    script: 'Screenplay',
    voices: 'Voice per speaker',
    pickVoice: 'Pick voice',
    aiBtn: 'AI Script',
    genBtn: 'Generate voiceover',
    genBtnSrs: 'Generate lip-sync clips',
    generating: 'Generating…',
    blocks: (n: number) => `${n} block${n === 1 ? '' : 's'}`,
    speakers: (n: number) => `${n} speaker${n === 1 ? '' : 's'}`,
    sec: (n: number) => `~${n}s`,
    needCast: 'Need at least 1 cast character.',
    voiceMissing: (name: string) => `Pick a voice for "${name}".`,
    parseEmpty: 'No valid script. Format: "Sarah: Hi!"',
    success: (n: number) => `${n} lip-sync clip${n === 1 ? '' : 's'} are being generated (1–3 min).`,
    successInline: (n: number) => `${n} voiceover block${n === 1 ? '' : 's'} attached to this scene.`,
    failed: 'Generation failed',
    aiFailed: 'AI script could not be generated',
    srsLabel: 'Advanced: render as separate shot-reverse-shot scenes',
    srsHint: 'Default: dialog plays as voiceover in this scene — no extra scenes.',
    close: 'Close',
  },
  es: {
    title: 'Guion de escena',
    subtitle: 'Escribe un guion — el diálogo suena como voz en off EN esta escena.',
    subtitleMono: 'Monólogo — el personaje habla a cámara. Suena como voz en off en esta escena.',
    script: 'Guion',
    voices: 'Voz por hablante',
    pickVoice: 'Elegir voz',
    aiBtn: 'Guion con IA',
    genBtn: 'Generar voz en off',
    genBtnSrs: 'Generar clips lip-sync',
    generating: 'Generando…',
    blocks: (n: number) => `${n} bloque${n === 1 ? '' : 's'}`,
    speakers: (n: number) => `${n} hablante${n === 1 ? '' : 's'}`,
    sec: (n: number) => `~${n}s`,
    needCast: 'Se necesita al menos 1 personaje.',
    voiceMissing: (name: string) => `Elige una voz para "${name}".`,
    parseEmpty: 'Guion no válido. Formato: "Sarah: ¡Hola!"',
    success: (n: number) => `${n} clip${n === 1 ? '' : 's'} lip-sync se están generando (1–3 min).`,
    successInline: (n: number) => `${n} bloque${n === 1 ? '' : 's'} de voz añadidos a esta escena.`,
    failed: 'Generación fallida',
    aiFailed: 'No se pudo generar el guion con IA',
    srsLabel: 'Avanzado: renderizar como escenas plano-contraplano separadas',
    srsHint: 'Por defecto: el diálogo suena como voz en off en esta escena — sin escenas extra.',
    close: 'Cerrar',
  },
};

const SceneDialogStudio = forwardRef<HTMLDivElement, SceneDialogStudioProps>(function SceneDialogStudio({
  scene,
  cast,
  characters,
  projectId,
  language,
  onUpdate,
  onAddScene,
  open,
  onClose,
}, ref) {
  const t = T[language];
  const { toast } = useToast();
  const { generate, estimateCost } = useTalkingHead();
  const { voices: customVoices } = useCustomVoices();

  // Build the cast subset of ComposerCharacters that are actually in this scene
  const sceneCast = useMemo<ComposerCharacter[]>(
    () =>
      cast
        .map((cs) => characters.find((c) => c.id === cs.characterId))
        .filter((c): c is ComposerCharacter => !!c),
    [cast, characters],
  );

  const allVoices = useMemo(
    () => [
      ...PRESET_VOICES.map((v) => ({ id: v.id, name: v.name, isCustom: false, elevenlabsVoiceId: undefined as string | undefined })),
      ...customVoices.filter((v) => v.is_active).map((v) => ({
        id: v.id,
        name: `⭐ ${v.name}`,
        isCustom: true,
        elevenlabsVoiceId: v.elevenlabs_voice_id,
      })),
    ],
    [customVoices],
  );

  const [script, setScript] = useState(scene.dialogScript ?? '');
  const [voicePerSpeaker, setVoicePerSpeaker] = useState<Record<string, string>>(
    scene.dialogVoices ?? {},
  );
  const [generating, setGenerating] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [renderAsSeparateScenes, setRenderAsSeparateScenes] = useState(false);

  // Sync only when switching to a different scene — otherwise the parent's
  // re-render after our own debounced save would clobber the user's in-flight
  // typing (cursor jump / dropped characters).
  useEffect(() => {
    setScript(scene.dialogScript ?? '');
    setVoicePerSpeaker(scene.dialogVoices ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id]);

  // Persist script with debounce. The actual prompt-sync happens in
  // SceneCard (so that structured-mode promptSlots.subject is updated and
  // stitchSlots can't wipe the marker on the next render).
  useEffect(() => {
    if (script === (scene.dialogScript ?? '')) return;
    const handle = setTimeout(() => {
      onUpdate({ dialogScript: script });
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  // Persist voice map immediately on change
  const setVoiceFor = (speakerId: string, voiceId: string) => {
    const next = { ...voicePerSpeaker, [speakerId]: voiceId };
    setVoicePerSpeaker(next);
    onUpdate({ dialogVoices: next });
  };

  const blocks = useMemo(() => parseDialogScript(script, sceneCast), [script, sceneCast]);
  const speakers = useMemo(() => uniqueSpeakers(blocks, sceneCast), [blocks, sceneCast]);

  const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);
  const estimatedDurationSec = Math.max(3, Math.ceil(totalChars / 18));
  const totalCost = blocks.length * estimateCost(4, true);

  const handleAiScript = async () => {
    if (sceneCast.length < 2) return;
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-scene-dialog', {
        body: {
          language,
          sceneContext: scene.aiPrompt || scene.sceneType || '',
          durationSeconds: scene.durationSeconds ?? 6,
          cast: sceneCast.map((c) => ({
            id: c.id,
            name: c.name,
            appearance: c.appearance ?? '',
          })),
        },
      });
      if (error) throw error;
      const generated = (data as any)?.script as string | undefined;
      if (generated) {
        setScript(generated);
        toast({
          title: language === 'de' ? 'Skript bereit' : language === 'es' ? 'Guion listo' : 'Script ready',
          description:
            language === 'de'
              ? 'Prompt aktualisiert ✓ — jetzt „Dialog generieren" klicken.'
              : language === 'es'
              ? 'Prompt actualizado ✓ — ahora haz clic en "Generar diálogo".'
              : 'Prompt updated ✓ — now click "Generate dialog".',
        });
      }
    } catch (e) {
      console.error('[SceneDialogStudio] AI script error', e);
      toast({
        title: t.aiFailed,
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setAiBusy(false);
    }
  };

  const handleGenerateInline = async () => {
    setGenerating(true);
    let okCount = 0;
    let cumulativeOffset = 0;
    try {
      for (const block of blocks) {
        const c = sceneCast.find((x) => x.id === block.speakerId);
        if (!c) continue;
        const voiceMeta = allVoices.find((v) => v.id === voicePerSpeaker[block.speakerId]);
        if (!voiceMeta) continue;

        // ElevenLabs voice id: presets use the preset id directly; cloned
        // voices store the real ElevenLabs id in `elevenlabsVoiceId`.
        const elevenVoiceId = voiceMeta.isCustom
          ? voiceMeta.elevenlabsVoiceId
          : voiceMeta.id;

        const { data, error } = await supabase.functions.invoke('generate-voiceover', {
          body: {
            text: block.text,
            voiceId: elevenVoiceId,
            projectId: projectId ?? scene.projectId,
          },
        });
        if (error) throw error;
        const audioUrl = (data as any)?.audioUrl as string | undefined;
        const duration = Number((data as any)?.duration ?? 0) || Math.max(1.5, block.text.length / 18);
        if (!audioUrl) throw new Error('No audioUrl returned');

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Unauthorized');

        const { error: insErr } = await supabase
          .from('scene_audio_clips')
          .insert({
            user_id: user.id,
            project_id: projectId ?? scene.projectId,
            scene_id: scene.id,
            kind: 'voiceover',
            source: 'ai',
            prompt: `${c.name}: ${block.text}`,
            url: audioUrl,
            start_offset: Math.round(cumulativeOffset * 100) / 100,
            duration: Math.round(duration * 100) / 100,
            volume: 1.0,
            ducking_enabled: true,
            cost_credits: 0,
          });
        if (insErr) throw insErr;

        cumulativeOffset += duration + 0.15; // small breath between speakers
        okCount += 1;
      }

      // Bump scene duration so all VO blocks fit (cap at 60s sanity)
      const totalNeeded = Math.min(60, Math.ceil(cumulativeOffset));
      if (totalNeeded > (scene.durationSeconds ?? 0)) {
        onUpdate({ durationSeconds: totalNeeded });
      }
      // Notify other panels (SoundDesign / preview) to refresh.
      try {
        const evt = new CustomEvent('scene-audio-clips-changed', {
          detail: { projectId: projectId ?? scene.projectId },
        });
        window.dispatchEvent(evt);
      } catch (_) { /* noop */ }

      toast({ title: t.title, description: t.successInline(okCount) });
    } catch (e) {
      console.error('[SceneDialogStudio] inline generate error', e);
      toast({
        title: t.failed,
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (blocks.length === 0) {
      toast({ title: t.parseEmpty, variant: 'destructive' });
      return;
    }
    for (const sp of speakers) {
      if (!voicePerSpeaker[sp.id]) {
        toast({ title: t.voiceMissing(sp.name), variant: 'destructive' });
        return;
      }
    }
    if (!renderAsSeparateScenes) {
      await handleGenerateInline();
      return;
    }
    setGenerating(true);
    let okCount = 0;
    try {
      // Run sequentially to avoid HeyGen rate spikes
      for (const block of blocks) {
        const c = sceneCast.find((x) => x.id === block.speakerId);
        if (!c) continue;
        if (!c.referenceImageUrl) {
          toast({
            title:
              language === 'de'
                ? `Kein Portrait für ${c.name}`
                : language === 'es'
                ? `Sin retrato para ${c.name}`
                : `No portrait for ${c.name}`,
            description:
              language === 'de'
                ? 'Lip-Sync übersprungen.'
                : language === 'es'
                ? 'Lip-sync omitido.'
                : 'Lip-sync skipped.',
            variant: 'destructive',
          });
          continue;
        }
        const voiceMeta = allVoices.find((v) => v.id === voicePerSpeaker[block.speakerId]);
        if (!voiceMeta) continue;

        if (!onAddScene) continue;

        // 1) Create the sub-scene FIRST so it has a real DB UUID. We store
        //    `clipStatus: 'generating'` so the placeholder shows the spinner
        //    immediately, and pollScenes (ClipsTab) will flip it to 'ready'
        //    once HeyGen finishes (the edge function writes back into the row).
        const charShot: CharacterShot = {
          characterId: c.id,
          shotType: 'profile',
        } as CharacterShot;
        const newSceneIdRaw = await onAddScene({
          sceneType: scene.sceneType,
          durationSeconds: Math.max(3, Math.ceil(block.text.length / 18)),
          clipSource: 'ai-hailuo',
          clipQuality: scene.clipQuality,
          clipStatus: 'generating',
          referenceImageUrl: c.referenceImageUrl,
          aiPrompt: `${c.name}: ${block.text}`,
          characterShot: charShot,
          characterShots: [charShot],
          lipSyncWithVoiceover: true,
          transitionType: 'fade',
          transitionDuration: 0.3,
        });
        const newSceneId = typeof newSceneIdRaw === 'string' ? newSceneIdRaw : undefined;

        // 2) Kick off the HeyGen render and tell it which scene to update.
        const r = await generate({
          sceneId: newSceneId,
          projectId,
          imageUrl: c.referenceImageUrl,
          text: block.text,
          voiceId: voiceMeta.isCustom ? undefined : voiceMeta.id,
          customVoiceId: voiceMeta.isCustom ? voiceMeta.elevenlabsVoiceId : undefined,
          aspectRatio: '9:16',
          resolution: '720p',
          composerCharacterId: c.id,
        });

        if (r?.success) {
          okCount += 1;
        }
      }
      toast({
        title: t.title,
        description: t.success(okCount),
      });
    } catch (e) {
      console.error('[SceneDialogStudio] generate error', e);
      toast({
        title: t.failed,
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  if (sceneCast.length < 1) return null;
  if (open === false) return null;

  const isMonologue = sceneCast.length === 1;

  return (
    <Card ref={ref} className="p-3 space-y-3 border-primary/30 bg-primary/5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mic className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold">{t.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {t.blocks(blocks.length)} · {t.speakers(speakers.length)} · {t.sec(estimatedDurationSec)}
            {blocks.length > 0 && ` · €${totalCost.toFixed(2)}`}
          </span>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onClose}
              aria-label={t.close}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground -mt-1">
        {isMonologue ? t.subtitleMono : t.subtitle}
      </p>

      <div>
        <Label className="text-[10px] text-muted-foreground">{t.script}</Label>
        <Textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder={
            isMonologue
              ? `${sceneCast[0]?.name ?? 'Sarah'}: ${
                  language === 'de'
                    ? 'Hi, willkommen!'
                    : language === 'es'
                    ? '¡Hola, bienvenido!'
                    : 'Hi, welcome!'
                }`
              : `${sceneCast[0]?.name ?? 'Sarah'}: ${
                  language === 'de' ? 'Hi!' : language === 'es' ? '¡Hola!' : 'Hi!'
                }\n${sceneCast[1]?.name ?? 'Matthew'}: ${
                  language === 'de'
                    ? `Hi ${sceneCast[0]?.name?.split(' ')[0] ?? 'Sarah'}!`
                    : language === 'es'
                    ? `¡Hola ${sceneCast[0]?.name?.split(' ')[0] ?? 'Sarah'}!`
                    : `Hi ${sceneCast[0]?.name?.split(' ')[0] ?? 'Sarah'}!`
                }`
          }
          rows={4}
          className="mt-1 font-mono text-xs"
        />

        {blocks.length > 0 && (
          <div className="mt-2 space-y-1 rounded-md border border-border/40 bg-background/40 p-2">
            {blocks.map((b, i) => {
              const sp = sceneCast.find((c) => c.id === b.speakerId);
              const missing = !sp?.referenceImageUrl;
              return (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  {sp?.referenceImageUrl ? (
                    <img src={sp.referenceImageUrl} alt={b.speakerName} className="h-5 w-5 rounded object-cover shrink-0" />
                  ) : (
                    <div className="h-5 w-5 rounded bg-muted flex items-center justify-center shrink-0">
                      <ImageOff className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                  <span className="font-semibold shrink-0">{b.speakerName}:</span>
                  <span className={`flex-1 truncate ${missing ? 'text-muted-foreground line-through' : ''}`}>
                    {b.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {blocks.length > 0 && (
          <div className="mt-2 text-[10px] text-emerald-500 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {language === 'de'
              ? 'Dialog ist live im Szenen-Prompt synchronisiert'
              : language === 'es'
              ? 'Diálogo sincronizado en vivo con el prompt de la escena'
              : 'Dialog is live-synced into the scene prompt'}
          </div>
        )}
      </div>

      {speakers.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-[10px] text-muted-foreground">{t.voices}</Label>
          <div className="space-y-1.5">
            {speakers.map((sp) => (
              <div
                key={sp.id}
                className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 p-1.5"
              >
                {sp.referenceImageUrl && (
                  <img
                    src={sp.referenceImageUrl}
                    alt={sp.name}
                    className="h-7 w-7 rounded object-cover"
                  />
                )}
                <div className="flex-1 text-xs font-medium truncate">{sp.name}</div>
                <Select
                  value={voicePerSpeaker[sp.id] || ''}
                  onValueChange={(v) => setVoiceFor(sp.id, v)}
                >
                  <SelectTrigger className="h-7 w-[180px] text-xs">
                    <SelectValue placeholder={t.pickVoice} />
                  </SelectTrigger>
                  <SelectContent>
                    {allVoices.map((v) => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isMonologue && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-border/40 bg-background/40 p-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Volume2 className="h-3 w-3 text-primary" />
              <span className="text-[11px] font-medium">{t.srsLabel}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t.srsHint}</p>
          </div>
          <Switch
            checked={renderAsSeparateScenes}
            onCheckedChange={setRenderAsSeparateScenes}
            disabled={generating}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleAiScript}
          disabled={aiBusy || generating}
          className="h-7 text-xs gap-1"
        >
          {aiBusy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {t.aiBtn}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleGenerate}
          disabled={generating || blocks.length === 0}
          className="h-7 text-xs gap-1 ml-auto"
        >
          {generating ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> {t.generating}
            </>
          ) : renderAsSeparateScenes ? (
            <>
              <User className="h-3 w-3" /> {t.genBtnSrs}
            </>
          ) : (
            <>
              <Volume2 className="h-3 w-3" /> {t.genBtn}
            </>
          )}
        </Button>
      </div>
    </Card>
  );
});

export default SceneDialogStudio;

