import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle, Sparkles, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { BioCard } from "@/components/bio/BioCard";
import { BrandVoiceDialog } from "@/components/bio/BrandVoiceDialog";
import { BioPreviewDialog } from "@/components/bio/BioPreviewDialog";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";

interface Bio {
  platform: string;
  text: string;
}

interface BioResult {
  bios: Bio[];
  explanation: string;
}

export default function BioOptimizer() {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const [platform, setPlatform] = useState("instagram");
  const [audience, setAudience] = useState("");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("friendly");
  const [keywords, setKeywords] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<BioResult | null>(null);
  const [userPlan, setUserPlan] = useState("free");
  const [showBrandVoice, setShowBrandVoice] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewBio, setPreviewBio] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [brandVoice, setBrandVoice] = useState<any>(null);

  useEffect(() => {
    if (user) {
      fetchUserPlan();
      fetchBrandVoice();
    }
  }, [user]);

  const fetchUserPlan = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user?.id)
      .single();
    
    if (data) setUserPlan(data.plan || "free");
  };

  const fetchBrandVoice = async () => {
    const { data } = await supabase
      .from("brand_voice")
      .select("*")
      .eq("user_id", user?.id)
      .single();
    
    if (data) setBrandVoice(data);
  };

  const applyBrandVoice = () => {
    if (!brandVoice) return;
    setTone(brandVoice.tone);
    setKeywords(brandVoice.keywords || "");
    toast.success("Brand voice applied");
  };

  const handleGenerate = async () => {
    if (!audience.trim() || !topic.trim()) {
      toast.error("Please fill in target audience and focus/niche");
      return;
    }

    setGenerating(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-bio', {
        body: {
          platform,
          audience,
          topic,
          tone,
          keywords: keywords.trim() || null,
          language
        }
      });

      if (error) {
        if (error.message?.includes('Daily limit reached') || error.message?.includes('429')) {
          setShowUpgrade(true);
          toast.error(t("bio_limit_reached"));
        } else {
          throw error;
        }
      } else if (data) {
        setResult(data);
        toast.success("Bios generated successfully!");
      }
    } catch (err) {
      console.error('Error generating bio:', err);
      toast.error("Failed to generate bios. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handlePreview = (bioText: string) => {
    setPreviewBio(bioText);
    setShowPreview(true);
  };

  const handleSaveBrandVoice = () => {
    if (userPlan === "free") {
      setShowUpgrade(true);
      return;
    }
    setShowBrandVoice(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        <Breadcrumbs category="optimize" feature={t("bio_title")} />

        <div className="flex items-center gap-2 mb-6">
          <UserCircle className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t("bio_title")}</h1>
            <p className="text-muted-foreground mt-1">
              Create perfect social media bios with AI
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Form */}
          <Card>
            <CardHeader>
              <CardTitle>Bio Details</CardTitle>
              <CardDescription>
                Tell us about your brand and target audience
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="platform">Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger id="platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="audience">{t("bio_input_audience")}</Label>
                <Input
                  id="audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="e.g., young entrepreneurs, fitness lovers"
                />
              </div>

              <div>
                <Label htmlFor="topic">{t("bio_input_topic")}</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., AI tools, healthy recipes"
                />
              </div>

              <div>
                <Label htmlFor="tone">{t("bio_input_tone")}</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger id="tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">{t("bio_tone_friendly")}</SelectItem>
                    <SelectItem value="professional">{t("bio_tone_professional")}</SelectItem>
                    <SelectItem value="bold">{t("bio_tone_bold")}</SelectItem>
                    <SelectItem value="humorous">{t("bio_tone_humorous")}</SelectItem>
                    <SelectItem value="inspirational">{t("bio_tone_inspirational")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="keywords">{t("bio_input_keywords")}</Label>
                <Textarea
                  id="keywords"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g., growth, AI, innovation"
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex-1"
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {t("bio_generate")}
                    </>
                  )}
                </Button>

                {brandVoice && (
                  <Button
                    onClick={applyBrandVoice}
                    variant="outline"
                  >
                    {t("bio_apply_brand_voice")}
                  </Button>
                )}
              </div>

              <Button
                onClick={handleSaveBrandVoice}
                variant="outline"
                className="w-full"
              >
                {userPlan === "free" && <Lock className="mr-2 h-4 w-4" />}
                {t("bio_save_brand_voice")}
              </Button>

              {userPlan === "free" && (
                <p className="text-xs text-muted-foreground text-center">
                  Free plan: 2 bios per day
                </p>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          <div className="space-y-4">
            {result && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Generated Bios</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {result.bios.map((bio, index) => (
                      <BioCard
                        key={index}
                        bio={bio}
                        index={index}
                        onPreview={handlePreview}
                      />
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t("bio_explanation")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {result.explanation}
                    </p>
                  </CardContent>
                </Card>
              </>
            )}

            {!result && !generating && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <UserCircle className="w-16 h-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    Fill in the form and click Generate Bio to create optimized bios
                  </p>
                </CardContent>
              </Card>
            )}

            {generating && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-16 h-16 text-primary animate-spin mb-4" />
                  <p className="text-muted-foreground">
                    Creating your perfect bios...
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Footer />

      <BrandVoiceDialog
        open={showBrandVoice}
        onClose={() => setShowBrandVoice(false)}
        onSave={fetchBrandVoice}
        currentTone={tone}
        currentKeywords={keywords}
      />

      <BioPreviewDialog
        open={showPreview}
        onClose={() => setShowPreview(false)}
        bioText={previewBio}
        platform={platform}
      />

      <PlanLimitDialog
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="AI Bio Optimizer"
      />
    </div>
  );
}
