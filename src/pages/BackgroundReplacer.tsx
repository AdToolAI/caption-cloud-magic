import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Download, Sparkles, Calendar, ArrowRight, Loader2 } from "lucide-react";
import { removeBackground, loadImage } from "@/lib/backgroundRemoval";

const THEMES = ['outdoor', 'workspace', 'studio', 'urban', 'home', 'retail', 'kitchen', 'abstract'];
const LIGHTING_OPTIONS = ['natural', 'studio', 'dramatic', 'neutral'];

export default function BackgroundReplacer() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [cutoutPreview, setCutoutPreview] = useState<string>("");
  const [theme, setTheme] = useState("outdoor");
  const [lighting, setLighting] = useState("natural");
  const [styleIntensity, setStyleIntensity] = useState([5]);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScenes, setGeneratedScenes] = useState<any[]>([]);
  const [brandKits, setBrandKits] = useState<any[]>([]);
  const [selectedBrandKit, setSelectedBrandKit] = useState<string>("");
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (user) {
      fetchBrandKits();
    }
  }, [user]);

  const fetchBrandKits = async () => {
    const { data } = await supabase
      .from('brand_kits')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setBrandKits(data);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        toast.error("Image must be under 15MB");
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      // Auto-remove background
      await handleRemoveBackground(file);
    }
  };

  const handleRemoveBackground = async (file: File) => {
    if (!user) {
      toast.error("Please sign in to use this feature");
      navigate("/auth");
      return;
    }

    setIsRemoving(true);
    toast.info(t('bg_removing_bg'));

    try {
      const img = await loadImage(file);
      const cutoutBlob = await removeBackground(img);
      
      // Upload cutout to storage
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
      toast.success("Background removed successfully!");
    } catch (error: any) {
      console.error('Background removal error:', error);
      toast.error("Failed to remove background");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleGenerateScenes = async () => {
    if (!user) {
      toast.error("Please sign in to generate scenes");
      navigate("/auth");
      return;
    }

    if (!cutoutPreview) {
      toast.error("Please upload an image first");
      return;
    }

    setIsGenerating(true);

    try {
      // Upload original image
      const fileExt = imageFile!.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('background-projects')
        .upload(fileName, imageFile!);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('background-projects')
        .getPublicUrl(fileName);

      // Call edge function
      const { data, error } = await supabase.functions.invoke('generate-background-scenes', {
        body: {
          cutoutImageUrl: cutoutPreview,
          theme,
          lighting,
          styleIntensity: styleIntensity[0],
          language: 'en',
          brandKitId: selectedBrandKit || null,
          originalImageUrl: publicUrl
        }
      });

      if (error) throw error;

      setGeneratedScenes(data.results_json || []);
      toast.success("Scenes generated successfully!");
    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error(error.message || "Failed to generate scenes");
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

  const handleDownloadSelected = () => {
    if (selectedImages.size === 0) {
      toast.error("Please select at least one image");
      return;
    }
    selectedImages.forEach(index => {
      const scene = generatedScenes[index];
      if (scene?.imageUrl) {
        const link = document.createElement('a');
        link.href = scene.imageUrl;
        link.download = `scene-${index + 1}.png`;
        link.click();
      }
    });
    toast.success(`Downloading ${selectedImages.size} image(s)`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <Breadcrumbs category="design" feature={t('bg_title')} />
        
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{t('bg_title')}</h1>
          <p className="text-muted-foreground">{t('bg_subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Input Panel */}
          <Card>
            <CardContent className="p-6 space-y-6">
              {/* Image Upload */}
              <div>
                <Label>{t('bg_upload_product')}</Label>
                <div className="mt-2 border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer">
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
                        <img src={imagePreview} alt="Original" className="max-h-48 mx-auto rounded" />
                        {cutoutPreview && (
                          <div>
                            <p className="text-sm font-medium mb-2">Background Removed:</p>
                            <img src={cutoutPreview} alt="Cutout" className="max-h-48 mx-auto rounded bg-checkerboard" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {isRemoving ? (
                          <Loader2 className="h-12 w-12 mx-auto mb-2 animate-spin text-primary" />
                        ) : (
                          <Upload className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                        )}
                        <p className="text-sm text-muted-foreground">
                          {isRemoving ? t('bg_removing_bg') : 'Click to upload (max 15MB)'}
                        </p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Theme */}
              <div>
                <Label>{t('bg_choose_theme')}</Label>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THEMES.map((th) => (
                      <SelectItem key={th} value={th}>{t(`bg_theme_${th}` as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lighting */}
              <div>
                <Label>{t('bg_lighting')}</Label>
                <Select value={lighting} onValueChange={setLighting}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIGHTING_OPTIONS.map((light) => (
                      <SelectItem key={light} value={light}>{t(`bg_lighting_${light}` as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Style Intensity */}
              <div>
                <Label>{t('bg_style_intensity')}: {styleIntensity[0]}/10</Label>
                <Slider
                  value={styleIntensity}
                  onValueChange={setStyleIntensity}
                  min={1}
                  max={10}
                  step={1}
                  className="mt-2"
                />
              </div>

              {/* Brand Kit */}
              {brandKits.length > 0 && (
                <div>
                  <Label>Brand Kit (Optional)</Label>
                  <Select value={selectedBrandKit} onValueChange={setSelectedBrandKit}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {brandKits.map((kit) => (
                        <SelectItem key={kit.id} value={kit.id}>
                          Brand Kit ({kit.mood})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button
                onClick={handleGenerateScenes}
                disabled={isGenerating || isRemoving || !cutoutPreview}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {t('bg_generating')}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    {t('bg_generate_scenes')}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Preview Panel */}
          <Card>
            <CardContent className="p-6">
              {generatedScenes.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{t('bg_preview')}</h3>
                    <div className="flex gap-2">
                      <Button onClick={handleDownloadSelected} size="sm" variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        {t('bg_download_selected')} ({selectedImages.size})
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 max-h-[600px] overflow-y-auto">
                    {generatedScenes.map((scene, index) => (
                      <div
                        key={index}
                        className={`relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                          selectedImages.has(index) ? 'border-primary' : 'border-transparent'
                        }`}
                        onClick={() => toggleImageSelection(index)}
                      >
                        <img
                          src={scene.imageUrl}
                          alt={`Variant ${scene.variant}`}
                          className="w-full h-auto"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                          <p className="text-xs text-white">Variant {scene.variant}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-4 border-t">
                    <Button variant="outline" size="sm" onClick={() => navigate('/ai-post-generator')}>
                      <ArrowRight className="h-4 w-4 mr-2" />
                      {t('bg_use_in_post')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate('/calendar')}>
                      <Calendar className="h-4 w-4 mr-2" />
                      {t('bg_schedule')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-center text-muted-foreground p-12">
                  <div>
                    <Sparkles className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>Upload a product image and generate scenes to see the gallery</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
