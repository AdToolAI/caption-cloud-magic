import { tx } from "@/lib/i18nText";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Sparkles, ImagePlus, Loader2, Wand2, X, Volume2, VolumeX, Film, Info,
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { ModelSelector } from './ModelSelector';
import AIVideoCostConfirmDialog, { type AIVideoCostConfirmPayload } from './AIVideoCostConfirmDialog';
import { FounderPriorityChip } from '@/components/render/FounderPriorityChip';
import { VideoPromptOptimizer } from './VideoPromptOptimizer';
import {
  ToolkitCastWorldPicker,
  buildCastWorldPromptSuffix,
} from './ToolkitCastWorldPicker';
import { ShotDirectorPanel } from './ShotDirectorPanel';
import CinematicStylePresets from './CinematicStylePresets';
import { MultiReferenceUploader, type ViduReferenceSlot } from './MultiReferenceUploader';
import {
  audioSupportedForMode,
  deriveStudioMode,
  supportsEndOnlyPlacement,
  supportsFirstLastPair,
  durationsFor,
  exactFrameLabel,
  getStudioCapabilities,
  validateStudioSelection,
} from '@/lib/videoCapabilities/studioCapabilities';
import { resolvePricingId } from '@/config/videoModelSpecs';

import { GenerateSection } from './generate/GenerateSection';
import { QuickSettingsBar } from './generate/QuickSettingsBar';

import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import PromptMentionEditor from '@/components/motion-studio/PromptMentionEditor';
import { resolveMentions } from '@/lib/motion-studio/mentionParser';
import { extractEdgeErrorMessage, extractEdgeErrorPayload } from '@/lib/edgeFunctionError';
import { findDuplicateReferences, isReferenceRole } from '@/lib/ai-video/referenceBinding';
import { friendlyVideoErrorMessage } from '@/lib/videoErrorMessages';

import { useUnifiedMentionLibrary } from '@/hooks/useUnifiedMentionLibrary';
import { useBrandCharacters } from '@/hooks/useBrandCharacters';
import type { ShotSelection } from '@/config/shotDirector';
import { buildShotPromptSuffix } from '@/lib/shotDirector/buildShotPromptSuffix';
import { prepareSceneAnchor } from '@/lib/motion-studio/prepareSceneAnchor';
import { applySceneAssetsToPrompt } from '@/lib/motion-studio/applySceneAssetsToPrompt';
import { toolkitModelToClipSource } from '@/lib/ai-video/toolkitModelToClipSource';
import { validateImageForModel } from '@/lib/ai-video/imageRequirements';
import {
  describePreflightViolation,
  preflightVideoRequest,
  type PreflightLocale,
} from '@/lib/ai-video/requestPreflight';

import type { MotionStudioCharacter, MotionStudioLocation } from '@/types/motion-studio';
import type { CharacterShot, ComposerCharacter, ComposerScene } from '@/types/video-composer';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { useVideoPricingCatalog } from '@/hooks/useVideoPricingCatalog';
import { useAccountType } from '@/hooks/useAccountType';
import { useTranslation } from '@/hooks/useTranslation';
import { getCurrencyForLanguage } from '@/lib/currency';
import {
  buildSpokenLanguageDirective,
  isSpokenLanguageSelection,
  resolveAutoSpokenLanguage,
  SEEDANCE_SPOKEN_LANGUAGES,
  type SpokenLanguageCode,
  type SpokenLanguageSelection,
} from '@/lib/ai-video/spokenLanguage';
import type { Currency } from '@/config/pricing';
import {
  AI_VIDEO_TOOLKIT_MODELS,
  getDefaultToolkitModel,
  getToolkitModelById,
  type ToolkitModel,
} from '@/config/aiVideoModelRegistry';

interface Props {
  onAfterGenerate?: () => void;
}

export function ToolkitGenerator({ onAfterGenerate }: Props) {
  const { user } = useAuth();
  const { language } = useTranslation();
  const { wallet, refetch: refetchWallet } = useAIVideoWallet();
  const [searchParams, setSearchParams] = useSearchParams();
  const currency: Currency = getCurrencyForLanguage(language);

  /* ── Setup-Entwurf: Tab-Wechsel darf keine Eingaben kosten ──
   * Neben dem Prompt wird auch das komplette Grund-Setup lokal gesichert und
   * beim Zurückkehren wiederhergestellt. Ungültige Werte werden weiter unten
   * vom Modell-Guard korrigiert. */
  const SETUP_DRAFT_KEY = 'ai-video-toolkit:setup-draft';
  const setupDraft = useMemo<Record<string, any>>(() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETUP_DRAFT_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Model selection (URL param ?model=… → state) ── */
  const initialModel = useMemo(() => {
    const fromUrl = searchParams.get('model');
    return getToolkitModelById(fromUrl) ?? getToolkitModelById(setupDraft.modelId) ?? getDefaultToolkitModel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [modelId, setModelId] = useState<string>(initialModel.id);
  const model: ToolkitModel = getToolkitModelById(modelId) ?? getDefaultToolkitModel();


  /* ── Form state ── */
  const PROMPT_DRAFT_KEY = 'ai-video-toolkit:prompt-draft';
  const [prompt, setPrompt] = useState<string>(() => {
    try {
      return typeof localStorage !== 'undefined' ? (localStorage.getItem(PROMPT_DRAFT_KEY) ?? '') : '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (prompt && prompt.trim()) {
          localStorage.setItem(PROMPT_DRAFT_KEY, prompt);
        } else {
          localStorage.removeItem(PROMPT_DRAFT_KEY);
        }
      } catch { /* noop */ }
    }, 300);
    return () => clearTimeout(t);
  }, [prompt]);
  const [duration, setDuration] = useState<number>(
    typeof setupDraft.duration === 'number' ? setupDraft.duration : model.durations[0],
  );
  const [aspectRatio, setAspectRatio] = useState<string>(
    typeof setupDraft.aspectRatio === 'string' ? setupDraft.aspectRatio : model.aspectRatios[0],
  );
  // Output resolution — only user-selectable when the provider really offers
  // more than one option for this model (e.g. Seedance 2.5: 720p / 480p).
  const [resolution, setResolution] = useState<string>(
    typeof setupDraft.resolution === 'string'
      ? setupDraft.resolution
      : (model.resolutions?.[0] ?? model.resolution),
  );
  const [generateAudio, setGenerateAudio] = useState<boolean>(
    typeof setupDraft.generateAudio === 'boolean' ? setupDraft.generateAudio : model.capabilities.audio,
  );

  // Provider-side TTS (Kling / Veo / Sora) defaults to English unless the prompt
  // explicitly names a target language. We let the user override the auto-pick
  // (which follows the UI language) so a DE user can force ES/EN audio if desired.
  const SPOKEN_LANG_KEY = 'ai-video-toolkit:spoken-lang';
  const [spokenLanguage, setSpokenLanguage] = useState<SpokenLanguageSelection>(() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(SPOKEN_LANG_KEY) : null;
      return isSpokenLanguageSelection(v) ? v : 'auto';
    } catch { return 'auto'; }
  });
  useEffect(() => {
    try { localStorage.setItem(SPOKEN_LANG_KEY, spokenLanguage); } catch { /* noop */ }
  }, [spokenLanguage]);
  const effectiveSpokenLang: SpokenLanguageCode =
    spokenLanguage === 'auto'
      ? resolveAutoSpokenLanguage(language)
      : spokenLanguage;
  // Sprachen, für die der native TTS/Lip-Sync des Providers verlässlich Klartext
  // produziert. Alles außerhalb → ambient-only Fallback (kein Voiceover), sonst
  // erfindet z. B. Kling für DE/ES eine Fantasie-Sprache.
  // Kling 3.0 Omni klingt für DE/ES weiterhin englisch/fantasy-artig; deshalb
  // erlauben wir dort native Stimmen nur für Englisch und sperren den Rest hart.
  const PROVIDER_TTS_LANGS: Record<string, ReadonlyArray<'en' | 'de' | 'es'>> = {
    veo:        ['en', 'de', 'es'],
    sora:       ['en', 'de', 'es'],
    kling:      ['en'],
    grok:       ['en'],
    happyhorse: ['en'],
    // Ambience/Foley only — kein verlässliches Voiceover (Ton wird trotzdem erzeugt):
    ltx: [], wan: [], hailuo: [], luma: [], runway: [], pika: [], vidu: [],
  };
  const isKlingOmni = model.id === 'kling-omni';
  const isSeedance25 = model.id === 'seedance-2-5';
  /** Kann das Modell überhaupt Sprache erzeugen (unabhängig von der Sprache)? */
  const modelSpeaks = isSeedance25 || isKlingOmni || (PROVIDER_TTS_LANGS[model.family] ?? []).length > 0;
  // Seedance 2.5 has no provider-side language enum. Native dialogue is
  // prompt-controlled, so local allowlists must never silence its audio.
  const ttsLangSupported = isSeedance25
    ? true
    : isKlingOmni
    ? effectiveSpokenLang === 'en'
    : (PROVIDER_TTS_LANGS[model.family] ?? []).includes(effectiveSpokenLang as 'en' | 'de' | 'es');
  const omniNonEnglishSilent = isKlingOmni && effectiveSpokenLang !== 'en';
  const [startImageUrl, setStartImageUrl] = useState<string | null>(
    typeof setupDraft.startImageUrl === 'string' ? setupDraft.startImageUrl : null,
  );

  /* ── Kling Omni: unified Cast + per-speaker Lip-Sync (max. 4 cast, 2 lip-sync) ── */
  type OmniVoicePreset = 'female-warm' | 'female-bright' | 'male-warm' | 'male-deep' | 'neutral';
  /**
   * A row is ALWAYS bound to a Cast & World character (strict — no anonymous
   * slots any more). `lipSync=true` means this character speaks in the clip;
   * `line` + `voicePreset` are only used in that case. Silent rows are
   * still composed into the anchor image.
   */
  type OmniLine = { characterId: string; lipSync: boolean; line: string; voicePreset: OmniVoicePreset };
  const [omniLines, setOmniLines] = useState<OmniLine[]>(
    Array.isArray(setupDraft.omniLines) ? (setupDraft.omniLines as OmniLine[]) : [],
  );

  /**
   * Placement of the uploaded reference image within the generated clip:
   *  - 'start'  → i2v startImageUrl (default, image is visible at frame 0)
   *  - 'end'    → endImageUrl (image is the LAST frame; needs capabilities.endFrame)
   *  - 'anchor' → identity-only reference; no forced start/end frame
   * If the current model doesn't support the selected placement, it falls back to 'start'.
   */
  const [referencePlacement, setReferencePlacement] = useState<'start' | 'end' | 'anchor'>(
    setupDraft.referencePlacement === 'end' || setupDraft.referencePlacement === 'anchor'
      ? setupDraft.referencePlacement
      : 'start',
  );

  /** Pending placement change awaiting user confirmation to auto-switch model. */
  const [pendingPlacement, setPendingPlacement] = useState<{
    placement: 'end' | 'anchor';
    targetModelId: string;
    targetModelName: string;
  } | null>(null);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState<string | null>(null);
  const [videoReferenceType, setVideoReferenceType] = useState<'feature' | 'base'>('feature');
  // Reference slots survive a reload: same order, same roles → identical
  // provider binding after resume (see referenceBinding.ts).
  const [viduReferences, setViduReferences] = useState<ViduReferenceSlot[]>(() => {
    const raw = setupDraft.viduReferences;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s: any) => s && typeof s.url === 'string' && s.url.length > 0)
      .map((s: any) => ({
        url: s.url as string,
        role: isReferenceRole(s.role) ? s.role : 'character',
        hash: typeof s.hash === 'string' ? s.hash : undefined,
      }));
  });
  /** UI index of the reference thumbnail the provider rejected (content[N] → slot). */
  const [rejectedReferenceIndex, setRejectedReferenceIndex] = useState<number | null>(null);
  const rejectedSlotRef = useRef<number | null>(null);
  useEffect(() => { setRejectedReferenceIndex(null); }, [viduReferences]);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [composingScene, setComposingScene] = useState(false);
  const [lastAnchorComposed, setLastAnchorComposed] = useState(false);
  const [lastAnchorRoute, setLastAnchorRoute] = useState<'start' | 'anchor' | 'text-only' | 'none'>('none');
  const debugMode = searchParams.get('debug') === '1';

  /* ── Kosten-Confirm-Gate ── */
  const COST_SUPPRESS_KEY = 'ai-video-toolkit:cost-suppressed-until';
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [costDialogSuppressed, setCostDialogSuppressed] = useState(false);

  /* ── Library Cast & Locations (Scene Continuity) ──
   * Characters: STRICT Cast & World lock — only rows from `brand_characters`
   * (UUID) are selectable. Legacy `motion_studio_characters` are no longer
   * exposed as pickable characters anywhere in the AI Video Studio.
   * Locations still come from Motion Studio Library (buildings + props). */
  const { locations: libLocations } = useMotionStudioLibrary();
  const { characters: brandCharList } = useBrandCharacters();
  const libCharacters = useMemo<MotionStudioCharacter[]>(
    () =>
      (brandCharList ?? []).map((c: any) => ({
        id: c.id,
        user_id: c.user_id,
        name: c.name ?? 'Unnamed',
        description:
          c.description ??
          c.visual_identity_json?.identity_card_prompt ??
          c.visual_identity_json?.identityCard ??
          '',
        signature_items: c.visual_identity_json?.signature_items ?? '',
        reference_image_url: c.portrait_url ?? c.reference_image_url ?? null,
        reference_image_seed: null,
        voice_id: c.default_voice_id ?? null,
        tags: [],
        usage_count: c.usage_count ?? 0,
        workspace_id: null,
        created_at: c.created_at,
        updated_at: c.updated_at,
      })),
    [brandCharList],
  );
  const { characters: mentionChars, locations: mentionLocs } = useUnifiedMentionLibrary();
  const [castCharacterIds, setCastCharacterIds] = useState<string[]>(
    Array.isArray(setupDraft.castCharacterIds) ? setupDraft.castCharacterIds : [],
  );
  const [castLocationId, setCastLocationId] = useState<string | null>(
    typeof setupDraft.castLocationId === 'string' ? setupDraft.castLocationId : null,
  );
  const [castBuildingId, setCastBuildingId] = useState<string | null>(
    typeof setupDraft.castBuildingId === 'string' ? setupDraft.castBuildingId : null,
  );
  const [castPropIds, setCastPropIds] = useState<string[]>(
    Array.isArray(setupDraft.castPropIds) ? setupDraft.castPropIds : [],
  );

  /* Setup-Entwurf sichern (debounced) + hart beim Tab-Wechsel/Verlassen. */
  const setupSnapshot = useMemo(
    () => ({
      modelId,
      duration,
      aspectRatio,
      resolution,
      generateAudio,
      startImageUrl,
      referencePlacement,
      omniLines,
      castCharacterIds,
      castLocationId,
      castBuildingId,
      castPropIds,
      viduReferences,
    }),
    [
      modelId, duration, aspectRatio, resolution, generateAudio, startImageUrl,
      referencePlacement, omniLines, castCharacterIds, castLocationId, castBuildingId, castPropIds,
      viduReferences,
    ],
  );
  const setupSnapshotRef = useRef(setupSnapshot);
  useEffect(() => { setupSnapshotRef.current = setupSnapshot; }, [setupSnapshot]);
  const writeSetupDraft = useCallback(() => {
    try { localStorage.setItem(SETUP_DRAFT_KEY, JSON.stringify(setupSnapshotRef.current)); } catch { /* noop */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(writeSetupDraft, 300);
    return () => clearTimeout(t);
  }, [setupSnapshot, writeSetupDraft]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) writeSetupDraft(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', writeSetupDraft);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', writeSetupDraft);
    };
  }, [writeSetupDraft]);

  /* ── Eingaben nach erfolgreichem Start leeren (mit Undo) ── */
  type LastInputsSnapshot = {
    prompt: string;
    startImageUrl: string | null;
    referenceVideoUrl: string | null;
    viduReferences: ViduReferenceSlot[];
    omniLines: OmniLine[];
  };
  const lastInputsRef = useRef<LastInputsSnapshot | null>(null);
  const resetInputsAfterStart = useCallback(() => {
    lastInputsRef.current = {
      prompt,
      startImageUrl,
      referenceVideoUrl,
      viduReferences,
      omniLines,
    };
    setPrompt('');
    setStartImageUrl(null);
    setReferenceVideoUrl(null);
    setViduReferences([]);
    setOmniLines([]);
    try { localStorage.removeItem(PROMPT_DRAFT_KEY); } catch { /* noop */ }
  }, [prompt, startImageUrl, referenceVideoUrl, viduReferences, omniLines]);
  const restoreLastInputs = useCallback(() => {
    const snap = lastInputsRef.current;
    if (!snap) return;
    setPrompt(snap.prompt);
    setStartImageUrl(snap.startImageUrl);
    setReferenceVideoUrl(snap.referenceVideoUrl);
    setViduReferences(snap.viduReferences);
    setOmniLines(snap.omniLines);
    lastInputsRef.current = null;
  }, []);




  const castCharacters = useMemo(
    () => castCharacterIds.map((id) => libCharacters.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c),
    [libCharacters, castCharacterIds],
  );
  const castLocation = useMemo(
    () => libLocations.find((l) => l.id === castLocationId) ?? null,
    [libLocations, castLocationId],
  );
  const castBuilding = useMemo(
    () => libLocations.find((l) => l.id === castBuildingId) ?? null,
    [libLocations, castBuildingId],
  );
  const castProps = useMemo(
    () => castPropIds.map((id) => libLocations.find((l) => l.id === id)).filter((l): l is NonNullable<typeof l> => !!l),
    [libLocations, castPropIds],
  );

  /**
   * Kling Omni: `omniLines` is the SINGLE source of truth for cast + speakers.
   *   • Adding/removing a row updates `castCharacterIds` (anchor pool) below.
   *   • First 2 rows may enable Lip-Sync (Kling Omni cap).
   *   • Silent rows (lipSync=false) appear as extras in the anchor.
   * When the user switches TO Omni with an existing cast, we seed rows once
   * from `castCharacterIds` so nothing is lost.
   */
  const omniPrefilledRef = useRef(false);
  useEffect(() => {
    if (!isKlingOmni) {
      omniPrefilledRef.current = false;
      return;
    }
    if (omniPrefilledRef.current) return;
    if (omniLines.length > 0) {
      omniPrefilledRef.current = true;
      return;
    }
    if (castCharacterIds.length === 0) return;
    const defaults: OmniVoicePreset[] = ['female-warm', 'male-warm', 'female-bright', 'male-deep'];
    setOmniLines(
      castCharacterIds.slice(0, 4).map((cid, i) => ({
        characterId: cid,
        lipSync: i < 2,
        line: '',
        voicePreset: defaults[i] ?? 'neutral',
      })),
    );
    omniPrefilledRef.current = true;
  }, [isKlingOmni, castCharacterIds, omniLines.length]);

  /* Mirror Omni rows → castCharacterIds so the anchor composer includes them. */
  useEffect(() => {
    if (!isKlingOmni) return;
    const ids = omniLines.map((r) => r.characterId).filter(Boolean) as string[];
    setCastCharacterIds((prev) => {
      if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return prev;
      return ids;
    });
  }, [isKlingOmni, omniLines]);

  /* ── Omni Media-Lock: when Omni + at least one character is selected, the
   *  anchor image is composed automatically. Manual Startbild / Multi-Ref /
   *  V2V uploads would overwrite the anchor and produce foreign faces with
   *  the wrong voices, so we hard-lock them and clear any prior uploads. */
  const omniMediaLock = isKlingOmni && omniLines.some((r) => !!r.characterId);

  // Some providers accept reference images only under specific settings
  // (Veo 3.1: `reference_images` are honoured at 16:9 + 8 s only).
  const refRequires = model.capabilities.refRequires;
  const refConstraintMet =
    !refRequires ||
    ((!refRequires.aspectRatios || refRequires.aspectRatios.includes(aspectRatio)) &&
      (!refRequires.durations || refRequires.durations.includes(duration)));
  const refConstraintHint = [
    refRequires?.aspectRatios?.join(' / '),
    refRequires?.durations ? `${refRequires.durations.join(' / ')}s` : null,
  ].filter(Boolean).join(' · ');
  useEffect(() => {
    if (!omniMediaLock) return;
    if (startImageUrl) setStartImageUrl(null);
    if (referenceVideoUrl) setReferenceVideoUrl(null);
    if (viduReferences.length) setViduReferences([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [omniMediaLock]);

  /* Kling Omni DE/ES hard-lock: the provider currently produces English-accented
   * fantasy speech for non-English native audio. Keep the cast, but remove all
   * native dialog state so no accidental prompt/API path can trigger speech. */
  useEffect(() => {
    if (!omniNonEnglishSilent) return;
    setOmniLines((prev) => {
      if (!prev.some((r) => r.lipSync || r.line.trim())) return prev;
      return prev.map((r) => ({ ...r, lipSync: false, line: '' }));
    });
  }, [omniNonEnglishSilent]);

  const consistencyKey = `ai-${model.family}`;

  /* ── Character lock — Cast & World is the single source of truth.
   * The primary (first) Cast & World character drives the anchor, the
   * prompt injection, the reference-uploader hint and usage tracking. */
  const { trackUsage: trackBrandUsage } = useBrandCharacters();
  const brandCharacter = useMemo(() => {
    const c = castCharacters[0];
    if (!c) return null;
    return {
      id: c.id,
      name: c.name,
      description: c.description ?? '',
      signature_items: c.signature_items ?? '',
      reference_image_url: c.reference_image_url ?? null,
    };
  }, [castCharacters]);

  /* ── Shot Director (cinematic prompt builder) ── */
  const [shotSelection, setShotSelection] = useState<ShotSelection>({});

  /* ── Canonical capability truth for the current selection ──
   * Every technical option the UI offers comes from ONE place:
   * `studioCapabilities` over the generated mirror of the server registry.
   * Nothing here re-derives provider knowledge locally. */
  /**
   * The mode comes STRICTLY from the inputs actually attached AND from where
   * the user placed them. A single image with placement "at the end" is an
   * END-ONLY request (`lastFrame`), never `t2v` and never `i2v`: the canonical
   * resolver in the registry mirror decides, so UI and edge function agree.
   * If the model does not offer that mode, `caps.supported` is false and the
   * capability violation below names the real `mode` conflict.
   */
  const placedEndImage = !!startImageUrl && referencePlacement === 'end';

  /* ── @-mentionable uploads ────────────────────────────────────────────
   * The images the user just attached are taggable in the prompt so they can
   * say *which* upload a sentence refers to. Tokens are replaced with a plain
   * English phrase before the prompt leaves the client — providers never see
   * a raw `@token`.
   */
  const uploadMentions = useMemo(() => {
    const list: { token: string; name: string; phrase: string; thumbnail: string | null }[] = [];
    if (startImageUrl) {
      const end = referencePlacement === 'end';
      list.push({
        token: end ? 'end-image' : 'start-image',
        name: end
          ? tx({ de: 'Endbild', en: 'End image', es: 'Imagen final' })
          : tx({ de: 'Startbild', en: 'Start image', es: 'Imagen inicial' }),
        phrase: end ? 'the uploaded end image' : 'the uploaded start image',
        thumbnail: startImageUrl,
      });
    }
    viduReferences.forEach((slot, i) => {
      list.push({
        token: `ref-${i + 1}`,
        name: tx({ de: `Referenz ${i + 1}`, en: `Reference ${i + 1}`, es: `Referencia ${i + 1}` }),
        phrase: `reference image ${i + 1}`,
        thumbnail: slot.url,
      });
    });
    if (referenceVideoUrl) {
      list.push({
        token: 'ref-video',
        name: tx({ de: 'Referenzvideo', en: 'Reference video', es: 'Vídeo de referencia' }),
        phrase: 'the uploaded reference video',
        thumbnail: null,
      });
    }
    return list;
  }, [startImageUrl, referencePlacement, viduReferences, referenceVideoUrl]);

  const resolveUploadMentions = useCallback(
    (text: string): string =>
      uploadMentions.reduce(
        (acc, m) => acc.replace(new RegExp(`@${m.token}\\b`, 'gi'), m.phrase),
        text,
      ),
    [uploadMentions],
  );

  const studioMode = useMemo(
    () => deriveStudioMode({
      modelId: model.id,
      hasStartImage: !!startImageUrl && referencePlacement !== 'end',
      hasEndImage: placedEndImage,
      hasReferenceImages: viduReferences.length > 0,
      hasReferenceVideo: !!referenceVideoUrl,
    }),
    [model.id, startImageUrl, placedEndImage, referencePlacement, viduReferences.length, referenceVideoUrl],
  );
  const caps = useMemo(() => getStudioCapabilities(model.id, studioMode), [model.id, studioMode]);
  const capDurations = useMemo(
    () => durationsFor(model.id, studioMode, resolution),
    [model.id, studioMode, resolution],
  );
  const capPixelLabel = useMemo(
    () => exactFrameLabel(model.id, studioMode, resolution, aspectRatio),
    [model.id, studioMode, resolution, aspectRatio],
  );
  /**
   * Canonical audio truth for the CURRENT mode — a model that makes sound in
   * one mode does not automatically make sound in another. Requested sound on
   * a silent mode blocks the start instead of being dropped on the way out.
   */
  const modeAudioSupported = useMemo(
    () => audioSupportedForMode(model.id, studioMode),
    [model.id, studioMode],
  );
  /** Mirror of the server gate — blocks the start, never rewrites a value. */
  const capabilityViolation = useMemo(
    () => validateStudioSelection({
      modelId: model.id,
      mode: studioMode,
      resolution,
      duration,
      aspectRatio,
    }),
    [model.id, studioMode, resolution, duration, aspectRatio],
  );


  /**
   * Placement violations are explicit, never silently routed to 'start'.
   * "At the end" means ONE image sent as the last frame WITHOUT a first frame,
   * so it needs `supportsEndOnlyPlacement` (canonical `lastFrame` mode) — a
   * model that only pairs first+last frames is named as such instead of being
   * offered and then rejected by the provider.
   */
  const placementViolation = useMemo<string | null>(() => {
    if (referencePlacement === 'end' && !supportsEndOnlyPlacement(model.id)) {
      if (supportsFirstLastPair(model.id)) {
        return tx({
          de: `${model.name} nimmt ein Endbild nur zusammen mit einem Startbild an. Bitte Platzierung ändern oder ein Modell mit reinem Endbild wählen.`,
          en: `${model.name} only accepts an end frame together with a start frame. Change the placement or pick a model that supports an end frame on its own.`,
          es: `${model.name} solo acepta un fotograma final junto con uno inicial. Cambia la ubicación o elige un modelo que admita solo el fotograma final.`,
        });
      }
      return tx({
        de: `${model.name} kann kein Endbild verarbeiten. Bitte Platzierung ändern oder ein Modell mit Endbild wählen.`,
        en: `${model.name} cannot take an end frame. Change the placement or pick a model that supports it.`,
        es: `${model.name} no admite un fotograma final. Cambia la ubicación o elige otro modelo.`,
      });
    }
    if (referencePlacement === 'anchor' && !model.capabilities.anchorOnly) {
      return tx({
        de: `${model.name} kennt keinen Anker-Modus. Bitte Platzierung ändern oder ein Modell mit Anker wählen.`,
        en: `${model.name} has no anchor mode. Change the placement or pick a model that supports it.`,
        es: `${model.name} no tiene modo de anclaje. Cambia la ubicación o elige otro modelo.`,
      });
    }
    return null;
  }, [referencePlacement, model.id, model.capabilities.anchorOnly, model.name]);

  /**
   * Requested sound on a mode that cannot produce any — blocked, not dropped.
   * The audio chip stays visible while this is active so the user can turn it
   * off; nothing is silently rewritten on the way to the provider.
   */
  const audioViolation = useMemo<string | null>(() => {
    if (!generateAudio || modeAudioSupported) return null;
    return tx({
      de: `${model.name} erzeugt in dieser Betriebsart keinen Ton. Bitte Ton ausschalten oder ein Modell mit nativem Ton wählen.`,
      en: `${model.name} produces no sound in this mode. Switch sound off or pick a model with native audio.`,
      es: `${model.name} no genera sonido en este modo. Desactiva el sonido o elige un modelo con audio nativo.`,
    });
  }, [generateAudio, modeAudioSupported, model.name]);

  /** Attached inputs the current model cannot accept — blocked, never cleared. */
  const inputViolation = useMemo<string | null>(() => {
    const unsupported: string[] = [];
    if (startImageUrl && !model.capabilities.i2v && !model.capabilities.anchorOnly) {
      unsupported.push(tx({ de: 'Startbild', en: 'start image', es: 'imagen inicial' }));
    }
    if (referenceVideoUrl && !model.capabilities.v2v) {
      unsupported.push(tx({ de: 'Referenzvideo', en: 'reference video', es: 'vídeo de referencia' }));
    }
    if (viduReferences.length > 0 && !model.capabilities.multiRef) {
      unsupported.push(tx({ de: 'Referenzbilder', en: 'reference images', es: 'imágenes de referencia' }));
    }
    if (!unsupported.length) return null;
    return tx({
      de: `${model.name} kann Folgendes nicht verarbeiten: ${unsupported.join(', ')}. Bitte entfernen oder Modell wechseln.`,
      en: `${model.name} cannot use: ${unsupported.join(', ')}. Remove it or switch the model.`,
      es: `${model.name} no puede usar: ${unsupported.join(', ')}. Quítalo o cambia de modelo.`,
    });
  }, [startImageUrl, referenceVideoUrl, viduReferences.length, model]);

  /** Models whose canonical registry entry accepts a single END image. */
  const endOnlyModels = useMemo(
    () => AI_VIDEO_TOOLKIT_MODELS.filter((m) => m.capabilities.endFrame),
    [],
  );
  const endOnlyModelNames = useMemo(
    () => endOnlyModels.map((m) => m.name).join(' · '),
    [endOnlyModels],
  );

  const blockingIssue = capabilityViolation?.message ?? placementViolation ?? inputViolation ?? audioViolation;

  /* ── Model switch: URL sync ONLY ──
   * No silent resets. Duration / aspect ratio / resolution / audio / uploads
   * and the chosen placement are the user's state; an unsupported combination
   * is surfaced above and blocks the start until the user resolves it. */
  useEffect(() => {
    if (searchParams.get('model') !== model.id) {
      const next = new URLSearchParams(searchParams);
      next.set('model', model.id);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id]);


  // Canonical per-second price from server catalog (falls back to local config).
  const { getPricePerSecond, getTotalCost, isReady: catalogReady, walletCurrency } =
    useVideoPricingCatalog();
  const { discountFactor } = useAccountType();
  // Display currency must follow the WALLET, not the UI language — otherwise a
  // USD price (incl. FX uplift) could be shown while an EUR wallet is charged.
  const billingCurrency: Currency = walletCurrency ?? currency;
  /**
   * BILLING IDENTITY — tier-scoped, never the bare model id.
   * The backend charges the pricing id of the selected (mode x resolution)
   * tier; quoting `model.id` showed the 720p price while a 480p run was
   * deducted. Same resolver on both sides.
   */
  const billingPricingId = useMemo(
    () => resolvePricingId(model.id, studioMode, resolution) ?? model.id,
    [model.id, studioMode, resolution],
  );
  // Catalog prices are already personalized; the local fallback is a list price.
  const catalogPricePerSecond = getPricePerSecond(billingPricingId, billingCurrency);
  // Never show a binding price we could not verify against the server catalog —
  // that was the source of preview/charge mismatches.
  const priceUnverified = !catalogReady || catalogPricePerSecond == null;
  const pricePerSecond =
    catalogPricePerSecond ?? model.costPerSecond[billingCurrency] * discountFactor;
  // Smart duration (-1) is reserved at the model's maximum length; the unused
  // seconds are refunded once the provider reports the real clip length.
  const billedSeconds = duration === -1
    ? Math.max(...model.durations)
    : duration;
  // Total is rounded exactly like the backend deduction chain.
  const cost = getTotalCost(billingPricingId, billingCurrency, billedSeconds)
    ?? billedSeconds * pricePerSecond;


  const symbol = billingCurrency === 'USD' ? '$' : '€';
  const isUnlimited = (wallet as any)?.is_unlimited === true;
  const canAfford = isUnlimited || (wallet?.balance_euros ?? 0) >= cost;

  /* ── Image upload ── */
  const handleImageUpload = async (file: File) => {
    if (!user) return;
    // Provider image contract: reject unusable frames before upload/generation
    // (e.g. 152×515 px, which ModelArk rejects with a raw 400).
    const violation = await validateImageForModel(file, {
      modelId: model.id,
      family: model.family,
      modelLabel: model.name,
      locale: (language as 'de' | 'en' | 'es') ?? 'en',
    });
    if (violation) {
      toast.error(violation);
      return;
    }
    setUploading(true);

    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/toolkit-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('ai-video-reference')
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from('ai-video-reference')
        .getPublicUrl(path);
      setStartImageUrl(publicUrl);
    } catch (err: any) {
      toast.error(err?.message ?? tx({ de: tx({ de: "Upload fehlgeschlagen", en: "Upload failed", es: "Error al subir" }), en: 'Upload failed', es: 'Error al subir' }));
    } finally {
      setUploading(false);
    }
  };

  /* ── Video upload (V2V reference clip) ── */
  const handleVideoUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error(tx({ de: 'Datei zu groß (max. 50 MB).', en: 'File too large (max 50 MB).', es: 'Archivo demasiado grande (máx. 50 MB).' }));
      return;
    }
    setUploadingVideo(true);
    try {
      const ext = file.name.split('.').pop() ?? 'mp4';
      const path = `${user.id}/toolkit-v2v-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('ai-video-reference')
        .upload(path, file, { upsert: true, contentType: file.type || 'video/mp4' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from('ai-video-reference')
        .getPublicUrl(path);
      setReferenceVideoUrl(publicUrl);
    } catch (err: any) {
      toast.error(err?.message ?? tx({ de: tx({ de: "Upload fehlgeschlagen", en: "Upload failed", es: "Error al subir" }), en: 'Upload failed', es: 'Error al subir' }));
    } finally {
      setUploadingVideo(false);
    }
  };

  /* ── Generate dispatch ── */
  const runGenerate = async () => {
    if (blockingIssue) {
      toast.error(blockingIssue);
      return;
    }
    if (!prompt.trim()) {
      toast.error(language === 'de' ? tx({ de: 'Bitte gib einen Prompt ein.', en: 'Please enter a prompt.', es: 'Por favor, introduce un prompt.' }) : 'Please enter a prompt.');
      return;
    }
    if (!canAfford) {
      toast.error(
        language === 'de'
          ? tx({ de: 'Nicht genügend Credits. Bitte Credits aufladen.', en: 'Not enough credits. Please top up credits.', es: 'No hay suficientes créditos. Por favor recarga créditos.' })
          : 'Not enough credits. Please top up.',
      );
      return;
    }

    setGenerating(true);
    try {
      // Resolve @mentions against the unified library (brand + motion-studio)
      const mentionResolved = resolveMentions(prompt.trim(), mentionChars, mentionLocs);

      // Build the prompt — inject Library cast/world, Brand Character (if
      // locked) AND Shot Director cinematography.
      const castSuffix = buildCastWorldPromptSuffix(
        castCharacters,
        castLocation,
        castBuilding,
        castProps,
      );
      // Cast & World already describes every booked character inside
      // `castSuffix` — no second character injection needed.
      const brandSuffix = '';
      const shotSuffix = buildShotPromptSuffix(shotSelection);
      // Guard against gibberish/faux-text hallucinations from video models
      // (Hailuo/Kling/Veo/Sora/Seedance/…). Motion Studio path is not touched.
      const noTextSuffix = 'No written text, no letters, no signage, no captions, no logos, no on-screen typography, no readable characters of any language. Any incidental text in the scene must remain out of focus and illegible.';
      // Spoken-Language-Guard: only append a language directive if the provider's
      // native TTS actually supports the chosen language. Otherwise Kling/Grok
      // hallucinate fantasy phonemes instead of speaking German/Spanish → fall
      // back to ambient-only (silent characters + room tone / background music).
      const dialogueSuppressed = omniNonEnglishSilent || (!!(model.capabilities.audio && generateAudio) && !ttsLangSupported);
      const spokenLangSuffix = (model.capabilities.audio && generateAudio && ttsLangSupported)
        ? buildSpokenLanguageDirective(effectiveSpokenLang)
        : '';
      const ambientOnlySuffix = dialogueSuppressed
        ? 'IMPORTANT: Do NOT generate any spoken dialogue, narration, voiceover, or lip-synced speech. Characters must remain silent — closed or naturally resting mouths, no lip movement matching speech. The audio track should contain ONLY ambient environmental sound, room tone, or subtle background music appropriate for the scene. No singing, no whispering, no non-verbal vocalizations that imply language.'
        : '';
      const proseFinalPrompt = [resolveUploadMentions(mentionResolved.prompt), shotSuffix, brandSuffix, castSuffix, spokenLangSuffix, ambientOnlySuffix, noTextSuffix]
        .filter(Boolean)
        .join('\n\n');

      // Motion-Studio-Parität: World-Refs (Location/Building/Props) landen als
      // deterministischer <!--scene-assets--> Slug-Block am Anfang des Prompts.
      // resolveSceneWorldRefs liest den Block und reicht die Referenz-Bilder an
      // Nano Banana / Vidu weiter — dieselben IDs wie im Motion Studio.
      const worldMentions = [
        castLocation ? { name: castLocation.name, id: (castLocation as any).id, type: 'location' as const } : null,
        castBuilding ? { name: castBuilding.name, id: (castBuilding as any).id, type: 'building' as const } : null,
        ...castProps.map((p) => ({ name: p.name, id: (p as any).id, type: 'prop' as const })),
        ...(mentionResolved as any).locations
          ? (mentionResolved as any).locations.map((l: { name: string; id?: string }) => ({ name: l.name, id: l.id }))
          : [],
      ].filter((x): x is { name: string; id?: string; type?: 'location' | 'building' | 'prop' } => !!x);
      const finalPrompt = applySceneAssetsToPrompt(proseFinalPrompt, worldMentions);

      const body: Record<string, unknown> = {
        prompt: finalPrompt,
        model: model.id,
        duration,
        aspectRatio,
        // Providers that accept an explicit output resolution (Hailuo, Seedance 2.5)
        // must receive exactly the quality the user is billed for.
        resolution,
      };

      // Scene-Aware Anchor (Motion-Studio parity):
      // Every picked cast character + the locked Brand Character + all
      // @-mentioned characters become explicit `characterShots` slots on the
      // stub scene, so `resolveSceneCharacterAnchorsAll` picks them up via
      // Path 1 and `compose-scene-anchor` (Nano Banana 2) renders the whole
      // cast into the described scene. IDs are the real Motion-Studio IDs.
      let composedFirstFrame: string | undefined;
      let composedSubjectRefs: string[] | undefined;
      let anchorComposed = false;
      setLastAnchorComposed(false);

      // Build the anchor character list — Motion-Studio character objects.
      const anchorCharsMap = new Map<string, ComposerCharacter>();
      const pushAnchor = (c: ComposerCharacter | null) => {
        if (!c || !c.referenceImageUrl) return;
        if (anchorCharsMap.has(c.id)) return;
        anchorCharsMap.set(c.id, c);
      };
      if (brandCharacter) {
        pushAnchor({
          id: brandCharacter.id,
          name: brandCharacter.name,
          appearance: (brandCharacter as any).description ?? '',
          signatureItems: '',
          brandCharacterId: brandCharacter.id,
          referenceImageUrl: brandCharacter.reference_image_url ?? undefined,
        });
      }
      for (const c of castCharacters) {
        pushAnchor({
          id: c.id,
          name: c.name,
          appearance: c.description ?? '',
          signatureItems: c.signature_items ?? '',
          referenceImageUrl: c.reference_image_url ?? undefined,
        });
      }
      for (const m of (mentionResolved as any).characters ?? []) {
        pushAnchor({
          id: (m as any).id,
          name: (m as any).name,
          appearance: (m as any).description ?? '',
          signatureItems: (m as any).signature_items ?? '',
          referenceImageUrl: (m as any).reference_image_url ?? undefined,
        });
      }
      const anchorChars = Array.from(anchorCharsMap.values()).slice(0, 4);
      const characterShots: CharacterShot[] = anchorChars.map((c) => ({
        characterId: c.id,
        shotType: 'full',
      }));

      const clipSource = toolkitModelToClipSource(model);
      const hasCastOrWorld =
        anchorChars.length > 0 || !!castLocation || !!castBuilding || castProps.length > 0;
      const modelAcceptsImageAnchor =
        !!model.capabilities.i2v || !!model.capabilities.anchorOnly;
      // v241 — Multi-Character Startframe-Parität mit Motion Studio.
      // Wir komponieren den Nano-Banana-2 Startframe IMMER, sobald Cast/World
      // vorhanden ist, das Modell einen Bild-Anker akzeptiert und der User
      // keinen eigenen Startframe hochgeladen hat. Placement 'end' / 'anchor'
      // blockiert die Kompo nicht mehr — der komponierte Charakter-Frame wird
      // im Routing-Block unten deterministisch als Startframe (i2v) bzw.
      // erster Anchor-Ref (anchorOnly) durchgereicht.
      const shouldCompose =
        !startImageUrl &&
        hasCastOrWorld &&
        !!clipSource &&
        modelAcceptsImageAnchor &&
        !(model.capabilities.multiRef && viduReferences.length > 0);

      if (shouldCompose) {
        try {
          setComposingScene(true);
          const stubScene: ComposerScene = {
            id: `toolkit-${Date.now()}`,
            projectId: 'toolkit',
            orderIndex: 0,
            sceneType: 'custom',
            durationSeconds: duration,
            clipSource: clipSource!,
            clipQuality: 'standard',
            aiPrompt: finalPrompt,
            characterShots,
            characterShot: characterShots[0],
          } as ComposerScene;
          const ar =
            aspectRatio === '9:16' ? '9:16'
            : aspectRatio === '1:1' ? '1:1'
            : '16:9';
          const prep = await prepareSceneAnchor(
            stubScene,
            anchorChars,
            brandCharacter
              ? { id: brandCharacter.id, name: brandCharacter.name, reference_image_url: brandCharacter.reference_image_url ?? undefined }
              : null,
            finalPrompt,
            ar,
            {},
            libLocations,
          );
          composedFirstFrame = prep.firstFrameUrl;
          composedSubjectRefs = prep.subjectReferenceUrls;
          anchorComposed = prep.composed === true;
          setLastAnchorComposed(anchorComposed);

          // Hard-Guard: wenn Scene-Aware angesagt war, aber weder ein
          // komponierter Startframe noch subject-references zurückkommen,
          // NICHT stillschweigend auf das rohe Porträt zurückfallen —
          // sonst startet das Video wieder mit der Avatar-Aufnahme.
          const providerSupportsSubjectRefs =
            !!model.capabilities.multiRef ||
            (Array.isArray(composedSubjectRefs) && composedSubjectRefs.length > 0);
          if (
            !composedFirstFrame &&
            !(providerSupportsSubjectRefs && composedSubjectRefs && composedSubjectRefs.length > 0) &&
            (model.capabilities.i2v || model.capabilities.anchorOnly)
          ) {
            throw new Error(
              language === 'de'
                ? tx({ de: 'Szenen-Komposition fehlgeschlagen. Bitte erneut versuchen.', en: 'Scene composition failed. Please try again.', es: 'La composición de la escena falló. Por favor, inténtalo de nuevo.' })
                : 'Scene composition failed. Please try again.',
            );
          }
        } catch (e: any) {
          console.warn('[toolkit] compose-scene-anchor failed', e);
          setComposingScene(false);
          setGenerating(false);
          toast.error(
            e?.message ??
              (language === 'de'
                ? tx({ de: 'Szenen-Komposition fehlgeschlagen. Bitte erneut versuchen.', en: 'Scene composition failed. Please try again.', es: 'La composición de la escena falló. Por favor, inténtalo de nuevo.' })
                : 'Scene composition failed. Please try again.'),
          );
          return;
        } finally {
          setComposingScene(false);
        }
      }

      // v241 — Split routing:
      //   • composedFirstFrame (Nano-Banana-2 Multi-Char Anchor) is ALWAYS
      //     used as identity anchor: startImageUrl for i2v models, first
      //     referenceImages slot for anchor-only models. Placement is ignored
      //     for the composed anchor (character must appear at frame 0).
      //   • Any user-uploaded reference image or @-mention fallback follows
      //     the selected placement (start / end / anchor) as before, but only
      //     when no composed anchor exists.
      // No silent routing: an unsupported placement blocks the run, it is never
      // rewritten to 'start'. `placementViolation` mirrors this in the UI.
      if (placementViolation) {
        toast.error(placementViolation);
        setGenerating(false);
        return;
      }
      const effectivePlacement: 'start' | 'end' | 'anchor' = referencePlacement;

      // Route the composed character anchor first (highest priority).
      let anchorRoute: 'start' | 'anchor' | 'text-only' | 'none' = 'none';
      if (composedFirstFrame) {
        if (model.capabilities.i2v) {
          body.startImageUrl = composedFirstFrame;
          anchorRoute = 'start';
        } else if (model.capabilities.anchorOnly && !model.capabilities.multiRef) {
          body.referenceImages = [composedFirstFrame];
          anchorRoute = 'anchor';
        }
      } else {
        // No composed anchor → follow user-selected placement with any manual
        // upload or @-mention fallback.
        const referenceImage =
          startImageUrl ??
          mentionResolved.referenceImageUrl ??
          null;
        if (referenceImage && model.capabilities.i2v && effectivePlacement === 'start') {
          body.startImageUrl = referenceImage;
        } else if (referenceImage && effectivePlacement === 'end' && model.capabilities.endFrame) {
          body.endImageUrl = referenceImage;
        } else if (referenceImage && effectivePlacement === 'anchor' && model.capabilities.anchorOnly) {
          if (!model.capabilities.multiRef) {
            body.referenceImages = [referenceImage];
          }
        } else if (anchorChars.length > 0 && !modelAcceptsImageAnchor) {
          // Text-only model with picked cast — nothing to attach; prompt-only
          // enforcement via castSuffix + lead phrase is our only lever.
          anchorRoute = 'text-only';
        }
      }
      setLastAnchorRoute(anchorRoute);
      // v2v: pass reference clip + reference type (Kling-3 omni)
      if (model.capabilities.v2v && referenceVideoUrl) {
        body.referenceVideoUrl = referenceVideoUrl;
        body.videoReferenceType = videoReferenceType;
      }
      // multi-ref: reference images with roles.
      //  - Vidu Reference2V: at least 1 image is mandatory, field `referenceImages`.
      //  - Seedance 2.5 (ModelArk): optional, field `referenceImageUrls`.
      if (model.capabilities.multiRef) {
        if (model.capabilities.multiRefRequired && viduReferences.length === 0) {
          toast.error(
            language === 'de'
              ? tx({ de: 'Bitte mindestens 1 Referenzbild hinzufügen.', en: 'Please add at least 1 reference image.', es: 'Por favor, añade al menos 1 imagen de referencia.' })
              : 'Please add at least 1 reference image.',
          );
          setGenerating(false);
          return;
        }
        if (viduReferences.length > 0 && refConstraintMet) {
          // Duplicate guard: one asset must never occupy two provider slots.
          const dups = findDuplicateReferences(viduReferences);
          if (dups.length > 0) {
            const d = dups[0];
            setRejectedReferenceIndex(d.uiIndex);
            toast.error(tx({
              de: `Referenzbild ${d.uiIndex + 1} ist identisch mit Referenzbild ${d.duplicateOf + 1}. Bitte entferne das Duplikat.`,
              en: `Reference image ${d.uiIndex + 1} is identical to reference image ${d.duplicateOf + 1}. Please remove the duplicate.`,
              es: `La imagen de referencia ${d.uiIndex + 1} es idéntica a la imagen ${d.duplicateOf + 1}. Elimina el duplicado.`,
            }));
            setGenerating(false);
            return;
          }
          // Same UI order everywhere: index i here = provider content[i+1].
          const urls = viduReferences.map((s) => s.url);
          const roles = viduReferences.map((s) => s.role);
          if (model.capabilities.multiRefRequired) {
            body.referenceImages = urls;
            body.referenceRoles = roles;
          } else {
            body.referenceImageUrls = urls;
            body.referenceRoles = roles;
            body.referenceHashes = viduReferences.map((s) => s.hash ?? null);
          }
        }
      } else if (composedSubjectRefs && composedSubjectRefs.length > 0 && !body.referenceImages) {
        // Subject-reference providers (non-Vidu path is rare, but keep it symmetric).
        // Do not overwrite the composed character anchor if it was already routed above.
        body.referenceImages = composedSubjectRefs;
      }
      if (model.capabilities.audio) {
        // Audio capability != speech capability. Seedance 2.5 keeps native
        // audio enabled for every prompt-controlled language; only providers
        // with a known unsupported language receive the ambience-only guard.
        body.generateAudio = generateAudio && !omniNonEnglishSilent;
        if (generateAudio && ttsLangSupported && !omniNonEnglishSilent) {
          body.spokenLanguage = effectiveSpokenLang;
        } else if ((generateAudio && !ttsLangSupported) || omniNonEnglishSilent) {
          body.suppressDialogue = true;
        }
      }
      // Grok-specific flag (alias)
      if (model.family === 'grok') body.enableAudio = generateAudio;

      // Kling 3.0 Omni — native Lip-Sync is allowed for English only. DE/ES are
      // hard-silenced because the provider currently returns fantasy language.
      // Per-speaker lines are merged into a screenplay-style dialog string
      // and — when > 1 speaker — additionally passed as `speaker_voices`.
      if (isKlingOmni && ttsLangSupported && !omniNonEnglishSilent) {
        const activeLines = omniLines
          .filter((l) => l.lipSync && l.line.trim().length > 0)
          .slice(0, 2);
        if (activeLines.length > 0) {
          const named = activeLines.map((l, i) => {
            const c = l.characterId ? libCharacters.find((x) => x.id === l.characterId) : null;
            const name = c?.name?.trim() || `Speaker ${i + 1}`;
            return { name, line: l.line.trim(), voice: l.voicePreset };
          });
          body.dialogText = named.map((n) => `${n.name}: ${n.line}`).join('\n');
          body.voicePreset = named[0].voice;
          if (named.length > 1) {
            body.speakerVoices = named.map((n) => ({ name: n.name, voice: n.voice }));
          }
          body.spokenLanguage = effectiveSpokenLang;
          body.nativeLipSync = true;

          // Embed spoken language + dialogue into the visual prompt so Kling
          // Omni conditions lip-motion + prosody on the exact text and locks
          // the language. Without this, native voices fall back to an English-
          // accented default even when spoken_language is set.
          const langLabel = 'English — all voices speak clearly and naturally in English';
          const dialogBlock = named.map((n) => `${n.name}: "${n.line}"`).join('\n');
          body.prompt = `${body.prompt}\n\n[SPOKEN LANGUAGE]: ${langLabel}.\n[DIALOG]\n${dialogBlock}`;
        }
      }

      // Sora 2 cannot accept image input → toast hint when a character is selected
      if (model.family === 'sora' && (anchorChars.length > 0 || castLocation || castBuilding)) {
        toast.info(
          tx({ de: 'Sora 2 nutzt nur die Beschreibung (~70 % Konsistenz). Für längere Storys → Kling oder Hailuo.', en: 'Sora 2 uses only the description (~70 % consistency). For longer stories switch to Kling or Hailuo.', es: 'Sora 2 usa solo la descripción (~70 % de consistencia). Para historias más largas, cambia a Kling o Hailuo.' }),
        );
      }

      // Same contract the edge function enforces: prompt length and exclusive
      // input slots are refused here, before any credits move.
      {
        const pre = preflightVideoRequest({
          modelId: model.id,
          prompt: String(body.prompt ?? ''),
          startImageUrl: (body.startImageUrl ?? null) as string | null,
          endImageUrl: (body.endImageUrl ?? null) as string | null,
          referenceImageUrls: (body.referenceImageUrls ?? body.referenceImages ?? null) as string[] | null,
          referenceVideoUrls: body.referenceVideoUrl ? [body.referenceVideoUrl as string] : null,
        });
        if (!pre.ok && pre.violation) {
          toast.error(describePreflightViolation(pre.violation, language as PreflightLocale, model.name));
          setGenerating(false);
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke(model.edgeFunction, { body });
      if (error) {
        // content[N] → UI slot: highlight the exact thumbnail the provider rejected.
        const payload = await extractEdgeErrorPayload(error);
        const idx = payload?.rejectedReferenceIndex;
        if (typeof idx === 'number' && Number.isInteger(idx) && idx >= 0) {
          rejectedSlotRef.current = idx;
        }
        throw new Error(await extractEdgeErrorMessage(error));
      }
      if (data?.error) throw new Error(data.error);


      // Track Brand Character usage for analytics & usage_count increment
      if (brandCharacter) {
        trackBrandUsage({
          character_id: brandCharacter.id,
          generation_id: (data?.id ?? data?.generation_id) as string | undefined,
          model_used: model.id,
          module: 'ai-video-toolkit',
        }).catch(() => {});
      }

      resetInputsAfterStart();

      toast.success(
        language === 'de'
          ? tx({ de: `Video wird generiert (${model.name}). Kosten: ${symbol}${cost.toFixed(2)}`, en: `Video is generated (${model.name}). Cost: ${symbol}${cost.toFixed(2)}`, es: `Se genera el vídeo (${model.name}). Costo: ${symbol}${cost.toFixed(2)}` })
          : `Video generation started (${model.name}). Cost: ${symbol}${cost.toFixed(2)}`,
        {
          action: {
            label: tx({ de: 'Rückgängig', en: 'Undo', es: 'Deshacer' }),
            onClick: () => restoreLastInputs(),
          },
        },
      );
      refetchWallet();
      onAfterGenerate?.();
    } catch (err: any) {
      const kind = classifyVideoError(err?.message);
      const tolerantId = getToolkitModelById('kling-3') ? 'kling-3' : (getToolkitModelById('wan-2-6-pro') ? 'wan-2-6-pro' : null);
      const offerSwitch = (kind === 'copyright_output' || kind === 'real_person_image') && tolerantId && model.id !== tolerantId;
      toast.error(friendlyVideoErrorMessage(err?.message), offerSwitch ? {
        duration: 12000,
        action: {
          label: tx({
            de: `Mit ${getToolkitModelById(tolerantId!)?.name ?? 'Kling 3'} versuchen`,
            en: `Try with ${getToolkitModelById(tolerantId!)?.name ?? 'Kling 3'}`,
            es: `Probar con ${getToolkitModelById(tolerantId!)?.name ?? 'Kling 3'}`,
          }),
          onClick: () => setModelId(tolerantId!),
        },
      } : undefined);

      if (rejectedSlotRef.current !== null) {
        // Set after the state reset effect so the highlight survives.
        const idx = rejectedSlotRef.current;
        rejectedSlotRef.current = null;
        setTimeout(() => setRejectedReferenceIndex(idx), 0);
      }


    } finally {
      setGenerating(false);
    }
  };

  /* Gate: opens cost-confirm dialog unless user suppressed it within 24 h. */
  const handleGenerate = () => {
    if (blockingIssue) {
      toast.error(blockingIssue);
      return;
    }
    if (!prompt.trim()) {
      toast.error(language === 'de' ? tx({ de: 'Bitte gib einen Prompt ein.', en: 'Please enter a prompt.', es: 'Por favor, introduce un prompt.' }) : 'Please enter a prompt.');
      return;
    }
    if (!canAfford) {
      toast.error(
        language === 'de'
          ? tx({ de: 'Nicht genügend Credits. Bitte Credits aufladen.', en: 'Not enough credits. Please top up credits.', es: 'No hay suficientes créditos. Por favor recarga créditos.' })
          : 'Not enough credits. Please top up.',
      );
      return;
    }
    try {
      const until = Number(localStorage.getItem(COST_SUPPRESS_KEY) ?? '0');
      if (Date.now() < until) {
        void runGenerate();
        return;
      }
    } catch { /* noop */ }
    setCostDialogSuppressed(false);
    setCostDialogOpen(true);
  };

  const confirmCostAndGenerate = () => {
    if (costDialogSuppressed) {
      try {
        localStorage.setItem(COST_SUPPRESS_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
      } catch { /* noop */ }
    }
    setCostDialogOpen(false);
    void runGenerate();
  };


  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* ── Model selector ── */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          {language === 'de' ? 'KI-Modell' : language === 'es' ? 'Modelo IA' : 'AI Model'}
        </Label>
        <ModelSelector
          value={model.id}
          onChange={setModelId}
          currency={currency}
          lockedModelIds={
            referencePlacement === 'end'
              ? AI_VIDEO_TOOLKIT_MODELS.filter((m) => !m.capabilities.endFrame).map((m) => m.id)
              : referencePlacement === 'anchor'
              ? AI_VIDEO_TOOLKIT_MODELS.filter((m) => !m.capabilities.anchorOnly).map((m) => m.id)
              : undefined
          }
          lockedReason={
            referencePlacement === 'end'
              ? tx({
                  de: `Ein reines Endbild unterstützen nur: ${endOnlyModelNames}. Platzierung zurück auf „Am Anfang" setzen, um andere Modelle zu wählen.`,
                  en: `An end image on its own is only supported by: ${endOnlyModelNames}. Reset the placement to "At start" to select other models.`,
                  es: `Solo admiten un fotograma final por sí solo: ${endOnlyModelNames}. Vuelve a poner la ubicación en «Al principio» para elegir otros modelos.`,
                })
              : (language === 'de'
                  ? tx({ de: 'Anker-Modus wird nur von Vidu Q2 und Kling 3 unterstützt.', en: 'Anchor mode is only supported by Vidu Q2 and Kling 3.', es: 'El modo ancla solo es compatible con Vidu Q2 y Kling 3.' })
                  : 'Anchor mode is only supported by Vidu Q2 and Kling 3.')
          }
        />
      </div>

      {/* ── Prompt block ── */}
      <Card className="p-5 bg-card/60 backdrop-blur-xl border-border/60 space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Prompt</Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOptimizer(true)}
            className="text-primary hover:text-primary hover:bg-primary/10"
          >
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />
            {language === 'de' ? 'Optimieren' : 'Optimize'}
          </Button>
        </div>
        <PromptMentionEditor
          value={prompt}
          onChange={setPrompt}
          placeholder={
            language === 'de'
              ? tx({ de: 'Beschreibe dein Video … nutze @charakter und @location aus deiner Library', en: 'Describe your video… use @character and @location from your Library', es: 'Describe tu vídeo… usa @personaje y @ubicación de tu Biblioteca' })
              : language === 'es'
              ? 'Describe tu vídeo … usa @personaje y @ubicación de tu biblioteca'
              : 'Describe your video … use @character and @location from your library'
          }
          rows={4}
          extraMentions={uploadMentions.map((m) => ({
            token: m.token,
            name: m.name,
            thumbnail: m.thumbnail,
            description: tx({ de: 'Dein Upload', en: 'Your upload', es: 'Tu subida' }),
          }))}
        />
        <p className="mt-1.5 text-[10px] text-muted-foreground/80 italic">
          {uploadMentions.length > 0
            ? tx({
                de: `ℹ️ Tippe @ für Charaktere & Locations aus deiner Library — und für deine Uploads (${uploadMentions.map((m) => `@${m.token}`).join(', ')}).`,
                en: `ℹ️ Type @ for characters & locations from your library — and for your uploads (${uploadMentions.map((m) => `@${m.token}`).join(', ')}).`,
                es: `ℹ️ Escribe @ para personajes y ubicaciones de tu biblioteca — y para tus subidas (${uploadMentions.map((m) => `@${m.token}`).join(', ')}).`,
              })
            : tx({ de: 'ℹ️ Tippe @ um Charaktere & Locations aus deiner Library zu taggen.', en: 'ℹ️ Type @ to tag characters & locations from your Library.', es: 'ℹ️ Escribe @ para etiquetar personajes y ubicaciones de tu Biblioteca.' })}
        </p>

      </Card>

      {/* ── Kompakte Einstellungsleiste (Dauer · Format · Qualität · Ton) ── */}
      <QuickSettingsBar
        duration={duration}
        onDurationChange={setDuration}
        durations={capDurations}
        smartDuration={caps.smartDuration}
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        aspectRatios={caps.aspectRatios}
        resolution={resolution}
        onResolutionChange={setResolution}
        resolutions={caps.resolutionLabels}
        resolutionChoices={caps.resolutions.map((r) => ({
          label: r.label,
          startable: r.startable,
          lockedReason: r.lockedReason,
          pixels: exactFrameLabel(model.id, studioMode, r.label, aspectRatio),
        }))}
        fixedResolution={caps.resolutionLabels[0] ?? model.resolution}
        pixelLabel={capPixelLabel}
        audioSupported={modeAudioSupported || generateAudio}
        audioEnabled={generateAudio && !omniNonEnglishSilent}
        audioDisabled={omniNonEnglishSilent}
        audioUnsupported={!modeAudioSupported}
        onAudioChange={setGenerateAudio}
      />

      {/* ── Hinweise & Sperren — bleiben immer sichtbar, nie eingeklappt ── */}
      {/* v241 — text-only warning: model can't accept image reference at all */}
      {castCharacterIds.length > 0 &&
        !model.capabilities.i2v &&
        !model.capabilities.anchorOnly &&
        !model.capabilities.multiRef && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {language === 'de'
              ? tx({ de: `${model.name} akzeptiert keine Bild-Referenz — die gewählten Charaktere werden nur textlich beschrieben. Für garantierte Charakter-Treue wähle ein Modell mit Bild-Anker (Kling, Veo, Hailuo, HappyHorse …).`, en: `${model.name} does not accept an image reference — the selected characters are only described textually. For guaranteed character fidelity, choose a model with image anchor (Kling, Veo, Hailuo, HappyHorse...).`, es: `${model.name} no acepta una referencia de imagen — los personajes seleccionados solo se describen textualmente. Para una fidelidad garantizada del personaje, elige un modelo con ancla de imagen (Kling, Veo, Hailuo, HappyHorse...).` })
              : language === 'es'
              ? `${model.name} no acepta imagen de referencia — los personajes se describen sólo por texto. Para fidelidad garantizada usa un modelo con anclaje de imagen (Kling, Veo, Hailuo, HappyHorse …).`
              : `${model.name} does not accept a reference image — the selected characters will only be described in text. For guaranteed character fidelity pick an image-anchor model (Kling, Veo, Hailuo, HappyHorse …).`}
          </span>
        </div>
      )}

      {/* ── Omni Media-Lock notice — replaces manual media inputs when Omni
       *  is active and characters are booked (anchor is composed automatically). */}
      {omniMediaLock && (
        <Card className="p-4 bg-primary/5 border-primary/30 border-dashed">
          <div className="flex items-start gap-3">
            <ImagePlus className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1 text-xs leading-relaxed">
              <div className="font-medium text-foreground">
                {language === 'de'
                  ? tx({ de: 'Referenzbild automatisch — Startbild / Multi-Ref / V2V gesperrt', en: 'Reference image automatically — Start image / Multi-Ref / V2V locked', es: 'Imagen de referencia automáticamente: Imagen inicial/Multi-Ref/V2V bloqueado' })
                  : 'Reference image automatic — Start image / Multi-Ref / V2V locked'}
              </div>
              <div className="text-muted-foreground">
                {language === 'de'
                  ? tx({ de: 'Kling Omni komponiert das Referenzbild automatisch aus den gebuchten Charakteren. Manuelle Uploads würden den Anker überschreiben und zu fremden Gesichtern mit deinen Stimmen führen. Entferne alle Charaktere oben, um manuelle Bilder/Videos zu nutzen.', en: 'Kling Omni automatically composes the reference image from the booked characters. Manual uploads would overwrite the anchor and lead to foreign faces with your voices. Remove all characters above to use manual images/videos.', es: 'Kling Omni compone automáticamente la imagen de referencia a partir de los personajes reservados. Las cargas manuales sobrescribirían el ancla y darían lugar a caras extrañas con tus voces. Elimina todos los personajes de arriba para usar imágenes/vídeos manuales.' })
                  : 'Kling Omni composes the reference image automatically from the booked characters. Manual uploads would overwrite the anchor and produce foreign faces with your voices. Remove all characters above to use manual images/videos.'}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Capability gate mirror — an invalid combination is shown, never
       *  silently rewritten. The start stays blocked until the user picks a
       *  startable option. The server remains authoritative. */}
      {blockingIssue && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-medium">
              {tx({
                de: 'Start blockiert:',
                en: 'Start blocked:',
                es: 'Inicio bloqueado:',
              })}
            </span>{' '}

            {blockingIssue}
          </span>
        </div>
      )}

      {/* ── Generate CTA ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between p-4 rounded-xl bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/20">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {priceUnverified
              ? tx({ de: 'Preis wird geprüft', en: 'Checking price', es: 'Comprobando precio' })
              : tx({ de: 'Kosten (verbindlich)', en: 'Cost (binding)', es: 'Costo (vinculante)' })}
          </p>
          <p className="text-2xl font-bold text-primary tabular-nums">
            {priceUnverified ? '—' : `${symbol}${cost.toFixed(2)}`}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {priceUnverified
              ? tx({ de: 'Aktueller Tarif wird geladen…', en: 'Loading current rate…', es: 'Cargando la tarifa actual…' })
              : `${duration}s × ${symbol}${pricePerSecond.toFixed(2)}/s · ${model.name}`}
          </p>
        </div>
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={generating || !prompt.trim() || !canAfford || priceUnverified || !!blockingIssue}
          className="min-w-[200px] bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {composingScene ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {tx({ de: 'Szene komponieren…', en: 'Composing scene…', es: 'Componiendo escena…' })}</>
          ) : generating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {language === 'de' ? 'Generiere…' : 'Generating…'}</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" /> {tx({ de: 'Video generieren', en: 'Generate video', es: 'Generar video' })}</>
          )}
        </Button>
      </div>

      <div className="flex justify-end -mt-1">
        <FounderPriorityChip />
      </div>

      {/* ── Look & Kamera ── */}
      <GenerateSection
        id="look"
        title={tx({ de: 'Look & Kamera', en: 'Look & camera', es: 'Estilo y cámara' })}
        icon={<Film className="h-4 w-4" />}
        summary={shotSelection && Object.values(shotSelection).some(Boolean)
          ? tx({ de: 'gesetzt', en: 'set', es: 'definido' })
          : null}
      >
        <CinematicStylePresets value={shotSelection} onApply={(sel) => setShotSelection(sel)} />
        <ShotDirectorPanel
          value={shotSelection}
          onChange={setShotSelection}
          basePrompt={prompt}
        />
      </GenerateSection>

      {/* Character selection lives exclusively in Cast & World. */}
      <GenerateSection
        id="cast-world"
        title="Cast & World"
        icon={<Sparkles className="h-4 w-4" />}
        summary={
          [
            castCharacterIds.length ? `${castCharacterIds.length} ${tx({ de: 'Charaktere', en: 'characters', es: 'personajes' })}` : null,
            castLocationId ? tx({ de: 'Location', en: 'Location', es: 'Ubicación' }) : null,
            castPropIds.length ? `${castPropIds.length} ${tx({ de: 'Requisiten', en: 'props', es: 'props' })}` : null,
          ].filter(Boolean).join(' · ') || null
        }
        defaultOpen={castCharacterIds.length > 0 || !!castLocationId}
      >
        <ToolkitCastWorldPicker
          characterIds={castCharacterIds}
          locationId={castLocationId}
          buildingId={castBuildingId}
          propIds={castPropIds}
          onCharacterIdsChange={setCastCharacterIds}
          onLocationIdChange={setCastLocationId}
          onBuildingIdChange={setCastBuildingId}
          onPropIdsChange={setCastPropIds}
          consistencyKey={consistencyKey}
          supportsImageInput={model.capabilities.i2v}
          hideCharacters={isKlingOmni}
        />
      </GenerateSection>


      {/* ── Referenzen & Medien ── */}
      <GenerateSection
        id="references"
        title={tx({ de: 'Referenzen & Medien', en: 'References & media', es: 'Referencias y medios' })}
        icon={<ImagePlus className="h-4 w-4" />}
        summary={
          [
            startImageUrl ? tx({ de: 'Startbild', en: 'Start image', es: 'Imagen inicial' }) : null,
            viduReferences.length ? `${viduReferences.length} Ref.` : null,
            referenceVideoUrl ? tx({ de: 'Video', en: 'Video', es: 'Vídeo' }) : null,
          ].filter(Boolean).join(' · ') || null
        }
        defaultOpen={
          !!startImageUrl || viduReferences.length > 0 || !!referenceVideoUrl ||
          !!model.capabilities.multiRefRequired
        }
      >
      {/* ── Multi-Reference (capabilities.multiRef → Vidu Reference2V, Seedance 2.5, Veo 3.1) ── */}

      {model.capabilities.multiRef && !omniMediaLock &&
        !(model.capabilities.refExclusive && !!startImageUrl) && (
        refConstraintMet ? (
          <MultiReferenceUploader
            slots={viduReferences}
            onChange={setViduReferences}
            maxReferences={model.capabilities.maxReferences ?? 7}
            required={!!model.capabilities.multiRefRequired}
            modelLabel={model.name}
            modelId={model.id}
            modelFamily={model.family}

            brandCharacterUrl={brandCharacter?.reference_image_url ?? null}
            brandCharacterName={brandCharacter?.name ?? null}
            rejectedIndex={rejectedReferenceIndex}
          />
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {language === 'de'
                ? `${model.name} akzeptiert Referenzbilder nur bei ${refConstraintHint}. Stelle Format und Länge entsprechend ein, dann erscheint der Upload.`
                : language === 'es'
                ? `${model.name} solo acepta imágenes de referencia con ${refConstraintHint}. Ajusta el formato y la duración y aparecerá la subida.`
                : `${model.name} only accepts reference images at ${refConstraintHint}. Set format and duration accordingly and the uploader appears.`}
            </span>
          </div>
        )
      )}

      {/* ── Provider privacy gate: ByteDance/Seedance rejects photos of real
             people as image input. Warn up-front instead of after the run. ── */}
      {model.family === 'seedance' && (!!startImageUrl || viduReferences.length > 0) && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {tx({
              de: `${model.name} lehnt Fotos echter Personen sowie bekannte Film-, Zeichentrick- und Markenmotive als Bildvorlage ab. Nutze ein KI-erzeugtes Charakterbild aus deiner Library — sonst bricht der Anbieter den Auftrag ab (ohne Kosten). Für bekannte Figuren sind Kling 3 oder Wan 2.6 Pro toleranter.`,
              en: `${model.name} rejects photos of real people as well as well-known movie, cartoon and brand motifs as image input. Use an AI-generated character image from your library — otherwise the provider cancels the job (at no cost). For well-known characters, Kling 3 or Wan 2.6 Pro are more tolerant.`,
              es: `${model.name} rechaza fotos de personas reales y motivos conocidos de cine, dibujos animados o marcas como imagen de referencia. Usa una imagen de personaje generada por IA de tu biblioteca; de lo contrario el proveedor cancela el trabajo (sin coste). Para personajes conocidos, Kling 3 o Wan 2.6 Pro son más tolerantes.`,

            })}
          </span>
        </div>
      )}


      {/* ── Image upload (only for I2V) ── */}
      {model.capabilities.i2v && !omniMediaLock &&
        !(model.capabilities.refExclusive && viduReferences.length > 0) && (
        <Card className="p-5 bg-card/60 backdrop-blur-xl border-border/60 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              {language === 'de' ? 'Startbild (optional)' : 'Start image (optional)'}
            </Label>
            {startImageUrl && (
              <Button variant="ghost" size="sm" onClick={() => setStartImageUrl(null)}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {startImageUrl ? (
            <div className="relative rounded-lg overflow-hidden border border-border/40">
              <img src={startImageUrl} alt="Start frame" className="w-full max-h-48 object-cover" />
            </div>
          ) : (
            <label
              htmlFor="toolkit-image-upload"
              className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-border/40 rounded-lg cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {tx({ de: 'Bild hochladen für Image-to-Video', en: 'Upload an image for Image-to-Video', es: 'Sube una imagen para Imagen a Video' })}
              </span>
              <input
                id="toolkit-image-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
              />
            </label>
          )}

          {/* ── Placement toggle: where does the reference image appear? ── */}
          {startImageUrl && (
            <div className="space-y-2 pt-2 border-t border-border/40">
              <Label className="text-xs font-medium text-muted-foreground">
                {tx({ de: 'Wo soll das Bild erscheinen?', en: 'Where should the image appear?', es: '¿Dónde debe aparecer la imagen?' })}
              </Label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  {
                    key: 'start' as const,
                    label: language === 'de' ? 'Am Anfang' : 'At start',
                    hint: language === 'de' ? tx({ de: 'Bild ist der erste Frame', en: 'Image is the first frame', es: 'La imagen es el primer fotograma' }) : 'Image is the first frame',
                    supportedByCurrent: true,
                  },
                  {
                    key: 'end' as const,
                    label: language === 'de' ? 'Am Ende' : 'At end',
                    hint: model.capabilities.endFrame
                      ? (language === 'de' ? tx({ de: 'Kamera fährt zum Bild hin', en: 'Camera moves to the image', es: 'La cámara se mueve a la imagen' }) : 'Camera transitions to image')
                      : tx({
                          de: `Nur mit: ${endOnlyModelNames}`,
                          en: `Only with: ${endOnlyModelNames}`,
                          es: `Solo con: ${endOnlyModelNames}`,
                        }),
                    supportedByCurrent: !!model.capabilities.endFrame,
                  },
                  {
                    key: 'anchor' as const,
                    label: language === 'de' ? 'Nur Anker' : 'Anchor only',
                    hint: model.capabilities.anchorOnly
                      ? tx({ de: tx({ de: "Nur Identitäts-Referenz, kein fester Frame", en: "Identity reference only, no fixed frame", es: "Solo referencia de identidad, sin fotograma fijo" }), en: 'Identity reference only, no forced frame', es: 'Solo referencia de identidad, sin fotograma fijo' })
                      : (language === 'de' ? tx({ de: 'Nur mit Vidu Q2 oder Kling 3 möglich', en: 'Only possible with Vidu Q2 or Kling 3', es: 'Solo es posible con Vidu Q2 o Kling 3' }) : 'Only available with Vidu Q2 or Kling 3'),
                    supportedByCurrent: !!model.capabilities.anchorOnly,
                  },
                ]).map((opt) => {
                  const active = referencePlacement === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      title={opt.hint}
                      onClick={() => {
                        if (opt.key === 'start') {
                          setReferencePlacement('start');
                          return;
                        }
                        if (opt.supportedByCurrent) {
                          setReferencePlacement(opt.key);
                          return;
                        }
                        // Unsupported by current model → propose auto-switch via dialog.
                        if (opt.key === 'end') {
                          const endOnly = endOnlyModels[0];
                          if (endOnly) {
                            setPendingPlacement({
                              placement: 'end',
                              targetModelId: endOnly.id,
                              targetModelName: endOnly.name,
                            });
                          }
                        } else if (opt.key === 'anchor') {
                          const target =
                            AI_VIDEO_TOOLKIT_MODELS.find((m) => m.id === 'vidu-q2-reference') ??
                            AI_VIDEO_TOOLKIT_MODELS.find((m) => m.capabilities.anchorOnly);
                          if (target) {
                            setPendingPlacement({
                              placement: 'anchor',
                              targetModelId: target.id,
                              targetModelName: target.name,
                            });
                          }
                        }
                      }}
                      className={`text-[11px] px-2 py-2 rounded-md border transition-colors text-left leading-tight ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                      }`}
                    >
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-[10px] opacity-80 mt-0.5">{opt.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Video upload (only for V2V) ── */}
      {model.capabilities.v2v && !omniMediaLock && (
        <Card className="p-5 bg-card/60 backdrop-blur-xl border-border/60 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-primary" />
              <Label className="text-sm font-medium">
                {tx({ de: 'Referenz-Video (Video-to-Video)', en: 'Reference video (Video-to-Video)', es: 'Video de referencia (Video-to-Video)' })}
              </Label>
              <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">V2V</Badge>
            </div>
            {referenceVideoUrl && (
              <Button variant="ghost" size="sm" onClick={() => setReferenceVideoUrl(null)}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {referenceVideoUrl ? (
            <div className="relative rounded-lg overflow-hidden border border-border/40">
              <video
                src={referenceVideoUrl}
                controls
                muted
                playsInline
                className="w-full max-h-56 object-cover bg-black"
              />
            </div>
          ) : (
            <label
              htmlFor="toolkit-video-upload"
              className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-border/40 rounded-lg cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              {uploadingVideo ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <Film className="h-6 w-6 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {tx({ de: 'Video hochladen (mp4/webm, max. 50 MB, ≤ 30s empfohlen)', en: 'Upload a video (mp4/webm, max 50 MB, ≤ 30s recommended)', es: 'Subir un video (mp4/webm, máx. 50 MB, ≤ 30s recomendado)' })}
              </span>
              <input
                id="toolkit-video-upload"
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
              />
            </label>
          )}

          {model.family === 'kling' ? (
            <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {language === 'de' ? 'Referenz-Typ' : 'Reference type'}
                </Label>
                <Select
                  value={videoReferenceType}
                  onValueChange={(v) => setVideoReferenceType(v as 'feature' | 'base')}
                  disabled={!referenceVideoUrl}
                >
                  <SelectTrigger className="bg-background/40 border-border/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feature">
                      {language === 'de'
                        ? tx({ de: "Feature — Stil & Bewegung übernehmen", en: "Feature — Adopt Style & Motion", es: "Característica — Adoptar estilo y movimiento" })
                        : 'Feature — copy style & motion'}
                    </SelectItem>
                    <SelectItem value="base">
                      {language === 'de'
                        ? 'Base — Komposition als Grundlage'
                        : 'Base — use composition as foundation'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground p-2 rounded-md bg-background/40 border border-border/40 max-w-xs">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                <span>
                  {tx({ de: 'Referenz-Typ gilt nur für Kling 3 Standard / Pro.', en: 'Reference type only applies to Kling 3 Standard / Pro.', es: 'El tipo de referencia solo se aplica a Kling 3 Standard / Pro.' })}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground p-2 rounded-md bg-background/40 border border-border/40">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
              <span>
                {tx({ de: 'Das Video dient als Bewegungs- und Stilreferenz für die Szene.', en: 'The clip is used as a motion and style reference for the scene.', es: 'El clip se usa como referencia de movimiento y estilo para la escena.' })}
              </span>
            </div>
          )}

        </Card>
      )}
      </GenerateSection>


      {/* ── Ton im Detail — Sprache & Modell-Hinweise (Schalter liegt in der Chip-Leiste) ── */}
      {model.capabilities.audio && (
        <GenerateSection
          id="audio-detail"
          title={tx({ de: 'Ton im Detail', en: 'Sound details', es: 'Sonido en detalle' })}
          icon={generateAudio && !omniNonEnglishSilent ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          summary={
            generateAudio && !omniNonEnglishSilent
              ? tx({ de: 'Ton an', en: 'Sound on', es: 'Sonido activado' })
              : tx({ de: 'Ton aus', en: 'Sound off', es: 'Sonido desactivado' })
          }
        >
          <div className="space-y-2">

            {generateAudio && modelSpeaks && (
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/30">
                <Label className="text-xs text-muted-foreground">
                  {tx({ de: 'Gesprochene Sprache', en: 'Spoken language', es: 'Idioma hablado' })}
                </Label>
                <Select value={spokenLanguage} onValueChange={(v) => {
                  if (isSpokenLanguageSelection(v)) setSpokenLanguage(v);
                }}>
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      {language === 'de'
                        ? `Auto (UI: ${language === 'de' ? 'Deutsch' : 'English'})`
                        : `Auto (UI: ${language === 'es' ? 'Español' : 'English'})`}
                    </SelectItem>
                    {(isSeedance25
                      ? SEEDANCE_SPOKEN_LANGUAGES
                      : SEEDANCE_SPOKEN_LANGUAGES.filter(({ code }) => code === 'de' || code === 'en' || code === 'es')
                    ).map(({ code, label }) => (
                      <SelectItem key={code} value={code}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {generateAudio && isSeedance25 && (
              <p className="text-[11px] leading-snug text-muted-foreground pt-1 border-t border-border/30">
                {tx({
                  de: 'Seedance 2.5 erzeugt natives Audio inklusive Dialog. Sprache und Wortlaut werden über deinen Prompt gesteuert; Aussprache und Lippenbewegung können modellbedingt variieren.',
                  en: 'Seedance 2.5 generates native audio including dialogue. Language and wording are controlled through your prompt; pronunciation and lip movement may vary by generation.',
                  es: 'Seedance 2.5 genera audio nativo, incluido el diálogo. El idioma y el texto se controlan mediante tu prompt; la pronunciación y el movimiento labial pueden variar.',
                })}
              </p>
            )}
            {generateAudio && !modelSpeaks && (
              <p className="text-[11px] leading-snug text-muted-foreground pt-1 border-t border-border/30">
                {tx({
                  de: `${model.name} erzeugt Umgebungssound, Foley und Musik, aber keine gesprochene Sprache. Für Voiceover z. B. Veo 3.1, Sora 2 oder Seedance 2.5 wählen — oder die Stimme nachträglich im Motion Studio ergänzen.`,
                  en: `${model.name} generates ambient sound, foley and music, but no spoken language. For voiceover pick e.g. Veo 3.1, Sora 2 or Seedance 2.5 — or add the voice later in Motion Studio.`,
                  es: `${model.name} genera sonido ambiente, foley y música, pero no voz hablada. Para locución elige p. ej. Veo 3.1, Sora 2 o Seedance 2.5, o añade la voz después en Motion Studio.`,
                })}
              </p>
            )}
            {generateAudio && modelSpeaks && !ttsLangSupported && (
              <p className="text-[11px] leading-snug text-amber-500/90 pt-1 border-t border-border/30">
                {tx({
                  de: `${model.name} unterstützt ${effectiveSpokenLang === 'de' ? 'Deutsch' : effectiveSpokenLang === 'es' ? 'Spanisch' : 'diese Sprache'} nicht zuverlässig. Für diese Szene wird kein Voiceover erzeugt — nur Umgebungssound/Musik. Für echtes Voiceover z. B. Veo 3.1 oder Sora 2 wählen, oder nachträglich im Motion Studio ergänzen.`,
                  en: `${model.name} does not reliably support ${effectiveSpokenLang === 'de' ? 'German' : effectiveSpokenLang === 'es' ? 'Spanish' : 'this language'}. No voiceover will be generated for this scene — only ambient sound/music. For real voiceover, pick e.g. Veo 3.1 or Sora 2, or add it later in Motion Studio.`,
                  es: `${model.name} no admite de forma fiable ${effectiveSpokenLang === 'de' ? 'alemán' : effectiveSpokenLang === 'es' ? 'español' : 'este idioma'}. No se generará locución para esta escena, solo sonido ambiental/música. Para una locución real, elige p. ej. Veo 3.1 o Sora 2, o añádela después en Motion Studio.`,
                })}
              </p>
            )}
          </div>
        </GenerateSection>

      )}


      {/* ── Sprecher & Lip-Sync — Kling 3.0 Omni (Cast + Native Lip-Sync) ── */}
      {isKlingOmni && (
        <GenerateSection
          id="omni-cast"
          title={tx({ de: 'Sprecher & Lip-Sync', en: 'Speakers & lip-sync', es: 'Locutores y sincronización labial' })}
          icon={<Sparkles className="h-4 w-4" />}
          summary={omniLines.length ? `${omniLines.length} Cast` : null}
          defaultOpen
        >
          {(() => {

          const MAX_CAST = 4;
          const LIP_SYNC_MAX = 2;
          const lipSyncCount = omniLines.filter((r) => r.lipSync).length;
          const withDialog = omniLines.filter((r) => r.lipSync && r.line.trim()).length;
          const silent = omniLines.length - omniLines.filter((r) => r.lipSync).length;

          const updateRow = (idx: number, patch: Partial<OmniLine>) =>
            setOmniLines((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
          const removeRow = (idx: number) =>
            setOmniLines((prev) => prev.filter((_, i) => i !== idx));
          const addRow = () => {
            const used = new Set(omniLines.map((r) => r.characterId));
            const next = libCharacters.find((c) => !used.has(c.id));
            if (!next) {
              toast.info(language === 'de' ? tx({ de: 'Kein weiterer Charakter in Cast & World verfügbar.', en: 'No other character available in Cast & World.', es: 'No hay otro personaje disponible en Cast & World.' }) : 'No further character available in Cast & World.');
              return;
            }
            const defaults: OmniVoicePreset[] = ['female-warm', 'male-warm', 'female-bright', 'male-deep'];
            setOmniLines((prev) => [
              ...prev,
              { characterId: next.id, lipSync: !omniNonEnglishSilent && prev.filter((r) => r.lipSync).length < LIP_SYNC_MAX, line: '', voicePreset: defaults[prev.length] ?? 'neutral' },
            ]);
          };
          const toggleLipSync = (idx: number, checked: boolean) => {
            const row = omniLines[idx];
            if (!row) return;
            if (checked && omniNonEnglishSilent) {
              toast.info(
                language === 'de'
                  ? tx({ de: 'Kling Omni spricht Deutsch aktuell nicht zuverlässig. Dieser Clip bleibt stumm; nutze Motion Studio für deutsches Lip-Sync.', en: 'Kling Omni currently does not reliably speak German. This clip remains silent; use Motion Studio for German lip-sync.', es: 'Kling Omni actualmente no habla alemán de forma fiable. Este clip permanecerá en silencio; usa Motion Studio para la sincronización labial en alemán.' })
                  : 'Kling Omni does not speak this language reliably yet. This clip stays silent; use Motion Studio for non-English lip-sync.',
              );
              return;
            }
            if (checked && lipSyncCount >= LIP_SYNC_MAX) return;
            if (!checked && row.line.trim()) {
              if (!confirm(language === 'de' ? tx({ de: 'Lip-Sync für diesen Charakter deaktivieren? Der Dialogtext wird verworfen.', en: 'Disable lip-sync for this character? The dialogue text will be discarded.', es: '¿Desactivar la sincronización labial para este personaje? El texto del diálogo se descartará.' }) : 'Disable lip-sync for this character? The dialogue will be discarded.')) return;
              updateRow(idx, { lipSync: false, line: '' });
              return;
            }
            updateRow(idx, { lipSync: checked });
          };

          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <Label className="text-sm">
                    {language === 'de' ? tx({ de: "Cast & Omni Anchor (Lip-Sync nur EN)", en: "Cast & Omni Anchor (Lip-Sync EN only)", es: "Cast & Omni Anchor (sincronización labial solo EN)" }) : 'Cast & Omni Anchor (Lip-Sync EN only)'}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-primary/40 text-primary text-[10px] tabular-nums">
                    {lipSyncCount}/{LIP_SYNC_MAX} {language === 'de' ? 'Lip-Sync' : 'Lip-Sync'}
                  </Badge>
                  <Badge variant="outline" className="border-primary/40 text-primary text-[10px] tabular-nums">
                    {omniLines.length}/{MAX_CAST} {language === 'de' ? 'Cast' : 'Cast'}
                  </Badge>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground leading-snug">
                {omniNonEnglishSilent && language === 'de'
                  ? tx({ de: 'Deutsch ist bei Kling Omni aktuell silent-only, weil die native Stimme sonst Fantasiesprache mit englischem Akzent erzeugt. Die Charaktere erscheinen im Bild, sprechen aber nicht. Für deutsches Lip-Sync bitte Motion Studio verwenden.', en: 'German is currently silent-only in Kling Omni because the native voice would otherwise generate fantasy language with an English accent. The characters appear in the image but do not speak. For German lip-sync, please use Motion Studio.', es: 'El alemán es actualmente solo silencioso en Kling Omni porque la voz nativa generaría un lenguaje de fantasía con acento inglés. Los personajes aparecen en la imagen pero no hablan. Para la sincronización labial en alemán, utiliza Motion Studio.' })
                  : omniNonEnglishSilent
                  ? 'This language is silent-only for Kling Omni because native speech is not reliable yet. Characters appear in frame but do not speak. Use Motion Studio for non-English lip-sync.'
                  : language === 'de'
                  ? tx({ de: 'Bis zu 4 Charaktere aus Cast & World. Aktiviere den Lip-Sync-Switch für max. 2 sprechende Charaktere — die anderen erscheinen als stumme Statist:innen im Bild.', en: 'Up to 4 characters from Cast & World. Activate the lip-sync switch for a maximum of 2 speaking characters — the others appear as silent extras in the image.', es: 'Hasta 4 personajes de Cast & World. Activa el interruptor de sincronización labial para un máximo de 2 personajes que hablen; los demás aparecerán como extras mudos en la imagen.' })
                  : 'Up to 4 characters from Cast & World. Toggle lip-sync for up to 2 speaking characters — the rest appear as silent extras in the frame.'}
              </p>

              {omniLines.length === 0 && (
                <div className="rounded-md border border-dashed border-primary/30 bg-background/40 p-4 text-center text-[12px] text-muted-foreground">
                  {language === 'de'
                    ? tx({ de: 'Noch keine Charaktere. Füge unten deinen ersten Cast-Charakter hinzu.', en: 'No characters yet. Add your first cast character below.', es: 'Aún no hay personajes. Añade tu primer personaje del elenco a continuación.' })
                    : 'No characters yet. Add your first cast character below.'}
                </div>
              )}

              <div className="space-y-3">
                {omniLines.map((row, idx) => {
                  const c = libCharacters.find((x) => x.id === row.characterId);
                  const displayName = c?.name?.trim() || (language === 'de' ? `Charakter ${idx + 1}` : `Character ${idx + 1}`);
                  const initials = displayName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                  const switchDisabled = omniNonEnglishSilent || (!row.lipSync && lipSyncCount >= LIP_SYNC_MAX);
                  return (
                    <div key={idx} className="rounded-md border border-primary/20 bg-background/40 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {c?.reference_image_url ? (
                          <img
                            src={c.reference_image_url}
                            alt={displayName}
                            className="h-10 w-10 rounded-full object-cover border border-primary/30 flex-shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[11px] font-semibold text-primary flex-shrink-0">
                            {initials || '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          <Select
                            value={row.characterId}
                            onValueChange={(v) => updateRow(idx, { characterId: v })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {libCharacters.map((ch) => {
                                const usedElsewhere = omniLines.some((r, i) => i !== idx && r.characterId === ch.id);
                                return (
                                  <SelectItem key={ch.id} value={ch.id} disabled={usedElsewhere}>
                                    {ch.name}{usedElsewhere ? (language === 'de' ? tx({ de: ' · bereits zugewiesen', en: '· already assigned', es: '· ya asignado' }) : ' · already assigned') : ''}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {language === 'de' ? tx({ de: "Aus Cast & World", en: "From Cast & World", es: "Desde Cast & World" }) : 'From Cast & World'}
                          </p>
                        </div>
                        <div
                          className="flex flex-col items-center gap-1"
                          title={
                            switchDisabled
                              ? (omniNonEnglishSilent
                                  ? (language === 'de'
                                      ? tx({ de: 'Deutsch/Spanisch sind für Kling Omni gesperrt, um Fantasie-Sprache zu verhindern.', en: 'German/Spanish are blocked for Kling Omni to prevent fantasy language.', es: 'El alemán/español están bloqueados para Kling Omni para evitar el lenguaje de fantasía.' })
                                      : 'Non-English lip-sync is blocked for Kling Omni to prevent fantasy speech.')
                                  : language === 'de'
                                  ? tx({ de: 'Kling Omni erlaubt max. 2 sprechende Charaktere pro Clip.', en: 'Kling Omni allows a max. of 2 speaking characters per clip.', es: 'Kling Omni permite un máximo de 2 personajes que hablen por clip.' })
                                  : 'Kling Omni allows max. 2 speaking characters per clip.')
                              : undefined
                          }
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Lip-Sync</span>
                            <Switch
                              checked={row.lipSync}
                              disabled={switchDisabled}
                              onCheckedChange={(v) => toggleLipSync(idx, v)}
                            />
                          </div>
                          {row.lipSync && (
                            <span className="text-[10px] font-semibold text-primary tabular-nums">
                              {omniLines.filter((r, i) => r.lipSync && i <= idx).length}/{LIP_SYNC_MAX}
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(idx)}
                          aria-label="Remove character"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      {row.lipSync && (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {language === 'de' ? tx({ de: "Stimme", en: "Voice", es: "Voz" }) : 'Voice'}
                            </Label>
                            <Select value={row.voicePreset} onValueChange={(v) => updateRow(idx, { voicePreset: v as OmniVoicePreset })}>
                              <SelectTrigger className="h-8 w-[180px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="female-warm">{language === 'de' ? 'Weiblich · warm' : 'Female · warm'}</SelectItem>
                                <SelectItem value="female-bright">{language === 'de' ? 'Weiblich · hell' : 'Female · bright'}</SelectItem>
                                <SelectItem value="male-warm">{language === 'de' ? 'Männlich · warm' : 'Male · warm'}</SelectItem>
                                <SelectItem value="male-deep">{language === 'de' ? 'Männlich · tief' : 'Male · deep'}</SelectItem>
                                <SelectItem value="neutral">{language === 'de' ? 'Neutral' : 'Neutral'}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {(() => {
                            const ch = libCharacters.find((c) => c.id === row.characterId);
                            if (ch?.voice_id) {
                              return (
                                <p className="text-[10px] text-muted-foreground italic">
                                  {language === 'de'
                                    ? tx({ de: `Hinweis: Cast-Stimme hinterlegt — wird in Motion Studio / Voiceover verwendet. Kling Omni nutzt hier eigene Presets.`, en: `Note: Cast voice stored — will be used in Motion Studio / Voiceover. Kling Omni uses its own presets here.`, es: `Nota: Voz del elenco guardada — se usará en Motion Studio / Voiceover. Kling Omni usa sus propios preajustes aquí.` })
                                    : `Note: Cast voice saved — used in Motion Studio / Voiceover. Kling Omni uses its own presets here.`}
                                </p>
                              );
                            }
                            return null;
                          })()}
                          <Textarea
                            value={row.line}
                            onChange={(e) => updateRow(idx, { line: e.target.value.slice(0, 300) })}
                            placeholder={
                              language === 'de'
                                ? `Dialog von ${displayName} …`
                                : `${displayName}'s line …`
                            }
                            className="min-h-[56px] text-sm bg-background/60"
                          />
                          <p className="text-[10px] text-muted-foreground text-right tabular-nums">
                            {row.line.length}/300
                          </p>
                        </>
                      )}
                      {!row.lipSync && (
                        <p className="text-[10px] text-muted-foreground italic pl-12">
                          {tx({ de: 'Stumme:r Statist:in — erscheint im Anchor, spricht nicht.', en: 'Silent extra — appears in the anchor, does not speak.', es: 'Extra silencioso — aparece en el ancla, no habla.' })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {omniLines.length < MAX_CAST && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs border-primary/30"
                  onClick={addRow}
                  disabled={libCharacters.length <= omniLines.length}
                >
                  + {language === 'de' ? tx({ de: 'Charakter hinzufügen', en: 'Add character', es: 'Añadir personaje' }) : 'Add character'}
                </Button>
              )}

              {omniLines.length > 0 && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {language === 'de'
                    ? tx({ de: `${omniLines.length} Charakter(e) im Anchor · ${withDialog}/${LIP_SYNC_MAX} mit Dialog · ${silent} stumme(r) Statist(en).`, en: `${omniLines.length} character(s) in Anchor · ${withDialog}/${LIP_SYNC_MAX} with dialog · ${silent} silent extra(s).`, es: `${omniLines.length} personaje(s) en Ancla · ${withDialog}/${LIP_SYNC_MAX} con diálogo · ${silent} extra(s) mudo(s).` })
                    : `${omniLines.length} character(s) in anchor · ${withDialog}/${LIP_SYNC_MAX} with dialogue · ${silent} silent extra(s).`}
                </p>
              )}
            </div>
          );
          })()}
        </GenerateSection>
      )}





      {lastAnchorComposed && (
        <p className="text-center text-[11px] text-primary/80">
          🎬 {language === 'de'
            ? tx({ de: 'Scene-Aware: Charakter wurde in die Szene komponiert (kein Portrait-Startframe).', en: 'Scene-Aware: Character was composed into the scene (no portrait start frame).', es: 'Consciente de la escena: el personaje se compuso en la escena (sin fotograma de inicio de retrato).' })
            : 'Scene-Aware: character composed into the scene (no portrait-locked first frame).'}
        </p>
      )}

      {debugMode && (
        <p className="text-center text-[10px] font-mono text-muted-foreground/70">
          debug · anchorComposed={String(lastAnchorComposed)} · route={lastAnchorRoute} · cast={castCharacterIds.length + (brandCharacter ? 1 : 0)} · model={model.id}
        </p>
      )}


      <VideoPromptOptimizer
        open={showOptimizer}
        onClose={() => setShowOptimizer(false)}
        onPromptGenerated={(p) => { setPrompt(p); setShowOptimizer(false); }}
      />

      {/* Model auto-switch confirmation for end-frame / anchor placements */}
      <AlertDialog
        open={!!pendingPlacement}
        onOpenChange={(open) => { if (!open) setPendingPlacement(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingPlacement?.placement === 'end'
                ? tx({
                    de: `Reines Endbild nur mit: ${endOnlyModelNames}`,
                    en: `End image on its own only with: ${endOnlyModelNames}`,
                    es: `Fotograma final por sí solo solo con: ${endOnlyModelNames}`,
                  })
                : (language === 'de' ? tx({ de: 'Anker-Modus benötigt Vidu Q2 oder Kling 3', en: 'Anchor mode requires Vidu Q2 or Kling 3', es: 'El modo Ancla requiere Vidu Q2 o Kling 3' }) : 'Anchor mode needs Vidu Q2 or Kling 3')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingPlacement?.placement === 'end'
                ? tx({
                    de: `Ein reines Endbild unterstützen nur: ${endOnlyModelNames}. Möchtest du jetzt zu ${pendingPlacement?.targetModelName} wechseln? Solange „Am Ende“ aktiv ist, sind andere Modelle im Picker ausgegraut.`,
                    en: `An end image on its own is only supported by: ${endOnlyModelNames}. Switch to ${pendingPlacement?.targetModelName} now? While "At end" is active, other models stay greyed out.`,
                    es: `Solo admiten un fotograma final por sí solo: ${endOnlyModelNames}. ¿Cambiar ahora a ${pendingPlacement?.targetModelName}? Mientras «Al final» esté activo, los demás modelos permanecen atenuados.`,
                  })
                : (language === 'de'
                    ? tx({ de: `Der Anker-Modus (Referenzbild ohne festen Frame) ist nur mit Vidu Q2 oder Kling 3 verfügbar. Zu ${pendingPlacement?.targetModelName} wechseln?`, en: `Anchor mode (reference image without fixed frame) is only available with Vidu Q2 or Kling 3. Switch to ${pendingPlacement?.targetModelName}?`, es: `El modo ancla (imagen de referencia sin fotograma fijo) solo está disponible con Vidu Q2 o Kling 3. ¿Cambiar a ${pendingPlacement?.targetModelName}?` })
                    : `Anchor mode (reference image without a forced frame) is only available with Vidu Q2 or Kling 3. Switch to ${pendingPlacement?.targetModelName}?`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {language === 'de' ? tx({ de: 'Abbrechen', en: 'Cancel', es: 'Cancelar' }) : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingPlacement) return;
                setModelId(pendingPlacement.targetModelId);
                setReferencePlacement(pendingPlacement.placement);
                setPendingPlacement(null);
              }}
            >
              {language === 'de'
                ? `Zu ${pendingPlacement?.targetModelName} wechseln`
                : `Switch to ${pendingPlacement?.targetModelName}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Kosten-Confirm vor Generierung */}
      <AIVideoCostConfirmDialog
        open={costDialogOpen}
        payload={{
          title: tx({ de: 'Video generieren?', en: 'Generate video?', es: '¿Generar video?' }),
          description:
            language === 'de'
              ? tx({ de: 'Übersicht deiner Kosten — sobald du bestätigst, startet die Generierung und dein AI-Guthaben wird belastet.', en: 'Overview of your costs — once you confirm, generation will start and your AI credit will be charged.', es: 'Resumen de tus costes: una vez que confirmes, la generación comenzará y se cargará tu crédito de IA.' })
              : 'Cost overview — once confirmed, generation starts and your AI wallet will be charged.',
          modelName: model.name,
          modelBadge: model.badge ?? undefined,
          lines: [
            {
              label: language === 'de' ? 'Länge × Preis / Sekunde' : 'Duration × price/second',
              value: `${duration}s × ${symbol}${pricePerSecond.toFixed(2)}`,
              detail: `${aspectRatio} · ${model.name}`,
            },
          ],
          totalLabel: language === 'de' ? 'Gesamtkosten' : 'Total',
          totalValue: `${symbol}${cost.toFixed(2)}`,
          currencySymbol: symbol,
          totalCost: cost,
          walletBalance: wallet?.balance_euros ?? null,
          isUnlimited,
        }}
        suppressed={costDialogSuppressed}
        onSuppressedChange={setCostDialogSuppressed}
        onConfirm={confirmCostAndGenerate}
        onCancel={() => setCostDialogOpen(false)}
        onTopUp={() => { window.location.href = '/credits'; }}
      />


      {/* Discreet hint about alternative models */}
      <p className="text-center text-[11px] text-muted-foreground">
        {tx({
          de: `${AI_VIDEO_TOOLKIT_MODELS.length} Modelle verfügbar — wechsle oben das Modell, dein Prompt bleibt erhalten.`,
          en: `${AI_VIDEO_TOOLKIT_MODELS.length} models available — switch the model above, your prompt is preserved.`,
          es: `${AI_VIDEO_TOOLKIT_MODELS.length} modelos disponibles — cambia el modelo arriba, tu prompt se conserva.`,
        })}
      </p>
    </motion.div>
  );
}
