import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useAICall } from "@/hooks/useAICall";
import { useAIRateLimit } from "@/hooks/useAIRateLimit";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Sparkles, Loader2, Info, ArrowLeft } from "lucide-react";
import { removeBackground, loadImage } from "@/lib/backgroundRemoval";
import { SceneGallery } from "@/components/background/SceneGallery";
import { ExportControls } from "@/components/background/ExportControls";
import { RateLimitIndicator } from "@/components/ai/RateLimitIndicator";
import { AICallStatus } from "@/components/ai/AICallStatus";
import { BackgroundReplacerHeroHeader } from "@/components/background/BackgroundReplacerHeroHeader";
import { ProductInsightBanner } from "@/components/background/ProductInsightBanner";
import { ImageLightbox } from "@/components/background/ImageLightbox";
import { SaveToAlbumDialog } from "@/components/picture-studio/SaveToAlbumDialog";
import { ESTIMATED_COSTS } from "@/lib/featureCosts";

const LIGHTING_OPTIONS = ['natural', 'studio', 'dramatic', 'neutral'];
const VARIANT_OPTIONS = [5, 10];

interface AISuggestion {
  productType: string;
  suggestedCategory: string;
  suggestedLighting: string;
  suggestedIntensity: number;
  reasoning: string;
}

export default function BackgroundReplacer() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { executeAICall, loading: aiCallLoading, status } = useAICall();
  const { checkRateLimit, getRemainingCalls, resetTime } = useAIRateLimit({ maxRequests: 2, windowMs: 60000 });

  const CATEGORIES = useMemo(() => [
    { value: 'workspace', label: t('picStudio.catWorkspace') },
    { value: 'outdoor', label: t('picStudio.catOutdoor') },
    { value: 'urban', label: t('picStudio.catUrban') },
    { value: 'studio', label: t('picStudio.catStudio') },
    { value: 'wellness', label: t('picStudio.catWellness') },
    { value: 'tech', label: t('picStudio.catTech') },
    { value: 'luxury', label: t('picStudio.catLuxury') },
  ], [t]);

  const scenePoolMap = useMemo((): Record<string, string[]> => ({
    workspace: [t('picStudio.spHomeOfficeWood'), t('picStudio.spCoWorkingConcrete'), t('picStudio.spAgencyStudio'), t('picStudio.spDesignerMarble'), t('picStudio.spMinimalDesk'), t('picStudio.spCoffeeShop'), t('picStudio.spTechDeskRgb')],
    outdoor: [t('picStudio.spForestBridge'), t('picStudio.spMountainMeadow'), t('picStudio.spRiverbank'), t('picStudio.spCoastSand'), t('picStudio.spDesertDunes'), t('picStudio.spSnowscape'), t('picStudio.spForestClearing')],
    urban: [t('picStudio.spRooftopSkyline'), t('picStudio.spCobblestoneAlley'), t('picStudio.spModernLobby'), t('picStudio.spSubwayStation'), t('picStudio.spConcreteSteps'), t('picStudio.spStreetCorner')],
    studio: [t('picStudio.spGradientLight'), t('picStudio.spSoftboxSetup'), t('picStudio.spAcrylMirror'), t('picStudio.spFabricLinen'), t('picStudio.spMarbleWhiteGray'), t('picStudio.spColorGradient')],
    wellness: [t('picStudio.spSpaTowel'), t('picStudio.spEucalyptus'), t('picStudio.spStoneBalance'), t('picStudio.spWoodYogaMat')],
    tech: [t('picStudio.spDarkNeon'), t('picStudio.spCircuitBoard'), t('picStudio.spGlassFiber'), t('picStudio.spBrushedMetal')],
    luxury: [t('picStudio.spVelvetDarkBlue'), t('picStudio.spLeatherCognac'), t('picStudio.spMarbleBlackGold'), t('picStudio.spCrystalGlass')],
  }), [t]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [cutoutPreview, setCutoutPreview] = useState<string>("");
  const [category, setCategory] = useState("workspace");
  const [lighting, setLighting] = useState("natural");
  const [styleIntensity, setStyleIntensity] = useState([5]);
  const [variantCount, setVariantCount] = useState(5);
  const [diversify, setDiversify] = useState(true);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScenes, setGeneratedScenes] = useState<any[]>([]);
  const [scenePool, setScenePool] = useState<string[]>([]);
  const [brandKits, setBrandKits] = useState<any[]>([]);
  const [selectedBrandKit, setSelectedBrandKit] = useState<string>("none");
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());
  const [edgeQuality, setEdgeQuality] = useState<number>(0);
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [suggestionApplied, setSuggestionApplied] = useState(false);
  const [lightboxScene, setLightboxScene] = useState<number | null>(null);
  const [acceptedScene, setAcceptedScene] = useState<any | null>(null);
  const [albumDialogOpen, setAlbumDialogOpen] = useState(false);
  const [albumImageId, setAlbumImageId] = useState<string>("");

  useEffect(() => {
    if (user) {
      fetchBrandKits();
    }

    const mediaImport = sessionStorage.getItem('bg_replacer_import');
    if (mediaImport) {
      try {
        const data = JSON.parse(mediaImport);
        if (Date.now() - data.timestamp < 5 * 60 * 1000) {
          fetch(data.imageUrl)
            .then(res => res.blob())
            .then(blob => {
              const file = new File([blob], 'imported-image.jpg', { type: 'image/jpeg' });
              setImageFile(file);
              setImagePreview(URL.createObjectURL(blob));
              toast.success(t('picStudio.importedFromMedia'));
            })
            .catch(err => {
              console.error('Failed to load image:', err);
              toast.error(t('picStudio.importError'));
            });
        }
        sessionStorage.removeItem('bg_replacer_import');
      } catch (e) {
        console.error('Error loading media import:', e);
      }
    }
  }, [user]);

  useEffect(() => {
    setScenePool(scenePoolMap[category] || scenePoolMap['workspace']);
  }, [category, scenePoolMap]);

  const fetchBrandKits = async () => {
    const { data } = await supabase
      .from('brand_kits')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setBrandKits(data);
  };

  const handleApplySuggestion = (suggestion: AISuggestion) => {
    setCategory(suggestion.suggestedCategory);
    setLighting(suggestion.suggestedLighting);
    setStyleIntensity([suggestion.suggestedIntensity]);
    setSuggestionApplied(true);
    toast.success(`${t('picStudio.settingsApplied')} "${suggestion.productType}"`);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        toast.error(t('picStudio.fileTooLarge'));
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      setAiSuggestion(null);
      setSuggestionApplied(false);
      
      await handleRemoveBackground(file);
    }
  };

  const handleRemoveBackground = async (file: File) => {
    if (!user) {
      toast.error(t('picStudio.loginRequired'));
      navigate("/auth");
      return;
    }

    setIsRemoving(true);
    toast.info(t('picStudio.bgRemoving'));

    try {
      const img = await loadImage(file);
      const { cutoutBlob, edgeScore } = await removeBackground(img, 'high');
      
      setEdgeQuality(edgeScore);
      
      const fileExt = 'png';
      const fileName = `${user.id}/${Date.now()}-cutout.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('background-projects')
        .upload(fileName, cutoutBlob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('background-projects')
        .getPublicUrl(fileName);

      setCutoutPreview(publicUrl);
      const qualityText = edgeScore >= 85 ? t('picStudio.qualityExcellent') : edgeScore >= 70 ? t('picStudio.qualityGood') : t('picStudio.qualityOk');
      toast.success(`${t('picStudio.bgRemoved')} ${edgeScore}/100 (${qualityText})`);
    } catch (error: any) {
      console.error('Background removal error:', error);
      toast.error(t('picStudio.bgRemoveError'));
    } finally {
      setIsRemoving(false);
    }
  };

  const handleGenerateScenes = async () => {
    if (!user) {
      toast.error(t('picStudio.loginRequired'));
      navigate("/auth");
      return;
    }

    if (!cutoutPreview) {
      toast.error(t('picStudio.uploadFirst'));
      return;
    }

    setIsGenerating(true);
    setAcceptedScene(null);

    try {
      const fileExt = imageFile!.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('background-projects')
        .upload(fileName, imageFile!);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('background-projects')
        .getPublicUrl(fileName);

      const dynamicCost = variantCount;
      
      const data = await executeAICall({
        featureCode: 'background_generate',
        estimatedCost: dynamicCost,
        apiCall: async () => {
          const { data, error } = await supabase.functions.invoke('generate-background-scenes', {
            body: {
              cutoutImageUrl: cutoutPreview,
              category,
              lighting,
              styleIntensity: styleIntensity[0],
              language: 'de',
              brandKitId: selectedBrandKit === 'none' ? null : selectedBrandKit,
              originalImageUrl: publicUrl,
              variantCount,
              diversify,
              analyzeProduct: !aiSuggestion
            }
          });

          if (error) throw error;
          return data;
        },
        rateLimitConfig: { maxRequests: 2, windowMs: 60000 },
        metadata: { variantCount, category, lighting }
      });

      console.log('Generated scenes response:', data);
      setGeneratedScenes(data.results_json || []);
      
      if (data.aiSuggestion && !aiSuggestion) {
        setAiSuggestion(data.aiSuggestion);
      }
      
      if (data.results_json && data.results_json.length > 0) {
        const scenesUsed = data.metadata?.scenesUsed || [];
        const avgQuality = data.results_json
          .filter((s: any) => s.qualityScores?.overall)
          .reduce((sum: number, s: any) => sum + s.qualityScores.overall, 0) / data.results_json.length;
        
        toast.success(
          `✅ ${data.results_json.length} ${t('picStudio.variantsGenerated')}\n` +
          `📊 ${t('picStudio.avgQuality')} ${Math.round(avgQuality)}/100\n` +
          `🎬 ${scenesUsed.length} ${t('picStudio.scenesUsed')}`
        );
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      if (error.code !== 'INSUFFICIENT_CREDITS') {
        toast.error(error.message || t('picStudio.generationError'));
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleImageSelection = (index: number) => {
    const newSelected = new Set(selectedImages);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedImages(newSelected);
  };

  const handleAcceptScene = (index: number) => {
    setAcceptedScene(generatedScenes[index]);
    setLightboxScene(null);
    toast.success(t('picStudio.variantAccepted'));
  };

  const handleSaveToAlbum = async (imageUrl: string) => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('studio_images')
      .insert({
        user_id: user.id,
        image_url: imageUrl,
        prompt: `Smart Background: ${category} / ${lighting}`,
        style: category,
        aspect_ratio: '1:1',
        source: 'smart_background',
      })
      .select('id')
      .single();
    
    if (error) {
      toast.error(t('picStudio.saveError'));
      return;
    }
    
    setAlbumImageId(data.id);
    setAlbumDialogOpen(true);
  };

  const handleLightboxSaveToAlbum = () => {
    if (lightboxScene !== null && generatedScenes[lightboxScene]) {
      handleSaveToAlbum(generatedScenes[lightboxScene].imageUrl);
    }
  };

  const handleGallerySaveToAlbum = (index: number) => {
    handleSaveToAlbum(generatedScenes[index].imageUrl);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        <Breadcrumbs category="design" feature="Smart Background" />
        
        <BackgroundReplacerHeroHeader />

        {aiSuggestion && (
          <ProductInsightBanner
            suggestion={aiSuggestion}
            onApply={handleApplySuggestion}
            applied={suggestionApplied}
          />
        )}
        
        <div className="mb-6 flex items-center gap-4">
          <AICallStatus stage={status.stage} message={status.message} retryAttempt={status.retryAttempt} />
          <RateLimitIndicator 
            remainingCalls={getRemainingCalls()} 
            maxCalls={2} 
            resetTime={resetTime} 
          />
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Card className="backdrop-blur-xl bg-card/60 border-white/10 shadow-[0_0_30px_hsla(43,90%,68%,0.08)] hover:shadow-[0_0_40px_hsla(43,90%,68%,0.12)] transition-all duration-300">
              <CardContent className="p-6 space-y-6">
                <div>
                  <Label className="text-sm font-medium">{t('picStudio.uploadProductImage')}</Label>
                  <motion.div 
                    className="mt-2 relative group"
                    whileHover={{ scale: 1.01 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 via-cyan-500/30 to-primary/30 rounded-xl blur opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="relative border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer backdrop-blur-sm bg-muted/10">
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={handleImageUpload}
                        className="hidden"
                        id="product-upload"
                        disabled={isRemoving}
                      />
                      <label htmlFor="product-upload" className="cursor-pointer">
                        {imagePreview ? (
                          <div className="space-y-4">
                            <img src={imagePreview} alt="Original" className="max-h-48 mx-auto rounded-lg shadow-lg" />
                            {cutoutPreview && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium">{t('picStudio.cutoutLabel')}</p>
                                  {edgeQuality > 0 && (
                                    <Badge 
                                      variant={edgeQuality >= 85 ? "default" : edgeQuality >= 70 ? "secondary" : "outline"}
                                      className={edgeQuality >= 85 ? "shadow-[0_0_10px_hsla(142,76%,36%,0.4)]" : edgeQuality >= 70 ? "shadow-[0_0_10px_hsla(43,90%,68%,0.4)]" : ""}
                                    >
                                      {t('picStudio.edgesLabel')} {edgeQuality}/100
                                    </Badge>
                                  )}
                                </div>
                                <img src={cutoutPreview} alt="Cutout" className="max-h-48 mx-auto rounded-lg bg-checkerboard shadow-lg" />
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <motion.div
                              animate={isRemoving ? { rotate: 360 } : { scale: [1, 1.1, 1] }}
                              transition={isRemoving ? { duration: 1, repeat: Infinity, ease: "linear" } : { duration: 2, repeat: Infinity }}
                            >
                              {isRemoving ? (
                                <Loader2 className="h-12 w-12 mx-auto mb-2 text-primary" />
                              ) : (
                                <Upload className="h-12 w-12 mx-auto mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
                              )}
                            </motion.div>
                            <p className="text-sm text-muted-foreground">
                              {isRemoving ? t('picStudio.removingBg') : t('picStudio.clickToUpload')}
                            </p>
                          </>
                        )}
                      </label>
                    </div>
                  </motion.div>
                </div>

                <div>
                  <Label className="text-sm font-medium">{t('picStudio.categoryLabel')}</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {scenePool.length > 0 && (
                  <motion.div 
                    className="backdrop-blur-md bg-muted/20 border border-white/10 p-4 rounded-xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Info className="h-4 w-4 text-primary" />
                      <Label className="text-xs font-medium">{t('picStudio.scenePoolLabel')} ({scenePool.length} {t('picStudio.scenePoolAvailable')})</Label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {scenePool.slice(0, 6).map((scene, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                        >
                          <Badge variant="outline" className="text-xs backdrop-blur-sm bg-card/40 border-white/10 hover:border-primary/50 transition-colors">
                            {scene}
                          </Badge>
                        </motion.div>
                      ))}
                      {scenePool.length > 6 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.35 }}
                          whileHover={{ scale: 1.05 }}
                        >
                          <Badge variant="outline" className="text-xs backdrop-blur-sm bg-primary/10 border-primary/30 text-primary">
                            +{scenePool.length - 6} {t('picStudio.scenePoolMore')}
                          </Badge>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}

                <div>
                  <Label className="text-sm font-medium">{t('picStudio.variantCountLabel')}</Label>
                  <Select value={variantCount.toString()} onValueChange={(v) => setVariantCount(Number(v))}>
                    <SelectTrigger className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VARIANT_OPTIONS.map((count) => (
                        <SelectItem key={count} value={count.toString()}>
                          {count} {t('picStudio.variantsUnit')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/10 border border-white/5">
                  <Label htmlFor="diversity" className="text-sm font-medium cursor-pointer">{t('picStudio.diversityToggle')}</Label>
                  <Switch
                    id="diversity"
                    checked={diversify}
                    onCheckedChange={setDiversify}
                  />
                </div>
                {diversify && (
                  <motion.p 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="text-xs text-primary -mt-4"
                  >
                    {t('picStudio.diversityActive')}
                  </motion.p>
                )}

                <div>
                  <Label className="text-sm font-medium">{t('picStudio.lightingLabel')}</Label>
                  <Select value={lighting} onValueChange={setLighting}>
                    <SelectTrigger className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LIGHTING_OPTIONS.map((light) => (
                        <SelectItem key={light} value={light}>
                          {light.charAt(0).toUpperCase() + light.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">{t('picStudio.styleIntensityLabel')}</Label>
                    <span className="text-sm font-bold text-primary">{styleIntensity[0]}/10</span>
                  </div>
                  <Slider
                    value={styleIntensity}
                    onValueChange={setStyleIntensity}
                    min={1}
                    max={10}
                    step={1}
                    className="mt-2"
                  />
                </div>

                {brandKits.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium">{t('picStudio.brandKitOptional')}</Label>
                    <Select value={selectedBrandKit} onValueChange={setSelectedBrandKit}>
                      <SelectTrigger className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20">
                        <SelectValue placeholder={t('picStudio.noBrandKit')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('picStudio.noBrandKit')}</SelectItem>
                        {brandKits.map((kit) => (
                          <SelectItem key={kit.id} value={kit.id}>
                            {kit.brand_name || `Brand Kit (${kit.mood})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={handleGenerateScenes}
                    disabled={isGenerating || isRemoving || !cutoutPreview}
                    className="w-full relative overflow-hidden group bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 border-0 shadow-lg hover:shadow-[0_0_25px_hsla(43,90%,68%,0.3)] transition-all duration-300"
                    size="lg"
                  >
                    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        {t('picStudio.generatingVariants')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-5 w-5" />
                        {variantCount} {t('picStudio.generateVariants')}
                      </>
                    )}
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card className="backdrop-blur-xl bg-card/60 border-white/10 overflow-hidden shadow-[0_0_30px_hsla(43,90%,68%,0.08)]">
              <CardContent className="p-0">
                {acceptedScene ? (
                  <div className="flex flex-col">
                    <div className="p-6 border-b border-white/10">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold">{t('picStudio.acceptedVariant')}</h3>
                          <p className="text-sm text-muted-foreground">
                            {acceptedScene.sceneName || `Variant ${acceptedScene.variant}`}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAcceptedScene(null)}
                          className="gap-1.5"
                        >
                          <ArrowLeft className="h-4 w-4" />
                          {t('picStudio.allVariants')}
                        </Button>
                      </div>
                    </div>
                    <div className="p-6">
                      <img
                        src={acceptedScene.imageUrl}
                        alt={acceptedScene.sceneName || 'Accepted scene'}
                        className="w-full rounded-xl shadow-lg"
                      />
                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSaveToAlbum(acceptedScene.imageUrl)}
                        >
                          {t('picStudio.saveToAlbum')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const a = document.createElement('a');
                            a.href = acceptedScene.imageUrl;
                            a.download = `scene-${acceptedScene.sceneName || acceptedScene.variant}.png`;
                            a.click();
                          }}
                        >
                          {t('picStudio.download')}
                        </Button>
                      </div>
                    </div>
                    <ExportControls
                      selectedImages={selectedImages}
                      scenes={[acceptedScene]}
                      onClearSelection={() => setSelectedImages(new Set())}
                    />
                  </div>
                ) : generatedScenes.length > 0 ? (
                  <div className="flex flex-col">
                    <div className="p-6 border-b border-white/10">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold">{t('picStudio.previewGallery')}</h3>
                          <p className="text-sm text-muted-foreground">
                            {generatedScenes.length} {t('picStudio.previewSubtitle')}
                          </p>
                        </div>
                        <Badge variant="default" className="gap-2 bg-gradient-to-r from-primary/80 to-cyan-500/80 border-0">
                          <Sparkles className="h-3 w-3" />
                          v3
                        </Badge>
                      </div>
                      
                      {edgeQuality > 0 && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{t('picStudio.cutoutQualityLabel')}:</span>
                          <Badge 
                            variant={edgeQuality >= 85 ? "default" : edgeQuality >= 70 ? "secondary" : "outline"}
                            className={edgeQuality >= 85 ? "shadow-[0_0_10px_hsla(142,76%,36%,0.4)]" : edgeQuality >= 70 ? "shadow-[0_0_10px_hsla(43,90%,68%,0.4)]" : ""}
                          >
                            {edgeQuality}/100 {edgeQuality >= 85 ? `✓ ${t('picStudio.qualityExcellent')}` : edgeQuality >= 70 ? `✓ ${t('picStudio.qualityGood')}` : `⚠ ${t('picStudio.qualityOk')}`}
                          </Badge>
                        </div>
                      )}
                    </div>

                    <div className="p-6 max-h-[500px] overflow-y-auto">
                      <SceneGallery
                        scenes={generatedScenes}
                        selectedImages={selectedImages}
                        onToggleSelection={toggleImageSelection}
                        onOpenLightbox={(index) => setLightboxScene(index)}
                        onSaveToAlbum={handleGallerySaveToAlbum}
                        onAcceptScene={handleAcceptScene}
                      />
                    </div>

                    <ExportControls
                      selectedImages={selectedImages}
                      scenes={generatedScenes}
                      onClearSelection={() => setSelectedImages(new Set())}
                    />
                  </div>
                ) : (
                  <div className="h-full min-h-[400px] flex items-center justify-center text-center text-muted-foreground p-12">
                    <div>
                      <motion.div
                        animate={{ 
                          y: [0, -10, 0],
                          scale: [1, 1.1, 1],
                        }}
                        transition={{ 
                          duration: 3,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      >
                        <Sparkles className="h-16 w-16 mx-auto mb-4 text-primary/50" />
                      </motion.div>
                      <p className="text-lg font-medium mb-2 bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">
                        {t('picStudio.bgCreatorTitle')}
                      </p>
                      <p className="text-sm whitespace-pre-line">
                        {t('picStudio.bgCreatorDesc')}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </main>

      <Footer />

      {lightboxScene !== null && generatedScenes[lightboxScene] && (
        <ImageLightbox
          scene={generatedScenes[lightboxScene]}
          cutoutPreview={cutoutPreview}
          open={true}
          onClose={() => setLightboxScene(null)}
          onSaveToAlbum={handleLightboxSaveToAlbum}
          onAcceptScene={() => handleAcceptScene(lightboxScene)}
        />
      )}

      <SaveToAlbumDialog
        open={albumDialogOpen}
        onOpenChange={setAlbumDialogOpen}
        imageId={albumImageId}
        onSaved={() => toast.success(t('picStudio.savedToAlbum'))}
      />
    </div>
  );
}
