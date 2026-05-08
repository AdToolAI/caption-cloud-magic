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
    setGenerating(true);
    let okCount = 0;
    let cumulativeOffset = 0;
    try {
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
        const duration = Number((data as any)?.duration ?? 0) || Math.max(1.5, block.text.length / 18);
        if (!audioUrl) throw new Error('No audioUrl returned');

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

        cumulativeOffset += duration + 0.15; // small breath between speakers
        okCount += 1;
      }

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
    if (!renderAsSeparateScenes) {
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
        const cfg = voicePerSpeaker[block.speakerId];
        if (!cfg?.voiceId) continue;

        if (!onAddScene) continue;

        // For Hume voices: pre-render audio to a public URL (HeyGen can't call
        // Hume directly). For ElevenLabs: let HeyGen do TTS internally.
        let preGeneratedAudioUrl: string | undefined;
        if (cfg.engine === 'hume') {
          const { data: humeData, error: humeErr } = await supabase.functions.invoke(
            'generate-voiceover-hume',
            {
              body: {
                text: block.text,
                voiceName: cfg.voiceId,
                provider: cfg.provider || 'HUME_AI',
                projectId: pidForSrs,
              },
            },
          );
          if (humeErr) throw humeErr;
          preGeneratedAudioUrl = (humeData as any)?.audioUrl;
          if (!preGeneratedAudioUrl) throw new Error('Hume returned no audioUrl');
        }

        // 1) Create the sub-scene FIRST so it has a real DB UUID.
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

        // 2) Kick off the HeyGen render. For Hume → pass the audioUrl directly.
        //    For ElevenLabs → pass text + voiceId so HeyGen can synth itself.
        const r = await generate({
          sceneId: newSceneId,
          projectId: pidForSrs,
          imageUrl: c.referenceImageUrl,
          ...(preGeneratedAudioUrl
            ? { audioUrl: preGeneratedAudioUrl }
            : {
                text: block.text,
                voiceId: cfg.isCustom ? undefined : cfg.voiceId,
                customVoiceId: cfg.isCustom ? cfg.elevenlabsVoiceId : undefined,
              }),
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
        description: formatError(e),
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

