import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Copy, Download, Calendar, Sparkles, Instagram, Facebook, Linkedin } from "lucide-react";

export default function AIPostGenerator() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [description, setDescription] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["instagram"]);
  const [style, setStyle] = useState("clean");
  const [tone, setTone] = useState("friendly");
  const [ctaInput, setCTAInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState<any>(null);
  const [brandKits, setBrandKits] = useState<any[]>([]);
  const [selectedBrandKit, setSelectedBrandKit] = useState<string>("default");

  const fetchBrandKits = async () => {
    const { data } = await supabase
      .from('brand_kits')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setBrandKits(data);
  };

  useEffect(() => {
    if (user) {
      fetchBrandKits();
    }
  }, [user]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Image must be under 10MB");
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePlatformToggle = (platform: string) => {
    setPlatforms(prev =>
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const handleGenerate = async () => {
    if (!user) {
      toast.error("Please sign in to generate posts");
      navigate("/auth");
      return;
    }

    if (!imageFile || !description.trim()) {
      toast.error("Please upload an image and provide a description");
      return;
    }

    if (platforms.length === 0) {
      toast.error("Please select at least one platform");
      return;
    }

    setIsGenerating(true);

    try {
      // Upload image to storage
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('image-captions')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('image-captions')
        .getPublicUrl(fileName);

      // Call edge function
      const { data, error } = await supabase.functions.invoke('generate-post', {
        body: {
          imageUrl: publicUrl,
          description: description.trim(),
          platforms,
          style,
          tone,
          language: 'en',
          brandKitId: selectedBrandKit === 'default' ? null : selectedBrandKit,
          ctaInput: ctaInput.trim()
        }
      });

      if (error) throw error;

      setGeneratedPost(data);
      toast.success("Post generated successfully!");
    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error(error.message || "Failed to generate post");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCaption = () => {
    if (generatedPost) {
      const fullCaption = `${generatedPost.caption}\n\n${generatedPost.hashtags.join(' ')}\n\n${generatedPost.cta_line}`;
      navigator.clipboard.writeText(fullCaption);
      toast.success("Caption copied to clipboard!");
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch(platform) {
      case 'instagram': return <Instagram className="h-4 w-4" />;
      case 'facebook': return <Facebook className="h-4 w-4" />;
      case 'linkedin': return <Linkedin className="h-4 w-4" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <Breadcrumbs category="design" feature={t('aipost_title')} />
        
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{t('aipost_title')}</h1>
          <p className="text-muted-foreground">{t('aipost_subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Input Panel */}
          <Card>
            <CardContent className="p-6 space-y-6">
              {/* Image Upload */}
              <div>
                <Label>{t('aipost_upload_image')}</Label>
                <div className="mt-2 border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="image-upload"
                  />
                  <label htmlFor="image-upload" className="cursor-pointer">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded" />
                    ) : (
                      <>
                        <Upload className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Click to upload (max 10MB)</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Description */}
              <div>
                <Label>{t('aipost_description')}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('aipost_description_placeholder')}
                  maxLength={200}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">{description.length}/200</p>
              </div>

              {/* Platforms */}
              <div>
                <Label>{t('aipost_platforms')}</Label>
                <div className="flex gap-4 mt-2">
                  {['instagram', 'facebook', 'linkedin'].map((platform) => (
                    <label key={platform} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={platforms.includes(platform)}
                        onCheckedChange={() => handlePlatformToggle(platform)}
                      />
                      <span className="capitalize flex items-center gap-1">
                        {getPlatformIcon(platform)}
                        {platform}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div>
                <Label>{t('aipost_style')}</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['clean', 'bold', 'lifestyle', 'elegant', 'corporate'].map((s) => (
                      <SelectItem key={s} value={s}>{t(`aipost_style_${s}` as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tone */}
              <div>
                <Label>{t('aipost_tone')}</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['friendly', 'informative', 'persuasive', 'playful', 'professional'].map((tn) => (
                      <SelectItem key={tn} value={tn}>{t(`aipost_tone_${tn}` as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Brand Kit */}
              {brandKits.length > 0 && (
                <div>
                  <Label>{t('aipost_brand_kit')}</Label>
                  <Select value={selectedBrandKit} onValueChange={setSelectedBrandKit}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Default Theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default Theme</SelectItem>
                      {brandKits.map((kit) => (
                        <SelectItem key={kit.id} value={kit.id}>
                          Brand Kit ({kit.mood})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* CTA */}
              <div>
                <Label>{t('aipost_cta')}</Label>
                <Input
                  value={ctaInput}
                  onChange={(e) => setCTAInput(e.target.value)}
                  placeholder={t('aipost_cta_placeholder')}
                  className="mt-2"
                />
              </div>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !imageFile || !description.trim()}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>{t('aipost_generating')}</>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    {t('aipost_generate_button')}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Preview Panel */}
          <Card>
            <CardContent className="p-6">
              {generatedPost ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">{t('aipost_preview')}</h3>
                    {imagePreview && (
                      <img src={imagePreview} alt="Post" className="w-full rounded-lg mb-4" />
                    )}
                  </div>

                  <div>
                    <Label className="text-sm font-medium">{t('aipost_headline')}</Label>
                    <p className="text-2xl font-bold mt-1">{generatedPost.headline}</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">{t('aipost_caption')}</Label>
                    <p className="mt-1 whitespace-pre-wrap">{generatedPost.caption}</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">{t('aipost_hashtags')}</Label>
                    <p className="mt-1 text-primary">{generatedPost.hashtags.join(' ')}</p>
                  </div>

                  {generatedPost.cta_line && (
                    <div>
                      <Label className="text-sm font-medium">CTA</Label>
                      <p className="mt-1 font-medium">{generatedPost.cta_line}</p>
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap pt-4 border-t">
                    <Button onClick={handleCopyCaption} variant="outline" size="sm">
                      <Copy className="h-4 w-4 mr-2" />
                      {t('aipost_copy_caption')}
                    </Button>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      {t('aipost_download')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate('/calendar')}>
                      <Calendar className="h-4 w-4 mr-2" />
                      {t('aipost_send_to_calendar')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-center text-muted-foreground p-12">
                  <div>
                    <Sparkles className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p>Upload an image and generate your post to see the preview</p>
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
