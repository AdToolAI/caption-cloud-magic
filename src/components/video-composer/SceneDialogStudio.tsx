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

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mic, Sparkles, User, Loader2, ImageOff, Volume2, X, Lock, AlertCircle } from 'lucide-react';
import { useAccessibleCharacters } from '@/hooks/useAccessibleCharacters';
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
import { extractFunctionsError } from '@/lib/functionsError';
// useTalkingHead removed — Composer no longer routes to generate-talking-head.
// The standalone /talking-head module still owns that hook.
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { supabase } from '@/integrations/supabase/client';
import { parseDialogScript, uniqueSpeakers, type DialogBlock } from '@/lib/talking-head/parseDialogScript';
import { applyDialogToPrompt, INTER_SPEAKER_GAP_SEC } from '@/lib/motion-studio/applyDialogToPrompt';
import { buildInvokePrompt } from '@/lib/motion-studio/buildInvokePrompt';
import { sanitizeDialogScript } from '@/lib/motion-studio/planDisplayFilter';
import { useHumeVoices } from '@/hooks/useHumeVoices';
import {
  resolveDialogVoice,
  resolveCharacterVoiceProfile,
  mergeWithTonality,
  type VoiceTuning,
} from '@/lib/voice-studio/resolveDialogVoice';
import { sortVoicesPremiumFirst, type VoiceMeta } from '@/lib/elevenlabs-voices';
import { emitPipelineEvent } from '@/lib/pipelineEvents';
import {
  AUTO_VOICE_OPTIONS,
  cleanVoiceId,
  getAutoVoiceName,
  toElevenLabsDialogVoice,
} from '@/lib/video-composer/autoVoiceAssignment';
import { dialogLineKey } from '@/lib/talking-head/dialogTakeKey';
import { DialogTakeStrip } from './DialogTakeStrip';
import PerTurnShotChip from './PerTurnShotChip';
import { useSceneRenderConfirm } from '@/lib/composer/sceneRenderConfirm';
import {
  buildCoveragePartials,
  coverageMarkerFor,
} from '@/lib/shotDirector/spawnCoverageScenes';
import type { ShotSelection } from '@/config/shotDirector';
import { Sparkles as SparklesIcon, Play, Clapperboard } from 'lucide-react';
import type {
  ComposerCharacter,
  ComposerScene,
  CharacterShot,
  DialogVoiceCfg,
  DialogTakeBundle,
} from '@/types/video-composer';

interface SceneDialogStudioProps {
  scene: ComposerScene;
  cast: CharacterShot[];
  characters: ComposerCharacter[];
  projectId?: string;
  language: 'de' | 'en' | 'es';
  onUpdate: (updates: Partial<ComposerScene>) => void;
  onAddScene?: (partial: Partial<ComposerScene>) => Promise<string | undefined> | void;
  /** Inserts SRS lip-sync sub-scenes at this scene's slot, replacing the
   *  parent dialog scene so users see Scene #1/#2 instead of new tail scenes. */
  onInsertScenesAfter?: (
    parentSceneId: string,
    partials: Partial<ComposerScene>[],
    opts?: { removeParent?: boolean },
  ) => Promise<(string | undefined)[]>;
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

/** Pure reader for Phase 3.1 per-line Shot Director overrides. */
function getDialogShotOverride(
  scene: ComposerScene,
  lineKey: string,
): Partial<ShotSelection> | undefined {
  const mods = scene.directorModifiers as Record<string, unknown> | undefined;
  const dialogShots = mods?.dialogShots as Record<string, Partial<ShotSelection>> | undefined;
  return dialogShots?.[lineKey];
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
    genBtn: 'Clip generieren mit Voiceover',
    genBtnSrs: 'Clip mit Lip-Sync generieren',
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
    srsLabel: 'Erweitert: Stattdessen als Voiceover über eine gemeinsame Szene legen',
    srsHint: 'Standard bei mehreren Sprechern mit Portrait: jeder Sprecher bekommt seinen eigenen Lip-Sync-Cut. Schalter aktivieren, wenn du nur eine Gruppen-Szene mit Voiceover willst.',
    close: 'Schließen',
    continuityLocked: 'Continuity gesperrt',
    continuityInherited: (n: number) => `Continuity erbt von Szene ${n}`,
    continuityTooltip: 'Folgeszenen mit gleichem Cast erben diesen Identity-Anker automatisch.',
    continuityTooltipInherited: (n: number) => `Sarah/Matthew werden visuell an Szene ${n} angeglichen.`,
    continuityRemove: 'Lock entfernen',
    continuityForce: 'Eigenen Lock erzwingen',
  },
  en: {
    title: 'Scene Script',
    subtitle: 'Write a screenplay — the dialog plays as voiceover IN this scene.',
    subtitleMono: 'Monologue — the character speaks to camera. Plays as voiceover in this scene.',
    script: 'Screenplay',
    voices: 'Voice per speaker',
    pickVoice: 'Pick voice',
    aiBtn: 'AI Script',
    genBtn: 'Generate Clip with Voiceover',
    genBtnSrs: 'Generate Clip with Lip-Sync',
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
    srsLabel: 'Advanced: keep it as voiceover over one shared scene instead',
    srsHint: 'Default with multiple speakers (with portraits): each speaker gets their own lip-sync cut. Toggle on if you only want a group scene with voiceover.',
    close: 'Close',
    continuityLocked: 'Continuity locked',
    continuityInherited: (n: number) => `Continuity inherited from Scene ${n}`,
    continuityTooltip: 'Following scenes with the same cast inherit this identity anchor automatically.',
    continuityTooltipInherited: (n: number) => `Cast appearance is matched to Scene ${n}.`,
    continuityRemove: 'Remove lock',
    continuityForce: 'Force own lock',
  },
  es: {
    title: 'Guion de escena',
    subtitle: 'Escribe un guion — el diálogo suena como voz en off EN esta escena.',
    subtitleMono: 'Monólogo — el personaje habla a cámara. Suena como voz en off en esta escena.',
    script: 'Guion',
    voices: 'Voz por hablante',
    pickVoice: 'Elegir voz',
    aiBtn: 'Guion con IA',
    genBtn: 'Generar Clip con Locución',
    genBtnSrs: 'Generar Clip con Lip-Sync',
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
    srsLabel: 'Avanzado: en su lugar, déjalo como voz en off sobre una escena compartida',
    srsHint: 'Por defecto con varios hablantes (con retratos): cada hablante tiene su propio plano lip-sync. Activa el interruptor si solo quieres una escena de grupo con voz en off.',
    close: 'Cerrar',
    continuityLocked: 'Continuidad bloqueada',
    continuityInherited: (n: number) => `Continuidad heredada de la escena ${n}`,
    continuityTooltip: 'Las escenas siguientes con el mismo reparto heredan este ancla de identidad automáticamente.',
    continuityTooltipInherited: (n: number) => `La apariencia del reparto se ajusta a la escena ${n}.`,
    continuityRemove: 'Quitar bloqueo',
    continuityForce: 'Forzar bloqueo propio',
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
  onInsertScenesAfter,
  open,
  onClose,
  onEnsurePersisted,
  autoSplitOnMount,
  onAutoSplitConsumed,
}, ref) {
  const t = T[language];
  const { toast } = useToast();
  // HeyGen Talking-Head hook removed from Composer.
  const { voices: customVoices } = useCustomVoices();
  const { voices: humeVoices } = useHumeVoices();
  const { data: accessibleChars = [] } = useAccessibleCharacters();
  const confirmRender = useSceneRenderConfirm();

  const isUuid = (value: string | null | undefined) =>
    !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  const canonicalDialogTurns = useMemo(() => {
    const turns = Array.isArray(scene.dialogTurns) ? scene.dialogTurns : [];
    return turns
      .map((turn, index) => {
        const characterId = String((turn as any)?.characterId ?? '').trim();
        const text = String((turn as any)?.text ?? '').trim();
        if (!isUuid(characterId) || !text) return null;
        return {
          turnId: (turn as any)?.turnId ? String((turn as any).turnId) : undefined,
          characterId,
          displayName: String((turn as any)?.displayName ?? '').trim() || undefined,
          text,
          mood: (turn as any)?.mood ? String((turn as any).mood) : undefined,
          order: typeof (turn as any)?.order === 'number' ? Number((turn as any).order) : index,
        };
      })
      .filter((turn): turn is NonNullable<typeof turn> => !!turn)
      .sort((a, b) => a.order - b.order);
  }, [scene.dialogTurns]);

  // Build the cast subset of ComposerCharacters that are actually in this scene.
  // Library-Fallback in 3 Stufen, damit der Studio nicht leer rendert wenn der
  // Plan/Briefing-Apply die IDs nicht 1:1 in die Project-Cast-Liste schreibt:
  //   1) direkter Match in `characters` (project-local)
  //   2) Match in `characters` via brandCharacterId
  //   3) Match in `accessibleChars` (Avatar-Library) via id / brandCharacterId
  //   4) Fuzzy Name-Match (first-name, substring) gegen beide Pools
  const buildSyntheticFromLibrary = (lib: any): ComposerCharacter => ({
    id: lib.id,
    name: lib.name ?? 'Charakter',
    appearance: (lib as any).appearance ?? (lib as any).description ?? '',
    signatureItems: (lib as any).signature_items ?? '',
    brandCharacterId: lib.id,
    referenceImageUrl:
      (lib as any).portrait_url ??
      (lib as any).reference_image_url ??
      (lib as any).hedra_portrait_url ??
      undefined,
    identityCardPrompt: (lib as any).identity_card_prompt ?? undefined,
  });

  const sceneCast = useMemo<ComposerCharacter[]>(() => {
    const lowered = (s: string) => (s || '').toLowerCase();
    const firstOf = (s: string) => lowered(s).split(/\s+/)[0] ?? '';
    const buildSyntheticFromId = (id: string, displayName?: string): ComposerCharacter => ({
      id,
      name: displayName?.trim() || `Character ${id.slice(0, 8)}`,
      appearance: '',
      signatureItems: '',
      brandCharacterId: id,
    });
    const findByName = (needle: string): ComposerCharacter | undefined => {
      const n = lowered(needle);
      const nFirst = firstOf(needle);
      if (!n) return undefined;
      const inProject = characters.find((c) => {
        const cn = lowered(c.name);
        return cn === n || firstOf(c.name) === nFirst || cn.includes(nFirst);
      });
      if (inProject) return inProject;
      const inLib = accessibleChars.find((b: any) => {
        const bn = lowered(b.name ?? '');
        return bn === n || firstOf(b.name ?? '') === nFirst || bn.includes(nFirst);
      });
      return inLib ? buildSyntheticFromLibrary(inLib) : undefined;
    };

    const resolved = cast
      .map((cs) => {
        if (cs.characterId) {
          const direct = characters.find((c) => c.id === cs.characterId);
          if (direct) return direct;
          const viaBrand = characters.find((c) => c.brandCharacterId === cs.characterId);
          if (viaBrand) return viaBrand;
          const libHit = accessibleChars.find(
            (b: any) => b.id === cs.characterId,
          );
          if (libHit) return buildSyntheticFromLibrary(libHit);
        }
        // Last resort: try by any name attached to the cast slot.
        const nameGuess =
          (cs as any).characterName ||
          (cs as any).name ||
          (cs.characterId ?? '');
        return findByName(String(nameGuess));
      })
      .filter((c): c is ComposerCharacter => !!c);

    for (const turn of canonicalDialogTurns) {
      if (resolved.some((c) => c.id === turn.characterId || c.brandCharacterId === turn.characterId)) continue;
      const direct = characters.find((c) => c.id === turn.characterId || c.brandCharacterId === turn.characterId);
      if (direct) {
        resolved.push(direct);
        continue;
      }
      const libHit = accessibleChars.find((b: any) => b.id === turn.characterId);
      resolved.push(libHit ? buildSyntheticFromLibrary(libHit) : buildSyntheticFromId(turn.characterId, turn.displayName));
    }

    // Script-name Fallback: wenn der Cast-Resolver leer ist, das Skript aber
    // "NAME: ..."-Zeilen enthält, lösen wir die Namen direkt gegen die
    // Briefing-Liste + Avatar-Library auf, damit Sprecher- und Stimm-Auswahl
    // wieder erscheinen (statt 0 Sprecher). Wir lesen aus scene.dialogScript
    // (persistente Quelle) — das lokale `script`-State ist hier noch nicht
    // deklariert.
    const persistedScript = scene.dialogScript ?? '';
    if (resolved.length === 0 && persistedScript) {
      const re =
        /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 _.'-]{0,60}?)\s*(?:[—–-]\s*[A-Za-zÀ-ÿ ]{1,32})?\s*(?:\[[^\]]{1,32}\])?\s*:\s*\S/;
      const found: ComposerCharacter[] = [];
      const seen = new Set<string>();
      for (const raw of persistedScript.split(/\r?\n/)) {
        const m = re.exec(raw.trim());
        if (!m) continue;
        const hit = findByName(m[1].trim());
        if (hit && !seen.has(hit.id)) {
          seen.add(hit.id);
          found.push(hit);
        }
      }
      if (found.length > 0) return found;
    }

    return resolved;
  }, [cast, characters, accessibleChars, scene.dialogScript, canonicalDialogTurns]);



  // Brand-default voice per ComposerCharacter.id — pulled from the Avatar Library.
  // Used for one-tap auto-binding when a speaker first enters the scene.
  const defaultVoiceByCharId = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const c of sceneCast) {
      const lookupId = c.brandCharacterId ?? c.id;
      const brand = accessibleChars.find((b) => b.id === lookupId);
      const voice = cleanVoiceId((brand as any)?.default_voice_id);
      if (voice) {
        out[c.id] = voice;
        out[lookupId] = voice;
      }
    }
    return out;
  }, [sceneCast, accessibleChars]);

  // Phase C — Brand voice tuning profile per ComposerCharacter.id.
  // Read from brand_characters.voice_settings; merged with per-line tonality
  // markers at TTS time via mergeWithTonality(). When absent, callers fall
  // back to ElevenLabs defaults inside generate-voiceover.
  const voiceProfileByCharId = useMemo<Record<string, VoiceTuning | null>>(() => {
    const out: Record<string, VoiceTuning | null> = {};
    for (const c of sceneCast) {
      const lookupId = c.brandCharacterId ?? c.id;
      const brand = accessibleChars.find((b) => b.id === lookupId);
      out[c.id] = resolveCharacterVoiceProfile(brand as any);
    }
    return out;
  }, [sceneCast, accessibleChars]);

  /** Build the merged voice_settings payload for one dialog block. */
  const buildTuningForBlock = (block: { speakerId: string; tonality?: string }) => {
    const base = voiceProfileByCharId[block.speakerId] ?? null;
    const merged = mergeWithTonality(base, (block.tonality as any) ?? null);
    return {
      stability: merged.stability,
      similarityBoost: merged.similarityBoost,
      style: merged.style,
      useSpeakerBoost: merged.useSpeakerBoost,
      speed: merged.speed,
    };
  };



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
    const existing = new Set([...lib, ...custom].map((v) => v.id));
    const autoFallbacks = AUTO_VOICE_OPTIONS
      .filter((v) => !existing.has(v.id))
      .map((v) => ({
        id: v.id,
        name: v.name,
        isCustom: false as const,
        elevenlabsVoiceId: undefined as string | undefined,
        gender: v.gender,
      }));
    return [...lib, ...custom, ...autoFallbacks];
  }, [elVoices, customVoices]);

  const dialogTurnsToScript = () =>
    canonicalDialogTurns
      .map((turn) => {
        const speaker = sceneCast.find((c) => c.id === turn.characterId || c.brandCharacterId === turn.characterId);
        const name = speaker?.name ?? turn.displayName ?? `Character ${turn.characterId.slice(0, 8)}`;
        return `${name}: ${turn.text}`;
      })
      .join('\n');

  const displayScriptFromScene = () => sanitizeDialogScript(scene.dialogScript) || dialogTurnsToScript();

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

  const [script, setScript] = useState(() => displayScriptFromScene());
  const [voicePerSpeaker, setVoicePerSpeaker] = useState<Record<string, DialogVoiceCfg>>(
    normalizeVoiceMap(scene.dialogVoices),
  );
  const [dialogTakes, setDialogTakes] = useState<Record<string, DialogTakeBundle>>(
    (scene.dialogTakes as Record<string, DialogTakeBundle> | undefined) ?? {},
  );
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genStage, setGenStage] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [renderAsSeparateScenes, setRenderAsSeparateScenes] = useState(false);

  const scriptLineTexts = (value: string) =>
    String(value ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^([^:\n]{1,96}):\s*(.*)$/);
        return (match ? match[2] : line).trim();
      })
      .filter(Boolean);

  const cleanDialogVoiceCfg = (cfg?: DialogVoiceCfg): DialogVoiceCfg | undefined => {
    if (!cfg?.voiceId) return undefined;
    if (cfg.engine === 'hume') return cfg;
    const voiceId = cleanVoiceId(cfg.voiceId);
    return voiceId ? { ...cfg, voiceId, voiceName: cfg.voiceName || getAutoVoiceName(voiceId) || voiceId } : undefined;
  };

  const getSpeakerAliases = (speakerId: string) => {
    const castEntry = sceneCast.find((c) => c.id === speakerId || c.brandCharacterId === speakerId);
    const brandId = castEntry?.brandCharacterId ?? speakerId;
    return Array.from(new Set([speakerId, brandId].filter(Boolean)));
  };

  // Sync when switching scenes OR when external state (plan-apply, hydration,
  // realtime) brings fresh dialogTurns/dialogScript. We protect in-flight
  // typing: if the user's local `script` differs from the persisted
  // `scene.dialogScript`, we don't overwrite — the debounced save effect
  // below will flush the user's edits back onto the scene.
  const lastSyncedSceneIdRef = useRef<string | null>(null);
  useEffect(() => {
    const cleanedScript = displayScriptFromScene();
    const sceneChanged = lastSyncedSceneIdRef.current !== scene.id;
    const localMatchesPersisted =
      script === (scene.dialogScript ?? '') || script === '';
    if (sceneChanged || localMatchesPersisted) {
      setScript(cleanedScript);
      if ((scene.dialogScript ?? '') && cleanedScript !== (scene.dialogScript ?? '')) {
        onUpdate({ dialogScript: cleanedScript });
      }
      setVoicePerSpeaker(normalizeVoiceMap(scene.dialogVoices));
      setDialogTakes((scene.dialogTakes as Record<string, DialogTakeBundle> | undefined) ?? {});
    }
    lastSyncedSceneIdRef.current = scene.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, scene.dialogScript, canonicalDialogTurns]);

  // Persist script with debounce. If canonical ID turns exist, keep them as the
  // technical source of truth and only update turn text by line order.
  useEffect(() => {
    if (script === (scene.dialogScript ?? '')) return;
    const handle = setTimeout(() => {
      const updates: Partial<ComposerScene> = { dialogScript: script };
      if (canonicalDialogTurns.length > 0) {
        const texts = scriptLineTexts(script);
        if (texts.length === canonicalDialogTurns.length) {
          updates.dialogTurns = canonicalDialogTurns.map((turn, order) => ({
            ...turn,
            text: texts[order] ?? turn.text,
            order,
          }));
        }
      }
      onUpdate(updates);
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script, canonicalDialogTurns]);

  /** Persist voice map immediately on change */
  const updateSpeakerVoice = (speakerId: string, patch: Partial<DialogVoiceCfg>) => {
    const cur = voicePerSpeaker[speakerId];
    const nextCfg: DialogVoiceCfg = {
      ...(cur ?? { engine: 'elevenlabs', voiceId: '' }),
      ...patch,
    };
    const next: Record<string, DialogVoiceCfg> = { ...voicePerSpeaker };
    for (const key of getSpeakerAliases(speakerId)) next[key] = nextCfg;
    setVoicePerSpeaker(next);
    const nextCharacterVoiceId =
      speakers.length === 1 && nextCfg.engine === 'elevenlabs'
        ? cleanVoiceId(nextCfg.isCustom ? nextCfg.elevenlabsVoiceId : nextCfg.voiceId)
        : undefined;
    onUpdate({
      dialogVoices: next,
      ...(nextCharacterVoiceId ? { characterVoiceId: nextCharacterVoiceId } : {}),
    });
  };

  /** Persist take-bundle for a single dialog line (Take-System A/B/C). */
  const updateLineTakes = (lineKey: string, bundle: DialogTakeBundle) => {
    const next = { ...dialogTakes };
    if (!bundle || (bundle.takes.length === 0 && !bundle.active)) {
      delete next[lineKey];
    } else {
      next[lineKey] = bundle;
    }
    setDialogTakes(next);
    onUpdate({ dialogTakes: next });
  };

  /**
   * Phase 3.1 — pre-lock per-line Shot Director overrides. Persisted as
   * a sub-object of the existing `directorModifiers` JSONB (no migration).
   * Read by composeFinalPrompt as `dialogShotOverrides` and copied into
   * `AudioPlanSpeaker.shotDirector` when the audio plan is locked.
   */
  const setDialogShotOverride = (lineKey: string, sel: Partial<ShotSelection>) => {
    const mods = { ...(scene.directorModifiers ?? {}) } as Record<string, unknown>;
    const dialogShots = { ...((mods.dialogShots as Record<string, Partial<ShotSelection>>) ?? {}) };
    if (!sel || Object.keys(sel).length === 0) delete dialogShots[lineKey];
    else dialogShots[lineKey] = sel;
    mods.dialogShots = dialogShots;
    onUpdate({ directorModifiers: mods as any });
  };


  /** Pull the active take's audio for a given line, if any. */
  const getActiveTake = (lineKey: string) => {
    const b = dialogTakes[lineKey];
    if (!b || !b.active) return null;
    return b.takes.find((t) => t.id === b.active) ?? null;
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
    const cfg = getResolvedVoiceForSpeakerId(speakerId);
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

  const idBlocks = useMemo<DialogBlock[] | null>(() => {
    if (canonicalDialogTurns.length === 0) return null;
    const texts = scriptLineTexts(script);
    const hasAlignedEditorText = texts.length === canonicalDialogTurns.length;
    const out = canonicalDialogTurns
      .map((turn, index) => {
        const speaker = sceneCast.find((c) => c.id === turn.characterId || c.brandCharacterId === turn.characterId);
        const speakerId = speaker?.id ?? turn.characterId;
        return {
          speakerId,
          speakerName: speaker?.name ?? turn.displayName ?? `Character ${turn.characterId.slice(0, 8)}`,
          text: hasAlignedEditorText ? (texts[index] ?? turn.text) : turn.text,
        } satisfies DialogBlock;
      })
      .filter((block) => block.text.trim().length > 0);
    return out.length > 0 ? out : null;
  }, [canonicalDialogTurns, script, sceneCast]);

  // v229 — Robust fallback: wenn weder ID-Turns noch der Namens-Parser Blöcke
  // finden, sichtbare `Name: Text`-Zeilen trotzdem als Blöcke zählen. Sprecher,
  // die (noch) nicht im Cast auflösbar sind, werden temporär erzeugt, damit
  // der Header nie „0 Blöcke" bei sichtbarem Text zeigt.
  const looseBlocks = useMemo<DialogBlock[]>(() => {
    const out: DialogBlock[] = [];
    for (const raw of String(script ?? '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^([^:\n]{2,96}):\s*(.+)$/);
      if (!m) continue;
      const speakerName = m[1].trim();
      const text = m[2].trim();
      if (!speakerName || !text) continue;
      const resolved = sceneCast.find((c) => {
        const a = (c.name || '').toLowerCase().trim();
        const b = speakerName.toLowerCase().trim();
        if (!a || !b) return false;
        return a === b || a.split(/\s+/)[0] === b.split(/\s+/)[0];
      });
      const slug = speakerName
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `speaker-${out.length + 1}`;
      out.push({
        speakerId: resolved?.id ?? slug,
        speakerName: resolved?.name ?? speakerName,
        text,
      });
    }
    return out;
  }, [script, sceneCast]);

  const blocks = useMemo(() => {
    if (idBlocks && idBlocks.length > 0) return idBlocks;
    const parsed = parseDialogScript(script, sceneCast);
    if (parsed.length > 0) return parsed;
    return looseBlocks;
  }, [idBlocks, script, sceneCast, looseBlocks]);

  const speakers = useMemo(() => {
    const resolved = uniqueSpeakers(blocks, sceneCast);
    if (resolved.length > 0 || blocks.length === 0) return resolved;
    // Blocks vorhanden, aber keiner der Sprecher ist im Cast auflösbar
    // (async Cast-Load, oder Kunde hat noch keinen Slot vergeben). Wir
    // erzeugen leichte Cast-Einträge, damit die Zählung stimmt.
    const byId = new Map<string, ComposerCharacter>();
    for (const b of blocks) {
      if (byId.has(b.speakerId)) continue;
      byId.set(b.speakerId, {
        id: b.speakerId,
        name: b.speakerName,
        appearance: '',
        signatureItems: '',
      });
    }
    return Array.from(byId.values());
  }, [blocks, sceneCast]);

  const resolvedVoicePerSpeaker = useMemo<Record<string, DialogVoiceCfg>>(() => {
    const sceneVoices = normalizeVoiceMap(scene.dialogVoices);
    const out: Record<string, DialogVoiceCfg> = {};

    for (const sp of speakers) {
      const castEntry = sceneCast.find((c) => c.id === sp.id);
      const lookupId = castEntry?.brandCharacterId ?? sp.id;
      const aliases = Array.from(new Set([sp.id, lookupId].filter(Boolean)));
      const existing = aliases
        .map((key) => cleanDialogVoiceCfg(voicePerSpeaker[key]) ?? cleanDialogVoiceCfg(sceneVoices[key]))
        .find(Boolean);
      const rootVoiceId = speakers.length === 1 ? cleanVoiceId((scene as any).characterVoiceId) : undefined;
      const fromSceneRoot = rootVoiceId
        ? toElevenLabsDialogVoice(rootVoiceId, getAutoVoiceName(rootVoiceId), true)
        : undefined;
      const chosen = existing ?? fromSceneRoot;
      if (chosen?.voiceId) out[sp.id] = chosen;
    }

    return out;
  }, [speakers, sceneCast, voicePerSpeaker, scene.dialogVoices, (scene as any).characterVoiceId]);

  const resolvedDialogVoiceMap = useMemo<Record<string, DialogVoiceCfg>>(() => {
    const next: Record<string, DialogVoiceCfg> = { ...voicePerSpeaker };
    for (const sp of speakers) {
      const chosen = resolvedVoicePerSpeaker[sp.id];
      if (!chosen?.voiceId) continue;
      for (const key of getSpeakerAliases(sp.id)) next[key] = chosen;
    }
    return next;
  }, [voicePerSpeaker, resolvedVoicePerSpeaker, speakers, sceneCast]);

  const getResolvedVoiceForSpeakerId = (speakerId: string): DialogVoiceCfg | undefined => {
    const sp = speakers.find((s) => s.id === speakerId);
    return (sp ? resolvedVoicePerSpeaker[sp.id] : undefined) ?? cleanDialogVoiceCfg(voicePerSpeaker[speakerId]);
  };

  // ── Voice Auto-Bind (Phase A+) ─────────────────────────────────────────
  // Existing dialog voice → brand-id alias → single-speaker characterVoiceId
  // → Avatar default_voice_id → deterministic AI pool.
  useEffect(() => {
    if (speakers.length === 0) return;
    let patched: Record<string, DialogVoiceCfg> | null = null;
    let nextCharacterVoiceId = cleanVoiceId((scene as any).characterVoiceId);

    for (const sp of speakers) {
      const castEntry = sceneCast.find((c) => c.id === sp.id);
      const lookupId = castEntry?.brandCharacterId ?? sp.id;
      const chosen = resolvedVoicePerSpeaker[sp.id];
      if (!chosen?.voiceId) continue;
      const keys = Array.from(new Set([sp.id, lookupId].filter(Boolean)));
      for (const key of keys) {
        const cur = cleanDialogVoiceCfg(voicePerSpeaker[key]);
        if (cur?.engine !== chosen.engine || cur?.voiceId !== chosen.voiceId || cur?.voiceName !== chosen.voiceName) {
          patched = patched ?? { ...voicePerSpeaker };
          patched[key] = chosen;
        }
      }
      if (speakers.length === 1 && chosen.engine === 'elevenlabs' && !nextCharacterVoiceId) {
        nextCharacterVoiceId = cleanVoiceId(chosen.voiceId);
      }
    }
    const update: Partial<ComposerScene> = {};
    if (patched) {
      setVoicePerSpeaker(patched);
      update.dialogVoices = patched;
    }
    if (nextCharacterVoiceId && nextCharacterVoiceId !== cleanVoiceId((scene as any).characterVoiceId)) {
      (update as any).characterVoiceId = nextCharacterVoiceId;
    }
    if (Object.keys(update).length > 0) {
      onUpdate(update);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakers, resolvedVoicePerSpeaker, (scene as any).characterVoiceId, sceneCast, voicePerSpeaker]);


  const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);
  const estimatedDurationSec = Math.max(3, Math.ceil(totalChars / 18));
  // Legacy HeyGen cost estimation dropped — Cinematic-Sync cost is shown per scene in ClipsTab.
  const totalCost = 0;

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
    setGenerating(true);
    emitPipelineEvent({ type: 'voiceover:start' });
    try {
      const ids = await resolvePersistedIds();
      if (!ids) {
        toast({
          title: t.failed,
          description: PROJECT_REQUIRED[language],
          variant: 'destructive',
        });
        emitPipelineEvent({ type: 'voiceover:end' });
        setGenerating(false);
        return;
      }
      pid = ids.pid;
      sceneId = ids.sceneId;
    } catch (e) {
      toast({ title: t.failed, description: formatError(e), variant: 'destructive' });
      emitPipelineEvent({ type: 'voiceover:end' });
      setGenerating(false);
      return;
    }
    // Pin dialog into the visible AI prompt immediately so the user sees the
    // concrete speaker lines right after clicking "Generate voiceover".
    try {
      const dialogPrompt = applyDialogToPrompt(scene.aiPrompt || '', blocks, language);
      if (dialogPrompt !== (scene.aiPrompt || '')) {
        onUpdate({ dialogScript: script, dialogVoices: resolvedDialogVoiceMap, aiPrompt: dialogPrompt });
      }
    } catch (_) { /* noop — non-fatal */ }
    let okCount = 0;
    let cumulativeOffset = 0;
    const timedBlocks: typeof blocks = [];
    // Director Console — accumulator for the first-class AudioPlan.
    // Stays in script order so `startSec`/`endSec` map directly to playback.
    const planSpeakers: import('@/types/video-composer').AudioPlanSpeaker[] = [];

    // (HeyGen auto-upgrade removed — Composer no longer routes to
    // generate-talking-head. Real lip-sync happens via compose-video-clips
    // + Sync.so on the Hailuo/HappyHorse master plate.)

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

      for (let bi = 0; bi < blocks.length; bi++) {
        const block = blocks[bi];
        const c = sceneCast.find((x) => x.id === block.speakerId);
        if (!c) continue;
        const cfg = getResolvedVoiceForSpeakerId(block.speakerId);
        if (!cfg?.voiceId) continue;

        // ── Take-System A/B/C reuse (Phase B + C: tonality-aware key) ──
        const lineKey = dialogLineKey(bi, block.text, block.tonality);
        const activeTake = getActiveTake(lineKey);

        let audioUrl: string | undefined;
        let duration: number;

        if (activeTake?.audioUrl) {
          audioUrl = activeTake.audioUrl;
          duration = activeTake.durationSec > 0
            ? activeTake.durationSec
            : await probeAudioDuration(activeTake.audioUrl, Math.max(1.5, block.text.length / 18));
        } else {
          // Engine-aware: Hume → generate-voiceover-hume, ElevenLabs → generate-voiceover.
          const fnName = cfg.engine === 'hume' ? 'generate-voiceover-hume' : 'generate-voiceover';
          const tuning = cfg.engine === 'elevenlabs' ? buildTuningForBlock(block) : undefined;
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
                ...(tuning ?? {}),
              };
          const { data, error } = await supabase.functions.invoke(fnName, { body });
          if (error) throw error;
          audioUrl = (data as any)?.audioUrl as string | undefined;
          if (!audioUrl) throw new Error('No audioUrl returned');

          // Real audio duration — TTS service value first, browser-probe fallback.
          // Fixes the "Matthew talks longer than Sarah even though his script
          // is shorter" bug caused by the static `text.length / 18` heuristic.
          const reportedDuration = Number((data as any)?.duration ?? 0);
          duration = reportedDuration > 0
            ? reportedDuration
            : await probeAudioDuration(audioUrl, Math.max(1.5, block.text.length / 18));
        }
        // After both branches audioUrl is guaranteed to be a string.
        const finalAudioUrl: string = audioUrl!;

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
            url: finalAudioUrl,
            start_offset: Math.round(cumulativeOffset * 100) / 100,
            duration: Math.round(duration * 100) / 100,
            volume: 1.0,
            ducking_enabled: true,
            cost_credits: 0,
          });
        if (insErr) throw insErr;

        // HeyGen auto-upgrade REMOVED — Composer no longer produces
        // isolated portrait busts. The scene's real lip-sync happens via
        // compose-video-clips → Sync.so on the Hailuo/HappyHorse master
        // plate. `useHeygenLipSync` is dead code below.


        timedBlocks.push({ ...block, startSec: cumulativeOffset, durationSec: duration });
        planSpeakers.push({
          characterId: c.id,
          name: c.name,
          startSec: Math.round(cumulativeOffset * 100) / 100,
          endSec: Math.round((cumulativeOffset + duration) * 100) / 100,
          text: block.text,
          engine: cfg.engine,
          voiceId: cfg.isCustom ? cfg.elevenlabsVoiceId : cfg.voiceId,
          audioUrl: finalAudioUrl,
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

      // Bump scene duration so all VO blocks fit (cap at 60s sanity).
      // June 26 2026 — Hailuo guard: Hailuo only supports 6s | 10s. NEVER
      // auto-bump Hailuo scenes wegen Audio-Länge — das würde die bewusste
      // Nutzer-Wahl (6s) zu einer Zwischenlänge überschreiben, die später
      // als 10s gerundet wird. Sync.so `cut_off` kürzt stattdessen das Audio.
      const totalNeeded = Math.min(60, Math.ceil(cumulativeOffset));
      const isHailuoScene = (scene.clipSource as string) === 'ai-hailuo';
      if (!isHailuoScene && totalNeeded > (scene.durationSeconds ?? 0)) {
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
      emitPipelineEvent({ type: 'voiceover:end' });
      setGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (blocks.length === 0) {
      toast({ title: t.parseEmpty, variant: 'destructive' });
      return;
    }
    for (const sp of speakers) {
      if (!getResolvedVoiceForSpeakerId(sp.id)?.voiceId) {
        toast({ title: t.voiceMissing(sp.name), variant: 'destructive' });
        return;
      }
    }
    // Warn when two speakers share the SAME voice id — almost always a setup
    // mistake that produces "both characters sound identical".
    if (speakers.length >= 2) {
      const seen = new Map<string, string>();
      for (const sp of speakers) {
        const cfg = getResolvedVoiceForSpeakerId(sp.id);
        const vid = cfg?.isCustom ? cfg?.elevenlabsVoiceId : cfg?.voiceId;
        if (!vid) continue;
        if (seen.has(vid)) {
          const other = seen.get(vid)!;
          toast({
            title:
              language === 'de'
                ? 'Gleiche Stimme für zwei Sprecher'
                : language === 'es'
                ? 'Misma voz para dos hablantes'
                : 'Same voice on two speakers',
            description:
              language === 'de'
                ? `${other} und ${sp.name} nutzen dieselbe Stimme. Bitte unterschiedliche Stimmen wählen.`
                : language === 'es'
                ? `${other} y ${sp.name} usan la misma voz. Elige voces distintas.`
                : `${other} and ${sp.name} share the same voice. Please pick different voices.`,
            variant: 'destructive',
          });
          return;
        }
        seen.set(vid, sp.name);
      }
    }
    // ── Schritt 1: Cost-Confirm-Gate (Dialog) ───────────────────────────
    // N speakers × ceil(dur) × 9 Cr/s for Sync.so lipsync passes, plus
    // Hailuo plate + VO per turn. Show aggregated cost before firing.
    {
      const turnCount = Math.max(1, blocks.length);
      const ok = await confirmRender({
        scenes: [
          {
            ...scene,
            dialogScript: script,
            dialogVoices: resolvedDialogVoiceMap,
            withAudio: true,
          } as typeof scene,
        ],
        passes: turnCount,
        title:
          turnCount > 1
            ? `Dialog rendern (${turnCount} Turns)?`
            : 'Dialog-Szene rendern?',
        description:
          turnCount > 1
            ? `Pro Sprecher-Turn läuft ein eigener Hailuo-Plate + dedizierter Sync.so Lip-Sync. Gesamtkosten siehe unten.`
            : 'Voiceover + Lip-Sync werden mitberechnet.',
      });
      if (!ok) return;
    }
    // Pin dialog into the parent scene's AI prompt immediately — visible to
    // the user and persisted alongside the script + voice map.
    try {
      const dialogPrompt = applyDialogToPrompt(scene.aiPrompt || '', blocks, language);
      if (dialogPrompt !== (scene.aiPrompt || '')) {
        onUpdate({ dialogScript: script, dialogVoices: resolvedDialogVoiceMap, aiPrompt: dialogPrompt });
      }
    } catch (_) { /* noop */ }

    // ── Routing decision ────────────────────────────────────────────────
    // Single speaker → inline voiceover (auto-upgrades to HeyGen if portrait).
    // Multi speaker:
    //   • All speakers have a portrait → PROFESSIONAL Shot-Reverse-Shot:
    //     each speaker becomes its own HeyGen lip-sync sub-scene, so the
    //     right face speaks the right line. This is what Artlist/Synthesia
    //     do — there is no reliable way to make ONE generic AI clip hard-
    //     bind two faces to two audio segments.
    //   • Any portrait missing → inline voiceover overlay only, with a
    //     clear honest message that real lip-sync is not available.
    //   • The "Erweitert" switch lets power users force inline overlay
    //     even when portraits exist.
    const allHavePortraits = speakers.every(
      (sp) => !!sceneCast.find((c) => c.id === sp.id)?.referenceImageUrl,
    );
    const useProfessionalSrs = blocks.length >= 2 && allHavePortraits && !renderAsSeparateScenes
      ? true
      : renderAsSeparateScenes;

    // ── Stage 8 (May 31 2026): single-speaker Cinematic-Sync routing ─────
    // For 1-speaker scenes that the user explicitly put on the Cinematic-Sync
    // engine (toggle "Dialog & Lip-Sync" on / `engineOverride='cinematic-sync'`
    // / `lipSyncWithVoiceover=true`), DO NOT take the legacy inline /
    // HeyGen-Talking-Head path — that's what produced the "Animorph + double
    // voice" bug (HeyGen avatar bust + a second compose-video-clips master
    // running in parallel). Route through the same compose-video-clips
    // dispatch as the multi-speaker path so there is exactly ONE master clip
    // + ONE lip-sync pass + ONE audio source per scene.
    // July 2026 — the "Clip mit Lip-Sync generieren" button itself counts as
    // explicit opt-in. Previously the routing required scene-level
    // engineOverride/lipSyncWithVoiceover to already be set, which meant a
    // single-speaker Kling/Wan/… scene clicking the lip-sync button silently
    // fell through to the inline VO path and never triggered Sync.so.
    const buttonIntendsLipSync =
      (blocks.length === 1 && renderAsSeparateScenes) ||
      (blocks.length >= 2 && allHavePortraits && !renderAsSeparateScenes);

    const forceCinematicSync =
      blocks.length === 1 &&
      allHavePortraits &&
      ((scene as any).engineOverride === 'cinematic-sync' ||
        (scene as any).lipSyncWithVoiceover === true ||
        buttonIntendsLipSync);

    if (!forceCinematicSync && (blocks.length < 2 || !useProfessionalSrs)) {
      await handleGenerateInline();
      return;
    }
    // From here: PROFESSIONAL multi-speaker lip-sync (SRS).
    if (blocks.length >= 2 && !allHavePortraits) {
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
    }
    setGenerating(true);
    emitPipelineEvent({ type: 'voiceover:start' });
    emitPipelineEvent({ type: 'lipsync:start' });
    // Ensure the project is persisted before spawning sub-scenes (otherwise
    // onAddScene would write to a non-existent project_id).
    let pidForSrs = (projectId || scene.projectId || '').trim();
    // Resolve the REAL persisted parent scene id. Without this we'd pass a
    // stale/local/temp id to onInsertScenesAfter, the dashboard wouldn't find
    // it in project.scenes, and every insert would silently no-op
    // → user sees "sub-scene insert failed" for every speaker.
    let resolvedParentSceneId = scene.id;
    try {
      const ids = await resolvePersistedIds();
      if (!ids) {
        toast({ title: t.failed, description: PROJECT_REQUIRED[language], variant: 'destructive' });
        emitPipelineEvent({ type: 'voiceover:end' });
        emitPipelineEvent({ type: 'lipsync:end' });
        setGenerating(false);
        return;
      }
      pidForSrs = ids.pid;
      resolvedParentSceneId = ids.sceneId;
    } catch (e) {
      toast({ title: t.failed, description: formatError(e), variant: 'destructive' });
      emitPipelineEvent({ type: 'voiceover:end' });
      emitPipelineEvent({ type: 'lipsync:end' });
      setGenerating(false);
      return;
    }
    let okCount = 0;
    // Marker so we can clean up previously auto-spawned SRS sub-scenes for
    // *this* parent scene before regenerating. Stored in the free-form
    // `cinematic_preset_slug` text column — no schema change needed.
    const srsMarker = `dialog-srs:${resolvedParentSceneId}`;
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
        const cfg = getResolvedVoiceForSpeakerId(block.speakerId);
        if (!cfg?.voiceId) {
          throw new Error(t.voiceMissing(c.name));
        }
      }

      // ── Idempotency: remove previously auto-spawned LEGACY dialog sub-scenes
      //    for THIS parent only. Critical safety rules:
      //      • Never touch the current parent scene itself.
      //      • Never touch cinematic-sync main scenes (engine_override =
      //        'cinematic-sync') — those are real scenes that just happen to
      //        carry a legacy `dialog-srs:*` marker from older builds. Deleting
      //        them was the root cause of "Szene 2 wird geschluckt".
      //      • Only match sub-scenes whose marker points at THIS parent.
      try {
        const { data: stale } = await supabase
          .from('composer_scenes')
          .select('id, engine_override, cinematic_preset_slug')
          .eq('project_id', pidForSrs)
          .eq('cinematic_preset_slug', `dialog-srs:${resolvedParentSceneId}`);
        const staleIds = (stale ?? [])
          .filter((r: any) =>
            r?.id &&
            r.id !== resolvedParentSceneId &&
            r.engine_override !== 'cinematic-sync',
          )
          .map((r: any) => r.id);
        if (staleIds.length > 0) {
          await supabase.from('scene_audio_clips').delete().in('scene_id', staleIds);
          await supabase.from('composer_scenes').delete().in('id', staleIds);
          console.log('[SceneDialogStudio] removed', staleIds.length, 'legacy dialog sub-scenes for parent', resolvedParentSceneId);
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
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const c = sceneCast.find((x) => x.id === block.speakerId)!;
        setGenStage(
          language === 'de'
            ? `Stimme ${i + 1}/${blocks.length} (${c.name}) wird erzeugt…`
            : language === 'es'
            ? `Generando voz ${i + 1}/${blocks.length} (${c.name})…`
            : `Generating voice ${i + 1}/${blocks.length} (${c.name})…`,
        );
        const cfg = getResolvedVoiceForSpeakerId(block.speakerId)!;

        // Take-System A/B/C reuse (Phase B + C: tonality-aware key).
        const lineKey = dialogLineKey(i, block.text, block.tonality);
        const activeTake = getActiveTake(lineKey);

        let audioUrl: string | undefined;
        let durationSec: number;

        if (activeTake?.audioUrl) {
          audioUrl = activeTake.audioUrl;
          durationSec = activeTake.durationSec > 0
            ? activeTake.durationSec
            : await probeAudioDuration(activeTake.audioUrl, Math.max(1.5, block.text.length / 18));
        } else {
          const fnName = cfg.engine === 'hume' ? 'generate-voiceover-hume' : 'generate-voiceover';
          const tuning = cfg.engine === 'elevenlabs' ? buildTuningForBlock(block) : undefined;
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
                ...(tuning ?? {}),
              };
          const { data, error } = await supabase.functions.invoke(fnName, { body });
          if (error) throw error;
          audioUrl = (data as any)?.audioUrl as string | undefined;
          if (!audioUrl) throw new Error(`No audioUrl returned for ${c.name}`);
          const reportedDuration = Number((data as any)?.duration ?? 0);
          durationSec = reportedDuration > 0
            ? reportedDuration
            : await probeAudioDuration(audioUrl, Math.max(1.5, block.text.length / 18));
        }
        synthed.push({
          block,
          character: c,
          audioUrl: audioUrl!,
          durationSec,
          engine: cfg.engine,
        });
      }

      // ── Phase 1b: refresh parent prompt with the real Audio Plan
      //    (per-speaker start–end seconds) now that durations are known,
      //    AND emit the first-class AudioPlan so downstream lip-sync /
      //    composer code never has to re-parse the textual fallback.
      try {
        let cursor = 0;
        const timedParentBlocks = synthed.map((s) => {
          const startSec = cursor;
          cursor += s.durationSec + INTER_SPEAKER_GAP_SEC;
          return { ...s.block, startSec, durationSec: s.durationSec };
        });
        const audioPlan: import('@/types/video-composer').AudioPlan = {
          version: 1,
          speakers: synthed.map((s, i) => ({
            characterId: s.character.id,
            name: s.character.name,
            startSec: Math.round(timedParentBlocks[i].startSec! * 100) / 100,
            endSec:
              Math.round((timedParentBlocks[i].startSec! + s.durationSec) * 100) / 100,
            text: s.block.text,
            engine: s.engine,
            voiceId: getResolvedVoiceForSpeakerId(s.block.speakerId)?.isCustom
              ? getResolvedVoiceForSpeakerId(s.block.speakerId)?.elevenlabsVoiceId
              : getResolvedVoiceForSpeakerId(s.block.speakerId)?.voiceId,
            audioUrl: s.audioUrl,
          })),
          totalSec: Math.round((cursor - INTER_SPEAKER_GAP_SEC) * 100) / 100,
          interSpeakerGapSec: INTER_SPEAKER_GAP_SEC,
          language,
          generatedAt: new Date().toISOString(),
        };
        const timedPrompt = applyDialogToPrompt(scene.aiPrompt || '', timedParentBlocks, language);
        const updates: Partial<ComposerScene> = {
          audioPlan,
          dialogLockedAt: audioPlan.generatedAt,
        };
        if (timedPrompt !== (scene.aiPrompt || '')) updates.aiPrompt = timedPrompt;
        onUpdate(updates);
      } catch (e) { console.warn('[SceneDialogStudio] SRS audioPlan emit failed', e); }

      // ── Phase 2: TWO-SHOT pipeline ────────────────────────────────────
      // For ≥2 speakers we KEEP the parent scene as one row and route it
      // through the cinematic-sync engine. Compose-video-clips renders ONE
      // 6s/10s Hailuo i2v master clip (both speakers in frame, anchored from
      // Nano Banana 2 two-shot composition); ClipsTab's auto-trigger then
      // detects ≥2 speakers in dialog_script and invokes
      // compose-twoshot-lipsync for sequential per-face Sync.so passes.
      //
      // No more sub-scene splitting — the storyboard shows ONE card with
      // a 6-stage progress bar (audio → anchor → master_clip → lipsync_1
      // → lipsync_2 → continuity).
      try {
        // Single-flight guard: if this scene is already mid-render via two-shot
        // (e.g. user double-clicked the button), do nothing.
        if (
          scene.clipStatus === 'generating' &&
          (scene as any).twoshotStage &&
          (scene as any).twoshotStage !== 'failed'
        ) {
          console.info('[SceneDialogStudio] two-shot already in flight — skipping re-trigger');
          if (onClose) onClose();
          okCount = 1;
          return;
        }

        // Duration: respect the user's chosen provider + duration.
        // - HappyHorse natively renders 3–15s → honour user pick directly
        // - Hailuo only supports 6s | 10s → honour the user's picked bucket
        // - Audio length must NOT silently extend Hailuo scenes; Sync.so cut_off handles overflow.
        const audioRequired = Math.ceil(
          synthed.reduce((acc, s) => acc + s.durationSec, 0) +
          INTER_SPEAKER_GAP_SEC * Math.max(0, synthed.length - 1) +
          0.4,
        );
        const userPick = Number(scene.durationSeconds || 6);

        // Honour the user's chosen provider — never silent-switch anymore.
        // July 2026 Lip-Sync policy: certified master-plate providers are
        // HappyHorse, Hailuo, Kling, Wan, Seedance and Luma. Anything else
        // falls back to HappyHorse (safe 3–15s default). Backend enforces
        // the same allowlist with a 400 response.
        const LIPSYNC_PROVIDERS = [
          'ai-hailuo', 'ai-happyhorse', 'ai-kling', 'ai-wan', 'ai-seedance', 'ai-luma',
        ] as const;
        type LipsyncProvider = typeof LIPSYNC_PROVIDERS[number];
        const userPickedProvider = (scene.clipSource as string) || 'ai-happyhorse';
        const masterProvider: LipsyncProvider =
          (LIPSYNC_PROVIDERS as readonly string[]).includes(userPickedProvider)
            ? (userPickedProvider as LipsyncProvider)
            : 'ai-happyhorse';

        const clamp = (min: number, max: number) =>
          Math.min(max, Math.max(min, Math.ceil(userPick)));
        const masterDuration =
          masterProvider === 'ai-hailuo'
            // Hailuo STRICT — only 10 stays 10, everything else snaps to 6.
            ? (userPick === 10 ? 10 : 6)
            : masterProvider === 'ai-happyhorse'
              ? clamp(3, 15)
              : masterProvider === 'ai-kling'
                ? clamp(3, 15)
                : masterProvider === 'ai-wan'
                  ? clamp(3, 10)
                  : masterProvider === 'ai-seedance'
                    ? clamp(3, 12)
                    // Luma Ray 2 — only 5s or 9s.
                    : (userPick >= 8 ? 9 : 5);

        if (audioRequired > masterDuration) {
          const providerLabel: Record<LipsyncProvider, string> = {
            'ai-hailuo': 'Hailuo',
            'ai-happyhorse': 'HappyHorse',
            'ai-kling': 'Kling',
            'ai-wan': 'Wan',
            'ai-seedance': 'Seedance',
            'ai-luma': 'Luma Ray 2',
          };
          toast({
            title: 'Dialog länger als Szene',
            description: `Audio braucht ~${audioRequired}s, ${providerLabel[masterProvider]}-Szene ist ${masterDuration}s. Sync.so kürzt am Ende (cut_off). Für vollen Dialog Szenendauer erhöhen oder Provider mit größerem Duration-Fenster wählen.`,
          });
        }

        const dialogScriptText = synthed.map((s) => `${s.character.name}: ${s.block.text}`).join('\n');
        const dialogVoicesMap: Record<string, DialogVoiceCfg> = {};
        for (const s of synthed) {
          const cfg = getResolvedVoiceForSpeakerId(s.block.speakerId);
          if (cfg) {
            for (const key of getSpeakerAliases(s.character.id)) dialogVoicesMap[key] = cfg;
          }
        }

        // Optimistic state — UI immediately shows "Generating".
        // NOTE: we intentionally do NOT write `cinematicPresetSlug: dialog-srs:*`
        // on the real cinematic-sync main scene anymore. That marker was a
        // legacy hook for old auto-spawned sub-scenes and caused the cleanup
        // pass to delete real main scenes ("Szene 2 verschwindet").
        onUpdate({
          dialogScript: dialogScriptText,
          dialogVoices: dialogVoicesMap,
          durationSeconds: masterDuration,
          clipSource: masterProvider,
          engineOverride: 'cinematic-sync',
          clipStatus: 'generating',
          twoshotStage: 'audio',
          lipSyncWithVoiceover: true,
        });


        // Actually trigger compose-video-clips so the master Hailuo i2v
        // render starts. Without this the card stays "generating" forever.
        try {
          // Ensure project + scene are persisted to DB — otherwise the edge
          // function rejects with MISSING_PROJECT_ID. Mirrors the SRS path.
          const persisted = await resolvePersistedIds();
          const pidFinal = (persisted?.pid || projectId || scene.projectId || '').trim();
          const sceneIdFinal = persisted?.sceneId || scene.id;
          if (!pidFinal) {
            onUpdate({ clipStatus: 'pending', twoshotStage: null as any });
            toast({
              title: t.failed,
              description: 'Projekt konnte nicht gespeichert werden — bitte erneut versuchen.',
              variant: 'destructive',
            });
            return;
          }
          // Cinematic-Sync anchors are server-only. Client-side pre-compose can
          // add prompt/name-match duplicates before the server audit runs.
          const composedFirstFrame: string | undefined = undefined;

          // v173 — run composeFinalPrompt so performance (mimik/gestik/blick/
          // energy) and actionBeat from the Briefing-Plan actually reach the
          // Cinematic-Sync wrapper. Previously this path sent scene.aiPrompt
          // raw, which silently dropped those fields.
          const composedInvoke = buildInvokePrompt(scene as any, characters as any, language);

          const scenePayload = {
            id: sceneIdFinal,
            projectId: pidFinal,
            sceneType: scene.sceneType,
            clipSource: masterProvider,
            clipQuality: scene.clipQuality || 'standard',
            aiPrompt: composedInvoke.aiPrompt || scene.aiPrompt || '',
            negativePrompt: composedInvoke.negativePrompt || (scene as any).negativePrompt || undefined,
            uploadUrl: scene.uploadUrl,
            referenceImageUrl: composedFirstFrame,
            durationSeconds: masterDuration,
            characterShot: scene.characterShot,
            characterShots: scene.characterShots,
            dialogScript: dialogScriptText,
            dialogVoices: dialogVoicesMap,
            engineOverride: 'cinematic-sync' as const,
            lipSyncWithVoiceover: true,
            dialogMode: true,
            withAudio: scene.withAudio !== false,
          };
          // Persist the engine + audio-embed flag so the player auto-unmutes
          // as soon as the lip-synced clip lands (otherwise the embedded VO
          // is inaudible until the user manually unmutes).
          await supabase
            .from('composer_scenes')
            .update({
              engine_override: 'cinematic-sync',
              lip_sync_with_voiceover: true,
              lip_sync_status: 'pending',
              // Re-Run: alten Abschluss-Zustand wegräumen, sonst verwirft der
              // Auto-Trigger die Szene als „bereits angewendet".
              lip_sync_applied_at: null,
              dialog_shots: null,
              lip_sync_source_clip_url: null,
              twoshot_stage: null,
            })
            .eq('id', sceneIdFinal);
          const { error: invokeErr } = await supabase.functions.invoke('compose-video-clips', {
            body: { projectId: pidFinal, scenes: [scenePayload], characters },
          });
          if (invokeErr) throw invokeErr;
        } catch (invokeErr) {
          console.error('[SceneDialogStudio] compose-video-clips invoke failed', invokeErr);
          // Roll back the optimistic generating state so user can retry.
          onUpdate({ clipStatus: 'pending', twoshotStage: null as any });
          const realMsg = await extractFunctionsError(invokeErr);
          toast({
            title: t.failed,
            description: realMsg,
            variant: 'destructive',
          });
          return;
        }

        okCount = 1;
        toast({
          title: language === 'de' ? 'Dialog-Shots werden gerendert' : language === 'es' ? 'Renderizando Dialog-Shots' : 'Rendering Dialog Shots',
          description:
            language === 'de'
              ? `Pro Sprecher-Turn wird ein eigener Shot (Hailuo + Sync.so Lip-Sync) gerendert und am Ende zu einer ${masterDuration}s-Szene gestitcht. Live-Fortschritt im Clip-Karten-Overlay.`
              : language === 'es'
              ? `Por cada turno se renderiza un shot dedicado (Hailuo + Sync.so) y al final se concatena a una escena de ${masterDuration}s. Progreso en vivo en la tarjeta del clip.`
              : `One dedicated shot (Hailuo + Sync.so lip-sync) per speaker turn, concatenated into a ${masterDuration}s scene at the end. Live progress in the clip-card overlay.`,
        });
        if (onClose) onClose();
      } catch (twoShotErr) {
        console.error('[SceneDialogStudio] two-shot dispatch failed', twoShotErr);
        toast({
          title: t.failed,
          description: formatError(twoShotErr),
          variant: 'destructive',
        });
      }
    } catch (e) {
      console.error('[SceneDialogStudio] generate error', e);
      toast({
        title: t.failed,
        description: formatError(e),
        variant: 'destructive',
      });
    } finally {
      emitPipelineEvent({ type: 'voiceover:end' });
      emitPipelineEvent({ type: 'lipsync:end' });
      setGenerating(false);
      setGenStage(null);
    }
  };

  // ── Auto-Split trigger ─────────────────────────────────────────────
  // Fires once when the parent's amber "Splitten" badge sets autoSplitOnMount.
  // Requires: ≥2 dialog blocks AND a voice configured for every speaker.
  useEffect(() => {
    if (!autoSplitOnMount) return;
    if (generating) return;
    if (blocks.length < 2) return;
    const allVoicesSet = speakers.every((sp) => Boolean(getResolvedVoiceForSpeakerId(sp.id)?.voiceId));
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

  if (open === false) return null;
  const castEmpty = sceneCast.length < 1;


  const isMonologue = sceneCast.length === 1;

  return (
    <Card ref={ref} className="p-3 space-y-3 border-primary/30 bg-primary/5">
      {castEmpty && (
        <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/[0.06] px-2.5 py-2 text-[11px] text-amber-200">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-300" />
          <div className="leading-snug">
            {language === 'de'
              ? 'Kein Cast-Charakter aufgelöst. Skript ist editierbar, aber für Voiceover/Lip-Sync bitte oben unter „Cast" einen Charakter aus der Avatar-Library zuweisen.'
              : language === 'es'
              ? 'Sin reparto resuelto. Puedes editar el guion, pero asigna un personaje arriba en "Cast" para generar voz/lip-sync.'
              : 'No cast character resolved. Script is editable, but assign a character above under "Cast" to generate voiceover/lip-sync.'}
          </div>
        </div>
      )}

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
          {onInsertScenesAfter && sceneCast.length >= 1 && blocks.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 gap-1 text-[10px] border-primary/40 text-primary hover:bg-primary/10"
              title={
                language === 'de'
                  ? 'Master + OTS/Close-up pro Sprecher als Folge-Szenen einfügen'
                  : language === 'es'
                  ? 'Insertar Master + OTS/Primer plano por hablante'
                  : 'Insert Master + OTS/Close-up coverage per speaker'
              }
              onClick={async () => {
                try {
                  const partials = buildCoveragePartials(scene);
                  // Idempotency: delete any prior coverage children for this parent.
                  const marker = coverageMarkerFor(scene.id);
                  if (scene.projectId) {
                    try {
                      const { data: stale } = await supabase
                        .from('composer_scenes')
                        .select('id')
                        .eq('project_id', scene.projectId)
                        .eq('cinematic_preset_slug', marker);
                      const ids = (stale ?? []).map((r: any) => r.id).filter((id: string) => id && id !== scene.id);
                      if (ids.length > 0) {
                        await supabase.from('composer_scenes').delete().in('id', ids);
                      }
                    } catch (cleanupErr) {
                      console.warn('[AutoCoverage] cleanup failed (continuing)', cleanupErr);
                    }
                  }
                  await onInsertScenesAfter(scene.id, partials, { removeParent: false });
                  toast({
                    title: language === 'de' ? '✨ Coverage erzeugt' : language === 'es' ? '✨ Coverage creada' : '✨ Coverage created',
                    description:
                      language === 'de'
                        ? `${partials.length} Szenen nach dieser Szene eingefügt.`
                        : language === 'es'
                        ? `${partials.length} escenas insertadas.`
                        : `${partials.length} scenes inserted.`,
                  });
                } catch (e) {
                  toast({ title: 'Auto-Coverage', description: formatError(e), variant: 'destructive' });
                }
              }}
            >
              <Clapperboard className="h-3 w-3" />
              {language === 'de' ? 'Auto-Coverage' : language === 'es' ? 'Auto-Coverage' : 'Auto-Coverage'}
            </Button>
          )}
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

      {/* Phase C.1 — Continuity Auto-Lock badge */}
      {scene.lockReferenceUrl && (
        <div className="flex items-center gap-2 flex-wrap">
          {scene.lockSource === 'inherited' ? (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300"
              title={t.continuityTooltipInherited(scene.lockSourceSceneIndex ?? 0)}
            >
              <Lock className="h-3 w-3" />
              {t.continuityInherited(scene.lockSourceSceneIndex ?? 0)}
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary"
              title={t.continuityTooltip}
            >
              <Lock className="h-3 w-3" />
              {t.continuityLocked}
            </span>
          )}
          <img
            src={scene.lockReferenceUrl}
            alt="lock reference"
            className="h-6 w-10 rounded object-cover border border-border/40"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (scene.lockSource === 'inherited') {
                // Phase C.2 — Force-Own: break inheritance AND invalidate the
                // existing clip so the next render composes a fresh anchor
                // (which compose-video-clips will persist as a new self-lock).
                onUpdate({
                  lockReferenceUrl: undefined,
                  noInheritLock: true,
                  clipUrl: undefined,
                  clipStatus: 'pending',
                });
              } else {
                onUpdate({ lockReferenceUrl: undefined, noInheritLock: false });
              }
            }}
          >
            {scene.lockSource === 'inherited' ? t.continuityForce : t.continuityRemove}
          </Button>
        </div>
      )}


      {generating && genStage && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-[11px] text-primary">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{genStage}</span>
        </div>
      )}
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

        {(!script || script.trim().length === 0) && sceneCast.length > 0 && (
          <p className="mt-1.5 text-[10px] text-muted-foreground italic">
            {language === 'de'
              ? `Skript eintragen — ${sceneCast.length} Sprecher-Slot${sceneCast.length === 1 ? '' : 's'} und Timing sind für dich vorbereitet.`
              : language === 'es'
              ? `Escribe el guion — ${sceneCast.length} slot${sceneCast.length === 1 ? '' : 's'} de hablante y el ritmo están listos.`
              : `Write the script — ${sceneCast.length} speaker slot${sceneCast.length === 1 ? '' : 's'} and timing are prepared for you.`}
          </p>
        )}

        {blocks.length > 0 && (
          <div className="mt-2 space-y-1 rounded-md border border-border/40 bg-background/40 p-2">
            {blocks.map((b, i) => {
              const sp = sceneCast.find((c) => c.id === b.speakerId);
              const missing = !sp?.referenceImageUrl;
              const lineKey = dialogLineKey(i, b.text, b.tonality);
              const bundle = dialogTakes[lineKey];
              const cfg = getResolvedVoiceForSpeakerId(b.speakerId);
              const tuning = cfg?.engine === 'elevenlabs' ? buildTuningForBlock(b) : undefined;
              return (
                <div key={i} className="space-y-0.5">
                  <div className="flex items-start gap-2 text-[11px]">
                    {sp?.referenceImageUrl ? (
                      <img src={sp.referenceImageUrl} alt={b.speakerName} className="h-5 w-5 rounded object-cover shrink-0" />
                    ) : (
                      <div className="h-5 w-5 rounded bg-muted flex items-center justify-center shrink-0">
                        <ImageOff className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                    <span className="font-semibold shrink-0">{b.speakerName}:</span>
                    {b.tonality && b.tonality !== 'neutral' && (
                      <span
                        className="shrink-0 inline-flex items-center gap-0.5 rounded border border-primary/40 bg-primary/10 px-1 py-px text-[9px] uppercase tracking-wide text-primary"
                        title={`Tonality: ${b.tonality}`}
                      >
                        {b.tonality}
                      </span>
                    )}
                    <span className={`flex-1 truncate ${missing ? 'text-muted-foreground line-through' : ''}`}>
                      {b.text}
                    </span>
                  </div>
                  <div className="pl-7 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <DialogTakeStrip
                        lineKey={lineKey}
                        text={b.text}
                        voiceCfg={cfg}
                        voiceTuning={tuning}
                        bundle={bundle}
                        language={language}
                        projectId={projectId || scene.projectId}
                        onChange={(next) => updateLineTakes(lineKey, next)}
                      />
                    </div>
                    <PerTurnShotChip
                      value={getDialogShotOverride(scene, lineKey)}
                      onChange={(sel) => setDialogShotOverride(lineKey, sel)}
                      language={language}
                    />

                  </div>
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
              const cfg = getResolvedVoiceForSpeakerId(sp.id);
              const isHume = cfg?.engine === 'hume';
              const brandDefault = defaultVoiceByCharId[sp.id];
              const isBrandVoice = !!brandDefault && cfg?.voiceId === brandDefault && cfg?.engine !== 'hume';
              const isAutoVoice = !isBrandVoice && cfg?.engine === 'elevenlabs' && !!getAutoVoiceName(cfg.voiceId);
              const brandLookupId = sceneCast.find((c) => c.id === sp.id)?.brandCharacterId ?? sp.id;
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
                  <div className="text-xs font-medium truncate flex items-center gap-1.5">
                    <span className="truncate">{sp.name}</span>
                    {isBrandVoice && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded border border-primary/40 bg-primary/10 px-1 py-px text-[9px] uppercase tracking-wide text-primary"
                        title={
                          language === 'de'
                            ? 'Standard-Stimme aus der Avatar-Bibliothek'
                            : language === 'es'
                            ? 'Voz por defecto de la biblioteca de avatares'
                            : 'Default voice from Avatar Library'
                        }
                      >
                        <Lock className="h-2.5 w-2.5" />
                        Brand
                      </span>
                    )}
                    {isAutoVoice && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded border border-primary/40 bg-primary/10 px-1 py-px text-[9px] uppercase tracking-wide text-primary"
                        title={
                          language === 'de'
                            ? 'Automatisch zugewiesene Stimme'
                            : language === 'es'
                            ? 'Voz asignada automáticamente'
                            : 'Automatically assigned voice'
                        }
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        Auto
                      </span>
                    )}
                    {!brandDefault && !cfg?.voiceId && (
                      <Link
                        to={`/avatars/${brandLookupId}`}
                        className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-px text-[9px] uppercase tracking-wide text-amber-400 hover:bg-amber-500/20"
                        title={
                          language === 'de'
                            ? 'Keine Standard-Stimme — im Avatar setzen'
                            : language === 'es'
                            ? 'Sin voz por defecto — configura en el avatar'
                            : 'No default voice — set in avatar'
                        }
                      >
                        <AlertCircle className="h-2.5 w-2.5" />
                        Setup
                      </Link>
                    )}
                  </div>


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
      {/* Lip-sync mode hint — honest about what each path actually delivers.
          Engine-aware: sync-segments (Sync.so sync-3) is the default for
          single- AND multi-speaker dialog; HeyGen is only used when the
          scene explicitly opts into `heygen-talking-head` (Shot-Reverse-
          Shot split). */}
      {blocks.length > 0 && (() => {
        const portraitsAll = speakers.every(
          (sp) => Boolean(sceneCast.find((c) => c.id === sp.id)?.referenceImageUrl),
        );
        const missing = speakers.find(
          (sp) => !sceneCast.find((c) => c.id === sp.id)?.referenceImageUrl,
        );
        const isMulti = blocks.length >= 2;
        const engineOv = (scene as any).engineOverride as string | undefined;
        // sync-segments is the auto default when a scene has dialog + cast
        // (see recommendEngineForScene). Treat unset/auto as sync-segments
        // so the user sees the correct provider name.
        const isSyncSegments =
          engineOv === 'sync-segments' ||
          engineOv === 'cinematic-sync' ||
          (!engineOv || engineOv === 'auto');
        const isSrsSplit = isMulti && renderAsSeparateScenes;
        let label: string;
        let tone: 'primary' | 'amber' | 'muted' = 'muted';
        if (isMulti && missing) {
          tone = 'amber';
          label = language === 'de'
            ? `⚠️ ${missing.name} hat kein Portrait — bitte Cast-Charakter zuweisen, sonst kein echter Lip-Sync möglich.`
            : language === 'es'
            ? `⚠️ ${missing.name} no tiene retrato — asigna un Brand-Character, si no, no hay lip-sync real.`
            : `⚠️ ${missing.name} has no portrait — assign a cast character or real lip-sync is impossible.`;
        } else if (isSrsSplit && portraitsAll) {
          tone = 'primary';
          label = language === 'de'
            ? `🎬 Wird als ${speakers.length} Szene${speakers.length === 1 ? '' : 'n'} gerendert (Shot-Reverse-Shot, je 1 Hailuo-Plate + Sync.so pro Sprecher)`
            : language === 'es'
            ? `🎬 Se renderizará como ${speakers.length} escena(s) (Shot-Reverse-Shot, 1 plate Hailuo + Sync.so por hablante)`
            : `🎬 Will render as ${speakers.length} scene(s) (Shot-Reverse-Shot, 1 Hailuo plate + Sync.so per speaker)`;
        } else if (isSyncSegments && portraitsAll) {
          tone = 'primary';
          // sync-segments pricing ≈ €0.20/s; show flat cost note instead of per-speaker.
          label = language === 'de'
            ? `⚡ Lip-Sync via Sync.so sync-3 (Fast Dialog) — Mund passt zum Audio${speakers.length > 1 ? ` · ${speakers.length} Sprecher in einer Plate` : ''} (~€0,20/s)`
            : language === 'es'
            ? `⚡ Lip-sync vía Sync.so sync-3 (Fast Dialog) — la boca coincide con el audio${speakers.length > 1 ? ` · ${speakers.length} hablantes en una sola toma` : ''} (~€0,20/s)`
            : `⚡ Lip-sync via Sync.so sync-3 (Fast Dialog) — mouth matches the audio${speakers.length > 1 ? ` · ${speakers.length} speakers in one plate` : ''} (~€0.20/s)`;
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
      {(() => {
        const allPortraits = speakers.every((sp) => !!sceneCast.find((c) => c.id === sp.id)?.referenceImageUrl);
        if (blocks.length < 2 || !allPortraits || renderAsSeparateScenes) return null;
        return (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-[10px] text-emerald-400 leading-relaxed">
            🎭 <strong>Dialog-Shot Pipeline:</strong>{' '}
            {language === 'de'
              ? `Pro Sprecher-Turn ein eigener Hailuo-Plate + dedizierter Sync.so Lip-Sync. ${blocks.length} Shots werden am Ende zu einer Szene gestitcht.`
              : language === 'es'
              ? `Un plate Hailuo + lip-sync Sync.so dedicado por turno. ${blocks.length} shots se concatenan al final.`
              : `One dedicated Hailuo plate + Sync.so lip-sync per speaker turn. ${blocks.length} shots concatenated into a single scene.`}
          </div>
        );
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
          disabled={generating || blocks.length === 0 || castEmpty}
          title={castEmpty ? (language === 'de' ? 'Cast-Charakter im Briefing zuweisen' : language === 'es' ? 'Asigna un personaje del reparto en el briefing' : 'Assign a cast character in the briefing') : undefined}
          className="h-7 text-xs gap-1 ml-auto"

        >
          {(() => {
            if (generating) {
              return (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> {t.generating}
                </>
              );
            }
            if (blocks.length >= 2) {
              const allPortraits = speakers.every(
                (sp) => !!sceneCast.find((c) => c.id === sp.id)?.referenceImageUrl,
              );
              const willSrs = allPortraits && !renderAsSeparateScenes;
              return willSrs ? (
                <>
                  <User className="h-3 w-3" />{' '}
                  {language === 'de'
                    ? `🎭 ${blocks.length} Dialog-Shots in echte Szene rendern`
                    : language === 'es'
                    ? `🎭 Renderizar ${blocks.length} Dialog-Shots en escena real`
                    : `🎭 Render ${blocks.length} Dialog Shots into real scene`}
                </>
              ) : (
                <>
                  <Volume2 className="h-3 w-3" /> {t.genBtn}
                </>
              );
            }
            if (renderAsSeparateScenes) {
              return (
                <>
                  <User className="h-3 w-3" /> {t.genBtnSrs}
                </>
              );
            }
            return (
              <>
                <Volume2 className="h-3 w-3" /> {t.genBtn}
              </>
            );
          })()}
        </Button>
      </div>
    </Card>
  );
});

export default SceneDialogStudio;

