import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, Upload, Trash2, Paintbrush, Download, 
  Sparkles, Copy, Check, Star, BarChart3, Settings
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
import { BrandKitHeroHeader } from "@/components/brand/BrandKitHeroHeader";

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
    stylePreference: "",
    primaryColor: "#6366F1",
    secondaryColor: ""
  });

  const isPro = subscribed && (
    productId === 'prod_TIRWOmhxlzFCwW' || // Pro Plan
    productId === 'prod_TIRYBu4fdR2BEw'    // Enterprise Plan
  );

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
          brandValues: Array.isArray(data.brandValues) ? data.brandValues.join(", ") : data.brandValues,
          stylePreference: data.stylePreference || null,
          primaryColor: data.primaryColor,
          secondaryColor: data.secondaryColor || null,
          brandDescription: data.brandDescription,
          tonePreference: data.tonePreference || null,
          language: 'de'
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

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
      
      let errorMessage = "Brand Kit konnte nicht erstellt werden";
      let errorDetails = "";
      
      if (error.message) {
        errorMessage = error.message;
      }
      
      if (error.context) {
        const ctx = error.context;
        if (ctx.error) errorDetails += ctx.error;
        if (ctx.details) errorDetails += (errorDetails ? ' - ' : '') + ctx.details;
        if (ctx.message) errorDetails += (errorDetails ? ' - ' : '') + ctx.message;
        if (ctx.dbError) errorDetails += (errorDetails ? ' - ' : '') + ctx.dbError;
        if (ctx.hint) errorDetails += (errorDetails ? ' - ' : '') + ctx.hint;
        if (ctx.preview) errorDetails += (errorDetails ? ' - ' : '') + `Preview: ${ctx.preview}`;
      }
      
      toast({
        title: "Fehler",
        description: errorDetails || errorMessage,
        variant: "destructive",
        duration: 10000,
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

  const tabVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const staggerItem = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Premium Hero Header */}
        <BrandKitHeroHeader 
          brandKitCount={brandKits.length}
          onCreateNew={() => setShowWizard(true)}
        />

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
          {/* Premium TabsList */}
          <TabsList className="grid w-full grid-cols-4 backdrop-blur-xl bg-card/60 border border-white/10 p-1.5 rounded-xl">
            <TabsTrigger 
              value="create"
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)] transition-all duration-300 flex items-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Erstellen
            </TabsTrigger>
            <TabsTrigger 
              value="brandboard" 
              disabled={!activeBrandKit}
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)] transition-all duration-300 flex items-center gap-2"
            >
              <Paintbrush className="h-4 w-4" />
              Brandboard
            </TabsTrigger>
            <TabsTrigger 
              value="consistency" 
              disabled={!activeBrandKit}
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)] transition-all duration-300 flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Konsistenz
            </TabsTrigger>
            <TabsTrigger 
              value="manage" 
              disabled={brandKits.length === 0}
              className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)] transition-all duration-300 flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Verwalten
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            {/* Create Tab */}
            <TabsContent value="create" className="space-y-6">
              <motion.div
                key="create"
                variants={tabVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="grid md:grid-cols-2 gap-6"
              >
                {/* Form Card - Premium Glassmorphism */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl overflow-hidden hover:shadow-[0_0_30px_hsla(43,90%,68%,0.08)] transition-all duration-300"
                >
                  <div className="p-6 border-b border-white/10">
                    <h3 className="text-xl font-semibold">Neues Marken-Set erstellen</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Fülle die Informationen aus oder nutze den Wizard
                    </p>
                  </div>
                  <div className="p-6 space-y-5">
                    <div>
                      <Label htmlFor="brandName" className="text-sm font-medium">Markenname *</Label>
                      <Input
                        id="brandName"
                        value={formData.brandName}
                        onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                        placeholder="z.B. Fashion Studio Berlin"
                        className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>

                    <div>
                      <Label htmlFor="logo">Logo hochladen</Label>
                      <div className="mt-2">
                        {logoPreview ? (
                          <div className="relative w-32 h-32 rounded-xl overflow-hidden border-2 border-primary/30 shadow-[0_0_15px_hsla(43,90%,68%,0.15)]">
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
                          <motion.label 
                            htmlFor="logo" 
                            whileHover={{ scale: 1.02 }}
                            className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-white/20 rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.1)] transition-all duration-300 group"
                          >
                            <Upload className="h-8 w-8 text-muted-foreground group-hover:text-primary group-hover:scale-110 transition-all" />
                            <span className="text-xs text-muted-foreground mt-2 group-hover:text-primary transition-colors">Max. 5MB</span>
                            <input
                              id="logo"
                              type="file"
                              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                              onChange={handleLogoUpload}
                              className="hidden"
                            />
                          </motion.label>
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
                        className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
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
                        className="mt-2 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="primary-color">Primärfarbe</Label>
                        <div className="flex gap-2 mt-2">
                          <div className="relative">
                            <Input
                              id="primary-color"
                              type="color"
                              value={formData.primaryColor}
                              onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                              className="w-14 h-10 p-1 cursor-pointer border-white/10 rounded-lg"
                            />
                            <div 
                              className="absolute inset-0 rounded-lg pointer-events-none border-2 border-transparent"
                              style={{ boxShadow: `0 0 12px ${formData.primaryColor}40` }}
                            />
                          </div>
                          <Input
                            type="text"
                            value={formData.primaryColor}
                            onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                            className="flex-1 font-mono text-sm bg-muted/20 border-white/10"
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
                            className="w-14 h-10 p-1 cursor-pointer border-white/10 rounded-lg"
                          />
                          <Input
                            type="text"
                            value={formData.secondaryColor}
                            onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                            placeholder="#000000"
                            className="flex-1 font-mono text-sm bg-muted/20 border-white/10"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      {/* Premium Generate Button */}
                      <Button
                        onClick={() => handleGenerate()}
                        disabled={isGenerating}
                        className="flex-1 relative group overflow-hidden bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-primary-foreground shadow-[0_0_20px_hsla(43,90%,68%,0.25)] hover:shadow-[0_0_30px_hsla(43,90%,68%,0.4)] transition-all duration-300"
                        size="lg"
                      >
                        {/* Shimmer Effect */}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                          <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        </div>
                        
                        {isGenerating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Wird erstellt...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-4 w-4 group-hover:rotate-12 transition-transform" />
                            Mit KI erstellen
                          </>
                        )}
                      </Button>

                      <Button
                        onClick={() => setShowWizard(true)}
                        variant="outline"
                        size="lg"
                        className="border-white/10 hover:bg-primary/10 hover:border-primary/30 transition-all"
                      >
                        Wizard nutzen
                      </Button>
                    </div>
                  </div>
                </motion.div>

                {/* Premium Feature Info Card */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="backdrop-blur-xl bg-gradient-to-br from-primary/10 via-card/60 to-accent/10 border border-white/15 rounded-2xl overflow-hidden relative"
                >
                  {/* Animated Border Glow */}
                  <div className="absolute inset-0 rounded-2xl opacity-50">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-transparent to-accent/20 animate-pulse" />
                  </div>
                  
                  <div className="relative p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <motion.div
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <Star className="h-6 w-6 text-primary" />
                      </motion.div>
                      <h3 className="text-xl font-semibold">Was macht dieses Feature besonders?</h3>
                    </div>
                  </div>
                  
                  <motion.div 
                    className="relative p-6 space-y-4"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {[
                      { emoji: "✨", title: "KI-Markenanalyse", desc: "Automatische Erkennung von Farben, Stilrichtung und Emotionen aus deinem Logo" },
                      { emoji: "🎨", title: "Visuelles Brandboard", desc: "Sofortige Live-Vorschau mit Farbpalette, Schriften und Beispiel-Posts" },
                      { emoji: "🔗", title: "Auto-Integration", desc: "Alle Tools nutzen automatisch deine Markenfarben und Tonalität" },
                      { emoji: "📊", title: "Consistency Score", desc: "Regelmäßige Analyse deiner Content-Konsistenz mit Verbesserungstipps" },
                      { emoji: "🚀", title: "Multi-Brand-Management", desc: "Verwalte mehrere Marken und wechsle mit einem Klick" },
                    ].map((feature, idx) => (
                      <motion.div 
                        key={idx}
                        variants={staggerItem}
                        className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group"
                      >
                        <div className="text-xl group-hover:scale-110 transition-transform">{feature.emoji}</div>
                        <div>
                          <strong className="text-foreground group-hover:text-primary transition-colors">{feature.title}:</strong>
                          <span className="text-muted-foreground ml-1">{feature.desc}</span>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </motion.div>
              </motion.div>
            </TabsContent>

            {/* Brandboard Tab */}
            <TabsContent value="brandboard">
              <motion.div
                key="brandboard"
                variants={tabVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                {activeBrandKit ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-2xl font-bold">{activeBrandKit.brand_name || "Dein Marken-Set"}</h2>
                        <p className="text-muted-foreground">
                          Erstellt am {new Date(activeBrandKit.created_at).toLocaleDateString('de-DE')}
                        </p>
                      </div>
                      <Button 
                        onClick={handleExportPDF} 
                        variant="outline"
                        className="border-white/10 hover:bg-primary/10 hover:border-primary/30 group"
                      >
                        <Download className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                        Als PDF exportieren
                      </Button>
                    </div>

                    <BrandBoard brandKit={activeBrandKit} />

                    {/* AI Comment Card - Premium */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl overflow-hidden"
                    >
                      <div className="p-6 border-b border-white/10">
                        <div className="flex items-center gap-2">
                          <motion.div
                            animate={{ rotate: [0, 360] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          >
                            <Sparkles className="h-5 w-5 text-primary" />
                          </motion.div>
                          <h3 className="text-lg font-semibold">KI-Analyse & Empfehlung</h3>
                        </div>
                      </div>
                      <div className="p-6">
                        <p className="text-sm leading-relaxed text-muted-foreground">{activeBrandKit.ai_comment}</p>
                      </div>
                    </motion.div>
                  </div>
                ) : (
                  <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
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
              </motion.div>
            </TabsContent>

            {/* Consistency Tab */}
            <TabsContent value="consistency">
              <motion.div
                key="consistency"
                variants={tabVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                {activeBrandKit ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    <ConsistencyScore 
                      score={activeBrandKit.consistency_score || 85} 
                      brandKit={activeBrandKit}
                    />

                    {/* Premium Hashtags Card */}
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl overflow-hidden"
                    >
                      <div className="p-6 border-b border-white/10">
                        <h3 className="text-lg font-semibold">Empfohlene Hashtags</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Nutze diese Hashtags für maximale Reichweite
                        </p>
                      </div>
                      <div className="p-6">
                        <motion.div 
                          className="flex flex-wrap gap-2"
                          variants={staggerContainer}
                          initial="hidden"
                          animate="visible"
                        >
                          {(activeBrandKit.recommended_hashtags as string[] || []).map((tag: string, idx: number) => (
                            <motion.div key={idx} variants={staggerItem}>
                              <Badge
                                variant="secondary"
                                className="cursor-pointer backdrop-blur-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:shadow-[0_0_10px_hsla(43,90%,68%,0.2)] transition-all duration-300"
                                onClick={() => copyToClipboard(tag, "Hashtag")}
                              >
                                {tag}
                                {copiedText === "Hashtag" ? (
                                  <Check className="ml-1 h-3 w-3" />
                                ) : (
                                  <Copy className="ml-1 h-3 w-3" />
                                )}
                              </Badge>
                            </motion.div>
                          ))}
                        </motion.div>

                        <div className="mt-6">
                          <Label className="mb-2 block text-sm font-medium">Beispiel-Caption</Label>
                          <div className="p-4 backdrop-blur-xl bg-muted/20 border border-white/10 rounded-xl relative group">
                            <p className="text-sm text-muted-foreground">{activeBrandKit.example_caption}</p>
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
                      </div>
                    </motion.div>
                  </div>
                ) : null}
              </motion.div>
            </TabsContent>

            {/* Manage Tab */}
            <TabsContent value="manage">
              <motion.div
                key="manage"
                variants={tabVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">Meine Marken-Sets</h2>
                  <Badge 
                    variant="secondary"
                    className="backdrop-blur-xl bg-primary/10 border border-primary/20 text-primary font-medium"
                  >
                    {brandKits.length} {brandKits.length === 1 ? "Set" : "Sets"}
                  </Badge>
                </div>

                <motion.div 
                  className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                >
                  {brandKits.map((kit: any) => (
                    <motion.div
                      key={kit.id}
                      variants={staggerItem}
                      whileHover={{ scale: 1.02, y: -5 }}
                      className={`relative backdrop-blur-xl bg-card/60 border rounded-2xl overflow-hidden transition-all duration-300 ${
                        kit.is_active 
                          ? "border-primary/50 shadow-[0_0_25px_hsla(43,90%,68%,0.15)]" 
                          : "border-white/10 hover:border-white/20 hover:shadow-[0_0_20px_rgba(0,0,0,0.2)]"
                      }`}
                    >
                      {kit.is_active && (
                        <Badge className="absolute -top-2 -right-2 z-10 bg-primary text-primary-foreground shadow-[0_0_15px_hsla(43,90%,68%,0.4)]">
                          Aktiv
                        </Badge>
                      )}
                      
                      <div className="p-5 space-y-4">
                        {kit.logo_url && (
                          <img 
                            src={kit.logo_url} 
                            alt="Logo" 
                            className="w-16 h-16 object-contain rounded-lg border border-white/10" 
                          />
                        )}
                        
                        <div>
                          <h3 className="font-semibold text-lg">{kit.brand_name || "Unnamed"}</h3>
                          <p className="text-xs text-muted-foreground">
                            {new Date(kit.created_at).toLocaleDateString('de-DE')}
                          </p>
                        </div>

                        {/* Color Swatches with Glow */}
                        <div className="flex gap-2">
                          {[
                            kit.color_palette.primary,
                            kit.color_palette.secondary,
                            kit.color_palette.accent
                          ].map((color, idx) => (
                            <motion.div
                              key={idx}
                              whileHover={{ scale: 1.15 }}
                              className="w-8 h-8 rounded-lg border border-white/20 cursor-pointer transition-all"
                              style={{ 
                                backgroundColor: color,
                                boxShadow: `0 0 10px ${color}40`
                              }}
                            />
                          ))}
                        </div>

                        <Badge 
                          variant="outline" 
                          className="text-xs backdrop-blur-xl bg-muted/20 border-white/10"
                        >
                          {kit.mood}
                        </Badge>

                        <div className="flex gap-2 pt-2">
                          {!kit.is_active && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 border-white/10 hover:bg-primary/10 hover:border-primary/30"
                              onClick={() => setActiveMutation.mutate(kit.id)}
                            >
                              Aktivieren
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-white/10"
                            onClick={() => handleDuplicate(kit)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="hover:bg-destructive/20 hover:text-destructive"
                            onClick={() => {
                              if (confirm("Wirklich löschen?")) {
                                deleteMutation.mutate(kit.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </motion.div>
            </TabsContent>
          </AnimatePresence>
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
