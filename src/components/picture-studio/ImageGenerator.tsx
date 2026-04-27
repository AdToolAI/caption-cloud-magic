import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Upload, Loader2, Wand2, Image as ImageIcon, X, FolderOpen, Wallet, Zap, Crown, Gem, Palette, Layers } from "lucide-react";
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
  const [editMode, setEditMode] = useState(cached?.editMode ?? false);
  const [referenceImage, setReferenceImage] = useState<string | null>(cached?.referenceImage ?? null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>(cached?.generatedImages ?? []);
  const [replicateLoading, setReplicateLoading] = useState(false);

  const [albumDialogOpen, setAlbumDialogOpen] = useState(false);
  const [selectedImageForAlbum, setSelectedImageForAlbum] = useState<GeneratedImage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);
  const [justGenerated, setJustGenerated] = useState(false);
  const [variantsCount, setVariantsCount] = useState<1 | 4>(1);
  const [styleReference, setStyleReference] = useState<string | null>(null);
  const [useBrandKit, setUseBrandKit] = useState(false);
  const [ciScores, setCiScores] = useState<Record<string, number>>({});

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
      referenceImage,
      generatedImages,
    });
  }, [prompt, style, aspectRatio, tier, editMode, referenceImage, generatedImages]);

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setReferenceImage(reader.result as string);
      setEditMode(true);
    };
    reader.readAsDataURL(file);
  };

  const generateOne = async (): Promise<any | null> => {
    if (tier === 'standard') {
      const { data, error } = await supabase.functions.invoke('generate-studio-image', {
        body: {
          prompt: prompt.trim(),
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
        prompt: prompt.trim(),
        tier,
        aspectRatio,
        style,
        referenceImageUrl: editMode ? referenceImage : undefined,
      }
    });

    if (error) {
      const fnError: any = error;
      if (fnError.context && typeof fnError.context.json === 'function') {
        const body = await fnError.context.json();
        if (body?.code === 'INSUFFICIENT_CREDITS' || body?.code === 'NO_WALLET') {
          const err: any = new Error(body.error);
          err.needsPurchase = true;
          throw err;
        }
        throw new Error(body?.error || fnError.message);
      }
      throw error;
    }
    return data?.image || null;
  };

  const handleGenerate = async () => {
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
          console.error('[ImageGenerator] variant failed:', r.reason);
        }
      }

      if (successCount === 0) {
        toast.error('Bildgenerierung fehlgeschlagen');
      } else if (variantsCount > 1) {
        toast.success(`${successCount} von ${variantsCount} Varianten generiert`);
      }
    } catch (error: any) {
      toast.error(error.message || t('picStudio.imageGenerationError'));
    } finally {
      setReplicateLoading(false);
    }
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
            <Label className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              {t('picStudio.prompt')}
            </Label>
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

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={editMode} onCheckedChange={(v) => { setEditMode(v); if (!v) setReferenceImage(null); }} />
              <Label className="text-sm">{t('picStudio.imageToImage')}</Label>
            </div>
            {editMode && (
              <div className="flex items-center gap-2">
                {referenceImage ? (
                  <div className="relative group/ref">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="relative block h-12 w-12 rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
                      title={t('picStudio.uploadImage')}
                    >
                      <img src={referenceImage} className="h-full w-full object-cover" alt="Reference" />
                      <div className="absolute inset-0 bg-background/70 opacity-0 group-hover/ref:opacity-100 transition-opacity flex items-center justify-center">
                        <Upload className="h-4 w-4 text-foreground" />
                      </div>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setReferenceImage(null); }} className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center z-10">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5 mr-1" /> {t('picStudio.uploadImage')}
                  </Button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReferenceUpload} />
              </div>
            )}

            {/* Variations Toggle */}
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
          </div>

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
    </div>
  );
}
