import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, Sparkles, ArrowRight, Info } from "lucide-react";

const PromptWizard = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [platform, setPlatform] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const [businessType, setBusinessType] = useState<string>("");
  const [tone, setTone] = useState<string>("");
  const [keywords, setKeywords] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [optimizedPrompt, setOptimizedPrompt] = useState<string>("");
  const [explanation, setExplanation] = useState<string>("");
  const [sampleCaption, setSampleCaption] = useState<string>("");

  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  const handleGenerate = async () => {
    if (!platform || !goal || !businessType || !tone) {
      toast({
        title: t("wizard.fillFields"),
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-optimized-prompt", {
        body: {
          platform,
          goal,
          tone,
          businessType,
          keywords,
          language: t("common.language"),
        },
      });

      if (error) throw error;

      setOptimizedPrompt(data.optimizedPrompt);
      setExplanation(data.explanation);
      setSampleCaption(data.sampleCaption);

      toast({
        title: t("wizard.success"),
      });
    } catch (error) {
      console.error("Error generating prompt:", error);
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(optimizedPrompt);
    toast({
      title: t("wizard.copied"),
    });
  };

  const handleUseInGenerator = () => {
    localStorage.setItem("wizardPrompt", optimizedPrompt);
    navigate("/generator");
  };

  const handleNewIdea = () => {
    setOptimizedPrompt("");
    setExplanation("");
    setSampleCaption("");
    setPlatform("");
    setGoal("");
    setBusinessType("");
    setTone("");
    setKeywords("");
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-secondary/20">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {t("wizard.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("wizard.subtitle")}
            </p>
          </div>

          <Card className="border-primary/20 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {t("wizard.infoTitle")}
              </CardTitle>
              <CardDescription className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{t("wizard.infoDescription")}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="platform">{t("wizard.platform")}</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger id="platform">
                      <SelectValue placeholder={t("wizard.selectPlatform")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="x">X (Twitter)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="goal">{t("wizard.goal")}</Label>
                  <Select value={goal} onValueChange={setGoal}>
                    <SelectTrigger id="goal">
                      <SelectValue placeholder={t("wizard.selectGoal")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reach">{t("wizard.moreReach")}</SelectItem>
                      <SelectItem value="engagement">{t("wizard.engagement")}</SelectItem>
                      <SelectItem value="sales">{t("wizard.sales")}</SelectItem>
                      <SelectItem value="awareness">{t("wizard.awareness")}</SelectItem>
                      <SelectItem value="growth">{t("wizard.growth")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="businessType">{t("wizard.businessType")}</Label>
                  <Input
                    id="businessType"
                    placeholder={t("wizard.businessPlaceholder")}
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tone">{t("wizard.tone")}</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger id="tone">
                      <SelectValue placeholder={t("wizard.selectTone")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="friendly">{t("common.friendly")}</SelectItem>
                      <SelectItem value="professional">{t("common.professional")}</SelectItem>
                      <SelectItem value="funny">{t("common.funny")}</SelectItem>
                      <SelectItem value="inspirational">{t("common.inspirational")}</SelectItem>
                      <SelectItem value="bold">{t("common.bold")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="keywords">{t("wizard.keywords")}</Label>
                <Input
                  id="keywords"
                  placeholder={t("wizard.keywordsPlaceholder")}
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                />
              </div>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !platform || !goal || !businessType || !tone}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("wizard.generating")}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {t("wizard.generate")}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {optimizedPrompt && (
            <Card className="border-primary/20 shadow-lg">
              <CardHeader>
                <CardTitle>{t("wizard.results")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-base font-semibold">{t("wizard.optimizedPrompt")}</Label>
                  <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                    <p className="whitespace-pre-wrap">{optimizedPrompt}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-semibold">{t("wizard.whyItWorks")}</Label>
                  <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                    <p className="whitespace-pre-wrap">{explanation}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-semibold">{t("wizard.example")}</Label>
                  <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                    <p className="whitespace-pre-wrap">{sampleCaption}</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button onClick={handleUseInGenerator} className="flex-1" size="lg">
                    <ArrowRight className="mr-2 h-4 w-4" />
                    {t("wizard.useInGenerator")}
                  </Button>
                  <Button onClick={handleCopy} variant="outline" size="lg">
                    <Copy className="mr-2 h-4 w-4" />
                    {t("wizard.copyPrompt")}
                  </Button>
                  <Button onClick={handleNewIdea} variant="outline" size="lg">
                    <Sparkles className="mr-2 h-4 w-4" />
                    {t("wizard.newIdea")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PromptWizard;