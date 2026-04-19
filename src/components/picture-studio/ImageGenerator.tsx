import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Upload, Loader2, Wand2, Image as ImageIcon, X, FolderOpen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAICall } from "@/hooks/useAICall";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageCard } from "./ImageCard";
import { StudioLightbox } from "./StudioLightbox";
import { SaveToAlbumDialog } from "./SaveToAlbumDialog";
import { FEATURE_COSTS, ESTIMATED_COSTS } from "@/lib/featureCosts";
import { getCachedState, setCachedState } from "./imageGeneratorCache";

interface GeneratedImage {
  id?: string;
  url: string;
  prompt: string;
  style: string;
  aspectRatio: string;
}

export function ImageGenerator() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { executeAICall, loading, status } = useAICall();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [quality, setQuality] = useState<'fast' | 'pro'>(cached?.quality ?? 'fast');
  const [editMode, setEditMode] = useState(cached?.editMode ?? false);
  const [referenceImage, setReferenceImage] = useState<string | null>(cached?.referenceImage ?? null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>(cached?.generatedImages ?? []);
  
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false);
  const [selectedImageForAlbum, setSelectedImageForAlbum] = useState<GeneratedImage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);
  const [justGenerated, setJustGenerated] = useState(false);

  useEffect(() => {
    setCachedState({ prompt, style, aspectRatio, quality, editMode, referenceImage, generatedImages });
  }, [prompt, style, aspectRatio, quality, editMode, referenceImage, generatedImages]);

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setReferenceImage(reader.result as string);
      setEditMode(true);
    };
    reader.readAsDataURL(file);
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

    try {
      const result = await executeAICall({
        featureCode: FEATURE_COSTS.STUDIO_IMAGE_GENERATE,
        estimatedCost: ESTIMATED_COSTS.studio_image_generate,
        apiCall: async () => {
          const { data, error } = await supabase.functions.invoke('generate-studio-image', {
            body: {
              prompt: prompt.trim(),
              style,
              aspectRatio,
              quality,
              editMode,
              referenceImageUrl: editMode ? referenceImage : undefined,
            }
          });

          if (error) {
            const fnError: any = error;
            if (fnError.context && typeof fnError.context.json === 'function') {
              try {
                const body = await fnError.context.json();
                const normalized: any = new Error(body?.error || fnError.message);
                normalized.status = body?.code || fnError.context?.status || 500;
                normalized.step = body?.step;
                normalized.attemptedModels = body?.attemptedModels;
                throw normalized;
              } catch (parseErr: any) {
                if (parseErr.status) throw parseErr;
              }
            }
            throw error;
          }
          if (data?.ok === false) {
            const normalized: any = new Error(data.error || 'Generation failed');
            normalized.status = data.code || 500;
            normalized.step = data.step;
            throw normalized;
          }
          if (data?.error) throw new Error(data.error);
          return data;
        }
      });

      if (result?.image) {
        const imgUrl = result.image.previewUrl || result.image.url;
        const imageId = result.image.id;
        setGeneratedImages(prev => [
          { ...result.image, url: imgUrl, prompt: prompt.trim(), style, aspectRatio: aspectRatio },
          ...prev,
        ]);
        toast.success(t('picStudio.imageGenerated'));
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
      }
    } catch (error: any) {
      if (error.code !== 'INSUFFICIENT_CREDITS') {
        toast.error(error.message || t('picStudio.imageGenerationError'));
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

  return (
    <div className="space-y-6">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="space-y-2">
              <Label>{t('picStudio.qualityLabel')}</Label>
              <div className="flex items-center gap-3 h-10">
                <span className={`text-sm ${quality === 'fast' ? 'text-foreground' : 'text-muted-foreground'}`}>{t('picStudio.qualityFast')}</span>
                <Switch checked={quality === 'pro'} onCheckedChange={(v) => setQuality(v ? 'pro' : 'fast')} />
                <span className={`text-sm ${quality === 'pro' ? 'text-foreground' : 'text-muted-foreground'}`}>{t('picStudio.qualityPro')}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
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
      />
    </div>
  );
}
