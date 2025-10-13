import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Sparkles, Loader2, Zap, Info } from "lucide-react";
import { removeBackground, loadImage } from "@/lib/backgroundRemoval";
import { SceneGallery } from "@/components/background/SceneGallery";
import { ExportControls } from "@/components/background/ExportControls";

const CATEGORIES = [
  { value: 'workspace', label: 'Arbeitsplatz' },
  { value: 'outdoor', label: 'Outdoor/Natur' },
  { value: 'urban', label: 'Urban' },
  { value: 'studio', label: 'Studio/Minimal' },
  { value: 'wellness', label: 'Wellness' },
  { value: 'tech', label: 'Tech' },
  { value: 'luxury', label: 'Luxury' }
];

const LIGHTING_OPTIONS = ['natural', 'studio', 'dramatic', 'neutral'];
const VARIANT_OPTIONS = [5, 10];

export default function BackgroundReplacer() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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

  useEffect(() => {
    if (user) {
      fetchBrandKits();
    }
  }, [user]);

  // Update scene pool when category changes
  useEffect(() => {
    updateScenePool(category);
  }, [category]);

  const fetchBrandKits = async () => {
    const { data } = await supabase
      .from('brand_kits')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setBrandKits(data);
  };

  const updateScenePool = (cat: string) => {
    const pools: Record<string, string[]> = {
      workspace: ['Home Office Holz', 'Co-Working Beton', 'Agentur Studio', 'Designer Marmor', 'Minimal Desk', 'Coffee Shop', 'Tech Desk RGB'],
      outdoor: ['Wald Holzbrücke', 'Bergwiese', 'Flussufer', 'Küste Sand', 'Wüste Dünen', 'Schneelandschaft', 'Waldlichtung'],
      urban: ['Rooftop Skyline', 'Pflastergasse', 'Moderne Lobby', 'U-Bahn Station', 'Beton Stufen', 'Straßenecke'],
      studio: ['Gradient Hell', 'Softbox Setup', 'Acryl Spiegelplatte', 'Stoff Leinen', 'Marmor Weiß-Grau', 'Farbverlauf'],
      wellness: ['Spa Handtuch', 'Eukalyptus Zweige', 'Stein Balance', 'Holz Yoga-Matte'],
      tech: ['Dunkel Neon-Akzente', 'Circuit Board', 'Glas Fiber Optik', 'Metall Gebürstet'],
      luxury: ['Samt Dunkelblau', 'Leder Cognac', 'Marmor Schwarz-Gold', 'Kristall Glas']
    };
    setScenePool(pools[cat] || pools['workspace']);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        toast.error("Bild muss unter 15MB sein");
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      await handleRemoveBackground(file);
    }
  };

  const handleRemoveBackground = async (file: File) => {
    if (!user) {
      toast.error("Bitte melden Sie sich an");
      navigate("/auth");
      return;
    }

    setIsRemoving(true);
    toast.info("Hintergrund wird entfernt mit Edge-Refinement...");

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
      const qualityText = edgeScore >= 85 ? 'Exzellent' : edgeScore >= 70 ? 'Gut' : 'Akzeptabel';
      toast.success(`Hintergrund entfernt! Kanten-Qualität: ${edgeScore}/100 (${qualityText})`);
    } catch (error: any) {
      console.error('Background removal error:', error);
      toast.error("Fehler beim Entfernen des Hintergrunds");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleGenerateScenes = async () => {
    if (!user) {
      toast.error("Bitte melden Sie sich an");
      navigate("/auth");
      return;
    }

    if (!cutoutPreview) {
      toast.error("Bitte laden Sie zuerst ein Bild hoch");
      return;
    }

    setIsGenerating(true);
    toast.info(`Generiere ${variantCount} Varianten mit maximaler Szenen-Diversität...`);

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
          diversify
        }
      });

      if (error) throw error;

      console.log('Generated scenes response:', data);
      setGeneratedScenes(data.results_json || []);
      
      if (data.results_json && data.results_json.length > 0) {
        const scenesUsed = data.metadata?.scenesUsed || [];
        const avgQuality = data.results_json
          .filter((s: any) => s.qualityScores?.overall)
          .reduce((sum: number, s: any) => sum + s.qualityScores.overall, 0) / data.results_json.length;
        
        toast.success(
          `✅ ${data.results_json.length} Varianten generiert!\n` +
          `📊 Durchschn. Qualität: ${Math.round(avgQuality)}/100\n` +
          `🎬 ${scenesUsed.length} unterschiedliche Szenen verwendet`
        );
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error(error.message || "Fehler bei der Generierung");
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <Breadcrumbs category="design" feature="KI-Hintergrund-Ersteller" />
        
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">KI-Hintergrund-Ersteller v2</h1>
              <p className="text-muted-foreground">Pro Compositing mit Szenen-Diversität & Multi-Varianten</p>
            </div>
            <Badge variant="default" className="gap-2 text-base px-4 py-2">
              <Zap className="h-5 w-5" />
              Pro v2
            </Badge>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Input Panel */}
          <Card>
            <CardContent className="p-6 space-y-6">
              {/* Image Upload */}
              <div>
                <Label>Produktbild hochladen</Label>
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
                           <div className="space-y-2">
                             <div className="flex items-center justify-between">
                               <p className="text-sm font-medium">Freigestellt:</p>
                               {edgeQuality > 0 && (
                                 <Badge variant={edgeQuality >= 85 ? "default" : edgeQuality >= 70 ? "secondary" : "outline"}>
                                   Kanten: {edgeQuality}/100
                                 </Badge>
                               )}
                             </div>
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
                          {isRemoving ? 'Hintergrund wird entfernt...' : 'Klicken zum Hochladen (max 15MB)'}
                        </p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Category */}
              <div>
                <Label>Kategorie</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Scene Pool Display */}
              {scenePool.length > 0 && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-xs">Szenen-Pool ({scenePool.length} verfügbar)</Label>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {scenePool.slice(0, 6).map((scene, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {scene}
                      </Badge>
                    ))}
                    {scenePool.length > 6 && (
                      <Badge variant="outline" className="text-xs">+{scenePool.length - 6} mehr</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Variant Count */}
              <div>
                <Label>Anzahl Varianten</Label>
                <Select value={variantCount.toString()} onValueChange={(v) => setVariantCount(Number(v))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VARIANT_OPTIONS.map((count) => (
                      <SelectItem key={count} value={count.toString()}>
                        {count} Varianten
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Diversity Toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="diversity">Szenen-Diversität maximieren</Label>
                <Switch
                  id="diversity"
                  checked={diversify}
                  onCheckedChange={setDiversify}
                />
              </div>
              {diversify && (
                <p className="text-xs text-muted-foreground -mt-2">
                  ✓ Aktiv: Wir vermeiden ähnliche Hintergründe, Props und Blickwinkel
                </p>
              )}

              {/* Lighting */}
              <div>
                <Label>Lichtpräferenz</Label>
                <Select value={lighting} onValueChange={setLighting}>
                  <SelectTrigger className="mt-2">
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

              {/* Style Intensity */}
              <div>
                <Label>Style Intensity: {styleIntensity[0]}/10</Label>
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
                      <SelectValue placeholder="Kein Brand Kit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kein Brand Kit</SelectItem>
                      {brandKits.map((kit) => (
                        <SelectItem key={kit.id} value={kit.id}>
                          {kit.brand_name || `Brand Kit (${kit.mood})`}
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
                    Generiere {variantCount} Varianten...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    {variantCount} Varianten generieren
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Preview Panel */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {generatedScenes.length > 0 ? (
                <div className="flex flex-col">
                  <div className="p-6 border-b">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">Vorschau-Galerie</h3>
                        <p className="text-sm text-muted-foreground">
                          {generatedScenes.length} Varianten mit unterschiedlichen Settings
                        </p>
                      </div>
                      <Badge variant="default" className="gap-2">
                        <Sparkles className="h-3 w-3" />
                        {variantCount} Varianten
                      </Badge>
                    </div>
                    
                    {edgeQuality > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Freistellungs-Qualität:</span>
                        <Badge variant={edgeQuality >= 85 ? "default" : edgeQuality >= 70 ? "secondary" : "outline"}>
                          {edgeQuality}/100 {edgeQuality >= 85 ? '✓ Exzellent' : edgeQuality >= 70 ? '✓ Gut' : '⚠ OK'}
                        </Badge>
                      </div>
                    )}

                    {diversify && (
                      <p className="text-xs text-muted-foreground mt-2">
                        ℹ️ Diversität aktiv: Unterschiedliche Hintergründe, Props und Blickwinkel
                      </p>
                    )}
                  </div>

                  <div className="p-6 max-h-[500px] overflow-y-auto">
                    <SceneGallery
                      scenes={generatedScenes}
                      selectedImages={selectedImages}
                      onToggleSelection={toggleImageSelection}
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
                    <Sparkles className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">KI-Hintergrund-Ersteller v2</p>
                    <p className="text-sm">Laden Sie ein Produktbild hoch und generieren Sie<br />5 oder 10 professionelle Varianten mit maximaler Szenen-Diversität</p>
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