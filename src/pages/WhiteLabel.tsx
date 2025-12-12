import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Palette, 
  Upload, 
  Save, 
  Eye, 
  Image, 
  Globe, 
  Code, 
  Sparkles,
  RefreshCw,
  Check,
  Wand2
} from "lucide-react";
import { WhiteLabelHeroHeader } from "@/components/white-label/WhiteLabelHeroHeader";
import { ColorPresetPalettes } from "@/components/white-label/ColorPresetPalettes";
import { LivePreviewPanel } from "@/components/white-label/LivePreviewPanel";
import { AIAssetGeneratorModal } from "@/components/white-label/AIAssetGeneratorModal";
import confetti from 'canvas-confetti';

export default function WhiteLabel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiModalAssetType, setAiModalAssetType] = useState<'logo' | 'favicon' | 'login_background'>('logo');

  const openAiModal = (assetType: 'logo' | 'favicon' | 'login_background') => {
    setAiModalAssetType(assetType);
    setAiModalOpen(true);
  };

  const handleAiGenerated = (imageUrl: string) => {
    const fieldMap = {
      logo: 'logoUrl',
      favicon: 'faviconUrl',
      login_background: 'loginBackgroundUrl',
    };
    setFormData(prev => ({ ...prev, [fieldMap[aiModalAssetType]]: imageUrl }));
    toast({
      title: "KI-Asset übernommen",
      description: "Das generierte Asset wurde eingefügt.",
    });
  };

  const [formData, setFormData] = useState({
    brandName: "",
    logoUrl: "",
    faviconUrl: "",
    loginBackgroundUrl: "",
    primaryColor: "#6366f1",
    secondaryColor: "#8b5cf6",
    accentColor: "#ec4899",
    customDomain: "",
    showPoweredBy: true,
    customCss: "",
  });

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('white_label_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading white label settings:', error);
      return;
    }

    if (data) {
      setSettingsId(data.id);
      setFormData({
        brandName: data.brand_name || "",
        logoUrl: data.logo_url || "",
        faviconUrl: data.favicon_url || "",
        loginBackgroundUrl: data.login_background_url || "",
        primaryColor: data.primary_color || "#6366f1",
        secondaryColor: data.secondary_color || "#8b5cf6",
        accentColor: data.accent_color || "#ec4899",
        customDomain: data.custom_domain || "",
        showPoweredBy: data.show_powered_by ?? true,
        customCss: data.custom_css || "",
      });
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const settingsData = {
        user_id: user.id,
        brand_name: formData.brandName,
        logo_url: formData.logoUrl,
        favicon_url: formData.faviconUrl,
        login_background_url: formData.loginBackgroundUrl,
        primary_color: formData.primaryColor,
        secondary_color: formData.secondaryColor,
        accent_color: formData.accentColor,
        custom_domain: formData.customDomain,
        show_powered_by: formData.showPoweredBy,
        custom_css: formData.customCss,
      };

      if (settingsId) {
        const { error } = await supabase
          .from('white_label_settings')
          .update(settingsData)
          .eq('id', settingsId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('white_label_settings')
          .insert([settingsData])
          .select()
          .single();

        if (error) throw error;
        setSettingsId(data.id);
      }

      // Trigger confetti on save
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: [formData.primaryColor, formData.secondaryColor, formData.accentColor]
      });

      toast({
        title: "Einstellungen gespeichert",
        description: "Ihre White-Label-Einstellungen wurden erfolgreich aktualisiert.",
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (field: 'logoUrl' | 'faviconUrl' | 'loginBackgroundUrl', file: File) => {
    if (!user) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${field}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('brand-logos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('brand-logos')
        .getPublicUrl(fileName);

      setFormData(prev => ({ ...prev, [field]: publicUrl }));

      toast({
        title: "Upload erfolgreich",
        description: "Die Datei wurde hochgeladen.",
      });
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleColorPresetSelect = (preset: { primary: string; secondary: string; accent: string }) => {
    setFormData(prev => ({
      ...prev,
      primaryColor: preset.primary,
      secondaryColor: preset.secondary,
      accentColor: preset.accent,
    }));
  };

  const handleReset = () => {
    setFormData({
      brandName: "",
      logoUrl: "",
      faviconUrl: "",
      loginBackgroundUrl: "",
      primaryColor: "#6366f1",
      secondaryColor: "#8b5cf6",
      accentColor: "#ec4899",
      customDomain: "",
      showPoweredBy: true,
      customCss: "",
    });
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, delay: i * 0.1 }
    })
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        <WhiteLabelHeroHeader />

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Settings Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Branding Card */}
            <motion.div
              custom={0}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
            >
              <Card className="bg-card/40 backdrop-blur-xl border-white/10 overflow-hidden">
                <CardHeader className="border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500">
                      <Image className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Branding</CardTitle>
                      <CardDescription>Logo, Favicon und Markenname anpassen</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Brand Name */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Markenname</Label>
                    <Input
                      value={formData.brandName}
                      onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                      placeholder="Ihr Firmenname"
                      className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>

                  {/* Logo Upload */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Logo</Label>
                    <div className="flex gap-3">
                      <Input
                        value={formData.logoUrl}
                        onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                        placeholder="Logo-URL eingeben oder hochladen"
                        className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/10 hover:bg-white/5 hover:border-primary/50"
                        onClick={() => document.getElementById('logo-upload')?.click()}
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/10 hover:bg-white/5 hover:border-primary/50 gap-1.5"
                        onClick={() => openAiModal('logo')}
                      >
                        <Wand2 className="h-4 w-4 text-primary" />
                        <span className="hidden sm:inline">KI</span>
                      </Button>
                      <input
                        id="logo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload('logoUrl', file);
                        }}
                      />
                    </div>
                    {formData.logoUrl && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-3 p-4 rounded-xl bg-muted/20 border border-white/10"
                      >
                        <img src={formData.logoUrl} alt="Logo preview" className="h-16 object-contain" />
                      </motion.div>
                    )}
                  </div>

                  {/* Favicon Upload */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Favicon</Label>
                    <div className="flex gap-3">
                      <Input
                        value={formData.faviconUrl}
                        onChange={(e) => setFormData({ ...formData, faviconUrl: e.target.value })}
                        placeholder="Favicon-URL eingeben oder hochladen"
                        className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/10 hover:bg-white/5 hover:border-primary/50"
                        onClick={() => document.getElementById('favicon-upload')?.click()}
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/10 hover:bg-white/5 hover:border-primary/50 gap-1.5"
                        onClick={() => openAiModal('favicon')}
                      >
                        <Wand2 className="h-4 w-4 text-primary" />
                        <span className="hidden sm:inline">KI</span>
                      </Button>
                      <input
                        id="favicon-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload('faviconUrl', file);
                        }}
                      />
                    </div>
                    {formData.faviconUrl && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-3 inline-flex items-center gap-2 p-3 rounded-xl bg-muted/20 border border-white/10"
                      >
                        <img src={formData.faviconUrl} alt="Favicon preview" className="h-8 w-8 rounded" />
                        <span className="text-sm text-muted-foreground">Browser-Tab Vorschau</span>
                      </motion.div>
                    )}
                  </div>

                  {/* Login Background */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Login-Hintergrund</Label>
                    <div className="flex gap-3">
                      <Input
                        value={formData.loginBackgroundUrl}
                        onChange={(e) => setFormData({ ...formData, loginBackgroundUrl: e.target.value })}
                        placeholder="Hintergrund-URL eingeben oder hochladen"
                        className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/10 hover:bg-white/5 hover:border-primary/50"
                        onClick={() => document.getElementById('bg-upload')?.click()}
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/10 hover:bg-white/5 hover:border-primary/50 gap-1.5"
                        onClick={() => openAiModal('login_background')}
                      >
                        <Wand2 className="h-4 w-4 text-primary" />
                        <span className="hidden sm:inline">KI</span>
                      </Button>
                      <input
                        id="bg-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload('loginBackgroundUrl', file);
                        }}
                      />
                    </div>
                    {formData.loginBackgroundUrl && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-3 rounded-xl overflow-hidden border border-white/10"
                      >
                        <img src={formData.loginBackgroundUrl} alt="Background preview" className="w-full h-32 object-cover" />
                      </motion.div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Colors Card */}
            <motion.div
              custom={1}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
            >
              <Card className="bg-card/40 backdrop-blur-xl border-white/10 overflow-hidden">
                <CardHeader className="border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500">
                        <Palette className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">Farbschema</CardTitle>
                        <CardDescription>Primär-, Sekundär- und Akzentfarben definieren</CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPresets(!showPresets)}
                      className="border-white/10 hover:bg-white/5"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Vorlagen
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Preset Palettes */}
                  {showPresets && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pb-6 border-b border-white/10"
                    >
                      <Label className="text-sm font-medium mb-3 block">Farbvorlagen</Label>
                      <ColorPresetPalettes
                        onSelect={handleColorPresetSelect}
                        currentColors={{
                          primary: formData.primaryColor,
                          secondary: formData.secondaryColor,
                          accent: formData.accentColor,
                        }}
                      />
                    </motion.div>
                  )}

                  {/* Custom Colors */}
                  <div className="grid md:grid-cols-3 gap-6">
                    {[
                      { key: 'primaryColor', label: 'Primärfarbe', gradient: 'from-indigo-500 to-purple-500' },
                      { key: 'secondaryColor', label: 'Sekundärfarbe', gradient: 'from-purple-500 to-pink-500' },
                      { key: 'accentColor', label: 'Akzentfarbe', gradient: 'from-pink-500 to-rose-500' },
                    ].map((color) => (
                      <div key={color.key} className="space-y-3">
                        <Label className="text-sm font-medium">{color.label}</Label>
                        <div className="relative">
                          <div
                            className="absolute inset-y-0 left-0 w-12 rounded-l-lg border-r border-white/10"
                            style={{ backgroundColor: formData[color.key as keyof typeof formData] as string }}
                          />
                          <Input
                            type="color"
                            value={formData[color.key as keyof typeof formData] as string}
                            onChange={(e) => setFormData({ ...formData, [color.key]: e.target.value })}
                            className="absolute inset-y-0 left-0 w-12 h-full opacity-0 cursor-pointer"
                          />
                          <Input
                            value={formData[color.key as keyof typeof formData] as string}
                            onChange={(e) => setFormData({ ...formData, [color.key]: e.target.value })}
                            className="pl-14 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Advanced Settings Card */}
            <motion.div
              custom={2}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
            >
              <Card className="bg-card/40 backdrop-blur-xl border-white/10 overflow-hidden">
                <CardHeader className="border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-violet-500">
                      <Code className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Erweiterte Einstellungen</CardTitle>
                      <CardDescription>Custom Domain, CSS und weitere Optionen</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Custom Domain */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />
                      Eigene Domain
                    </Label>
                    <Input
                      value={formData.customDomain}
                      onChange={(e) => setFormData({ ...formData, customDomain: e.target.value })}
                      placeholder="app.ihredomain.de"
                      className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    <p className="text-xs text-muted-foreground">
                      Kontaktieren Sie den Support zur Einrichtung Ihrer Custom Domain
                    </p>
                  </div>

                  {/* Powered By Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/10 border border-white/5">
                    <div>
                      <Label className="text-sm font-medium">"Powered by" anzeigen</Label>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        AdTool AI Badge in der Fußzeile anzeigen
                      </p>
                    </div>
                    <Switch
                      checked={formData.showPoweredBy}
                      onCheckedChange={(checked) => setFormData({ ...formData, showPoweredBy: checked })}
                    />
                  </div>

                  {/* Custom CSS */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Benutzerdefiniertes CSS</Label>
                    <Textarea
                      value={formData.customCss}
                      onChange={(e) => setFormData({ ...formData, customCss: e.target.value })}
                      placeholder="/* Eigene CSS-Stile */&#10;.custom-class {&#10;  color: #fff;&#10;}"
                      rows={8}
                      className="font-mono text-sm bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              custom={3}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="flex flex-wrap gap-3"
            >
              <Button 
                onClick={handleSave} 
                disabled={loading}
                className="relative overflow-hidden bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 text-white shadow-lg shadow-primary/25"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.6 }}
                />
                {loading ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {loading ? 'Wird gespeichert...' : 'Einstellungen speichern'}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={handleReset}
                className="border-white/10 hover:bg-white/5"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Zurücksetzen
              </Button>
            </motion.div>
          </div>

          {/* Live Preview Column */}
          <div className="lg:col-span-1">
            <LivePreviewPanel
              brandName={formData.brandName}
              logoUrl={formData.logoUrl}
              primaryColor={formData.primaryColor}
              secondaryColor={formData.secondaryColor}
              accentColor={formData.accentColor}
              faviconUrl={formData.faviconUrl}
            />
          </div>
        </div>
      </main>
      <Footer />

      {/* AI Asset Generator Modal */}
      <AIAssetGeneratorModal
        open={aiModalOpen}
        onOpenChange={setAiModalOpen}
        assetType={aiModalAssetType}
        brandName={formData.brandName}
        primaryColor={formData.primaryColor}
        secondaryColor={formData.secondaryColor}
        onGenerated={handleAiGenerated}
      />
    </div>
  );
}
