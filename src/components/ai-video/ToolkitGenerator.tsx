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

import { ModelSelector } from './ModelSelector';
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
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<number>(model.durations[0]);
  const [aspectRatio, setAspectRatio] = useState<string>(model.aspectRatios[0]);
  const [generateAudio, setGenerateAudio] = useState<boolean>(model.capabilities.audio);
  const [startImageUrl, setStartImageUrl] = useState<string | null>(null);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState<string | null>(null);
  const [videoReferenceType, setVideoReferenceType] = useState<'feature' | 'base'>('feature');
  const [viduReferences, setViduReferences] = useState<ViduReferenceSlot[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [composingScene, setComposingScene] = useState(false);
  const [lastAnchorComposed, setLastAnchorComposed] = useState(false);

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
    // Reflect selection in URL for shareable / bookmarkable state
    if (searchParams.get('model') !== model.id) {
      const next = new URLSearchParams(searchParams);
      next.set('model', model.id);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id]);

  const cost = duration * model.costPerSecond[currency];
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
  const handleGenerate = async () => {
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
      // Build the prompt — inject Library cast/location, Brand Character (if locked) AND Shot Director cinematography
      const castSuffix = buildCastPromptSuffix(castCharacter, castLocation);
      const brandSuffix = brandCharacter
        ? `Featuring ${brandCharacter.name}: ${buildCharacterPromptInjection(brandCharacter)}.`
        : '';
      const shotSuffix = buildShotPromptSuffix(shotSelection);
      const finalPrompt = [mentionResolved.prompt, shotSuffix, brandSuffix, castSuffix]
        .filter(Boolean)
        .join('\n\n');

      const body: Record<string, unknown> = {
        prompt: finalPrompt,
        model: model.id,
        duration,
        aspectRatio,
      };

      // Scene-Aware Anchor (Motion-Studio parity):
      // Instead of blindly sending the avatar portrait as i2v first-frame
      // (which locks every scene to start on the portrait pose), pre-compose
      // a scene-specific first frame via Nano Banana 2 (compose-scene-anchor).
      // Manual uploads still win, as does the Vidu multiRef path below.
      let composedFirstFrame: string | undefined;
      let composedSubjectRefs: string[] | undefined;
      let anchorComposed = false;
      setLastAnchorComposed(false);

      const anchorChar: ComposerCharacter | null =
        brandCharacter
          ? {
              id: brandCharacter.id,
              name: brandCharacter.name,
              appearance: (brandCharacter as any).description ?? '',
              signatureItems: '',
              brandCharacterId: brandCharacter.id,
              referenceImageUrl: brandCharacter.reference_image_url ?? undefined,
            }
          : castCharacter
          ? {
              id: castCharacter.id,
              name: castCharacter.name,
              appearance: (castCharacter as any).description ?? '',
              signatureItems: (castCharacter as any).signature_items ?? '',
              referenceImageUrl: castCharacter.reference_image_url ?? undefined,
            }
          : null;

      const clipSource = toolkitModelToClipSource(model);
      const shouldCompose =
        !startImageUrl &&
        !!anchorChar?.referenceImageUrl &&
        !!clipSource &&
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
          } as ComposerScene;
          const ar =
            aspectRatio === '9:16' ? '9:16'
            : aspectRatio === '1:1' ? '1:1'
            : '16:9';
          const prep = await prepareSceneAnchor(
            stubScene,
            [anchorChar!],
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
        } catch (e) {
          console.warn('[toolkit] compose-scene-anchor failed — falling back to raw portrait', e);
        } finally {
          setComposingScene(false);
        }
      }

      // i2v: composed scene frame > manual upload > raw portrait fallbacks
      const referenceImage =
        composedFirstFrame ??
        startImageUrl ??
        anchorChar?.referenceImageUrl ??
        mentionResolved.referenceImageUrl ??
        null;
      if (model.capabilities.i2v && referenceImage) body.startImageUrl = referenceImage;
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
      }
      if (model.capabilities.audio) body.generateAudio = generateAudio;
      // Grok-specific flag (alias)
      if (model.family === 'grok') body.enableAudio = generateAudio;

      // Sora 2 cannot accept image input → toast hint when a character is selected
      if (model.family === 'sora' && (castCharacter || brandCharacter)) {
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

      <ToolkitCastPicker
        characterId={castCharacterId}
        locationId={castLocationId}
        onCharacterChange={setCastCharacterId}
        onLocationChange={setCastLocationId}
        consistencyKey={consistencyKey}
        supportsImageInput={model.capabilities.i2v}
      />

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
          <div className="sm:col-span-3 flex items-center justify-between p-3 rounded-md bg-background/40 border border-border/40">
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
            {duration}s × {symbol}{model.costPerSecond[currency].toFixed(2)}/s · {model.name}
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

      <VideoPromptOptimizer
        open={showOptimizer}
        onClose={() => setShowOptimizer(false)}
        onPromptGenerated={(p) => { setPrompt(p); setShowOptimizer(false); }}
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
