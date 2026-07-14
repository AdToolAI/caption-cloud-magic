import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Upload, Loader2, Wand2, Image as ImageIcon, X, FolderOpen, Wallet, Zap, Crown, Gem, Palette, Camera } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { useAIVideoWallet } from "@/hooks/useAIVideoWallet";
import { useActiveBrandKit, computeCIMatchScore } from "@/hooks/useActiveBrandKit";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageCard } from "./ImageCard";
import { StudioLightbox } from "./StudioLightbox";
import { SaveToAlbumDialog } from "./SaveToAlbumDialog";
import { getCachedState, setCachedState } from "./imageGeneratorCache";
import { PromptHelperDialog, type PromptHelperResult } from "./PromptHelperDialog";
import { PreflightCheck } from "./PreflightCheck";
import AIVideoCostConfirmDialog from "@/components/ai-video/AIVideoCostConfirmDialog";
import {
  PICTURE_MODES,
  type PictureMode,
  type QualityTier as ModelTier,
} from "@/config/pictureStudioModels";

interface GeneratedImage {
  id?: string;
  url: string;
  prompt: string;
  style: string;
  aspectRatio: string;
}

type QualityTier = 'standard' | 'fast' | 'pro' | 'ultra';

const TIER_COSTS: Record<QualityTier, number> = {
  standard: 0,    // Gemini via Lovable AI Gateway — gratis im Abo
  fast: 0.04,     // Seedream 4
  pro: 0.08,      // Imagen 4 Ultra
  ultra: 0.20,    // Nano Banana 2
};

const TIER_META: Record<QualityTier, { label: string; model: string; icon: any; gradient: string }> = {
  standard: { label: 'Standard', model: 'Gemini (im Abo)', icon: Sparkles, gradient: 'from-emerald-500/20 to-teal-500/20' },
  fast: { label: 'Fast', model: 'Seedream 4', icon: Zap, gradient: 'from-blue-500/20 to-cyan-500/20' },
  pro: { label: 'Pro', model: 'Imagen 4 Ultra', icon: Crown, gradient: 'from-purple-500/20 to-pink-500/20' },
  ultra: { label: 'Ultra', model: 'Nano Banana 2', icon: Gem, gradient: 'from-amber-500/20 to-orange-500/20' },
};

export function ImageGenerator() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { wallet } = useAIVideoWallet();
  const { data: activeBrandKit } = useActiveBrandKit();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleRefInputRef = useRef<HTMLInputElement>(null);
  const status = { stage: '', message: '' };

  const STYLES = useMemo(() => [
    { value: 'realistic', label: t('picStudio.styleRealistic') },
    { value: 'cinematic', label: t('picStudio.styleCinematic') },
    { value: 'watercolor', label: t('picStudio.styleWatercolor') },
    { value: 'neon-cyberpunk', label: t('picStudio.styleNeonCyberpunk') },
    { value: 'anime', label: t('picStudio.styleAnime') },
    { value: 'oil-painting', label: t('picStudio.styleOilPainting') },
    { value: 'pop-art', label: t('picStudio.stylePopArt') },
    { value: 'minimalist', label: t('picStudio.styleMinimalist') },
    { value: 'vintage', label: t('picStudio.styleVintage') },
    { value: 'fantasy', label: t('picStudio.styleFantasy') },
    { value: 'product-photo', label: t('picStudio.styleProductPhoto') },
    { value: 'abstract', label: t('picStudio.styleAbstract') },
    { value: 'sketch', label: t('picStudio.styleSketch') },
    { value: '3d-render', label: t('picStudio.style3dRender') },
    { value: 'noir', label: t('picStudio.styleNoir') },
    { value: 'pastel', label: t('picStudio.stylePastel') },
    { value: 'comic', label: t('picStudio.styleComic') },
    { value: 'surreal', label: t('picStudio.styleSurreal') },
    { value: 'architectural', label: t('picStudio.styleArchitectural') },
    { value: 'editorial', label: t('picStudio.styleEditorial') },
    { value: 'brand-logo', label: t('picStudio.styleBrandLogo') },
  ], [t]);

  const ASPECT_RATIOS = useMemo(() => [
    { value: '1:1', label: t('picStudio.arSquare') },
    { value: '16:9', label: t('picStudio.arLandscape') },
    { value: '9:16', label: t('picStudio.arPortrait') },
    { value: '4:5', label: t('picStudio.arInstagram') },
    { value: '4:3', label: t('picStudio.arHeader') },
    { value: '3:4', label: t('picStudio.arVertical') },
    { value: '2:1', label: t('picStudio.arBanner') },
  ], [t]);

  const cached = getCachedState();

  const [prompt, setPrompt] = useState(cached?.prompt ?? "");
  const [style, setStyle] = useState(cached?.style ?? "realistic");
  const [aspectRatio, setAspectRatio] = useState(cached?.aspectRatio ?? "1:1");
  const [tier, setTier] = useState<QualityTier>('standard');
  
  // New mode model (replaces editMode boolean). Legacy editMode is migrated.
  const initialMode: PictureMode =
    cached?.mode ?? (cached?.editMode ? 'transform' : 'create');
  const [mode, setMode] = useState<PictureMode>(initialMode);
  const [referenceImage, setReferenceImage] = useState<string | null>(cached?.referenceImage ?? null);
  const [styleReference, setStyleReference] = useState<string | null>(cached?.styleReference ?? null);
  const [strength, setStrength] = useState<number>(cached?.strength ?? 70);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>(cached?.generatedImages ?? []);
  const [replicateLoading, setReplicateLoading] = useState(false);

  const [albumDialogOpen, setAlbumDialogOpen] = useState(false);
  const [selectedImageForAlbum, setSelectedImageForAlbum] = useState<GeneratedImage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);
  const [justGenerated, setJustGenerated] = useState(false);
  const [variantsCount, setVariantsCount] = useState<1 | 4>(1);
  const [useBrandKit, setUseBrandKit] = useState(false);
  const [ciScores, setCiScores] = useState<Record<string, number>>({});
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperAutoEnhance, setHelperAutoEnhance] = useState(false);

  // Derived: legacy editMode = "we have a reference + we want to transform"
  const editMode = mode === 'transform';

  const loading = replicateLoading;
  const baseCost = TIER_COSTS[tier];
  const cost = baseCost * variantsCount;
  const currency = wallet?.currency || 'EUR';
  const currencySymbol = currency === 'USD' ? '$' : '€';
  const balance = wallet?.balance_euros ?? 0;
  const hasInsufficientCredits = cost > 0 && balance < cost;

  useEffect(() => {
    setCachedState({
      prompt,
      style,
      aspectRatio,
      quality: tier === 'standard' || tier === 'fast' ? 'fast' : 'pro',
      editMode,
      mode,
      strength,
      referenceImage,
      styleReference,
      generatedImages,
    });
  }, [prompt, style, aspectRatio, tier, editMode, mode, strength, referenceImage, styleReference, generatedImages]);

  // When the mode changes, clean up slots that aren't relevant for it.
  useEffect(() => {
    if (mode === 'create') {
      // create: no reference of any kind
      setReferenceImage(null);
      setStyleReference(null);
    } else if (mode === 'transform') {
      // transform: only the i2i slot matters
      setStyleReference(null);
    } else if (mode === 'restyle') {
      // restyle: only the style reference matters
      setReferenceImage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setReferenceImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleStyleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setStyleReference(reader.result as string);
    reader.readAsDataURL(file);
  };

  const brandKitPayload = useBrandKit && activeBrandKit ? {
    name: activeBrandKit.brand_name || undefined,
    primaryColor: activeBrandKit.primary_color || undefined,
    secondaryColor: activeBrandKit.secondary_color || undefined,
    accentColor: activeBrandKit.accent_color || undefined,
    mood: activeBrandKit.mood || undefined,
  } : null;

  // Build the effective prompt: for transform-mode, append a preservation
  // suffix based on the strength slider, so downstream models (which mostly
  // don't expose a numeric "strength" param) honor user intent via language.
  const effectivePrompt = useMemo(() => {
    const base = prompt.trim();
    if (mode !== 'transform' || !referenceImage) return base;
    if (strength <= 35) {
      return `${base}\n\nPreserve the exact composition, subjects, layout and lighting of the reference image. Only refine style and details — do not move, add, or remove subjects.`;
    }
    if (strength <= 65) {
      return `${base}\n\nKeep the overall composition and main subjects of the reference image. Adjust style, lighting and atmosphere as described.`;
    }
    return `${base}\n\nUse the reference image as loose inspiration only.`;
  }, [prompt, mode, referenceImage, strength]);

  /** "Realistic Reproduction" one-click for the transform mode. */
  const handleRealisticReproduction = () => {
    setTier('ultra');
    setStrength(40);
    setStyle('realistic');
    setVariantsCount(1);
    setPrompt((p) => {
      const base = p.trim();
      const suffix = 'photorealistic, ultra-detailed, preserve composition and all subjects from reference, natural light, sharp focus, IMAX color grading';
      if (base.toLowerCase().includes('photorealistic')) return base;
      return base ? `${base}, ${suffix}` : `Photorealistic recreation of the reference scene, ${suffix}`;
    });
    toast.success('Realistic-Reproduction-Preset gesetzt');
  };

  const handleHelperApply = (result: PromptHelperResult, chosenPrompt: string) => {
    setPrompt(chosenPrompt);
    setTier(result.recommendedTier as ModelTier);
    setMode(result.recommendedMode);
    if (result.recommendedMode === 'transform') {
      setStrength(result.recommendedStrength);
    }
    toast.success(`Prompt übernommen — Modell: ${result.recommendedTier}`);
  };

  const generateOne = async (): Promise<any | null> => {
    if (tier === 'standard') {
      const { data, error } = await supabase.functions.invoke('generate-studio-image', {
        body: {
          prompt: effectivePrompt,
          style,
          aspectRatio,
          quality: 'fast',
          editMode,
          referenceImageUrl: editMode ? referenceImage : undefined,
        }
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || 'Generation failed');
      if (data?.error) throw new Error(data.error);
      return data?.image || null;
    }

    // Premium tier — Replicate via €-Wallet
    const { data, error } = await supabase.functions.invoke('generate-image-replicate', {
      body: {
        prompt: effectivePrompt,
        tier,
        aspectRatio,
        style,
        referenceImageUrl: editMode ? referenceImage : undefined,
        styleReferenceUrl: mode === 'restyle' ? (styleReference || undefined) : undefined,
        strength: mode === 'transform' ? strength : undefined,
        brandKit: brandKitPayload,
      }
    });

    if (error) {
      const fnError: any = error;
      if (fnError.context && typeof fnError.context.json === 'function') {
        const body = await fnError.context.json().catch(() => null);
        if (body?.code === 'INSUFFICIENT_CREDITS' || body?.code === 'NO_WALLET') {
          const err: any = new Error(body.error);
          err.needsPurchase = true;
          throw err;
        }
        const err: any = new Error(body?.error || fnError.message);
        err.code = body?.code;
        throw err;
      }
      throw error;
    }
    return data?.image || null;
  };

  const runGenerate = async () => {
    if (!prompt.trim()) {
      toast.error(t('picStudio.promptRequired'));
      return;
    }
    if (!user) {
      toast.error(t('picStudio.loginRequired'));
      return;
    }

    if (hasInsufficientCredits) {
      toast.error(`Nicht genügend AI Credits. Du brauchst ${currencySymbol}${cost.toFixed(2)}, hast aber nur ${currencySymbol}${balance.toFixed(2)}.`);
      navigate('/ai-video-purchase-credits');
      return;
    }


    setReplicateLoading(true);
    try {
      const tasks = Array.from({ length: variantsCount }, () => generateOne());
      const results = await Promise.allSettled(tasks);

      let successCount = 0;
      let safetyFilteredMsg: string | null = null;
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          await handleGenerationSuccess(r.value);
          successCount++;
        } else if (r.status === 'rejected') {
          if ((r.reason as any)?.needsPurchase) {
            toast.error(r.reason.message);
            navigate('/ai-video-purchase-credits');
            setReplicateLoading(false);
            return;
          }
          if ((r.reason as any)?.code === 'SAFETY_FILTERED') {
            safetyFilteredMsg = r.reason.message;
          }
          console.error('[ImageGenerator] variant failed:', r.reason);
        }
      }

      if (successCount === 0) {
        if (safetyFilteredMsg) {
          const canRetryFast = tier !== 'fast';
          toast.warning('Sicherheitsfilter ausgelöst', {
            description: safetyFilteredMsg + (canRetryFast ? ' Tipp: „Fast" (Seedream 4) hat tolerantere Filter.' : ''),
            duration: 14000,
            action: canRetryFast ? {
              label: 'Mit Fast erneut',
              onClick: () => {
                setTier('fast');
                setTimeout(() => { void runGenerate(); }, 50);
              },
            } : undefined,
          });
        } else {
          toast.error('Bildgenerierung fehlgeschlagen');
        }
      } else if (variantsCount > 1) {
        toast.success(`${successCount} von ${variantsCount} Varianten generiert`);
      }
    } catch (error: any) {
      toast.error(error.message || t('picStudio.imageGenerationError'));
    } finally {
      setReplicateLoading(false);
    }
  };

  /* Confirm gate — only premium tiers (paid Replicate) require confirmation. */
  const COST_SUPPRESS_KEY = 'picture-studio:cost-suppressed-until';
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [costDialogSuppressed, setCostDialogSuppressed] = useState(false);

  const handleGenerate = () => {
    if (!prompt.trim()) { toast.error(t('picStudio.promptRequired')); return; }
    if (!user) { toast.error(t('picStudio.loginRequired')); return; }
    // Free tier (Gemini/Standard "Gratis im Abo") skips confirm.
    if (cost <= 0) { void runGenerate(); return; }
    if (hasInsufficientCredits) {
      toast.error(`Nicht genügend AI Credits. Du brauchst ${currencySymbol}${cost.toFixed(2)}, hast aber nur ${currencySymbol}${balance.toFixed(2)}.`);
      navigate('/ai-video-purchase-credits');
      return;
    }
    try {
      const until = Number(localStorage.getItem(COST_SUPPRESS_KEY) ?? '0');
      if (Date.now() < until) { void runGenerate(); return; }
    } catch { /* noop */ }
    setCostDialogSuppressed(false);
    setCostDialogOpen(true);
  };

  const confirmCostAndGenerate = () => {
    if (costDialogSuppressed) {
      try { localStorage.setItem(COST_SUPPRESS_KEY, String(Date.now() + 24 * 60 * 60 * 1000)); } catch { /* noop */ }
    }
    setCostDialogOpen(false);
    void runGenerate();
  };


  const handleGenerationSuccess = async (image: any) => {
    const imgUrl = image.previewUrl || image.url;
    const imageId = image.id;
    setGeneratedImages(prev => [
      { ...image, url: imgUrl, prompt: prompt.trim(), style, aspectRatio },
      ...prev,
    ]);
    if (tier === 'standard' && variantsCount === 1) toast.success(t('picStudio.imageGenerated'));
    setJustGenerated(true);

    // CI-Match-Score (Phase C — async, non-blocking)
    if (useBrandKit && activeBrandKit && imgUrl) {
      const palette = [
        activeBrandKit.primary_color,
        activeBrandKit.secondary_color,
        activeBrandKit.accent_color,
      ].filter(Boolean) as string[];
      if (palette.length) {
        computeCIMatchScore(imgUrl, palette)
          .then(score => {
            const key = imageId || imgUrl;
            setCiScores(prev => ({ ...prev, [key]: score }));
            if (score < 60) {
              toast.warning(`CI-Match nur ${score}% — Bild weicht vom Markenstil ab`);
            }
          })
          .catch(() => { /* silent */ });
      }
    }

    if (imageId && user) {
      try {
        let { data: systemAlbum } = await supabase
          .from('studio_albums')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_system', true)
          .eq('name', 'KI Picture Studio')
          .maybeSingle();

        if (!systemAlbum) {
          const { data: newAlbum } = await supabase
            .from('studio_albums')
            .insert({ user_id: user.id, name: 'KI Picture Studio', is_system: true })
            .select('id')
            .single();
          systemAlbum = newAlbum;
        }

        if (systemAlbum) {
          await supabase
            .from('studio_images')
            .update({ album_id: systemAlbum.id })
            .eq('id', imageId);
        }
      } catch (err) {
        console.error('Auto-assign to system album failed:', err);
      }
    }
  };

  const handleSaveToAlbum = (image: GeneratedImage) => {
    if (!image.id) {
      toast.error(t('picStudio.noIdYet'));
      return;
    }
    setSelectedImageForAlbum(image);
    setAlbumDialogOpen(true);
  };

  const handleImageSaved = () => {
    if (selectedImageForAlbum) {
      setGeneratedImages(prev => prev.filter(img => img.id !== selectedImageForAlbum.id));
      setSelectedImageForAlbum(null);
    }
  };

  const handleDeleteImage = async (image: any) => {
    if (!image.id) {
      setGeneratedImages(prev => prev.filter(img => img.url !== image.url));
      return;
    }
    try {
      const url = new URL(image.url);
      const pathMatch = url.pathname.match(/\/object\/public\/background-projects\/(.+)/);
      if (pathMatch) {
        await supabase.storage.from('background-projects').remove([pathMatch[1]]);
      }
      await supabase.from('studio_images').delete().eq('id', image.id);
      setGeneratedImages(prev => prev.filter(img => img.id !== image.id));
      toast.success(t('picStudio.imageDeleted'));
    } catch (err) {
      console.error(err);
      toast.error(t('picStudio.deleteError'));
    }
  };

  const handleUpscaled = (upscaled: { id?: string; url: string; previewUrl: string; factor: 2 | 4; parentId: string | null }, original: any) => {
    setGeneratedImages(prev => [
      {
        id: upscaled.id,
        url: upscaled.url,
        prompt: original.prompt,
        style: original.style,
        aspectRatio: original.aspectRatio,
        upscale_factor: upscaled.factor,
        parent_id: upscaled.parentId,
      } as any,
      ...prev,
    ]);
    setJustGenerated(true);
  };

  return (
    <div className="space-y-6">
      {/* Wallet-Header */}
      <Card className="border-border/50 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">AI Credits</p>
              <p className="text-lg font-semibold">{currencySymbol}{balance.toFixed(2)}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/ai-video-purchase-credits')}>
            Aufladen
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-6 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                {t('picStudio.prompt')}
              </Label>
              <div className="flex items-center gap-1.5">
                {(mode === 'transform' && referenceImage) && (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => { setHelperAutoEnhance(true); setHelperOpen(true); }}
                  >
                    <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                    ✨ Bild übernehmen & verbessern
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => { setHelperAutoEnhance(false); setHelperOpen(true); }}
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1.5 text-primary" />
                  ✨ Prompt-Helfer
                </Button>
              </div>
            </div>
            <Textarea
              placeholder={t('picStudio.promptPlaceholder')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[100px] bg-background/50 border-border/50 resize-none"
            />
          </div>

          {/* Quality-Tier-Picker */}
          <div className="space-y-2">
            <Label>Qualität & Modell</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(Object.keys(TIER_META) as QualityTier[]).map((t) => {
                const meta = TIER_META[t];
                const Icon = meta.icon;
                const tierCost = TIER_COSTS[t];
                const isSelected = tier === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
                    className={`relative p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-primary bg-gradient-to-br ' + meta.gradient + ' shadow-md'
                        : 'border-border/50 bg-background/30 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="font-semibold text-sm">{meta.label}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-1.5">{meta.model}</p>
                    <Badge variant={tierCost === 0 ? 'secondary' : 'outline'} className="text-[10px] h-5">
                      {tierCost === 0 ? 'Gratis im Abo' : `${currencySymbol}${tierCost.toFixed(2)}/Bild`}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('picStudio.styleLabel')}</Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STYLES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('picStudio.aspectRatio')}</Label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIOS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* MODE SWITCH — replaces the old dual-slot UI */}
          <div className="space-y-2">
            <Label className="text-xs">Modus</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PICTURE_MODES) as PictureMode[]).map((m) => {
                const meta = PICTURE_MODES[m];
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      active
                        ? 'border-primary bg-primary/10'
                        : 'border-border/50 bg-background/30 hover:border-border'
                    }`}
                  >
                    <div className="font-semibold text-sm mb-0.5">{meta.label}</div>
                    <p className="text-[10px] text-muted-foreground leading-snug">{meta.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SINGLE REFERENCE SLOT — only shown when the mode needs one */}
          {PICTURE_MODES[mode].needsReference && (
            <div className="p-3 rounded-lg border border-border/50 bg-background/30 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  {mode === 'transform' ? (
                    <><ImageIcon className="h-3.5 w-3.5 text-primary" /> Vorlage-Bild (wird verwandelt)</>
                  ) : (
                    <><Palette className="h-3.5 w-3.5 text-primary" /> Stil-Referenz (Farben/Mood)</>
                  )}
                </Label>
                {(mode === 'transform' ? referenceImage : styleReference) && (
                  <button
                    onClick={() => mode === 'transform' ? setReferenceImage(null) : setStyleReference(null)}
                    className="text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    Entfernen
                  </button>
                )}
              </div>
              {(mode === 'transform' ? referenceImage : styleReference) ? (
                <button
                  type="button"
                  onClick={() => mode === 'transform' ? fileInputRef.current?.click() : styleRefInputRef.current?.click()}
                  className="relative block w-full h-24 rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
                >
                  <img
                    src={mode === 'transform' ? referenceImage! : styleReference!}
                    className="h-full w-full object-cover"
                    alt="Reference"
                  />
                  <div className="absolute inset-0 bg-background/70 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Upload className="h-4 w-4" />
                  </div>
                </button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-24 border-dashed"
                  onClick={() => mode === 'transform' ? fileInputRef.current?.click() : styleRefInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Bild hochladen
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReferenceUpload} />
              <input ref={styleRefInputRef} type="file" accept="image/*" className="hidden" onChange={handleStyleRefUpload} />

              {/* Strength slider — transform mode only */}
              {mode === 'transform' && referenceImage && (
                <div className="pt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Stärke der Veränderung</span>
                    <span className="font-mono">{strength}%</span>
                  </div>
                  <Slider
                    value={[strength]}
                    onValueChange={([v]) => setStrength(v)}
                    min={0}
                    max={100}
                    step={5}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>nah am Original</span>
                    <span>nur Inspiration</span>
                  </div>
                </div>
              )}

              {/* Realistic-Reproduction one-click — transform mode only */}
              {mode === 'transform' && referenceImage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleRealisticReproduction}
                >
                  <Camera className="h-3.5 w-3.5 mr-1.5" />
                  📸 Bild realistisch & detailliert reproduzieren
                </Button>
              )}
            </div>
          )}

          {/* Brand-Kit Toggle */}
          <div className="p-3 rounded-lg border border-border/50 bg-background/30">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 text-primary" />
                Brand-Kit Lock
              </Label>
              <Switch
                checked={useBrandKit}
                onCheckedChange={setUseBrandKit}
                disabled={!activeBrandKit}
              />
            </div>
            {activeBrandKit ? (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[activeBrandKit.primary_color, activeBrandKit.secondary_color, activeBrandKit.accent_color]
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((c, i) => (
                      <div key={i} className="h-5 w-5 rounded-full border border-border/50" style={{ backgroundColor: c as string }} />
                    ))}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {activeBrandKit.brand_name || 'Aktiver Brand-Kit'}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Kein aktives Brand-Kit. <button onClick={() => navigate('/brand-kit')} className="text-primary underline">Anlegen</button>
              </p>
            )}
          </div>

          {/* Variants */}
          <div className="flex items-center gap-2 ml-auto">
            <Label className="text-sm text-muted-foreground">Varianten:</Label>
            <div className="flex items-center rounded-lg border border-border/50 bg-background/30 p-0.5">
              {([1, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setVariantsCount(n)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    variantsCount === n
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {n}× {n === 4 && <span className="opacity-70">Bilder</span>}
                </button>
              ))}
            </div>
          </div>




          {/* Pre-flight check */}
          <PreflightCheck
            mode={mode}
            tier={tier}
            prompt={prompt}
            variantsCount={variantsCount}
            cost={cost}
            currencySymbol={currencySymbol}
            hasReference={!!referenceImage}
            onSwitchTier={(t) => setTier(t as QualityTier)}
            onOpenHelper={() => setHelperOpen(true)}
            onSetVariants={setVariantsCount}
          />


          <Button
            className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground"
            size="lg"
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {status.message || t('picStudio.generating')}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {t('picStudio.generateImage')}
                {cost > 0 && (
                  <span className="ml-2 text-xs opacity-90">· {currencySymbol}{cost.toFixed(2)}</span>
                )}
              </>
            )}
          </Button>

          {justGenerated && generatedImages.length > 0 && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/mediathek?tab=albums&album=ki-picture-studio')}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              {t('picStudio.goToMediaLibrary')}
            </Button>
          )}
        </CardContent>
      </Card>

      <AnimatePresence>
        {generatedImages.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              {t('picStudio.generatedImages')} ({generatedImages.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <AnimatePresence>
                {generatedImages.map((img, i) => (
                  <ImageCard
                    key={img.id || img.url}
                    image={img}
                    index={i}
                    onSaveToAlbum={handleSaveToAlbum}
                    onOpenLightbox={setLightboxImage}
                    onDelete={handleDeleteImage}
                    onUpscaled={handleUpscaled}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedImageForAlbum?.id && (
        <SaveToAlbumDialog
          open={albumDialogOpen}
          onOpenChange={setAlbumDialogOpen}
          imageId={selectedImageForAlbum.id}
          onSaved={handleImageSaved}
        />
      )}

      <StudioLightbox
        image={lightboxImage}
        open={!!lightboxImage}
        onOpenChange={(open) => !open && setLightboxImage(null)}
        onSaveToAlbum={handleSaveToAlbum}
        onDelete={handleDeleteImage}
        onUpscaled={handleUpscaled}
      />

      <PromptHelperDialog
        open={helperOpen}
        onOpenChange={(o) => { setHelperOpen(o); if (!o) setHelperAutoEnhance(false); }}
        initialUserText={prompt}
        currentMode={mode}
        currentTier={tier as QualityTier}
        referenceImageUrl={mode === 'transform' ? referenceImage : mode === 'restyle' ? styleReference : null}
        autoEnhance={helperAutoEnhance}
        onApply={handleHelperApply}
      />

      <AIVideoCostConfirmDialog
        open={costDialogOpen}
        payload={{
          title: 'Bild generieren?',
          description:
            'Übersicht deiner Kosten — sobald du bestätigst, startet die Generierung und dein AI-Guthaben wird belastet.',
          modelName: tier === 'fast' ? 'Fast (Seedream 4)' : tier === 'pro' ? 'Pro (SDXL)' : tier === 'ultra' ? 'Ultra (Flux Pro)' : 'Standard',
          modelBadge: tier.toUpperCase(),
          lines: [
            {
              label: variantsCount > 1 ? `${variantsCount} Varianten × Preis` : 'Preis pro Bild',
              value: `${variantsCount} × ${currencySymbol}${baseCost.toFixed(2)}`,
              detail: `${aspectRatio} · ${style}`,
            },
          ],
          totalLabel: 'Gesamtkosten',
          totalValue: `${currencySymbol}${cost.toFixed(2)}`,
          currencySymbol,
          totalCost: cost,
          walletBalance: balance,
          isUnlimited: false,
        }}
        suppressed={costDialogSuppressed}
        onSuppressedChange={setCostDialogSuppressed}
        onConfirm={confirmCostAndGenerate}
        onCancel={() => setCostDialogOpen(false)}
        onTopUp={() => navigate('/ai-video-purchase-credits')}
      />
    </div>

  );
}
