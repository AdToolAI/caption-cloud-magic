import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Palette, Upload, Save, Eye } from "lucide-react";

export default function WhiteLabel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

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

      toast({
        title: t('whiteLabel.saved'),
        description: t('whiteLabel.savedDescription'),
      });
    } catch (error: any) {
      toast({
        title: t('error'),
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
        title: t('whiteLabel.uploadSuccess'),
        description: t('whiteLabel.uploadSuccessDescription'),
      });
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{t('whiteLabel.title')}</h1>
          <p className="text-muted-foreground">{t('whiteLabel.subtitle')}</p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                <CardTitle>{t('whiteLabel.branding')}</CardTitle>
              </div>
              <CardDescription>{t('whiteLabel.brandingDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{t('whiteLabel.brandName')}</Label>
                <Input
                  value={formData.brandName}
                  onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                  placeholder={t('whiteLabel.brandNamePlaceholder')}
                />
              </div>

              <div>
                <Label>{t('whiteLabel.logo')}</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.logoUrl}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    placeholder={t('whiteLabel.logoUrlPlaceholder')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('logo-upload')?.click()}
                  >
                    <Upload className="h-4 w-4" />
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
                  <img src={formData.logoUrl} alt="Logo preview" className="mt-2 h-16 object-contain" />
                )}
              </div>

              <div>
                <Label>{t('whiteLabel.favicon')}</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.faviconUrl}
                    onChange={(e) => setFormData({ ...formData, faviconUrl: e.target.value })}
                    placeholder={t('whiteLabel.faviconUrlPlaceholder')}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('favicon-upload')?.click()}
                  >
                    <Upload className="h-4 w-4" />
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('whiteLabel.colors')}</CardTitle>
              <CardDescription>{t('whiteLabel.colorsDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>{t('whiteLabel.primaryColor')}</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="color"
                      value={formData.primaryColor}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                      className="w-20 h-10"
                    />
                    <Input
                      value={formData.primaryColor}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label>{t('whiteLabel.secondaryColor')}</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="color"
                      value={formData.secondaryColor}
                      onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                      className="w-20 h-10"
                    />
                    <Input
                      value={formData.secondaryColor}
                      onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label>{t('whiteLabel.accentColor')}</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="color"
                      value={formData.accentColor}
                      onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                      className="w-20 h-10"
                    />
                    <Input
                      value={formData.accentColor}
                      onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('whiteLabel.advanced')}</CardTitle>
              <CardDescription>{t('whiteLabel.advancedDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{t('whiteLabel.customDomain')}</Label>
                <Input
                  value={formData.customDomain}
                  onChange={(e) => setFormData({ ...formData, customDomain: e.target.value })}
                  placeholder="app.yourdomain.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('whiteLabel.customDomainHelp')}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('whiteLabel.showPoweredBy')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('whiteLabel.showPoweredByDescription')}
                  </p>
                </div>
                <Switch
                  checked={formData.showPoweredBy}
                  onCheckedChange={(checked) => setFormData({ ...formData, showPoweredBy: checked })}
                />
              </div>

              <div>
                <Label>{t('whiteLabel.customCss')}</Label>
                <Textarea
                  value={formData.customCss}
                  onChange={(e) => setFormData({ ...formData, customCss: e.target.value })}
                  placeholder="/* Custom CSS styles */"
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {t('whiteLabel.save')}
            </Button>
            <Button variant="outline" disabled>
              <Eye className="h-4 w-4 mr-2" />
              {t('whiteLabel.preview')}
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}