import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, Upload, Trash2, Paintbrush, Download, 
  Sparkles, Copy, Check, Star
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { OnboardingWizard } from "@/components/brand/OnboardingWizard";
import { BrandBoard } from "@/components/brand/BrandBoard";
import { ConsistencyScore } from "@/components/brand/ConsistencyScore";
import { ActiveBrandSelector } from "@/components/brand/ActiveBrandSelector";

const BrandKit = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { subscribed, productId } = useAuth();

  const [showWizard, setShowWizard] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPlanLimit, setShowPlanLimit] = useState(false);
  const [activeTab, setActiveTab] = useState("create");
  const [copiedText, setCopiedText] = useState("");

  const [formData, setFormData] = useState({
    brandName: "",
    targetAudience: "",
    brandDescription: "",
    brandValues: [] as string[],
    tonePreference: "",
    primaryColor: "#6366F1",
    secondaryColor: ""
  });

  const isPro = subscribed && productId === 'prod_TDoYdYP1nOOWsN';

  // Fetch existing brand kits
  const { data: brandKits = [], isLoading } = useQuery({
    queryKey: ['brand-kits'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  const activeBrandKit = brandKits.find((kit: any) => kit.is_active) || brandKits[0];

  // Show wizard for first-time users
  useEffect(() => {
    if (!isLoading && brandKits.length === 0) {
      setShowWizard(true);
    }
  }, [isLoading, brandKits.length]);

  const setActiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('brand_kits')
        .update({ is_active: true })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
      toast({
        title: "Aktives Marken-Set geändert",
        description: "Das neue Marken-Set wird jetzt in allen Tools verwendet"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('brand_kits')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
      toast({
        title: "Gelöscht",
        description: "Brand Kit wurde erfolgreich gelöscht"
      });
    }
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Fehler",
        description: "Datei muss kleiner als 5MB sein",
        variant: "destructive"
      });
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleWizardComplete = async (wizardData: any) => {
    setFormData({
      ...formData,
      ...wizardData,
      brandValues: wizardData.brandValues
    });
    setShowWizard(false);
    
    // Auto-generate after wizard
    setTimeout(() => {
      handleGenerate(wizardData);
    }, 500);
  };

  const handleGenerate = async (dataOverride?: any) => {
    const data = dataOverride || formData;

    if (!data.brandDescription && !data.brandName) {
      toast({
        title: "Fehler",
        description: "Bitte gib mindestens einen Markennamen oder Beschreibung ein",
        variant: "destructive"
      });
      return;
    }

    // Check plan limits
    if (!isPro && brandKits.length >= 1) {
      setShowPlanLimit(true);
      return;
    }

    setIsGenerating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let logoUrl = null;

      // Upload logo if provided
      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const filePath = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('brand-logos')
          .upload(filePath, logoFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('brand-logos')
          .getPublicUrl(filePath);

        logoUrl = publicUrl;
      }

      // Call edge function
      const { data: response, error } = await supabase.functions.invoke('generate-brand-kit', {
        body: {
          logoUrl,
          brandName: data.brandName,
          targetAudience: data.targetAudience,
          brandValues: data.brandValues.join(", "),
          primaryColor: data.primaryColor,
          secondaryColor: data.secondaryColor || null,
          brandDescription: data.brandDescription,
          tonePreference: data.tonePreference || null,
          language: 'de'
        }
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
      setActiveTab("brandboard");

      toast({
        title: "Erfolgreich erstellt!",
        description: "Dein Marken-Set wurde generiert und ist jetzt aktiv",
        duration: 5000
      });

      // Reset form
      setLogoFile(null);
      setLogoPreview("");
    } catch (error: any) {
      console.error('Error generating brand kit:', error);
      toast({
        title: "Fehler",
        description: error.message || "Brand Kit konnte nicht erstellt werden",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = () => {
    toast({
      title: "Export wird vorbereitet",
      description: "PDF-Export kommt in Kürze"
    });
  };

  const handleDuplicate = async (kit: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('brand_kits')
        .insert({
          ...kit,
          id: undefined,
          user_id: user.id,
          brand_name: `${kit.brand_name} (Kopie)`,
          is_active: false,
          created_at: undefined
        });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });
      toast({
        title: "Dupliziert",
        description: "Brand Kit wurde kopiert"
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Konnte nicht dupliziert werden",
        variant: "destructive"
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(""), 2000);
    toast({
      title: "Kopiert!",
      description: `${label}: ${text}`
    });
  };

  if (showWizard) {
    return (
      <OnboardingWizard
        onComplete={handleWizardComplete}
        onSkip={() => setShowWizard(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Paintbrush className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Automatisches Marken-Set</h1>
              <p className="text-muted-foreground">
                KI-gestützte Markenidentität für alle deine Inhalte
              </p>
            </div>
          </div>
          
          {brandKits.length > 0 && (
            <Button onClick={() => setShowWizard(true)} variant="outline">
              <Sparkles className="mr-2 h-4 w-4" />
              Neues Set erstellen
            </Button>
          )}
        </div>

        {/* Active Brand Selector */}
        {brandKits.length > 0 && (
          <div className="mb-6">
            <ActiveBrandSelector
              brandKits={brandKits}
              activeKitId={activeBrandKit?.id}
              onSelect={(id) => setActiveMutation.mutate(id)}
            />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="create">Erstellen</TabsTrigger>
            <TabsTrigger value="brandboard" disabled={!activeBrandKit}>
              Brandboard
            </TabsTrigger>
            <TabsTrigger value="consistency" disabled={!activeBrandKit}>
              Konsistenz
            </TabsTrigger>
            <TabsTrigger value="manage" disabled={brandKits.length === 0}>
              Verwalten
            </TabsTrigger>
          </TabsList>

          {/* Create Tab */}
          <TabsContent value="create" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Neues Marken-Set erstellen</CardTitle>
                  <CardDescription>
                    Fülle die Informationen aus oder nutze den Wizard
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="brandName">Markenname *</Label>
                    <Input
                      id="brandName"
                      value={formData.brandName}
                      onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                      placeholder="z.B. Fashion Studio Berlin"
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="logo">Logo hochladen</Label>
                    <div className="mt-2">
                      {logoPreview ? (
                        <div className="relative w-32 h-32 border-2 border-dashed rounded-lg overflow-hidden">
                          <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                          <Button
                            variant="destructive"
                            size="sm"
                            className="absolute top-1 right-1"
                            onClick={() => {
                              setLogoFile(null);
                              setLogoPreview("");
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <label 
                          htmlFor="logo" 
                          className="flex items-center justify-center w-32 h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors"
                        >
                          <Upload className="h-8 w-8 text-muted-foreground" />
                          <input
                            id="logo"
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                            onChange={handleLogoUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="audience">Zielgruppe</Label>
                    <Textarea
                      id="audience"
                      value={formData.targetAudience}
                      onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                      placeholder="z.B. Junge Frauen 25-35, Mode-bewusst..."
                      rows={3}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Markenbeschreibung *</Label>
                    <Textarea
                      id="description"
                      value={formData.brandDescription}
                      onChange={(e) => setFormData({ ...formData, brandDescription: e.target.value })}
                      placeholder="Beschreibe deine Marke, ihre Werte und Mission..."
                      rows={4}
                      className="mt-2"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="primary-color">Primärfarbe</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          id="primary-color"
                          type="color"
                          value={formData.primaryColor}
                          onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                          className="w-16 h-10"
                        />
                        <Input
                          type="text"
                          value={formData.primaryColor}
                          onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                          className="flex-1 font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="secondary-color">Sekundärfarbe</Label>
                      <div className="flex gap-2 mt-2">
                        <Input
                          id="secondary-color"
                          type="color"
                          value={formData.secondaryColor || "#000000"}
                          onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                          className="w-16 h-10"
                        />
                        <Input
                          type="text"
                          value={formData.secondaryColor}
                          onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                          placeholder="#000000"
                          className="flex-1 font-mono text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={() => handleGenerate()}
                      disabled={isGenerating}
                      className="flex-1"
                      size="lg"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Wird erstellt...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Mit KI erstellen
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={() => setShowWizard(true)}
                      variant="outline"
                      size="lg"
                    >
                      Wizard nutzen
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Info Card */}
              <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-primary" />
                    Was macht dieses Feature besonders?
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">✨</div>
                    <div>
                      <strong>KI-Markenanalyse:</strong> Automatische Erkennung von Farben, Stilrichtung und Emotionen aus deinem Logo
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">🎨</div>
                    <div>
                      <strong>Visuelles Brandboard:</strong> Sofortige Live-Vorschau mit Farbpalette, Schriften und Beispiel-Posts
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">🔗</div>
                    <div>
                      <strong>Auto-Integration:</strong> Alle Tools nutzen automatisch deine Markenfarben und Tonalität
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">📊</div>
                    <div>
                      <strong>Consistency Score:</strong> Regelmäßige Analyse deiner Content-Konsistenz mit Verbesserungstipps
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">🚀</div>
                    <div>
                      <strong>Multi-Brand-Management:</strong> Verwalte mehrere Marken und wechsle mit einem Klick
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Brandboard Tab */}
          <TabsContent value="brandboard">
            {activeBrandKit ? (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold">{activeBrandKit.brand_name || "Dein Marken-Set"}</h2>
                    <p className="text-muted-foreground">
                      Erstellt am {new Date(activeBrandKit.created_at).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                  <Button onClick={handleExportPDF} variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Als PDF exportieren
                  </Button>
                </div>

                <BrandBoard brandKit={activeBrandKit} />

                {/* AI Comment */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      KI-Analyse & Empfehlung
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed">{activeBrandKit.ai_comment}</p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Paintbrush className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Kein Marken-Set vorhanden</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Erstelle dein erstes Marken-Set, um es hier zu sehen
                  </p>
                  <Button onClick={() => setActiveTab("create")}>
                    Jetzt erstellen
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Consistency Tab */}
          <TabsContent value="consistency">
            {activeBrandKit ? (
              <div className="grid md:grid-cols-2 gap-6">
                <ConsistencyScore 
                  score={activeBrandKit.consistency_score || 85} 
                  brandKit={activeBrandKit}
                />

                <Card>
                  <CardHeader>
                    <CardTitle>Empfohlene Hashtags</CardTitle>
                    <CardDescription>
                      Nutze diese Hashtags für maximale Reichweite
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {(activeBrandKit.recommended_hashtags as string[] || []).map((tag: string, idx: number) => (
                        <Badge
                          key={idx}
                          variant="secondary"
                          className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                          onClick={() => copyToClipboard(tag, "Hashtag")}
                        >
                          {tag}
                          {copiedText === "Hashtag" ? (
                            <Check className="ml-1 h-3 w-3" />
                          ) : (
                            <Copy className="ml-1 h-3 w-3" />
                          )}
                        </Badge>
                      ))}
                    </div>

                    <div className="mt-6">
                      <Label className="mb-2 block">Beispiel-Caption</Label>
                      <div className="p-4 bg-muted rounded-lg relative group">
                        <p className="text-sm">{activeBrandKit.example_caption}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => copyToClipboard(activeBrandKit.example_caption, "Caption")}
                        >
                          {copiedText === "Caption" ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </TabsContent>

          {/* Manage Tab */}
          <TabsContent value="manage">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Meine Marken-Sets</h2>
                <Badge variant="secondary">
                  {brandKits.length} {brandKits.length === 1 ? "Set" : "Sets"}
                </Badge>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {brandKits.map((kit: any) => (
                  <Card 
                    key={kit.id} 
                    className={`relative transition-all hover:shadow-lg ${
                      kit.is_active ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    {kit.is_active && (
                      <Badge className="absolute -top-2 -right-2 z-10">
                        Aktiv
                      </Badge>
                    )}
                    
                    <CardContent className="pt-6 space-y-3">
                      {kit.logo_url && (
                        <img 
                          src={kit.logo_url} 
                          alt="Logo" 
                          className="w-16 h-16 object-contain mb-3" 
                        />
                      )}
                      
                      <div>
                        <h3 className="font-semibold">{kit.brand_name || "Unnamed"}</h3>
                        <p className="text-xs text-muted-foreground">
                          {new Date(kit.created_at).toLocaleDateString('de-DE')}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        {[
                          kit.color_palette.primary,
                          kit.color_palette.secondary,
                          kit.color_palette.accent
                        ].map((color, idx) => (
                          <div
                            key={idx}
                            className="w-8 h-8 rounded border"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>

                      <Badge variant="outline" className="text-xs">
                        {kit.mood}
                      </Badge>

                      <div className="flex gap-2 pt-2">
                        {!kit.is_active && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => setActiveMutation.mutate(kit.id)}
                          >
                            Aktivieren
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicate(kit)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm("Wirklich löschen?")) {
                              deleteMutation.mutate(kit.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <PlanLimitDialog
        open={showPlanLimit}
        onOpenChange={setShowPlanLimit}
        feature="brand_kit"
      />
    </div>
  );
};

export default BrandKit;
