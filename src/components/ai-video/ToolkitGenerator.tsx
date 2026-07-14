import { useEffect, useMemo, useState } from 'react';
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
import type { MotionStudioLocation } from '@/types/motion-studio';
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
  // Kling 3.0 Omni ist die einzige Kling-Variante mit nativem DE/EN/ES-Lip-Sync.
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
    ? (['en', 'de', 'es'] as const).includes(effectiveSpokenLang)
    : (PROVIDER_TTS_LANGS[model.family] ?? []).includes(effectiveSpokenLang);
  const [startImageUrl, setStartImageUrl] = useState<string | null>(null);
  /* ── Kling Omni: per-speaker native Lip-Sync (max. 2 speakers) ── */
  type OmniVoicePreset = 'female-warm' | 'female-bright' | 'male-warm' | 'male-deep' | 'neutral';
  type OmniLine = { characterId: string | null; line: string; voicePreset: OmniVoicePreset };
  const [omniLines, setOmniLines] = useState<OmniLine[]>([
    { characterId: null, line: '', voicePreset: 'female-warm' },
  ]);
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

  /* ── Library Cast & Locations (Scene Continuity) ── */
  const { characters: libCharacters, locations: libLocations } = useMotionStudioLibrary();
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
      const dialogueSuppressed = !!(model.capabilities.audio && generateAudio) && !ttsLangSupported;
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
        body.generateAudio = generateAudio;
        if (generateAudio && ttsLangSupported) {
          body.spokenLanguage = effectiveSpokenLang;
        } else if (generateAudio && !ttsLangSupported) {
          body.suppressDialogue = true;
        }
      }
      // Grok-specific flag (alias)
      if (model.family === 'grok') body.enableAudio = generateAudio;

      // Kling 3.0 Omni — native Lip-Sync in DE/EN/ES bypasses Sync.so.
      // Per-speaker lines are merged into a screenplay-style dialog string
      // and — when > 1 speaker — additionally passed as `speaker_voices`.
      if (isKlingOmni) {
        const activeLines = omniLines
          .filter((l) => l.line.trim().length > 0)
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

      {/* ── Brand Character Lock (cross-studio persistent character) ── */}
      <Card className="p-5 bg-card/60 backdrop-blur-xl border-border/60">
        <BrandCharacterSelector
          value={brandCharacter?.id ?? null}
          onChange={setBrandCharacter}
        />
      </Card>

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

      {/* ── Multi-Reference (only for capabilities.multiRef → Vidu Q2 Reference2V) ── */}
      {model.capabilities.multiRef && (
        <MultiReferenceUploader
          slots={viduReferences}
          onChange={setViduReferences}
          maxReferences={model.capabilities.maxReferences ?? 7}
          brandCharacterUrl={brandCharacter?.reference_image_url ?? null}
          brandCharacterName={brandCharacter?.name ?? null}
        />
      )}

      {/* ── Image upload (only for I2V) ── */}
      {model.capabilities.i2v && (
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
      {model.capabilities.v2v && (
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

        {/* ── Kling 3.0 Omni — Native Lip-Sync Panel ── */}
        {isKlingOmni && (
          <div className="sm:col-span-3 space-y-3 p-3 rounded-md bg-primary/5 border border-primary/30">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <Label className="text-sm">
                  {language === 'de' ? 'Native Lip-Sync (DE/EN/ES)' : 'Native lip-sync (DE/EN/ES)'}
                </Label>
              </div>
              <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
                {language === 'de' ? 'Ein Rendering — kein Sync.so nötig' : 'Single render — no Sync.so needed'}
              </Badge>
            </div>

            <p className="text-[11px] text-muted-foreground leading-snug">
              {language === 'de'
                ? 'Ein Block pro Sprecher — Dialog & Stimme direkt am Charakter. Leer lassen für stummen Clip mit Ambient-Audio.'
                : 'One block per speaker — dialogue & voice attached to the character. Leave empty for a silent clip with ambient audio.'}
            </p>

            {/* Per-speaker rows */}
            <div className="space-y-3">
              {omniLines.map((row, idx) => {
                const c = row.characterId ? libCharacters.find((x) => x.id === row.characterId) : null;
                const displayName = c?.name?.trim() || (language === 'de' ? `Sprecher ${idx + 1}` : `Speaker ${idx + 1}`);
                const initials = displayName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                const updateRow = (patch: Partial<OmniLine>) =>
                  setOmniLines((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
                const removeRow = () =>
                  setOmniLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
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
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{displayName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {c ? (language === 'de' ? 'Aus Cast & World' : 'From Cast & World') : (language === 'de' ? 'Anonymer Sprecher' : 'Anonymous speaker')}
                        </p>
                      </div>
                      <Select value={row.voicePreset} onValueChange={(v) => updateRow({ voicePreset: v as OmniVoicePreset })}>
                        <SelectTrigger className="h-8 w-[160px] text-xs">
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
                      {omniLines.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={removeRow}
                          aria-label="Remove speaker"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Textarea
                      value={row.line}
                      onChange={(e) => updateRow({ line: e.target.value.slice(0, 300) })}
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
                  </div>
                );
              })}
            </div>

            {omniLines.length < 2 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs border-primary/30"
                onClick={() =>
                  setOmniLines((prev) => [
                    ...prev,
                    { characterId: null, line: '', voicePreset: 'male-warm' },
                  ])
                }
              >
                + {language === 'de' ? 'Zweiten Sprecher hinzufügen' : 'Add second speaker'}
              </Button>
            )}

            {castCharacterIds.length > 2 && (
              <p className="text-[11px] leading-snug text-amber-500/90">
                {language === 'de'
                  ? `Kling Omni unterstützt max. 2 Sprecher pro Clip. Aktuell ${castCharacterIds.length} Charaktere ausgewählt — nur die ersten 2 erhalten Lip-Sync.`
                  : `Kling Omni supports max. 2 speakers per clip. Currently ${castCharacterIds.length} characters selected — only the first 2 get lip-sync.`}
              </p>
            )}
          </div>
        )}
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
