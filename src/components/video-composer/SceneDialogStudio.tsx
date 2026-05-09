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
import { applyDialogToPrompt, INTER_SPEAKER_GAP_SEC } from '@/lib/motion-studio/applyDialogToPrompt';
import { useHumeVoices } from '@/hooks/useHumeVoices';
import { resolveDialogVoice } from '@/lib/voice-studio/resolveDialogVoice';
import { sortVoicesPremiumFirst, type VoiceMeta } from '@/lib/elevenlabs-voices';
import { Sparkles as SparklesIcon, Play } from 'lucide-react';
import type {
  ComposerCharacter,
  ComposerScene,
  CharacterShot,
  DialogVoiceCfg,
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
  /** Auto-persist hook — saves the project before generating voiceover so
   *  unsaved projects don't block the user. Returns the fresh projectId and
   *  scene rows so we can map the current scene to its DB id. */
  onEnsurePersisted?: () => Promise<{ projectId: string; scenes: ComposerScene[] }>;
  /** When true, the studio will auto-flip "render as separate scenes" and
   *  trigger handleGenerate() once on mount/update. Used by the multi-speaker
   *  "Splitten" badge in SceneCard for one-click sub-scene generation. */
  autoSplitOnMount?: boolean;
  onAutoSplitConsumed?: () => void;
}

const PRESET_VOICES = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (warm female)' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (deep male)' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam (young male)' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda (clear female)' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica (energetic)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (narrator)' },
];

// Extract a human-readable error message from any thrown value
// (Error, Supabase FunctionsHttpError, PostgrestError, plain object, string).
function formatError(e: unknown): string {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e instanceof Error && e.message) return e.message;
  const anyE = e as any;
  return (
    anyE?.message ||
    anyE?.error?.message ||
    anyE?.context?.message ||
    anyE?.details ||
    anyE?.error_description ||
    (() => {
      try { return JSON.stringify(anyE); } catch { return String(anyE); }
    })()
  );
}

const PROJECT_REQUIRED = {
  de: 'Bitte zuerst das Projekt speichern, bevor Voiceover generiert wird.',
  en: 'Please save the project first before generating voiceover.',
  es: 'Guarda el proyecto antes de generar la voz en off.',
} as const;

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
  onEnsurePersisted,
  autoSplitOnMount,
  onAutoSplitConsumed,
}, ref) {
  const t = T[language];
  const { toast } = useToast();
  const { generate, estimateCost } = useTalkingHead();
  const { voices: customVoices } = useCustomVoices();
  const { voices: humeVoices } = useHumeVoices();

  // Build the cast subset of ComposerCharacters that are actually in this scene
  const sceneCast = useMemo<ComposerCharacter[]>(
    () =>
      cast
        .map((cs) => characters.find((c) => c.id === cs.characterId))
        .filter((c): c is ComposerCharacter => !!c),
    [cast, characters],
  );

  // ── Full ElevenLabs library (loaded from list-voices) + active custom voices ──
  const [elVoices, setElVoices] = useState<VoiceMeta[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('list-voices', {
          body: { language: 'all' },
        });
        if (error) throw error;
        setElVoices(sortVoicesPremiumFirst<VoiceMeta>(data?.voices || []));
      } catch (err) {
        console.warn('[SceneDialogStudio] list-voices failed, using PRESET_VOICES fallback', err);
        setElVoices(PRESET_VOICES.map((p) => ({ id: p.id, name: p.name, language: 'en' as any })));
      }
    })();
  }, []);

  /** ElevenLabs picker entries (library + active custom voices) */
  const elPickerEntries = useMemo(() => {
    const lib = elVoices.map((v) => ({
      id: v.id,
      name: v.name,
      isCustom: false as const,
      elevenlabsVoiceId: undefined as string | undefined,
      gender: v.gender,
    }));
    const custom = customVoices
      .filter((v) => v.is_active && v.elevenlabs_voice_id)
      .map((v) => ({
        id: v.id,
        name: `⭐ ${v.name}`,
        isCustom: true as const,
        elevenlabsVoiceId: v.elevenlabs_voice_id,
        gender: undefined as string | undefined,
      }));
    return [...lib, ...custom];
  }, [elVoices, customVoices]);

  // ── Voice map state — backwards-compatible (string → DialogVoiceCfg) ──
  const normalizeVoiceMap = (
    raw: Record<string, string | DialogVoiceCfg> | undefined,
  ): Record<string, DialogVoiceCfg> => {
    const out: Record<string, DialogVoiceCfg> = {};
    if (!raw) return out;
    for (const [k, v] of Object.entries(raw)) {
      const r = resolveDialogVoice(v);
      if (r) out[k] = r;
    }
    return out;
  };

  const [script, setScript] = useState(scene.dialogScript ?? '');
  const [voicePerSpeaker, setVoicePerSpeaker] = useState<Record<string, DialogVoiceCfg>>(
    normalizeVoiceMap(scene.dialogVoices),
  );
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [renderAsSeparateScenes, setRenderAsSeparateScenes] = useState(false);

  // Sync only when switching to a different scene — otherwise the parent's
  // re-render after our own debounced save would clobber the user's in-flight
  // typing (cursor jump / dropped characters).
  useEffect(() => {
    setScript(scene.dialogScript ?? '');
    setVoicePerSpeaker(normalizeVoiceMap(scene.dialogVoices));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id]);

  // Persist script with debounce.
  useEffect(() => {
    if (script === (scene.dialogScript ?? '')) return;
    const handle = setTimeout(() => {
      onUpdate({ dialogScript: script });
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  /** Persist voice map immediately on change */
  const updateSpeakerVoice = (speakerId: string, patch: Partial<DialogVoiceCfg>) => {
    const cur = voicePerSpeaker[speakerId];
    const next: Record<string, DialogVoiceCfg> = {
      ...voicePerSpeaker,
      [speakerId]: { ...(cur ?? { engine: 'elevenlabs', voiceId: '' }), ...patch },
    };
    setVoicePerSpeaker(next);
    onUpdate({ dialogVoices: next });
  };

  const handleEngineChange = (speakerId: string, engine: 'elevenlabs' | 'hume') => {
    if (engine === 'hume') {
      const fallback = humeVoices[0];
      updateSpeakerVoice(speakerId, {
        engine: 'hume',
        voiceId: fallback.name,
        voiceName: fallback.label,
        provider: fallback.provider,
        isCustom: undefined,
        elevenlabsVoiceId: undefined,
      });
    } else {
      const fb = elPickerEntries[0];
      updateSpeakerVoice(speakerId, {
        engine: 'elevenlabs',
        voiceId: fb?.id ?? 'EXAVITQu4vr4xnSDxMaL',
        voiceName: fb?.name ?? 'Sarah',
        isCustom: fb?.isCustom ?? false,
        elevenlabsVoiceId: fb?.elevenlabsVoiceId,
        provider: undefined,
      });
    }
  };

  const handlePreview = async (speakerId: string) => {
    const cfg = voicePerSpeaker[speakerId];
    if (!cfg?.voiceId) return;
    setPreviewing(speakerId);
    try {
      const fnName = cfg.engine === 'hume' ? 'preview-voice-hume' : 'preview-voice';
      const sp = sceneCast.find((c) => c.id === speakerId);
      const previewText =
        language === 'de'
          ? `Hi, ich bin ${sp?.name?.split(' ')[0] ?? 'Sarah'}.`
          : language === 'es'
          ? `Hola, soy ${sp?.name?.split(' ')[0] ?? 'Sarah'}.`
          : `Hi, I'm ${sp?.name?.split(' ')[0] ?? 'Sarah'}.`;
      const body = cfg.engine === 'hume'
        ? { text: previewText, voiceName: cfg.voiceId, provider: cfg.provider || 'HUME_AI' }
        : { text: previewText, voiceId: cfg.isCustom ? cfg.elevenlabsVoiceId : cfg.voiceId };
      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw error;
      if (!data?.audioContent) throw new Error('No audio returned');
      const audio = new Audio(`data:audio/mpeg;base64,${data.audioContent}`);
      await audio.play();
    } catch (e) {
      toast({ title: 'Preview failed', description: formatError(e), variant: 'destructive' });
    } finally {
      setPreviewing(null);
    }
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
        description: formatError(e),
        variant: 'destructive',
      });
    } finally {
      setAiBusy(false);
    }
  };

  /** Resolve a usable {pid, sceneId}. If the project hasn't been persisted yet,
   *  call onEnsurePersisted() to flush it and remap the current scene's id by
   *  orderIndex (preferred) or by tempId equality. */
  const resolvePersistedIds = async (): Promise<{ pid: string; sceneId: string } | null> => {
    let pid = (projectId || scene.projectId || '').trim();
    let sceneId = scene.id;
    if (pid && sceneId && !sceneId.startsWith('temp-')) return { pid, sceneId };
    if (!onEnsurePersisted) return pid && sceneId ? { pid, sceneId } : null;
    const result = await onEnsurePersisted();
    pid = result.projectId;
    const matched =
      result.scenes.find((s) => s.id === scene.id) ||
      result.scenes.find((s) => s.orderIndex === scene.orderIndex);
    if (matched?.id) sceneId = matched.id;
    return pid && sceneId ? { pid, sceneId } : null;
  };

  /** Probe real audio duration in browser when TTS service didn't return one. */
  const probeAudioDuration = (audioUrl: string, fallbackSec: number): Promise<number> =>
    new Promise((resolve) => {
      try {
        const a = new Audio();
        a.preload = 'metadata';
        let done = false;
        const finish = (d: number) => { if (!done) { done = true; resolve(d); } };
        a.addEventListener('loadedmetadata', () => {
          const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : fallbackSec;
          finish(d);
        });
        a.addEventListener('error', () => finish(fallbackSec));
        setTimeout(() => finish(fallbackSec), 5000);
        a.src = audioUrl;
      } catch {
        resolve(fallbackSec);
      }
    });

  const handleGenerateInline = async () => {
    let pid = '';
    let sceneId = scene.id;
    try {
      const ids = await resolvePersistedIds();
      if (!ids) {
        toast({
          title: t.failed,
          description: PROJECT_REQUIRED[language],
          variant: 'destructive',
        });
        return;
      }
      pid = ids.pid;
      sceneId = ids.sceneId;
    } catch (e) {
      toast({ title: t.failed, description: formatError(e), variant: 'destructive' });
      return;
    }
    // Pin dialog into the visible AI prompt immediately so the user sees the
    // concrete speaker lines right after clicking "Generate voiceover".
    try {
      const dialogPrompt = applyDialogToPrompt(scene.aiPrompt || '', blocks, language);
      if (dialogPrompt !== (scene.aiPrompt || '')) {
        onUpdate({ dialogScript: script, dialogVoices: voicePerSpeaker, aiPrompt: dialogPrompt });
      }
    } catch (_) { /* noop — non-fatal */ }
    setGenerating(true);
    let okCount = 0;
    let cumulativeOffset = 0;
    const timedBlocks: typeof blocks = [];
    // Director Console — accumulator for the first-class AudioPlan.
    // Stays in script order so `startSec`/`endSec` map directly to playback.
    const planSpeakers: import('@/types/video-composer').AudioPlanSpeaker[] = [];

    // Determine if we should auto-upgrade to HeyGen lip-sync.
    // Trigger: at least one speaker in this dialog has a portrait. If not, we
    // fall back to plain audio overlay (no face animation).
    const portraitsAvailable = sceneCast.some((c) => Boolean(c.referenceImageUrl));
    const useHeygenLipSync =
      portraitsAvailable && blocks.length === 1; // single-speaker scene → replace clip with HeyGen
    // (Multi-speaker single-scene HeyGen would require stitching multiple
    // talking-head clips into one; that path lives in SRS mode.)

    try {
      // ── Idempotency: wipe previous voiceover clips for this scene so a
      //    re-generation never stacks Sarah-old + Sarah-new on top of each
      //    other (which produced the "two voices at once" bug).
      const { error: delErr } = await supabase
        .from('scene_audio_clips')
        .delete()
        .eq('scene_id', sceneId)
        .eq('kind', 'voiceover');
      if (delErr) {
        console.warn('[SceneDialogStudio] failed to clear old voiceover clips', delErr);
      }

      for (const block of blocks) {
        const c = sceneCast.find((x) => x.id === block.speakerId);
        if (!c) continue;
        const cfg = voicePerSpeaker[block.speakerId];
        if (!cfg?.voiceId) continue;

        // Engine-aware: Hume → generate-voiceover-hume, ElevenLabs → generate-voiceover.
        const fnName = cfg.engine === 'hume' ? 'generate-voiceover-hume' : 'generate-voiceover';
        const body = cfg.engine === 'hume'
          ? {
              text: block.text,
              voiceName: cfg.voiceId,
              provider: cfg.provider || 'HUME_AI',
              projectId: pid,
            }
          : {
              text: block.text,
              voiceId: cfg.isCustom ? cfg.elevenlabsVoiceId : cfg.voiceId,
              projectId: pid,
            };
        const { data, error } = await supabase.functions.invoke(fnName, { body });
        if (error) throw error;
        const audioUrl = (data as any)?.audioUrl as string | undefined;
        if (!audioUrl) throw new Error('No audioUrl returned');

        // Real audio duration — TTS service value first, browser-probe fallback.
        // Fixes the "Matthew talks longer than Sarah even though his script
        // is shorter" bug caused by the static `text.length / 18` heuristic.
        const reportedDuration = Number((data as any)?.duration ?? 0);
        const duration = reportedDuration > 0
          ? reportedDuration
          : await probeAudioDuration(audioUrl, Math.max(1.5, block.text.length / 18));

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Unauthorized');

        const { error: insErr } = await supabase
          .from('scene_audio_clips')
          .insert({
            user_id: user.id,
            project_id: pid,
            scene_id: sceneId,
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

        // Auto-upgrade single-speaker scenes to HeyGen lip-sync when we have
        // a portrait. The HeyGen render REPLACES `clip_url` so the on-screen
        // mouth actually matches the audio (Artlist/Synthesia-style flow).
        if (useHeygenLipSync && c.referenceImageUrl) {
          try {
            await generate({
              sceneId,
              projectId: pid,
              imageUrl: c.referenceImageUrl,
              audioUrl,
              aspectRatio: '9:16',
              resolution: '720p',
              composerCharacterId: c.id,
            });
          } catch (heygenErr) {
            console.warn('[SceneDialogStudio] HeyGen auto-upgrade failed, audio-only fallback in place', heygenErr);
          }
        }

        timedBlocks.push({ ...block, startSec: cumulativeOffset, durationSec: duration });
        planSpeakers.push({
          characterId: c.id,
          name: c.name,
          startSec: Math.round(cumulativeOffset * 100) / 100,
          endSec: Math.round((cumulativeOffset + duration) * 100) / 100,
          text: block.text,
          engine: cfg.engine,
          voiceId: cfg.isCustom ? cfg.elevenlabsVoiceId : cfg.voiceId,
          audioUrl,
        });
        cumulativeOffset += duration + INTER_SPEAKER_GAP_SEC; // small breath between speakers
        okCount += 1;
      }

      // Refresh the visible prompt with concrete per-speaker timestamps
      // (Audio Plan), now that real TTS durations are known.
      // Also persist the AudioPlan as a first-class field so downstream
      // consumers (lip-sync, prompt composer, audio playback) stop racing
      // against the textual fallback.
      try {
        const timedPrompt = applyDialogToPrompt(scene.aiPrompt || '', timedBlocks, language);
        const audioPlan: import('@/types/video-composer').AudioPlan = {
          version: 1,
          speakers: planSpeakers,
          totalSec: Math.round((cumulativeOffset - INTER_SPEAKER_GAP_SEC) * 100) / 100,
          interSpeakerGapSec: INTER_SPEAKER_GAP_SEC,
          language,
          generatedAt: new Date().toISOString(),
        };
        const updates: Partial<ComposerScene> = {
          audioPlan,
          dialogLockedAt: audioPlan.generatedAt,
        };
        if (timedPrompt !== (scene.aiPrompt || '')) updates.aiPrompt = timedPrompt;
        onUpdate(updates);
      } catch (e) { console.warn('[SceneDialogStudio] audioPlan emit failed', e); }

      // Bump scene duration so all VO blocks fit (cap at 60s sanity)
      const totalNeeded = Math.min(60, Math.ceil(cumulativeOffset));
      if (totalNeeded > (scene.durationSeconds ?? 0)) {
        onUpdate({ durationSeconds: totalNeeded });
      }
      // Notify other panels (SoundDesign / preview) to refresh — use the
      // shared helper so the event name matches `useSceneAudioClips`.
      try {
        const { emitSceneAudioClipsChanged } = await import('@/hooks/useSceneAudioClips');
        emitSceneAudioClipsChanged(pid);
      } catch (_) { /* noop */ }

      toast({ title: t.title, description: t.successInline(okCount) });
    } catch (e) {
      console.error('[SceneDialogStudio] inline generate error', e);
      toast({
        title: t.failed,
        description: formatError(e),
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
      if (!voicePerSpeaker[sp.id]?.voiceId) {
        toast({ title: t.voiceMissing(sp.name), variant: 'destructive' });
        return;
      }
    }
    // Pin dialog into the parent scene's AI prompt immediately — visible to
    // the user and persisted alongside the script + voice map.
    try {
      const dialogPrompt = applyDialogToPrompt(scene.aiPrompt || '', blocks, language);
      if (dialogPrompt !== (scene.aiPrompt || '')) {
        onUpdate({ dialogScript: script, dialogVoices: voicePerSpeaker, aiPrompt: dialogPrompt });
      }
    } catch (_) { /* noop */ }

    // ── Auto-SRS for multi-speaker dialog ─────────────────────────────
    // It is physically impossible to lip-sync 2+ different speakers into a
    // single AI B-roll clip — there is only one `clip_url` per scene and
    // the underlying i2v model has no idea who speaks when. Artlist /
    // Synthesia / HeyGen Studio all solve this by rendering one talking-
    // head clip per speaker and cutting them together (Shot-Reverse-Shot).
    // We force that path automatically as soon as we have ≥2 blocks AND a
    // portrait for every speaker. No silent fallback to fake "audio overlay
    // pretending to be lip-sync".
    if (blocks.length >= 2) {
      const missingPortrait = speakers.find(
        (sp) => !sceneCast.find((c) => c.id === sp.id)?.referenceImageUrl,
      );
      if (missingPortrait) {
        toast({
          title:
            language === 'de'
              ? `Kein Portrait für ${missingPortrait.name}`
              : language === 'es'
              ? `Sin retrato para ${missingPortrait.name}`
              : `No portrait for ${missingPortrait.name}`,
          description:
            language === 'de'
              ? `Weise ${missingPortrait.name} im Cast einen Brand-Character mit Portrait zu — sonst kein echtes Lip-Sync möglich.`
              : language === 'es'
              ? `Asigna a ${missingPortrait.name} un Brand-Character con retrato; sin él no hay lip-sync real.`
              : `Assign ${missingPortrait.name} a Brand-Character with a portrait — without it, real lip-sync is impossible.`,
          variant: 'destructive',
        });
        return;
      }
      if (!renderAsSeparateScenes) {
        setRenderAsSeparateScenes(true);
        // fall through into SRS path below
      }
    } else if (!renderAsSeparateScenes) {
      await handleGenerateInline();
      return;
    }
    // Ensure the project is persisted before spawning sub-scenes (otherwise
    // onAddScene would write to a non-existent project_id).
    let pidForSrs = (projectId || scene.projectId || '').trim();
    try {
      const ids = await resolvePersistedIds();
      if (!ids) {
        toast({ title: t.failed, description: PROJECT_REQUIRED[language], variant: 'destructive' });
        return;
      }
      pidForSrs = ids.pid;
    } catch (e) {
      toast({ title: t.failed, description: formatError(e), variant: 'destructive' });
      return;
    }
    setGenerating(true);
    let okCount = 0;
    // Marker so we can clean up previously auto-spawned SRS sub-scenes for
    // *this* parent scene before regenerating. Stored in the free-form
    // `cinematic_preset_slug` text column — no schema change needed.
    const srsMarker = `dialog-srs:${scene.id}`;
    try {
      // ── Pre-flight: validate every speaker has a voice + portrait BEFORE
      //    any spend, so we can't end up with a half-rendered dialog where
      //    only one speaker got real lip-sync.
      for (const block of blocks) {
        const c = sceneCast.find((x) => x.id === block.speakerId);
        if (!c) throw new Error(`Speaker "${block.speakerName}" is not in this scene's cast`);
        if (!c.referenceImageUrl) {
          throw new Error(
            language === 'de'
              ? `${c.name} hat kein Portrait — bitte im Cast einen Brand-Character mit Portrait zuweisen.`
              : language === 'es'
              ? `${c.name} no tiene retrato — asigna un Brand-Character con retrato.`
              : `${c.name} has no portrait — assign a cast Brand-Character with a portrait.`,
          );
        }
        const cfg = voicePerSpeaker[block.speakerId];
        if (!cfg?.voiceId) {
          throw new Error(t.voiceMissing(c.name));
        }
      }

      // ── Idempotency: remove previously auto-spawned dialog sub-scenes for
      //    this parent so a re-generation does NOT stack old Sarah/Matthew
      //    clips on top of the fresh ones (root cause of "random extra
      //    speakers" / "double voiceovers" in the user's report).
      try {
        const { data: stale } = await supabase
          .from('composer_scenes')
          .select('id')
          .eq('project_id', pidForSrs)
          .eq('cinematic_preset_slug', srsMarker);
        const staleIds = (stale ?? []).map((r: any) => r.id).filter(Boolean);
        if (staleIds.length > 0) {
          await supabase.from('scene_audio_clips').delete().in('scene_id', staleIds);
          await supabase.from('composer_scenes').delete().in('id', staleIds);
          console.log('[SceneDialogStudio] removed', staleIds.length, 'stale dialog sub-scenes');
        }
      } catch (cleanupErr) {
        console.warn('[SceneDialogStudio] stale sub-scene cleanup failed (continuing)', cleanupErr);
      }

      // ── Phase 1: pre-generate TTS for EVERY block first.
      //    This guarantees:
      //      • Sub-scenes are created with the REAL audio duration (no more
      //        "Matthew talks 4× too long" because of the text-length heuristic).
      //      • HeyGen always receives a fixed `audioUrl` — never an internal
      //        re-TTS that could pick a different voice.
      type Synth = {
        block: typeof blocks[number];
        character: ComposerCharacter;
        audioUrl: string;
        durationSec: number;
        engine: 'elevenlabs' | 'hume';
      };
      const synthed: Synth[] = [];
      for (const block of blocks) {
        const c = sceneCast.find((x) => x.id === block.speakerId)!;
        const cfg = voicePerSpeaker[block.speakerId]!;
        const fnName = cfg.engine === 'hume' ? 'generate-voiceover-hume' : 'generate-voiceover';
        const body = cfg.engine === 'hume'
          ? {
              text: block.text,
              voiceName: cfg.voiceId,
              provider: cfg.provider || 'HUME_AI',
              projectId: pidForSrs,
            }
          : {
              text: block.text,
              voiceId: cfg.isCustom ? cfg.elevenlabsVoiceId : cfg.voiceId,
              projectId: pidForSrs,
            };
        const { data, error } = await supabase.functions.invoke(fnName, { body });
        if (error) throw error;
        const audioUrl = (data as any)?.audioUrl as string | undefined;
        if (!audioUrl) throw new Error(`No audioUrl returned for ${c.name}`);
        const reportedDuration = Number((data as any)?.duration ?? 0);
        const durationSec = reportedDuration > 0
          ? reportedDuration
          : await probeAudioDuration(audioUrl, Math.max(1.5, block.text.length / 18));
        synthed.push({
          block,
          character: c,
          audioUrl,
          durationSec,
          engine: cfg.engine,
        });
      }

      // ── Phase 1b: refresh parent prompt with the real Audio Plan
      //    (per-speaker start–end seconds) now that durations are known.
      try {
        const timedParentBlocks = (() => {
          let cursor = 0;
          return synthed.map((s) => {
            const startSec = cursor;
            cursor += s.durationSec + INTER_SPEAKER_GAP_SEC;
            return { ...s.block, startSec, durationSec: s.durationSec };
          });
        })();
        const timedPrompt = applyDialogToPrompt(scene.aiPrompt || '', timedParentBlocks, language);
        if (timedPrompt !== (scene.aiPrompt || '')) {
          onUpdate({ aiPrompt: timedPrompt });
        }
      } catch (_) { /* noop */ }

      // ── Phase 2: spawn one sub-scene + HeyGen render per block, in script
      //    order, each with its OWN real duration and OWN audioUrl.
      if (!onAddScene) throw new Error('Cannot spawn sub-scenes: onAddScene missing');
      for (const s of synthed) {
        const charShot: CharacterShot = {
          characterId: s.character.id,
          shotType: 'profile',
        } as CharacterShot;
        const subDuration = Math.max(2, Math.min(60, Math.round(s.durationSec * 100) / 100));
        // Per-speaker dialog map — restrict to ONLY this speaker so any
        // downstream re-route that reads dialogVoices can never accidentally
        // pick another speaker's voice.
        const speakerVoiceCfg = voicePerSpeaker[s.block.speakerId];
        const newSceneIdRaw = await onAddScene({
          sceneType: scene.sceneType,
          durationSeconds: subDuration,
          // Mark as a finished HeyGen lip-sync scene so compose-video-clips
          // does NOT re-render it as ai-hailuo B-roll later.
          clipSource: 'ai-hailuo',
          clipQuality: scene.clipQuality,
          clipStatus: 'generating',
          referenceImageUrl: s.character.referenceImageUrl,
          // Single-speaker dialog script — exact line, this speaker only.
          dialogScript: `${s.character.name}: ${s.block.text}`,
          dialogVoices: speakerVoiceCfg ? { [s.character.id]: speakerVoiceCfg } : undefined,
          // Force HeyGen engine and disable any auto-routing decisions.
          engineOverride: 'heygen',
          aiPrompt: applyDialogToPrompt('', [{ ...s.block, startSec: 0, durationSec: s.durationSec }], language),
          characterShot: charShot,
          characterShots: [charShot],
          lipSyncWithVoiceover: true,
          transitionType: 'fade',
          transitionDuration: 0.3,
          // Marker for idempotent cleanup on the next regeneration AND
          // for compose-video-clips to skip these as already-rendered.
          cinematicPresetSlug: srsMarker,
        });
        const newSceneId = typeof newSceneIdRaw === 'string' ? newSceneIdRaw : undefined;

        // Always pass the pre-generated audioUrl — no HeyGen-internal TTS,
        // no risk of voice swaps. Pinning audioUrl also guarantees the
        // rendered mouth-open length === audio length === sub-scene length.
        const r = await generate({
          sceneId: newSceneId,
          projectId: pidForSrs,
          imageUrl: s.character.referenceImageUrl,
          audioUrl: s.audioUrl,
          aspectRatio: '9:16',
          resolution: '720p',
          composerCharacterId: s.character.id,
        });

        if (r?.success) okCount += 1;
      }
      toast({
        title: t.title,
        description: t.success(okCount),
      });
    } catch (e) {
      console.error('[SceneDialogStudio] generate error', e);
      toast({
        title: t.failed,
        description: formatError(e),
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  // ── Auto-Split trigger ─────────────────────────────────────────────
  // Fires once when the parent's amber "Splitten" badge sets autoSplitOnMount.
  // Requires: ≥2 dialog blocks AND a voice configured for every speaker.
  useEffect(() => {
    if (!autoSplitOnMount) return;
    if (generating) return;
    if (blocks.length < 2) return;
    const allVoicesSet = speakers.every((sp) => Boolean(voicePerSpeaker[sp.id]?.voiceId));
    if (!allVoicesSet) {
      toast({
        title:
          language === 'de'
            ? 'Stimme pro Sprecher fehlt'
            : language === 'es'
            ? 'Falta voz por hablante'
            : 'Voice per speaker missing',
        description:
          language === 'de'
            ? 'Bitte unten eine Stimme für jeden Sprecher wählen, dann erneut auf „Splitten" klicken.'
            : language === 'es'
            ? 'Selecciona una voz para cada hablante y vuelve a hacer clic en "Dividir".'
            : 'Pick a voice for every speaker, then click "Split" again.',
        variant: 'destructive',
      });
      onAutoSplitConsumed?.();
      return;
    }
    setRenderAsSeparateScenes(true);
    onAutoSplitConsumed?.();
    setTimeout(() => { void handleGenerate(); }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSplitOnMount, blocks.length, generating]);

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
            {speakers.map((sp) => {
              const cfg = voicePerSpeaker[sp.id];
              const isHume = cfg?.engine === 'hume';
              return (
                <div
                  key={sp.id}
                  className="grid grid-cols-[auto_1fr_120px_180px_auto] items-center gap-2 rounded-md border border-border/40 bg-muted/20 p-1.5"
                >
                  {sp.referenceImageUrl ? (
                    <img
                      src={sp.referenceImageUrl}
                      alt={sp.name}
                      className="h-7 w-7 rounded object-cover"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded bg-muted" />
                  )}
                  <div className="text-xs font-medium truncate">{sp.name}</div>

                  {/* Engine selector */}
                  <Select
                    value={cfg?.engine ?? 'elevenlabs'}
                    onValueChange={(v) => handleEngineChange(sp.id, v as 'elevenlabs' | 'hume')}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[60]">
                      <SelectItem value="elevenlabs" className="text-xs">ElevenLabs</SelectItem>
                      <SelectItem value="hume" className="text-xs">
                        <span className="inline-flex items-center gap-1">
                          <SparklesIcon className="h-3 w-3" />
                          Hume Octave
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Voice selector — list depends on engine */}
                  <Select
                    value={cfg?.voiceId ?? ''}
                    onValueChange={(voiceId) => {
                      if (isHume) {
                        const v = humeVoices.find((x) => x.name === voiceId);
                        updateSpeakerVoice(sp.id, {
                          voiceId,
                          voiceName: v?.label ?? voiceId,
                          provider: v?.provider ?? 'HUME_AI',
                        });
                      } else {
                        const v = elPickerEntries.find((x) => x.id === voiceId);
                        updateSpeakerVoice(sp.id, {
                          voiceId,
                          voiceName: v?.name ?? voiceId,
                          isCustom: v?.isCustom ?? false,
                          elevenlabsVoiceId: v?.elevenlabsVoiceId,
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder={t.pickVoice} />
                    </SelectTrigger>
                    <SelectContent className="z-[60] max-h-[320px]">
                      {isHume
                        ? humeVoices.map((v) => (
                            <SelectItem key={v.id} value={v.name} className="text-xs">
                              <div className="flex flex-col">
                                <span>{v.label}</span>
                                <span className="text-[10px] text-muted-foreground">{v.description}</span>
                              </div>
                            </SelectItem>
                          ))
                        : elPickerEntries.map((v) => (
                            <SelectItem key={v.id} value={v.id} className="text-xs">
                              {v.name}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>

                  {/* Preview */}
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    disabled={!cfg?.voiceId || previewing === sp.id}
                    onClick={() => handlePreview(sp.id)}
                    aria-label="Preview"
                  >
                    {previewing === sp.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              );
            })}
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
      {/* Lip-sync mode hint — honest about what each path actually delivers. */}
      {blocks.length > 0 && (() => {
        const portraitsAll = speakers.every(
          (sp) => Boolean(sceneCast.find((c) => c.id === sp.id)?.referenceImageUrl),
        );
        const missing = speakers.find(
          (sp) => !sceneCast.find((c) => c.id === sp.id)?.referenceImageUrl,
        );
        const isMulti = blocks.length >= 2;
        let label: string;
        let tone: 'primary' | 'amber' | 'muted' = 'muted';
        if (isMulti && portraitsAll) {
          tone = 'primary';
          const cost = (speakers.length * 0.30).toFixed(2);
          label = language === 'de'
            ? `🎙️ Wird als ${speakers.length} Szenen gerendert (Shot-Reverse-Shot, je 1 HeyGen-Clip pro Sprecher) — ~€${cost}`
            : language === 'es'
            ? `🎙️ Se renderizará como ${speakers.length} escenas (Shot-Reverse-Shot, 1 clip HeyGen por hablante) — ~€${cost}`
            : `🎙️ Will render as ${speakers.length} scenes (Shot-Reverse-Shot, 1 HeyGen clip per speaker) — ~€${cost}`;
        } else if (isMulti && missing) {
          tone = 'amber';
          label = language === 'de'
            ? `⚠️ ${missing.name} hat kein Portrait — bitte Cast-Charakter zuweisen, sonst kein echter Lip-Sync möglich.`
            : language === 'es'
            ? `⚠️ ${missing.name} no tiene retrato — asigna un Brand-Character, si no, no hay lip-sync real.`
            : `⚠️ ${missing.name} has no portrait — assign a cast character or real lip-sync is impossible.`;
        } else if (!isMulti && portraitsAll) {
          tone = 'primary';
          label = language === 'de'
            ? '🎙️ Lip-Sync via HeyGen — Mund passt zum Audio (~€0,30)'
            : language === 'es'
            ? '🎙️ Lip-sync via HeyGen — la boca coincide con el audio (~€0,30)'
            : '🎙️ Lip-sync via HeyGen — mouth matches the audio (~€0.30)';
        } else {
          label = language === 'de'
            ? '🔊 Audio-Overlay (kein Lip-Sync möglich ohne Cast-Portrait)'
            : language === 'es'
            ? '🔊 Solo audio (sin retrato, no hay lip-sync posible)'
            : '🔊 Audio overlay (no lip-sync possible without a cast portrait)';
        }
        const cls = tone === 'primary'
          ? 'text-primary'
          : tone === 'amber'
          ? 'text-amber-500'
          : 'text-muted-foreground';
        return <p className={`text-[10px] ${cls} -mb-1`}>{label}</p>;
      })()}
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
          ) : blocks.length >= 2 ? (
            <>
              <User className="h-3 w-3" />{' '}
              {language === 'de'
                ? `Lip-Sync generieren (${speakers.length} Szenen)`
                : language === 'es'
                ? `Generar lip-sync (${speakers.length} escenas)`
                : `Generate lip-sync (${speakers.length} scenes)`}
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

