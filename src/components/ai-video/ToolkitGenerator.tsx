import { useEffect, useMemo, useRef, useState } from 'react';
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
import { VideoPromptOptimizer } from './VideoPromptOptimizer';
import {
  ToolkitCastWorldPicker,
  buildCastWorldPromptSuffix,
} from './ToolkitCastWorldPicker';
import { ShotDirectorPanel } from './ShotDirectorPanel';
import CinematicStylePresets from './CinematicStylePresets';
import { MultiReferenceUploader, type ViduReferenceSlot } from './MultiReferenceUploader';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import PromptMentionEditor from '@/components/motion-studio/PromptMentionEditor';
import { resolveMentions } from '@/lib/motion-studio/mentionParser';
import { useUnifiedMentionLibrary } from '@/hooks/useUnifiedMentionLibrary';
import { BrandCharacterSelector } from '@/components/brand-characters/BrandCharacterSelector';
import { useBrandCharacters, buildCharacterPromptInjection, type BrandCharacter } from '@/hooks/useBrandCharacters';
import type { ShotSelection } from '@/config/shotDirector';
import { buildShotPromptSuffix } from '@/lib/shotDirector/buildShotPromptSuffix';
import { prepareSceneAnchor } from '@/lib/motion-studio/prepareSceneAnchor';
import { applySceneAssetsToPrompt } from '@/lib/motion-studio/applySceneAssetsToPrompt';
import { toolkitModelToClipSource } from '@/lib/ai-video/toolkitModelToClipSource';
import type { MotionStudioCharacter, MotionStudioLocation } from '@/types/motion-studio';
import type { CharacterShot, ComposerCharacter, ComposerScene } from '@/types/video-composer';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { useVideoPricingCatalog } from '@/hooks/useVideoPricingCatalog';
import { useTranslation } from '@/hooks/useTranslation';
import { getCurrencyForLanguage } from '@/lib/currency';
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

  /* ── Model selection (URL param ?model=… → state) ── */
  const initialModel = useMemo(() => {
    const fromUrl = searchParams.get('model');
    return getToolkitModelById(fromUrl) ?? getDefaultToolkitModel();
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
  const [duration, setDuration] = useState<number>(model.durations[0]);
  const [aspectRatio, setAspectRatio] = useState<string>(model.aspectRatios[0]);
  const [generateAudio, setGenerateAudio] = useState<boolean>(model.capabilities.audio);
  // Provider-side TTS (Kling / Veo / Sora) defaults to English unless the prompt
  // explicitly names a target language. We let the user override the auto-pick
  // (which follows the UI language) so a DE user can force ES/EN audio if desired.
  const SPOKEN_LANG_KEY = 'ai-video-toolkit:spoken-lang';
  const [spokenLanguage, setSpokenLanguage] = useState<'auto' | 'de' | 'en' | 'es'>(() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(SPOKEN_LANG_KEY) : null;
      return v === 'de' || v === 'en' || v === 'es' || v === 'auto' ? v : 'auto';
    } catch { return 'auto'; }
  });
  useEffect(() => {
    try { localStorage.setItem(SPOKEN_LANG_KEY, spokenLanguage); } catch { /* noop */ }
  }, [spokenLanguage]);
  const effectiveSpokenLang: 'de' | 'en' | 'es' =
    spokenLanguage === 'auto'
      ? (language === 'de' ? 'de' : language === 'es' ? 'es' : 'en')
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
    ltx: [], wan: [], hailuo: [], luma: [], seedance: [], runway: [], pika: [], vidu: [],
  };
  const isKlingOmni = model.id === 'kling-omni';
  const ttsLangSupported = isKlingOmni
    ? effectiveSpokenLang === 'en'
    : (PROVIDER_TTS_LANGS[model.family] ?? []).includes(effectiveSpokenLang);
  const omniNonEnglishSilent = isKlingOmni && effectiveSpokenLang !== 'en';
  const [startImageUrl, setStartImageUrl] = useState<string | null>(null);
  /* ── Kling Omni: unified Cast + per-speaker Lip-Sync (max. 4 cast, 2 lip-sync) ── */
  type OmniVoicePreset = 'female-warm' | 'female-bright' | 'male-warm' | 'male-deep' | 'neutral';
  /**
   * A row is ALWAYS bound to a Cast & World character (strict — no anonymous
   * slots any more). `lipSync=true` means this character speaks in the clip;
   * `line` + `voicePreset` are only used in that case. Silent rows are
   * still composed into the anchor image.
   */
  type OmniLine = { characterId: string; lipSync: boolean; line: string; voicePreset: OmniVoicePreset };
  const [omniLines, setOmniLines] = useState<OmniLine[]>([]);
  /**
   * Placement of the uploaded reference image within the generated clip:
   *  - 'start'  → i2v startImageUrl (default, image is visible at frame 0)
   *  - 'end'    → endImageUrl (image is the LAST frame; needs capabilities.endFrame)
   *  - 'anchor' → identity-only reference; no forced start/end frame
   * If the current model doesn't support the selected placement, it falls back to 'start'.
   */
  const [referencePlacement, setReferencePlacement] = useState<'start' | 'end' | 'anchor'>('start');
  /** Pending placement change awaiting user confirmation to auto-switch model. */
  const [pendingPlacement, setPendingPlacement] = useState<{
    placement: 'end' | 'anchor';
    targetModelId: string;
    targetModelName: string;
  } | null>(null);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState<string | null>(null);
  const [videoReferenceType, setVideoReferenceType] = useState<'feature' | 'base'>('feature');
  const [viduReferences, setViduReferences] = useState<ViduReferenceSlot[]>([]);
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
  const [castCharacterIds, setCastCharacterIds] = useState<string[]>([]);
  const [castLocationId, setCastLocationId] = useState<string | null>(null);
  const [castBuildingId, setCastBuildingId] = useState<string | null>(null);
  const [castPropIds, setCastPropIds] = useState<string[]>([]);

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

  /* ── Brand Character Lock (cross-studio persistent character) ── */
  const { trackUsage: trackBrandUsage } = useBrandCharacters();
  const [brandCharacter, setBrandCharacter] = useState<BrandCharacter | null>(null);

  /* ── Shot Director (cinematic prompt builder) ── */
  const [shotSelection, setShotSelection] = useState<ShotSelection>({});

  /* ── Sync settings to model capabilities when switching ── */
  useEffect(() => {
    if (!model.durations.includes(duration)) setDuration(model.durations[0]);
    if (!model.aspectRatios.includes(aspectRatio)) setAspectRatio(model.aspectRatios[0]);
    if (!model.capabilities.audio) setGenerateAudio(false);
    if (!model.capabilities.i2v) setStartImageUrl(null);
    if (!model.capabilities.v2v) setReferenceVideoUrl(null);
    if (!model.capabilities.multiRef) setViduReferences([]);
    // Reset placement to 'start' if the current one isn't available on this model.
    // 'end' → only Luma Ray 2 (capabilities.endFrame). 'anchor' → Vidu/Kling (capabilities.anchorOnly).
    if (referencePlacement === 'end' && !model.capabilities.endFrame) {
      setReferencePlacement('start');
      toast.info(
        language === 'de'
          ? `Placement wurde auf „Am Anfang" zurückgesetzt — ${model.name} unterstützt keinen Endframe.`
          : `Placement reset to "At start" — ${model.name} does not support end-frame.`,
      );
    }
    if (referencePlacement === 'anchor' && !model.capabilities.anchorOnly) {
      setReferencePlacement('start');
      toast.info(
        language === 'de'
          ? `Placement wurde auf „Am Anfang" zurückgesetzt — ${model.name} unterstützt keinen Anker-Modus.`
          : `Placement reset to "At start" — ${model.name} does not support anchor mode.`,
      );
    }
    // Reflect selection in URL for shareable / bookmarkable state
    if (searchParams.get('model') !== model.id) {
      const next = new URLSearchParams(searchParams);
      next.set('model', model.id);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id]);

  // Canonical per-second price from server catalog (falls back to local config).
  const { getPricePerSecond } = useVideoPricingCatalog();
  const pricePerSecond = getPricePerSecond(model.id, currency) ?? model.costPerSecond[currency];
  const cost = duration * pricePerSecond;
  const symbol = currency === 'USD' ? '$' : '€';
  const isUnlimited = (wallet as any)?.is_unlimited === true;
  const canAfford = isUnlimited || (wallet?.balance_euros ?? 0) >= cost;

  /* ── Image upload ── */
  const handleImageUpload = async (file: File) => {
    if (!user) return;
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
      toast.error(err?.message ?? 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  };

  /* ── Video upload (V2V reference clip) ── */
  const handleVideoUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error(language === 'de'
        ? 'Datei zu groß (max. 50 MB).'
        : 'File too large (max 50 MB).');
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
      toast.error(err?.message ?? 'Upload fehlgeschlagen');
    } finally {
      setUploadingVideo(false);
    }
  };

  /* ── Generate dispatch ── */
  const runGenerate = async () => {
    if (!prompt.trim()) {
      toast.error(language === 'de' ? 'Bitte gib einen Prompt ein.' : 'Please enter a prompt.');
      return;
    }
    if (!canAfford) {
      toast.error(
        language === 'de'
          ? 'Nicht genügend Credits. Bitte Credits aufladen.'
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
      const brandSuffix = brandCharacter
        ? `Featuring ${brandCharacter.name}: ${buildCharacterPromptInjection(brandCharacter)}.`
        : '';
      const shotSuffix = buildShotPromptSuffix(shotSelection);
      // Guard against gibberish/faux-text hallucinations from video models
      // (Hailuo/Kling/Veo/Sora/Seedance/…). Motion Studio path is not touched.
      const noTextSuffix = 'No written text, no letters, no signage, no captions, no logos, no on-screen typography, no readable characters of any language. Any incidental text in the scene must remain out of focus and illegible.';
      // Spoken-Language-Guard: only append a language directive if the provider's
      // native TTS actually supports the chosen language. Otherwise Kling/Grok
      // hallucinate fantasy phonemes instead of speaking German/Spanish → fall
      // back to ambient-only (silent characters + room tone / background music).
      const langLabel = effectiveSpokenLang === 'de'
        ? 'German (Deutsch)'
        : effectiveSpokenLang === 'es'
        ? 'Spanish (Español)'
        : 'English';
      const dialogueSuppressed = omniNonEnglishSilent || (!!(model.capabilities.audio && generateAudio) && !ttsLangSupported);
      const spokenLangSuffix = (model.capabilities.audio && generateAudio && ttsLangSupported)
        ? `All spoken dialogue, narration and voiceover MUST be performed in ${langLabel}. Do not use any other language for speech. Lip movement must match ${langLabel} phonemes.`
        : '';
      const ambientOnlySuffix = dialogueSuppressed
        ? 'IMPORTANT: Do NOT generate any spoken dialogue, narration, voiceover, or lip-synced speech. Characters must remain silent — closed or naturally resting mouths, no lip movement matching speech. The audio track should contain ONLY ambient environmental sound, room tone, or subtle background music appropriate for the scene. No singing, no whispering, no non-verbal vocalizations that imply language.'
        : '';
      const proseFinalPrompt = [mentionResolved.prompt, shotSuffix, brandSuffix, castSuffix, spokenLangSuffix, ambientOnlySuffix, noTextSuffix]
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
                ? 'Szenen-Komposition fehlgeschlagen. Bitte erneut versuchen.'
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
                ? 'Szenen-Komposition fehlgeschlagen. Bitte erneut versuchen.'
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
      const effectivePlacement: 'start' | 'end' | 'anchor' =
        referencePlacement === 'end' && !model.capabilities.endFrame ? 'start'
        : referencePlacement === 'anchor' && !model.capabilities.anchorOnly ? 'start'
        : referencePlacement;

      // Safety-net: block invalid end-placement submissions (UI should already prevent this)
      if (referencePlacement === 'end' && !model.capabilities.endFrame) {
        toast.error(
          language === 'de'
            ? `${model.name} unterstützt keinen Endframe. Bitte Luma Ray 2 wählen.`
            : `${model.name} does not support end-frame. Please switch to Luma Ray 2.`,
        );
        setGenerating(false);
        return;
      }

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
      // multi-ref: Vidu Q2 Reference2V — 1–7 reference images with roles
      if (model.capabilities.multiRef) {
        if (viduReferences.length === 0) {
          toast.error(
            language === 'de'
              ? 'Bitte mindestens 1 Referenzbild hinzufügen.'
              : 'Please add at least 1 reference image.',
          );
          setGenerating(false);
          return;
        }
        body.referenceImages = viduReferences.map((s) => s.url);
        body.referenceRoles = viduReferences.map((s) => s.role);
      } else if (composedSubjectRefs && composedSubjectRefs.length > 0 && !body.referenceImages) {
        // Subject-reference providers (non-Vidu path is rare, but keep it symmetric).
        // Do not overwrite the composed character anchor if it was already routed above.
        body.referenceImages = composedSubjectRefs;
      }
      if (model.capabilities.audio) {
        body.generateAudio = generateAudio && ttsLangSupported && !omniNonEnglishSilent;
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
          language === 'de'
            ? 'Sora 2 nutzt nur die Beschreibung (~70 % Konsistenz). Für längere Storys → Kling oder Hailuo.'
            : 'Sora 2 uses only the description (~70 % consistency). For longer stories switch to Kling or Hailuo.',
        );
      }

      const { data, error } = await supabase.functions.invoke(model.edgeFunction, { body });
      if (error) throw error;
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

      toast.success(
        language === 'de'
          ? `Video wird generiert (${model.name}). Kosten: ${symbol}${cost.toFixed(2)}`
          : `Video generation started (${model.name}). Cost: ${symbol}${cost.toFixed(2)}`,
      );
      refetchWallet();
      onAfterGenerate?.();
    } catch (err: any) {
      toast.error(err?.message ?? 'Generierung fehlgeschlagen');
    } finally {
      setGenerating(false);
    }
  };

  /* Gate: opens cost-confirm dialog unless user suppressed it within 24 h. */
  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast.error(language === 'de' ? 'Bitte gib einen Prompt ein.' : 'Please enter a prompt.');
      return;
    }
    if (!canAfford) {
      toast.error(
        language === 'de'
          ? 'Nicht genügend Credits. Bitte Credits aufladen.'
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
              ? (language === 'de'
                  ? 'Endframe wird nur von Luma Ray 2 unterstützt. Placement zurück auf „Am Anfang" setzen, um andere Modelle zu wählen.'
                  : 'End-frame is only supported by Luma Ray 2. Reset placement to "At start" to select other models.')
              : (language === 'de'
                  ? 'Anker-Modus wird nur von Vidu Q2 und Kling 3 unterstützt.'
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
              ? 'Beschreibe dein Video … nutze @charakter und @location aus deiner Library'
              : language === 'es'
              ? 'Describe tu vídeo … usa @personaje y @ubicación de tu biblioteca'
              : 'Describe your video … use @character and @location from your library'
          }
          rows={4}
        />
        <p className="mt-1.5 text-[10px] text-muted-foreground/80 italic">
          {language === 'de'
            ? 'ℹ️ Tippe @ um Charaktere & Locations aus deiner Library zu taggen.'
            : language === 'es'
            ? 'ℹ️ Escribe @ para etiquetar personajes y ubicaciones de tu biblioteca.'
            : 'ℹ️ Type @ to tag characters & locations from your library.'}
        </p>
      </Card>

      {/* ── Cinematic Style Presets (one-click director looks) ── */}
      <Card className="p-4 bg-card/60 backdrop-blur-xl border-border/60">
        <CinematicStylePresets value={shotSelection} onApply={(sel) => setShotSelection(sel)} />
      </Card>

      {/* ── Shot Director (cinematic prompt builder) ── */}
      <ShotDirectorPanel
        value={shotSelection}
        onChange={setShotSelection}
        basePrompt={prompt}
      />

      {/* ── Brand Character Lock (cross-studio persistent character) ──
           Hidden for Kling Omni — the unified Cast & Lip-Sync panel above
           is the single source of truth for characters in that mode. */}
      {!isKlingOmni && (
        <Card className="p-5 bg-card/60 backdrop-blur-xl border-border/60">
          <BrandCharacterSelector
            value={brandCharacter?.id ?? null}
            onChange={setBrandCharacter}
          />
        </Card>
      )}

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

      {/* v241 — text-only warning: model can't accept image reference at all */}
      {castCharacterIds.length > 0 &&
        !model.capabilities.i2v &&
        !model.capabilities.anchorOnly &&
        !model.capabilities.multiRef && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {language === 'de'
              ? `${model.name} akzeptiert keine Bild-Referenz — die gewählten Charaktere werden nur textlich beschrieben. Für garantierte Charakter-Treue wähle ein Modell mit Bild-Anker (Kling, Veo, Hailuo, HappyHorse …).`
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
                  ? 'Referenzbild automatisch — Startbild / Multi-Ref / V2V gesperrt'
                  : 'Reference image automatic — Start image / Multi-Ref / V2V locked'}
              </div>
              <div className="text-muted-foreground">
                {language === 'de'
                  ? 'Kling Omni komponiert das Referenzbild automatisch aus den gebuchten Charakteren. Manuelle Uploads würden den Anker überschreiben und zu fremden Gesichtern mit deinen Stimmen führen. Entferne alle Charaktere oben, um manuelle Bilder/Videos zu nutzen.'
                  : 'Kling Omni composes the reference image automatically from the booked characters. Manual uploads would overwrite the anchor and produce foreign faces with your voices. Remove all characters above to use manual images/videos.'}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Multi-Reference (only for capabilities.multiRef → Vidu Q2 Reference2V) ── */}
      {model.capabilities.multiRef && !omniMediaLock && (
        <MultiReferenceUploader
          slots={viduReferences}
          onChange={setViduReferences}
          maxReferences={model.capabilities.maxReferences ?? 7}
          brandCharacterUrl={brandCharacter?.reference_image_url ?? null}
          brandCharacterName={brandCharacter?.name ?? null}
        />
      )}

      {/* ── Image upload (only for I2V) ── */}
      {model.capabilities.i2v && !omniMediaLock && (
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
                {language === 'de' ? 'Bild hochladen für Image-to-Video' : 'Upload an image for Image-to-Video'}
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
                {language === 'de' ? 'Wo soll das Bild erscheinen?' : 'Where should the image appear?'}
              </Label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  {
                    key: 'start' as const,
                    label: language === 'de' ? 'Am Anfang' : 'At start',
                    hint: language === 'de' ? 'Bild ist der erste Frame' : 'Image is the first frame',
                    supportedByCurrent: true,
                  },
                  {
                    key: 'end' as const,
                    label: language === 'de' ? 'Am Ende' : 'At end',
                    hint: model.capabilities.endFrame
                      ? (language === 'de' ? 'Kamera fährt zum Bild hin' : 'Camera transitions to image')
                      : (language === 'de' ? 'Nur mit Luma Ray 2 möglich' : 'Only available with Luma Ray 2'),
                    supportedByCurrent: !!model.capabilities.endFrame,
                  },
                  {
                    key: 'anchor' as const,
                    label: language === 'de' ? 'Nur Anker' : 'Anchor only',
                    hint: model.capabilities.anchorOnly
                      ? (language === 'de' ? 'Nur Identitäts-Referenz, kein fester Frame' : 'Identity reference only, no forced frame')
                      : (language === 'de' ? 'Nur mit Vidu Q2 oder Kling 3 möglich' : 'Only available with Vidu Q2 or Kling 3'),
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
                          const luma = AI_VIDEO_TOOLKIT_MODELS.find((m) => m.capabilities.endFrame);
                          if (luma) {
                            setPendingPlacement({
                              placement: 'end',
                              targetModelId: luma.id,
                              targetModelName: luma.name,
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
                {language === 'de' ? 'Referenz-Video (Video-to-Video)' : 'Reference video (Video-to-Video)'}
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
                {language === 'de'
                  ? 'Video hochladen (mp4/webm, max. 50 MB, ≤ 30s empfohlen)'
                  : 'Upload a video (mp4/webm, max 50 MB, ≤ 30s recommended)'}
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
                      ? 'Feature — Stil & Bewegung übernehmen'
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
                {language === 'de'
                  ? 'V2V derzeit nur für Kling 3 Standard / Pro.'
                  : 'V2V is currently only available for Kling 3 Standard / Pro.'}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* ── Settings ── */}
      <Card className="p-5 bg-card/60 backdrop-blur-xl border-border/60 grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {language === 'de' ? 'Dauer' : 'Duration'}
          </Label>
          <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
            <SelectTrigger className="bg-background/40 border-border/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {model.durations.map((d) => (
                <SelectItem key={d} value={String(d)}>{d}s</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {language === 'de' ? 'Format' : 'Aspect Ratio'}
          </Label>
          <Select value={aspectRatio} onValueChange={setAspectRatio}>
            <SelectTrigger className="bg-background/40 border-border/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {model.aspectRatios.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            {language === 'de' ? 'Qualität' : 'Quality'}
          </Label>
          <div className="h-9 flex items-center px-3 rounded-md bg-background/40 border border-border/40">
            <Badge variant="outline" className="border-primary/30 text-primary">
              {model.resolution}
            </Badge>
          </div>
        </div>

        {model.capabilities.audio && (
          <div className="sm:col-span-3 space-y-2 p-3 rounded-md bg-background/40 border border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {generateAudio
                  ? <Volume2 className="h-4 w-4 text-primary" />
                  : <VolumeX className="h-4 w-4 text-muted-foreground" />
                }
                <Label className="text-sm cursor-pointer" htmlFor="audio-switch">
                  {language === 'de' ? 'Native Audio generieren' : 'Generate native audio'}
                </Label>
              </div>
              <Switch id="audio-switch" checked={generateAudio} onCheckedChange={setGenerateAudio} />
            </div>
            {generateAudio && (
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/30">
                <Label className="text-xs text-muted-foreground">
                  {language === 'de' ? 'Gesprochene Sprache' : language === 'es' ? 'Idioma hablado' : 'Spoken language'}
                </Label>
                <Select value={spokenLanguage} onValueChange={(v) => setSpokenLanguage(v as 'auto' | 'de' | 'en' | 'es')}>
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      {language === 'de'
                        ? `Auto (UI: ${language === 'de' ? 'Deutsch' : 'English'})`
                        : `Auto (UI: ${language === 'es' ? 'Español' : 'English'})`}
                    </SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {generateAudio && !ttsLangSupported && (
              <p className="text-[11px] leading-snug text-amber-500/90 pt-1 border-t border-border/30">
                {language === 'de'
                  ? `${model.name} unterstützt ${effectiveSpokenLang === 'de' ? 'Deutsch' : effectiveSpokenLang === 'es' ? 'Spanisch' : 'diese Sprache'} nicht zuverlässig. Für diese Szene wird kein Voiceover erzeugt — nur Umgebungssound/Musik. Für echtes Voiceover z. B. Veo 3.1 oder Sora 2 wählen, oder nachträglich im Motion Studio ergänzen.`
                  : language === 'es'
                  ? `${model.name} no admite ${effectiveSpokenLang === 'de' ? 'alemán' : effectiveSpokenLang === 'es' ? 'español' : 'este idioma'} de forma fiable. Esta escena se generará sin voz — solo sonido ambiente/música. Para voz real usa p. ej. Veo 3.1 o Sora 2, o añádela después en Motion Studio.`
                  : `${model.name} does not reliably support ${effectiveSpokenLang === 'de' ? 'German' : effectiveSpokenLang === 'es' ? 'Spanish' : 'this language'}. This scene will render without voiceover — ambient sound / music only. For real voiceover pick e.g. Veo 3.1 or Sora 2, or add it later in Motion Studio.`}
              </p>
            )}
          </div>
        )}

        {/* ── Kling 3.0 Omni — Unified Cast + Native Lip-Sync ── */}
        {isKlingOmni && (() => {
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
              toast.info(language === 'de' ? 'Kein weiterer Charakter in Cast & World verfügbar.' : 'No further character available in Cast & World.');
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
                  ? 'Kling Omni spricht Deutsch aktuell nicht zuverlässig. Dieser Clip bleibt stumm; nutze Motion Studio für deutsches Lip-Sync.'
                  : 'Kling Omni does not speak this language reliably yet. This clip stays silent; use Motion Studio for non-English lip-sync.',
              );
              return;
            }
            if (checked && lipSyncCount >= LIP_SYNC_MAX) return;
            if (!checked && row.line.trim()) {
              if (!confirm(language === 'de' ? 'Lip-Sync für diesen Charakter deaktivieren? Der Dialogtext wird verworfen.' : 'Disable lip-sync for this character? The dialogue will be discarded.')) return;
              updateRow(idx, { lipSync: false, line: '' });
              return;
            }
            updateRow(idx, { lipSync: checked });
          };

          return (
            <div className="sm:col-span-3 space-y-3 p-3 rounded-md bg-primary/5 border border-primary/30">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <Label className="text-sm">
                    {language === 'de' ? 'Cast & Omni Anchor (Lip-Sync nur EN)' : 'Cast & Omni Anchor (Lip-Sync EN only)'}
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
                  ? 'Deutsch ist bei Kling Omni aktuell silent-only, weil die native Stimme sonst Fantasiesprache mit englischem Akzent erzeugt. Die Charaktere erscheinen im Bild, sprechen aber nicht. Für deutsches Lip-Sync bitte Motion Studio verwenden.'
                  : omniNonEnglishSilent
                  ? 'This language is silent-only for Kling Omni because native speech is not reliable yet. Characters appear in frame but do not speak. Use Motion Studio for non-English lip-sync.'
                  : language === 'de'
                  ? 'Bis zu 4 Charaktere aus Cast & World. Aktiviere den Lip-Sync-Switch für max. 2 sprechende Charaktere — die anderen erscheinen als stumme Statist:innen im Bild.'
                  : 'Up to 4 characters from Cast & World. Toggle lip-sync for up to 2 speaking characters — the rest appear as silent extras in the frame.'}
              </p>

              {omniLines.length === 0 && (
                <div className="rounded-md border border-dashed border-primary/30 bg-background/40 p-4 text-center text-[12px] text-muted-foreground">
                  {language === 'de'
                    ? 'Noch keine Charaktere. Füge unten deinen ersten Cast-Charakter hinzu.'
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
                                    {ch.name}{usedElsewhere ? (language === 'de' ? ' · bereits zugewiesen' : ' · already assigned') : ''}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {language === 'de' ? 'Aus Cast & World' : 'From Cast & World'}
                          </p>
                        </div>
                        <div
                          className="flex flex-col items-center gap-1"
                          title={
                            switchDisabled
                              ? (omniNonEnglishSilent
                                  ? (language === 'de'
                                      ? 'Deutsch/Spanisch sind für Kling Omni gesperrt, um Fantasie-Sprache zu verhindern.'
                                      : 'Non-English lip-sync is blocked for Kling Omni to prevent fantasy speech.')
                                  : language === 'de'
                                  ? 'Kling Omni erlaubt max. 2 sprechende Charaktere pro Clip.'
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
                              {language === 'de' ? 'Stimme' : 'Voice'}
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
                          {language === 'de'
                            ? 'Stumme:r Statist:in — erscheint im Anchor, spricht nicht.'
                            : 'Silent extra — appears in the anchor, does not speak.'}
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
                  + {language === 'de' ? 'Charakter hinzufügen' : 'Add character'}
                </Button>
              )}

              {omniLines.length > 0 && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {language === 'de'
                    ? `${omniLines.length} Charakter(e) im Anchor · ${withDialog}/${LIP_SYNC_MAX} mit Dialog · ${silent} stumme(r) Statist(en).`
                    : `${omniLines.length} character(s) in anchor · ${withDialog}/${LIP_SYNC_MAX} with dialogue · ${silent} silent extra(s).`}
                </p>
              )}
            </div>
          );
        })()}
      </Card>

      {/* ── Generate CTA ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between p-4 rounded-xl bg-gradient-to-r from-primary/5 to-accent/5 border border-primary/20">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {language === 'de' ? 'Geschätzte Kosten' : 'Estimated cost'}
          </p>
          <p className="text-2xl font-bold text-primary tabular-nums">
            {symbol}{cost.toFixed(2)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {duration}s × {symbol}{pricePerSecond.toFixed(2)}/s · {model.name}
          </p>
        </div>
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={generating || !prompt.trim() || !canAfford}
          className="min-w-[200px] bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {composingScene ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {language === 'de' ? 'Szene komponieren…' : 'Composing scene…'}</>
          ) : generating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {language === 'de' ? 'Generiere…' : 'Generating…'}</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" /> {language === 'de' ? 'Video generieren' : 'Generate video'}</>
          )}
        </Button>
      </div>

      {lastAnchorComposed && (
        <p className="text-center text-[11px] text-primary/80">
          🎬 {language === 'de'
            ? 'Scene-Aware: Charakter wurde in die Szene komponiert (kein Portrait-Startframe).'
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
                ? (language === 'de' ? 'Endframe nur mit Luma Ray 2' : 'End-frame only with Luma Ray 2')
                : (language === 'de' ? 'Anker-Modus benötigt Vidu Q2 oder Kling 3' : 'Anchor mode needs Vidu Q2 or Kling 3')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingPlacement?.placement === 'end'
                ? (language === 'de'
                    ? `Die Endframe-Funktion ist ausschließlich mit Luma Ray 2 verfügbar. Möchtest du jetzt zu ${pendingPlacement?.targetModelName} wechseln? Solange „Am Ende" aktiv ist, sind andere Modelle im Picker ausgegraut.`
                    : `The end-frame option is exclusive to Luma Ray 2. Switch to ${pendingPlacement?.targetModelName} now? While "At end" is active, other models will be greyed out.`)
                : (language === 'de'
                    ? `Der Anker-Modus (Referenzbild ohne festen Frame) ist nur mit Vidu Q2 oder Kling 3 verfügbar. Zu ${pendingPlacement?.targetModelName} wechseln?`
                    : `Anchor mode (reference image without a forced frame) is only available with Vidu Q2 or Kling 3. Switch to ${pendingPlacement?.targetModelName}?`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {language === 'de' ? 'Abbrechen' : 'Cancel'}
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
          title: language === 'de' ? 'Video generieren?' : 'Generate video?',
          description:
            language === 'de'
              ? 'Übersicht deiner Kosten — sobald du bestätigst, startet die Generierung und dein AI-Guthaben wird belastet.'
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
        {language === 'de'
          ? `${AI_VIDEO_TOOLKIT_MODELS.length} Modelle verfügbar — wechsle oben das Modell, dein Prompt bleibt erhalten.`
          : `${AI_VIDEO_TOOLKIT_MODELS.length} models available — switch the model above, your prompt is preserved.`}
      </p>
    </motion.div>
  );
}
