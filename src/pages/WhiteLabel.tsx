import { useState, useEffect, useMemo } from "react";
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
  Palette, Upload, Save, Eye, Image, Globe, Code, Sparkles, RefreshCw, Check, Wand2
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
    const fieldMap = { logo: 'logoUrl', favicon: 'faviconUrl', login_background: 'loginBackgroundUrl' };
    setFormData(prev => ({ ...prev, [fieldMap[aiModalAssetType]]: imageUrl }));
    toast({ title: t('wl.aiAssetApplied'), description: t('wl.aiAssetAppliedDesc') });
  };

  const [formData, setFormData] = useState({
    brandName: "", logoUrl: "", faviconUrl: "", loginBackgroundUrl: "",
    primaryColor: "#6366f1", secondaryColor: "#8b5cf6", accentColor: "#ec4899",
    customDomain: "", showPoweredBy: true, customCss: "",
  });

  const colorFields = useMemo(() => [
    { key: 'primaryColor', label: t('wl.primaryColor'), gradient: 'from-indigo-500 to-purple-500' },
    { key: 'secondaryColor', label: t('wl.secondaryColor'), gradient: 'from-purple-500 to-pink-500' },
    { key: 'accentColor', label: t('wl.accentColor'), gradient: 'from-pink-500 to-rose-500' },
  ], [t]);

  useEffect(() => { if (user) loadSettings(); }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('white_label_settings').select('*').eq('user_id', user.id).maybeSingle();
    if (error && error.code !== 'PGRST116') { console.error('Error loading white label settings:', error); return; }
    if (data) {
      setSettingsId(data.id);
      setFormData({
        brandName: data.brand_name || "", logoUrl: data.logo_url || "", faviconUrl: data.favicon_url || "",
        loginBackgroundUrl: data.login_background_url || "", primaryColor: data.primary_color || "#6366f1",
        secondaryColor: data.secondary_color || "#8b5cf6", accentColor: data.accent_color || "#ec4899",
        customDomain: data.custom_domain || "", showPoweredBy: data.show_powered_by ?? true, customCss: data.custom_css || "",
      });
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const settingsData = {
        user_id: user.id, brand_name: formData.brandName, logo_url: formData.logoUrl,
        favicon_url: formData.faviconUrl, login_background_url: formData.loginBackgroundUrl,
        primary_color: formData.primaryColor, secondary_color: formData.secondaryColor,
        accent_color: formData.accentColor, custom_domain: formData.customDomain,
        show_powered_by: formData.showPoweredBy, custom_css: formData.customCss,
      };
      if (settingsId) {
        const { error } = await supabase.from('white_label_settings').update(settingsData).eq('id', settingsId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('white_label_settings').insert([settingsData]).select().single();
        if (error) throw error;
        setSettingsId(data.id);
      }
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: [formData.primaryColor, formData.secondaryColor, formData.accentColor] });
      toast({ title: t('wl.savedTitle'), description: t('wl.savedDesc') });
    } catch (error: any) {
      toast({ title: t('wl.errorTitle'), description: error.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const handleFileUpload = async (field: 'logoUrl' | 'faviconUrl' | 'loginBackgroundUrl', file: File) => {
    if (!user) return;
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${field}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('brand-logos').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('brand-logos').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, [field]: publicUrl }));
      toast({ title: t('wl.uploadSuccess'), description: t('wl.uploadSuccessDesc') });
    } catch (error: any) {
      toast({ title: t('wl.errorTitle'), description: error.message, variant: 'destructive' });
    }
  };

  const handleColorPresetSelect = (preset: { primary: string; secondary: string; accent: string }) => {
    setFormData(prev => ({ ...prev, primaryColor: preset.primary, secondaryColor: preset.secondary, accentColor: preset.accent }));
  };

  const handleReset = () => {
    setFormData({ brandName: "", logoUrl: "", faviconUrl: "", loginBackgroundUrl: "", primaryColor: "#6366f1", secondaryColor: "#8b5cf6", accentColor: "#ec4899", customDomain: "", showPoweredBy: true, customCss: "" });
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.1 } })
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        <WhiteLabelHeroHeader />

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Branding Card */}
            <motion.div custom={0} initial="hidden" animate="visible" variants={cardVariants}>
              <Card className="bg-card/40 backdrop-blur-xl border-white/10 overflow-hidden">
                <CardHeader className="border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500">
                      <Image className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{t('wl.brandingTitle')}</CardTitle>
                      <CardDescription>{t('wl.brandingDesc')}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('wl.brandNameLabel')}</Label>
                    <Input value={formData.brandName} onChange={(e) => setFormData({ ...formData, brandName: e.target.value })} placeholder={t('wl.brandNamePlaceholder')} className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('wl.logoLabel')}</Label>
                    <div className="flex gap-3">
                      <Input value={formData.logoUrl} onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })} placeholder={t('wl.logoPlaceholder')} className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all" />
                      <Button type="button" variant="outline" className="border-white/10 hover:bg-white/5 hover:border-primary/50" onClick={() => document.getElementById('logo-upload')?.click()}><Upload className="h-4 w-4" /></Button>
                      <Button type="button" variant="outline" className="border-white/10 hover:bg-white/5 hover:border-primary/50 gap-1.5" onClick={() => openAiModal('logo')}><Wand2 className="h-4 w-4 text-primary" /><span className="hidden sm:inline">{t('wl.ai')}</span></Button>
                      <input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload('logoUrl', file); }} />
                    </div>
                    {formData.logoUrl && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-3 p-4 rounded-xl bg-muted/20 border border-white/10">
                        <img src={formData.logoUrl} alt="Logo preview" className="h-16 object-contain" />
                      </motion.div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('wl.faviconLabel')}</Label>
                    <div className="flex gap-3">
                      <Input value={formData.faviconUrl} onChange={(e) => setFormData({ ...formData, faviconUrl: e.target.value })} placeholder={t('wl.faviconPlaceholder')} className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all" />
                      <Button type="button" variant="outline" className="border-white/10 hover:bg-white/5 hover:border-primary/50" onClick={() => document.getElementById('favicon-upload')?.click()}><Upload className="h-4 w-4" /></Button>
                      <Button type="button" variant="outline" className="border-white/10 hover:bg-white/5 hover:border-primary/50 gap-1.5" onClick={() => openAiModal('favicon')}><Wand2 className="h-4 w-4 text-primary" /><span className="hidden sm:inline">{t('wl.ai')}</span></Button>
                      <input id="favicon-upload" type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload('faviconUrl', file); }} />
                    </div>
                    {formData.faviconUrl && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-3 inline-flex items-center gap-2 p-3 rounded-xl bg-muted/20 border border-white/10">
                        <img src={formData.faviconUrl} alt="Favicon preview" className="h-8 w-8 rounded" />
                        <span className="text-sm text-muted-foreground">{t('wl.faviconPreview')}</span>
                      </motion.div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('wl.loginBgLabel')}</Label>
                    <div className="flex gap-3">
                      <Input value={formData.loginBackgroundUrl} onChange={(e) => setFormData({ ...formData, loginBackgroundUrl: e.target.value })} placeholder={t('wl.loginBgPlaceholder')} className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all" />
                      <Button type="button" variant="outline" className="border-white/10 hover:bg-white/5 hover:border-primary/50" onClick={() => document.getElementById('bg-upload')?.click()}><Upload className="h-4 w-4" /></Button>
                      <Button type="button" variant="outline" className="border-white/10 hover:bg-white/5 hover:border-primary/50 gap-1.5" onClick={() => openAiModal('login_background')}><Wand2 className="h-4 w-4 text-primary" /><span className="hidden sm:inline">{t('wl.ai')}</span></Button>
                      <input id="bg-upload" type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload('loginBackgroundUrl', file); }} />
                    </div>
                    {formData.loginBackgroundUrl && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-3 rounded-xl overflow-hidden border border-white/10">
                        <img src={formData.loginBackgroundUrl} alt="Background preview" className="w-full h-32 object-cover" />
                      </motion.div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Colors Card */}
            <motion.div custom={1} initial="hidden" animate="visible" variants={cardVariants}>
              <Card className="bg-card/40 backdrop-blur-xl border-white/10 overflow-hidden">
                <CardHeader className="border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500">
                        <Palette className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">{t('wl.colorsTitle')}</CardTitle>
                        <CardDescription>{t('wl.colorsDesc')}</CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowPresets(!showPresets)} className="border-white/10 hover:bg-white/5">
                      <Sparkles className="w-4 h-4 mr-2" />{t('wl.presetsBtn')}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {showPresets && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="pb-6 border-b border-white/10">
                      <Label className="text-sm font-medium mb-3 block">{t('wl.colorPresetsLabel')}</Label>
                      <ColorPresetPalettes onSelect={handleColorPresetSelect} currentColors={{ primary: formData.primaryColor, secondary: formData.secondaryColor, accent: formData.accentColor }} />
                    </motion.div>
                  )}

                  <div className="grid md:grid-cols-3 gap-6">
                    {colorFields.map((color) => (
                      <div key={color.key} className="space-y-3">
                        <Label className="text-sm font-medium">{color.label}</Label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 w-12 rounded-l-lg border-r border-white/10" style={{ backgroundColor: formData[color.key as keyof typeof formData] as string }} />
                          <Input type="color" value={formData[color.key as keyof typeof formData] as string} onChange={(e) => setFormData({ ...formData, [color.key]: e.target.value })} className="absolute inset-y-0 left-0 w-12 h-full opacity-0 cursor-pointer" />
                          <Input value={formData[color.key as keyof typeof formData] as string} onChange={(e) => setFormData({ ...formData, [color.key]: e.target.value })} className="pl-14 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Advanced Settings Card */}
            <motion.div custom={2} initial="hidden" animate="visible" variants={cardVariants}>
              <Card className="bg-card/40 backdrop-blur-xl border-white/10 overflow-hidden">
                <CardHeader className="border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-violet-500">
                      <Code className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{t('wl.advancedTitle')}</CardTitle>
                      <CardDescription>{t('wl.advancedDesc')}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Globe className="w-4 h-4 text-primary" />{t('wl.customDomainLabel')}
                    </Label>
                    <Input value={formData.customDomain} onChange={(e) => setFormData({ ...formData, customDomain: e.target.value })} placeholder={t('wl.customDomainPlaceholder')} className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all" />
                    <p className="text-xs text-muted-foreground">{t('wl.customDomainHelp')}</p>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/10 border border-white/5">
                    <div>
                      <Label className="text-sm font-medium">{t('wl.poweredByLabel')}</Label>
                      <p className="text-sm text-muted-foreground mt-0.5">{t('wl.poweredByDesc')}</p>
                    </div>
                    <Switch checked={formData.showPoweredBy} onCheckedChange={(checked) => setFormData({ ...formData, showPoweredBy: checked })} />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('wl.customCssLabel')}</Label>
                    <Textarea value={formData.customCss} onChange={(e) => setFormData({ ...formData, customCss: e.target.value })} placeholder={t('wl.customCssPlaceholder')} rows={8} className="font-mono text-sm bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Action Buttons */}
            <motion.div custom={3} initial="hidden" animate="visible" variants={cardVariants} className="flex flex-wrap gap-3">
              <Button onClick={handleSave} disabled={loading} className="relative overflow-hidden bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 text-white shadow-lg shadow-primary/25">
                <motion.div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0" initial={{ x: '-100%' }} whileHover={{ x: '100%' }} transition={{ duration: 0.6 }} />
                {loading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {loading ? t('wl.savingBtn') : t('wl.saveBtn')}
              </Button>
              <Button variant="outline" onClick={handleReset} className="border-white/10 hover:bg-white/5">
                <RefreshCw className="h-4 w-4 mr-2" />{t('wl.resetBtn')}
              </Button>
            </motion.div>
          </div>

          <div className="lg:col-span-1">
            <LivePreviewPanel brandName={formData.brandName} logoUrl={formData.logoUrl} primaryColor={formData.primaryColor} secondaryColor={formData.secondaryColor} accentColor={formData.accentColor} faviconUrl={formData.faviconUrl} />
          </div>
        </div>
      </main>
      <Footer />
      <AIAssetGeneratorModal open={aiModalOpen} onOpenChange={setAiModalOpen} assetType={aiModalAssetType} brandName={formData.brandName} primaryColor={formData.primaryColor} secondaryColor={formData.secondaryColor} onGenerated={handleAiGenerated} />
    </div>
  );
}
