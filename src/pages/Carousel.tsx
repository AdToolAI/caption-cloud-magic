import { useState, useEffect } from "react";
import { Footer } from "@/components/Footer";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { getProductInfo } from "@/config/pricing";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Download, Plus, Trash2, Edit, GripVertical, Sparkles, Copy, FileText } from "lucide-react";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { Input } from "@/components/ui/input";
import { DesignPreview } from "@/components/carousel/DesignPreview";
import { PerformanceScores } from "@/components/carousel/PerformanceScores";
import { BrandSyncBadge } from "@/components/carousel/BrandSyncBadge";
import { ExportBundle } from "@/components/carousel/ExportBundle";

interface Slide {
  role: "title" | "content" | "cta";
  title: string;
  bullets: string[];
}

interface CarouselOutline {
  slides: Slide[];
  tone: string;
  notes: string;
  hookScore?: number;
  hookTip?: string;
  readabilityScore?: number;
  ctaScore?: number;
  hashtags?: string[];
}

interface BrandKit {
  id: string;
  brand_name?: string;
  primary_color: string;
  secondary_color: string;
  color_palette: any;
  font_pairing: any;
  brand_tone?: string;
  brand_voice?: any;
  keywords?: any;
  recommended_hashtags?: any;
}

const Carousel = () => {
  const { t } = useTranslation();
  const { session, subscribed, productId } = useAuth();
  const [text, setText] = useState("");
  const [slideCount, setSlideCount] = useState(7);
  const [platform, setPlatform] = useState("instagram");
  const [template, setTemplate] = useState("minimal");
  const [mode, setMode] = useState("auto");
  const [brandKitId, setBrandKitId] = useState<string | null>(null);
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [activeBrandKit, setActiveBrandKit] = useState<BrandKit | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [carouselOutline, setCarouselOutline] = useState<CarouselOutline | null>(null);
  const [variantB, setVariantB] = useState<CarouselOutline | null>(null);
  const [activeVariant, setActiveVariant] = useState<"A" | "B">("A");
  const [editingSlideIndex, setEditingSlideIndex] = useState<number | null>(null);
  const [showPlanLimit, setShowPlanLimit] = useState(false);
  const [createABVariant, setCreateABVariant] = useState(false);
  const [activeTab, setActiveTab] = useState<"text" | "design" | "flow">("text");

  const planInfo = getProductInfo(productId);
  const isPro = subscribed && productId === 'prod_TDoYdYP1nOOWsN';

  useEffect(() => {
    if (session?.user) {
      loadBrandKits();
    }
  }, [session]);

  useEffect(() => {
    const kit = brandKits.find(k => k.id === brandKitId);
    setActiveBrandKit(kit || null);
  }, [brandKitId, brandKits]);

  const loadBrandKits = async () => {
    if (!session?.user) return;

    const { data, error } = await supabase
      .from("brand_kits")
      .select("*")
      .eq("user_id", session.user.id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading brand kits:", error);
      return;
    }

    setBrandKits(data || []);
    const activeKit = data?.find(k => k.is_active);
    if (activeKit) {
      setBrandKitId(activeKit.id);
      setActiveBrandKit(activeKit);
    } else if (data && data.length > 0) {
      setBrandKitId(data[0].id);
      setActiveBrandKit(data[0]);
    }
  };

  const handleGenerate = async (isVariantB = false) => {
    if (!session?.user) {
      toast.error("Please sign in to generate carousels");
      return;
    }

    if (text.trim().length < 2 || text.trim().length > 2500) {
      toast.error("Text must be between 2 and 2,500 characters");
      return;
    }

    // Check plan limits
    if (!isPro && slideCount > 5) {
      setShowPlanLimit(true);
      return;
    }

    setIsGenerating(true);

    try {
      const brandKit = activeBrandKit ? {
        tone: {
          style: activeBrandKit.brand_tone || "professional",
          emojiUse: activeBrandKit.brand_voice?.emojiUse || "minimal",
        },
        colors: {
          primary: activeBrandKit.primary_color,
          secondary: activeBrandKit.secondary_color,
        },
        hashtags: activeBrandKit.recommended_hashtags || [],
      } : undefined;

      const { data, error } = await supabase.functions.invoke("generate-carousel", {
        body: {
          text: text.trim(),
          slideCount,
          language: "de",
          platform,
          template,
          mode,
          brandKit,
        },
      });

      if (error) throw error;

      if (isVariantB) {
        setVariantB(data);
        setActiveVariant("B");
      } else {
        setCarouselOutline(data);
        setActiveVariant("A");
      }
      
      toast.success(`Carousel ${isVariantB ? "Variante B" : ""} erfolgreich erstellt!`);

      // Save to database
      await supabase.from("carousel_projects").insert({
        user_id: session.user.id,
        language: "de",
        platform,
        template,
        slide_count: slideCount,
        brand_kit_id: brandKitId,
        outline_json: data,
        has_watermark: !isPro,
      });

    } catch (error: any) {
      console.error("Error generating carousel:", error);
      
      if (error.message?.includes("429")) {
        toast.error("Rate limit exceeded. Please try again in a moment.");
      } else if (error.message?.includes("402")) {
        toast.error("AI credits exhausted. Please add credits to continue.");
      } else {
        toast.error("Failed to generate carousel. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateABVariant = async () => {
    if (!carouselOutline) {
      toast.error("Erstelle zuerst Variante A");
      return;
    }
    await handleGenerate(true);
  };

  const handleCopyCaption = () => {
    const activeOutline = activeVariant === "A" ? carouselOutline : variantB;
    if (!activeOutline) return;

    const caption = activeOutline.slides
      .map((s, i) => `${i === 0 ? "🎯" : "▸"} ${s.title}${s.bullets.length ? "\n" + s.bullets.map(b => `• ${b}`).join("\n") : ""}`)
      .join("\n\n");
    
    const hashtags = activeOutline.hashtags?.join(" ") || "";
    const fullText = `${caption}\n\n${hashtags}`;
    
    navigator.clipboard.writeText(fullText);
    toast.success("Caption & Hashtags kopiert!");
  };

  const handleExportPNG = () => {
    if (!isPro) {
      toast.info(t("carousel_watermark_info"));
    }
    // TODO: Implement PNG export with html2canvas
    toast.info("PNG export coming soon!");
  };

  const handleExportPDF = () => {
    if (!isPro) {
      setShowPlanLimit(true);
      return;
    }
    // TODO: Implement PDF export with jsPDF
    toast.info("PDF export coming soon!");
  };

  const updateSlide = (index: number, field: "title" | "bullets", value: string | string[]) => {
    if (!carouselOutline) return;

    const updatedSlides = [...carouselOutline.slides];
    if (field === "bullets" && Array.isArray(value)) {
      updatedSlides[index].bullets = value;
    } else if (field === "title" && typeof value === "string") {
      updatedSlides[index].title = value;
    }

    setCarouselOutline({
      ...carouselOutline,
      slides: updatedSlides,
    });
  };

  const removeSlide = (index: number) => {
    if (!carouselOutline || carouselOutline.slides.length <= 5) {
      toast.error("Minimum 5 slides required");
      return;
    }

    const updatedSlides = carouselOutline.slides.filter((_, i) => i !== index);
    setCarouselOutline({
      ...carouselOutline,
      slides: updatedSlides,
    });
  };

  const addSlide = () => {
    if (!carouselOutline) return;

    if (!isPro && carouselOutline.slides.length >= 5) {
      setShowPlanLimit(true);
      return;
    }

    if (carouselOutline.slides.length >= 10) {
      toast.error("Maximum 10 slides allowed");
      return;
    }

    const newSlide: Slide = {
      role: "content",
      title: "New Slide",
      bullets: ["Add your content here"],
    };

    setCarouselOutline({
      ...carouselOutline,
      slides: [...carouselOutline.slides, newSlide],
    });
  };

  const getTemplateStyles = () => {
    const selectedKit = brandKits.find(kit => kit.id === brandKitId);
    
    const templates: Record<string, any> = {
      minimal: {
        bg: "bg-background",
        text: "text-foreground",
        accent: "bg-primary",
      },
      bold: {
        bg: selectedKit ? `bg-[${selectedKit.primary_color}]` : "bg-primary",
        text: "text-primary-foreground",
        accent: selectedKit ? `bg-[${selectedKit.secondary_color}]` : "bg-secondary",
      },
      elegant: {
        bg: "bg-muted",
        text: "text-foreground",
        accent: "bg-accent",
      },
      playful: {
        bg: "bg-gradient-to-br from-primary/20 to-secondary/20",
        text: "text-foreground",
        accent: "bg-secondary",
      },
      corporate: {
        bg: "bg-card",
        text: "text-card-foreground",
        accent: "bg-primary",
      },
    };

    return templates[template] || templates.minimal;
  };

  const styles = getTemplateStyles();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold mb-2">PRO Karussell-Generator</h1>
                <p className="text-muted-foreground">Storytelling-Engine mit Brand-Sync & Performance-Analytics</p>
              </div>
              {activeBrandKit && (
                <BrandSyncBadge 
                  brandName={activeBrandKit.brand_name || "Brand Kit"} 
                  isActive={true} 
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Input Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Inhalt & Einstellungen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="text">Dein Thema oder Stichpunkte</Label>
                  <Textarea
                    id="text"
                    placeholder="🪄 Tipp: Gib 3 Stichpunkte ein – wir bauen die Story für dich."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="min-h-[200px] mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {text.length}/2500 Zeichen
                  </p>
                </div>

                <div>
                  <Label>Story-Modus</Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">🎯 Auto (empfohlen)</SelectItem>
                      <SelectItem value="educational">📚 Educational</SelectItem>
                      <SelectItem value="emotional">💝 Emotional Story</SelectItem>
                      <SelectItem value="conversion">🚀 Conversion-Driven</SelectItem>
                      <SelectItem value="authority">⭐ Authority/Insights</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t("carousel_slide_count")}</Label>
                    <Select value={slideCount.toString()} onValueChange={(v) => setSlideCount(parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[5, 6, 7, 8, 9, 10].map((n) => (
                          <SelectItem key={n} value={n.toString()} disabled={!isPro && n > 5}>
                            {n} slides {!isPro && n > 5 && "🔒"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>{t("carousel_platform")}</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>{t("carousel_style")}</Label>
                  <Select value={template} onValueChange={setTemplate}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="bold">Bold</SelectItem>
                      <SelectItem value="elegant">Elegant</SelectItem>
                      <SelectItem value="playful">Playful</SelectItem>
                      <SelectItem value="corporate">Corporate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {brandKits.length > 0 && (
                  <div>
                    <Label>{t("carousel_brand_kit")}</Label>
                    <Select value={brandKitId || "none"} onValueChange={(v) => setBrandKitId(v === "none" ? null : v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("carousel_brand_kit_default")}</SelectItem>
                        {brandKits.map((kit) => (
                          <SelectItem key={kit.id} value={kit.id}>
                            Brand Kit {kit.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {isPro && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <Label htmlFor="ab-variant" className="text-sm">A/B-Variante erstellen</Label>
                    <Switch
                      id="ab-variant"
                      checked={createABVariant}
                      onCheckedChange={setCreateABVariant}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Button 
                    onClick={() => handleGenerate(false)} 
                    disabled={isGenerating || text.trim().length < 2}
                    className="w-full"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generiere...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Folien erstellen
                      </>
                    )}
                  </Button>
                  
                  {createABVariant && carouselOutline && (
                    <Button 
                      onClick={handleCreateABVariant}
                      disabled={isGenerating}
                      variant="outline"
                      className="w-full"
                    >
                      Variante B generieren
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Preview Panel */}
            <div className="space-y-4">
              {carouselOutline && (
                <PerformanceScores
                  hookScore={carouselOutline.hookScore}
                  hookTip={carouselOutline.hookTip}
                  readabilityScore={carouselOutline.readabilityScore}
                  ctaScore={carouselOutline.ctaScore}
                />
              )}

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Vorschau</CardTitle>
                    {carouselOutline && (
                      <div className="flex gap-2">
                        <Button onClick={handleCopyCaption} variant="outline" size="sm">
                          <Copy className="h-4 w-4 mr-2" />
                          Caption kopieren
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {!carouselOutline ? (
                    <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-4">
                      <FileText className="h-16 w-16 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">Erstelle Folien um die Vorschau zu sehen</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="text">Text</TabsTrigger>
                          <TabsTrigger value="design">Design</TabsTrigger>
                          <TabsTrigger value="flow">Story-Flow</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="text" className="space-y-3 mt-4">
                          <ExportBundle 
                            onExportPNG={handleExportPNG}
                            onExportPDF={handleExportPDF}
                            onExportBundle={() => toast.info("Bundle-Export kommt bald!")}
                            isPro={isPro}
                          />

                          <div className="space-y-3 max-h-[500px] overflow-y-auto">
                            {carouselOutline.slides.map((slide, index) => (
                              <div
                                key={index}
                                className={`p-4 rounded-lg border-2 ${styles.bg} ${styles.text} relative group`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-2">
                                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                                    <span className="text-xs font-medium opacity-50">
                                      Slide {index + 1} • {slide.role}
                                    </span>
                                  </div>
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setEditingSlideIndex(editingSlideIndex === index ? null : index)}
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => removeSlide(index)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>

                                {editingSlideIndex === index ? (
                                  <div className="mt-3 space-y-2">
                                    <Input
                                      value={slide.title}
                                      onChange={(e) => updateSlide(index, "title", e.target.value)}
                                      className="font-semibold"
                                    />
                                    {slide.bullets.map((bullet, bIndex) => (
                                      <Input
                                        key={bIndex}
                                        value={bullet}
                                        onChange={(e) => {
                                          const newBullets = [...slide.bullets];
                                          newBullets[bIndex] = e.target.value;
                                          updateSlide(index, "bullets", newBullets);
                                        }}
                                        className="text-sm"
                                      />
                                    ))}
                                  </div>
                                ) : (
                                  <div className="mt-3">
                                    <h3 className="text-lg font-bold mb-2">{slide.title}</h3>
                                    {slide.bullets.length > 0 && (
                                      <ul className="space-y-1 text-sm">
                                        {slide.bullets.map((bullet, bIndex) => (
                                          <li key={bIndex} className="flex items-start">
                                            <span className="mr-2">•</span>
                                            <span>{bullet}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}

                                {!isPro && (
                                  <div className="absolute bottom-2 right-2 text-[10px] opacity-30">
                                    AdTool AI
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {carouselOutline.notes && (
                            <div className="mt-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                              <strong>AI Notes:</strong> {carouselOutline.notes}
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="design" className="mt-4">
                          <DesignPreview 
                            slides={carouselOutline.slides}
                            brandKit={activeBrandKit}
                            template={template}
                          />
                        </TabsContent>

                        <TabsContent value="flow" className="mt-4">
                          <div className="p-6 text-center text-muted-foreground">
                            <p>Story-Flow Visualisierung kommt bald!</p>
                          </div>
                        </TabsContent>
                      </Tabs>

                      {carouselOutline.hashtags && carouselOutline.hashtags.length > 0 && (
                        <div className="p-4 bg-muted/50 rounded-lg">
                          <p className="text-sm font-medium mb-2">Empfohlene Hashtags:</p>
                          <div className="flex flex-wrap gap-2">
                            {carouselOutline.hashtags.map((tag, i) => (
                              <span key={i} className="text-sm text-primary">{tag}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <PlanLimitDialog
        open={showPlanLimit}
        onOpenChange={setShowPlanLimit}
        feature="Carousel Generator (10 slides, PDF export, no watermark)"
      />
    </div>
  );
};

export default Carousel;
