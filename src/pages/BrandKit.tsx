import { useState } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Copy, Check, Trash2, Paintbrush } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { getProductInfo } from "@/config/pricing";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface BrandKit {
  id: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string | null;
  color_palette: {
    primary: string;
    secondary: string;
    accent: string;
    neutrals: string[];
  };
  font_pairing: {
    headline: string;
    body: string;
  };
  mood: string;
  keywords: string[];
  usage_examples: string[];
  ai_comment: string;
  created_at: string;
}

const BrandKit = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { subscribed, productId } = useAuth();

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [primaryColor, setPrimaryColor] = useState("#6366F1");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [tonePreference, setTonePreference] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedKit, setGeneratedKit] = useState<BrandKit | null>(null);
  const [copiedColor, setCopiedColor] = useState<string>("");
  const [showPlanLimit, setShowPlanLimit] = useState(false);

  const isPro = subscribed && productId === 'prod_TDoYdYP1nOOWsN';

  // Fetch existing brand kits
  const { data: brandKits = [] } = useQuery({
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
      return (data || []) as unknown as BrandKit[];
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
        title: t('success'),
        description: "Brand kit deleted successfully",
      });
    }
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t('error'),
        description: "File size must be less than 5MB",
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

  const handleGenerate = async () => {
    if (!brandDescription) {
      toast({
        title: t('error'),
        description: "Please provide a brand description",
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
      const { data, error } = await supabase.functions.invoke('generate-brand-kit', {
        body: {
          logoUrl,
          primaryColor,
          secondaryColor: secondaryColor || null,
          brandDescription,
          tonePreference: tonePreference || null,
          language: 'en'
        }
      });

      if (error) throw error;

      setGeneratedKit(data);
      queryClient.invalidateQueries({ queryKey: ['brand-kits'] });

      toast({
        title: t('success'),
        description: "Brand kit generated successfully!"
      });
    } catch (error: any) {
      console.error('Error generating brand kit:', error);
      toast({
        title: t('error'),
        description: error.message || "Failed to generate brand kit",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedColor(label);
    setTimeout(() => setCopiedColor(""), 2000);
    toast({
      title: t('brand_kit_copied'),
      description: `${label}: ${text}`
    });
  };

  const handleDelete = (id: string) => {
    if (confirm(t('brand_kit_delete_confirm'))) {
      deleteMutation.mutate(id);
    }
  };

  const renderColorSwatch = (color: string, label: string) => (
    <div className="flex items-center gap-2">
      <div
        className="w-12 h-12 rounded-lg border-2 border-border shadow-sm"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground font-mono">{color}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => copyToClipboard(color, label)}
      >
        {copiedColor === label ? (
          <Check className="h-4 w-4 text-accent" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );

  const displayKit = generatedKit || brandKits[0];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-3 mb-6">
          <Paintbrush className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">{t('brand_kit_title')}</h1>
            <p className="text-muted-foreground">{t('brand_kit_subtitle')}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Input Form */}
          <Card>
            <CardHeader>
              <CardTitle>Create Your Brand Kit</CardTitle>
              <CardDescription>Upload your logo and describe your brand</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="logo">{t('brand_kit_upload_logo')}</Label>
                <div className="mt-2">
                  {logoPreview ? (
                    <div className="relative w-32 h-32 border-2 border-dashed rounded-lg overflow-hidden">
                      <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <label htmlFor="logo" className="flex items-center justify-center w-32 h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors">
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
                <Label htmlFor="primary-color">{t('brand_kit_primary_color')}</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="primary-color"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-20 h-10"
                  />
                  <Input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1 font-mono"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="secondary-color">{t('brand_kit_secondary_color')}</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    id="secondary-color"
                    type="color"
                    value={secondaryColor || "#000000"}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-20 h-10"
                  />
                  <Input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    placeholder="#000000"
                    className="flex-1 font-mono"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">{t('brand_kit_description')}</Label>
                <Textarea
                  id="description"
                  value={brandDescription}
                  onChange={(e) => setBrandDescription(e.target.value)}
                  placeholder={t('brand_kit_description_placeholder')}
                  rows={4}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="tone">{t('brand_kit_tone')}</Label>
                <Select value={tonePreference} onValueChange={setTonePreference}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select tone..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modern">{t('brand_kit_tone_modern')}</SelectItem>
                    <SelectItem value="minimalist">{t('brand_kit_tone_minimalist')}</SelectItem>
                    <SelectItem value="playful">{t('brand_kit_tone_playful')}</SelectItem>
                    <SelectItem value="elegant">{t('brand_kit_tone_elegant')}</SelectItem>
                    <SelectItem value="bold">{t('brand_kit_tone_bold')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('brand_kit_generating')}
                  </>
                ) : (
                  t('brand_kit_generate')
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Results Display */}
          <div className="space-y-4">
            {displayKit ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{t('brand_kit_color_palette')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {renderColorSwatch(displayKit.color_palette.primary, "Primary")}
                    {renderColorSwatch(displayKit.color_palette.secondary, "Secondary")}
                    {renderColorSwatch(displayKit.color_palette.accent, "Accent")}
                    {displayKit.color_palette.neutrals.map((color, idx) => 
                      renderColorSwatch(color, `Neutral ${idx + 1}`)
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('brand_kit_font_pairing')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>{t('brand_kit_headline_font')}</Label>
                      <p className="text-2xl font-bold mt-1">{displayKit.font_pairing.headline}</p>
                    </div>
                    <div>
                      <Label>{t('brand_kit_body_font')}</Label>
                      <p className="mt-1">{displayKit.font_pairing.body}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('brand_kit_mood')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="secondary" className="text-base px-4 py-1">
                      {displayKit.mood}
                    </Badge>
                    <div className="mt-4">
                      <Label>{t('brand_kit_keywords')}</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {displayKit.keywords.map((keyword, idx) => (
                          <Badge key={idx} variant="outline">#{keyword}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {displayKit.usage_examples.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('brand_kit_usage')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {displayKit.usage_examples.map((example, idx) => (
                          <li key={idx} className="text-sm">• {example}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>{t('brand_kit_ai_insight')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{displayKit.ai_comment}</p>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Paintbrush className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">{t('brand_kit_no_kits')}</h3>
                  <p className="text-sm text-muted-foreground">{t('brand_kit_create_first')}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Brand Kits History */}
        {brandKits.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold mb-4">{t('brand_kit_my_kits')}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {brandKits.map((kit) => (
                <Card key={kit.id} className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => handleDelete(kit.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <CardContent className="pt-6">
                    {kit.logo_url && (
                      <img src={kit.logo_url} alt="Logo" className="w-16 h-16 object-contain mb-4" />
                    )}
                    <div className="flex gap-2 mb-2">
                      {[kit.color_palette.primary, kit.color_palette.secondary, kit.color_palette.accent].map((color, idx) => (
                        <div
                          key={idx}
                          className="w-8 h-8 rounded border"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <Badge variant="secondary" className="text-xs">{kit.mood}</Badge>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(kit.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      <PlanLimitDialog
        open={showPlanLimit}
        onOpenChange={setShowPlanLimit}
        feature="Auto-Brand Kit"
      />
    </div>
  );
};

export default BrandKit;
