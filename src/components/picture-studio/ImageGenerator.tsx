import { tx } from "@/lib/i18nText";
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
  PICTURE_MODELS,
  aspectRatiosForTier,
  closestAspectRatio,
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

type QualityTier = ModelTier;

const TIER_COSTS: Record<QualityTier, number> = {
  standard: PICTURE_MODELS.standard.cost,
  fast: PICTURE_MODELS.fast.cost,
  pro: PICTURE_MODELS.pro.cost,
  ultra: PICTURE_MODELS.ultra.cost,
  gptimage: PICTURE_MODELS.gptimage.cost,
  flux: PICTURE_MODELS.flux.cost,
  ideogram: PICTURE_MODELS.ideogram.cost,
  recraft: PICTURE_MODELS.recraft.cost,
  qwen: PICTURE_MODELS.qwen.cost,
};

const TIER_META: Record<QualityTier, { label: string; model: string; icon: any; gradient: string }> = {
  standard: { label: 'Standard', model: tx({ de: "Gemini (im Abo)", en: "Gemini (included)", es: "Gemini (incluido)" }), icon: Sparkles, gradient: 'from-emerald-500/20 to-teal-500/20' },
  fast: { label: 'Fast', model: 'Seedream 4', icon: Zap, gradient: 'from-blue-500/20 to-cyan-500/20' },
  pro: { label: 'Pro', model: 'Imagen 4 Ultra', icon: Crown, gradient: 'from-purple-500/20 to-pink-500/20' },
  ultra: { label: 'Ultra', model: 'Nano Banana 2', icon: Gem, gradient: 'from-amber-500/20 to-orange-500/20' },
  gptimage: { label: 'GPT Image', model: 'GPT-Image-2 (ChatGPT)', icon: Sparkles, gradient: 'from-slate-500/20 to-emerald-500/20' },
  flux: { label: 'FLUX Ultra', model: 'FLUX 1.1 Pro Ultra', icon: Camera, gradient: 'from-rose-500/20 to-orange-500/20' },
  ideogram: { label: 'Ideogram', model: 'Ideogram v3 Turbo', icon: Wand2, gradient: 'from-indigo-500/20 to-blue-500/20' },
  recraft: { label: 'Recraft', model: 'Recraft v3', icon: Palette, gradient: 'from-lime-500/20 to-emerald-500/20' },
  qwen: { label: 'Qwen', model: 'Qwen Image', icon: ImageIcon, gradient: 'from-cyan-500/20 to-sky-500/20' },
};

const MAIN_TIERS: QualityTier[] = ['standard', 'fast', 'pro', 'ultra'];
const SPECIALIST_TIERS: QualityTier[] = ['gptimage', 'flux', 'ideogram', 'recraft', 'qwen'];


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
    { value: '5:4', label: '5:4' },
    { value: '4:3', label: t('picStudio.arHeader') },
    { value: '3:4', label: t('picStudio.arVertical') },
    { value: '3:2', label: '3:2' },
    { value: '2:3', label: '2:3' },
    { value: '21:9', label: tx({ de: '21:9 Banner (ultrabreit)', en: '21:9 banner (ultra-wide)', es: '21:9 banner (ultraancho)' }) },
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
  const [extraReferences, setExtraReferences] = useState<string[]>(cached?.extraReferences ?? []);
  const [styleReference, setStyleReference] = useState<string | null>(cached?.styleReference ?? null);
  const [exactWidth, setExactWidth] = useState<string>(cached?.exactWidth ?? '');
  const [exactHeight, setExactHeight] = useState<string>(cached?.exactHeight ?? '');
  const extraRefInputRef = useRef<HTMLInputElement>(null);
  const [strength, setStrength] = useState<number>(cached?.strength ?? 70);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>(cached?.generatedImages ?? []);
  const [replicateLoading, setReplicateLoading] = useState(false);
  const [refUploading, setRefUploading] = useState(false);

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

  // Nur Seitenverhältnisse anbieten, die das gewählte Modell wirklich akzeptiert.
  const availableAspectRatios = useMemo(() => {
    const allowed = aspectRatiosForTier(tier);
    return allowed ? ASPECT_RATIOS.filter(r => allowed.includes(r.value)) : ASPECT_RATIOS;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, ASPECT_RATIOS]);

  // Beim Modellwechsel auf das nächstliegende erlaubte Verhältnis springen.
  useEffect(() => {
    if (!availableAspectRatios.some(r => r.value === aspectRatio)) {
      const next = closestAspectRatio(tier, aspectRatio);
      setAspectRatio(availableAspectRatios.some(r => r.value === next) ? next : (availableAspectRatios[0]?.value ?? '1:1'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableAspectRatios]);



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

  /**
   * Referenzbilder gehen in den Storage (Pfad startet mit der User-ID) und
   * werden als URL an das Modell geschickt. Base64-Daten-URLs sprengen sonst
   * die Request-Grenzen von Replicate bei größeren Fotos.
   */
  const uploadReference = async (file: File, apply: (url: string | null) => void) => {
    if (!user) { toast.error(t('picStudio.loginRequired')); return; }
    // Sofortige lokale Vorschau
    const localPreview = URL.createObjectURL(file);
    apply(localPreview);
    setRefUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${user.id}/picture-studio/refs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from('background-projects')
        .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('background-projects').getPublicUrl(path);
      apply(data.publicUrl);
    } catch (err: any) {
      console.error('[ImageGenerator] reference upload failed:', err);
      apply(null);
      toast.error(tx({ de: 'Referenzbild konnte nicht hochgeladen werden', en: 'Reference image could not be uploaded', es: 'No se pudo subir la imagen de referencia' }));
    } finally {
      URL.revokeObjectURL(localPreview);
      setRefUploading(false);
    }
  };

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void uploadReference(file, setReferenceImage);
  };

  const handleExtraRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // uploadReference calls back twice (local preview, then the storage URL):
    // append on the first call, replace that slot on every later one.
    let slot = -1;
    void uploadReference(file, (url) => {
      setExtraReferences(prev => {
        if (slot === -1) {
          if (!url) return prev;
          slot = prev.length;
          return [...prev, url].slice(0, Math.max(0, maxSubjectRefs - 1));
        }
        if (!url) return prev.filter((_, i) => i !== slot);
        return prev.map((u, i) => (i === slot ? url : u));
      });
    });
  };

  const handleStyleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void uploadReference(file, setStyleReference);
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
    toast.success(tx({ de: 'Realistic-Reproduction-Preset gesetzt', en: 'Realistic reproduction preset set', es: 'Ajuste preestablecido de reproducción realista establecido' }));
  };

  const handleHelperApply = (result: PromptHelperResult, chosenPrompt: string) => {
    setPrompt(chosenPrompt);
    setTier(result.recommendedTier as ModelTier);
    setMode(result.recommendedMode);
    if (result.recommendedMode === 'transform') {
      setStrength(result.recommendedStrength);
    }
    toast.success(tx({ de: `Prompt übernommen — Modell: ${result.recommendedTier}`, en: `Prompt applied — model: ${result.recommendedTier}`, es: `Prompt aplicado — modelo: ${result.recommendedTier}` }));
  };

  const generateOne = async (): Promise<any | null> => {
    const subjectRefs = editMode
      ? [referenceImage, ...extraReferences].filter(Boolean).slice(0, maxSubjectRefs) as string[]
      : [];
    const styleRefs = mode === 'restyle' && styleReference ? [styleReference] : [];
    const exact = supportsExactSize && Number(exactWidth) > 0 && Number(exactHeight) > 0
      ? { width: Number(exactWidth), height: Number(exactHeight) }
      : {};

    if (tier === 'standard') {
      const { data, error } = await supabase.functions.invoke('generate-studio-image', {
        body: {
          prompt: effectivePrompt,
          style,
          aspectRatio,
          quality: 'fast',
          editMode,
          referenceImageUrl: subjectRefs[0],
          referenceImageUrls: subjectRefs,
          styleReferenceUrls: styleRefs,
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
        referenceImageUrls: subjectRefs,
        styleReferenceUrls: styleRefs,
        ...exact,
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
      toast.error(tx({ de: `Nicht genügend AI Credits. Du brauchst ${currencySymbol}${cost.toFixed(2)}, hast aber nur ${currencySymbol}${balance.toFixed(2)}.`, en: `Not enough AI credits. You need ${currencySymbol}${cost.toFixed(2)}, but only have ${currencySymbol}${balance.toFixed(2)}.`, es: `No hay suficientes créditos de IA. Necesitas ${currencySymbol}${cost.toFixed(2)}, pero solo tienes ${currencySymbol}${balance.toFixed(2)}.` }));
      navigate('/ai-video-purchase-credits');
      return;
    }


    setReplicateLoading(true);
    try {
      const tasks = Array.from({ length: variantsCount }, () => generateOne());
      const results = await Promise.allSettled(tasks);

      let successCount = 0;
      let safetyFilteredMsg: string | null = null;
      let firstErrorMsg: string | null = null;
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
          if (!firstErrorMsg) firstErrorMsg = (r.reason as any)?.message ?? null;
          console.error('[ImageGenerator] variant failed:', r.reason);
        }
      }

      if (successCount === 0) {
        if (safetyFilteredMsg) {
          const canRetryFast = tier !== 'fast';
          toast.warning(tx({ de: "Sicherheitsfilter ausgelöst", en: "Security filter triggered", es: "Filtro de seguridad activado" }), {
            description: safetyFilteredMsg + (canRetryFast ? tx({ de: ' Tipp: „Fast" (Seedream 4) hat tolerantere Filter.', en: 'Tip: “Fast” (Seedream 4) has more tolerant filters.', es: 'Consejo: "Rápido" (Seedream 4) tiene filtros más tolerantes.' }) : ''),
            duration: 14000,
            action: canRetryFast ? {
              label: tx({ de: 'Mit Fast erneut', en: 'Retry with Fast', es: 'Reintentar con Fast' }),
              onClick: () => {
                setTier('fast');
                setTimeout(() => { void runGenerate(); }, 50);
              },
            } : undefined,
          });
        } else {
          toast.error(tx({ de: 'Bildgenerierung fehlgeschlagen', en: 'Image generation failed', es: 'Error al generar la imagen' }), {
            description: firstErrorMsg ?? undefined,
            duration: 12000,
          });
        }
      } else if (variantsCount > 1) {
        toast.success(tx({ de: `${successCount} von ${variantsCount} Varianten generiert`, en: `${successCount} of ${variantsCount} variants generated`, es: `${successCount} de ${variantsCount} variantes generadas` }));
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
      toast.error(tx({ de: `Nicht genügend AI Credits. Du brauchst ${currencySymbol}${cost.toFixed(2)}, hast aber nur ${currencySymbol}${balance.toFixed(2)}.`, en: `Not enough AI credits. You need ${currencySymbol}${cost.toFixed(2)}, but only have ${currencySymbol}${balance.toFixed(2)}.`, es: `No hay suficientes créditos de IA. Necesitas ${currencySymbol}${cost.toFixed(2)}, pero solo tienes ${currencySymbol}${balance.toFixed(2)}.` }));
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
              toast.warning(tx({ de: `CI-Match nur ${score}% — Bild weicht vom Markenstil ab`, en: `CI-Match only ${score}% — image deviates from brand style`, es: `CI-Match solo ${score}% — la imagen se desvía del estilo de marca` }));
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
                    {tx({ de: "✨ Bild übernehmen & verbessern", en: "✨ Adopt & improve image", es: "✨ Adoptar y mejorar imagen" })}
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
            <Label>{tx({ de: "Qualität & Modell", en: "Quality & Model", es: "Calidad y Modelo" })}</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {MAIN_TIERS.map((t) => {
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
                      {tierCost === 0 ? tx({ de: "Gratis im Abo", en: "Free with subscription", es: "Gratis con la suscripción" }) : tx({ de: `${currencySymbol}${tierCost.toFixed(2)}/Bild`, en: `${currencySymbol}${tierCost.toFixed(2)}/image`, es: `${currencySymbol}${tierCost.toFixed(2)}/imagen` })}
                    </Badge>
                  </button>
                );
              })}
            </div>

            {/* Spezialmodelle */}
            <details className="rounded-lg border border-border/50 bg-background/30" open={SPECIALIST_TIERS.includes(tier)}>
              <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted-foreground">
                {tx({ de: 'Spezialmodelle', en: 'Specialist models', es: 'Modelos especializados' })}
              </summary>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-2 pt-0">
                {SPECIALIST_TIERS.map((t) => {
                  const meta = TIER_META[t];
                  const Icon = meta.icon;
                  const tierCost = TIER_COSTS[t];
                  const isSelected = tier === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTier(t)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-gradient-to-br ' + meta.gradient + ' shadow-md'
                          : 'border-border/50 bg-background/30 hover:border-border'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="font-semibold text-xs">{meta.label}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-1">{PICTURE_MODELS[t].bestFor[0]}</p>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {currencySymbol}{tierCost.toFixed(2)}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </details>
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
                  {availableAspectRatios.map(r => (
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
                    <><ImageIcon className="h-3.5 w-3.5 text-primary" /> {tx({ de: "Vorlage-Bild (wird verwandelt)", en: "Template image (will be transformed)", es: "Imagen de plantilla (se transformará)" })}</>
                  ) : (
                    <><Palette className="h-3.5 w-3.5 text-primary" /> {tx({ de: 'Stil-Referenz (Farben/Mood)', en: 'Style reference (colours/mood)', es: 'Referencia de estilo (colores/ambiente)' })}</>
                  )}
                </Label>
                {(mode === 'transform' ? referenceImage : styleReference) && (
                  <button
                    onClick={() => mode === 'transform' ? setReferenceImage(null) : setStyleReference(null)}
                    className="text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    {tx({ de: 'Entfernen', en: 'Remove', es: 'Quitar' })}
                  </button>
                )}
              </div>
              {(mode === 'transform' ? referenceImage : styleReference) ? (
                <button
                  type="button"
                  onClick={() => mode === 'transform' ? fileInputRef.current?.click() : styleRefInputRef.current?.click()}
                  className="relative block w-full rounded-md overflow-hidden border border-border bg-muted/30 hover:border-primary transition-colors"
                >
                  <img
                    src={mode === 'transform' ? referenceImage! : styleReference!}
                    className="mx-auto max-h-56 w-auto max-w-full object-contain"
                    alt="Reference"
                  />
                  {refUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
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
                  {tx({ de: 'Bild hochladen', en: 'Upload image', es: 'Subir imagen' })}
                </Button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReferenceUpload} />
              <input ref={styleRefInputRef} type="file" accept="image/*" className="hidden" onChange={handleStyleRefUpload} />

              {/* Strength slider — transform mode only */}
              {mode === 'transform' && referenceImage && (
                <div className="pt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{tx({ de: 'Stärke der Veränderung', en: 'Strength of change', es: 'Intensidad del cambio' })}</span>
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
                    <span>{tx({ de: "nah am Original", en: "close to original", es: "cerca del original" })}</span>
                    <span>{tx({ de: "nur Inspiration", en: "inspiration only", es: "solo inspiración" })}</span>
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
                  {tx({ de: "📸 Bild realistisch & detailliert reproduzieren", en: "📸 Reproduce image realistically & detailed", es: "📸 Reproducir imagen de forma realista y detallada" })}
                </Button>
              )}
            </div>
          )}

          {/* MULTI-REFERENCE SLOTS — only for models that really accept them */}
          {PICTURE_MODES[mode].needsReference && maxSubjectRefs > 1 && mode === 'transform' && (
            <div className="p-3 rounded-lg border border-border/50 bg-background/30 space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-primary" />
                {tx({ de: 'Weitere Referenzbilder', en: 'Additional reference images', es: 'Imágenes de referencia adicionales' })}
                <span className="text-[10px] text-muted-foreground">
                  {extraReferences.length}/{maxSubjectRefs - 1}
                </span>
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {extraReferences.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => setExtraReferences(prev => prev.filter((_, idx) => idx !== i))}
                    className="relative rounded-md overflow-hidden border border-border bg-muted/30 aspect-square"
                    title={tx({ de: 'Entfernen', en: 'Remove', es: 'Quitar' })}
                  >
                    <img src={url} alt={`Reference ${i + 2}`} className="h-full w-full object-cover" />
                  </button>
                ))}
                {extraReferences.length < maxSubjectRefs - 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="aspect-square h-auto border-dashed"
                    onClick={() => extraRefInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <input
                ref={extraRefInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleExtraRefUpload}
              />
            </div>
          )}

          {/* EXACT PIXEL SIZE — only for models with true custom sizing */}
          {supportsExactSize && (
            <div className="p-3 rounded-lg border border-border/50 bg-background/30 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">
                  {tx({ de: 'Exakte Pixelgröße', en: 'Exact pixel size', es: 'Tamaño exacto en píxeles' })}
                </Label>
                <button
                  type="button"
                  onClick={() => { setExactWidth(''); setExactHeight(''); }}
                  className="text-[10px] text-muted-foreground hover:text-destructive"
                >
                  {tx({ de: 'Automatisch', en: 'Automatic', es: 'Automático' })}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="2048"
                  value={exactWidth}
                  onChange={(e) => setExactWidth(e.target.value)}
                  className="h-8 text-xs"
                />
                <span className="text-xs text-muted-foreground">×</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="2048"
                  value={exactHeight}
                  onChange={(e) => setExactHeight(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {exactRange
                  ? `${exactRange.minW}–${exactRange.maxW} px, ${tx({ de: 'Schritt', en: 'step', es: 'paso' })} ${exactRange.step}, max ${exactRange.maxMegapixels} MP`
                  : null}
              </p>
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
                  {activeBrandKit.brand_name || tx({ de: "Aktiver Brand-Kit", en: "Active brand kit", es: "Brand Kit activo" })}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {tx({ de: "Kein aktives Brand-Kit.", en: "No active brand kit.", es: "Ningún Brand Kit activo." })} <button onClick={() => navigate('/brand-kit')} className="text-primary underline">{tx({ de: "Anlegen", en: "Create", es: "Crear" })}</button>
              </p>
            )}
          </div>

          {/* Variants */}
          <div className="flex items-center gap-2 ml-auto">
            <Label className="text-sm text-muted-foreground">{tx({ de: "Varianten: ", en: "Variants:", es: "Variantes:" })}</Label>
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
                  {n}× {n === 4 && <span className="opacity-70">{tx({ de: "Bilder", en: "Images", es: "Imágenes" })}</span>}
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
          title: tx({ de: 'Bild generieren?', en: 'Generate image?', es: '¿Generar imagen?' }),
          description:
            tx({ de: 'Übersicht deiner Kosten — sobald du bestätigst, startet die Generierung und dein AI-Guthaben wird belastet.', en: 'Overview of your costs — once you confirm, generation will start and your AI credit will be charged.', es: 'Resumen de tus costes: una vez que confirmes, la generación comenzará y se cargará tu crédito de IA.' }),
          modelName: tier === 'fast' ? 'Fast (Seedream 4)' : tier === 'pro' ? 'Pro (SDXL)' : tier === 'ultra' ? 'Ultra (Flux Pro)' : 'Standard',
          modelBadge: tier.toUpperCase(),
          lines: [
            {
              label: variantsCount > 1 ? `${variantsCount} ${tx({ de: 'Varianten × Preis', en: 'variants × price', es: 'variantes × precio' })}` : tx({ de: 'Preis pro Bild', en: 'Price per image', es: 'Precio por imagen' }),
              value: `${variantsCount} × ${currencySymbol}${baseCost.toFixed(2)}`,
              detail: `${aspectRatio} · ${style}`,
            },
          ],
          totalLabel: tx({ de: "Gesamtkosten", en: "Total cost", es: "Coste total" }),
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
