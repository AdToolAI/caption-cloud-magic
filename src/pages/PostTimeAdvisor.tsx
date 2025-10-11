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
import { Loader2, Copy, Clock, TrendingUp, Lightbulb, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PostTimeAdvisor = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [platform, setPlatform] = useState<string>("");
  const [timezone, setTimezone] = useState<string>("");
  const [niche, setNiche] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);

  const [times, setTimes] = useState<string[]>([]);
  const [explanation, setExplanation] = useState<string>("");
  const [tips, setTips] = useState<string[]>([]);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  useEffect(() => {
    // Auto-detect timezone
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(detectedTimezone);
  }, []);

  const handleAnalyze = async () => {
    if (!platform || !timezone) {
      toast({
        title: t("advisor.fillFields"),
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-posting-times", {
        body: {
          platform,
          timezone,
          niche,
          goal,
          language: t("common.language"),
        },
      });

      if (error) {
        if (error.message?.includes('LIMIT_REACHED')) {
          setShowLimitModal(true);
          return;
        }
        throw error;
      }

      setTimes(data.times || []);
      setExplanation(data.explanation || "");
      setTips(data.tips || []);

      toast({
        title: t("advisor.success"),
      });
    } catch (error) {
      console.error("Error analyzing times:", error);
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopy = async () => {
    const text = times.join('\n');
    await navigator.clipboard.writeText(text);
    toast({
      title: t("advisor.copied"),
    });
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-secondary/20">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              {t("advisor.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("advisor.subtitle")}
            </p>
          </div>

          <Card className="border-primary/20 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                {t("advisor.infoTitle")}
              </CardTitle>
              <CardDescription className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{t("advisor.infoDescription")}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="platform">{t("advisor.platform")}</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger id="platform">
                        <SelectValue placeholder={t("advisor.selectPlatform")} />
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
                    <Label htmlFor="timezone">{t("advisor.timezone")}</Label>
                    <Input
                      id="timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      placeholder="Europe/Berlin"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="niche">{t("advisor.niche")}</Label>
                    <Input
                      id="niche"
                      placeholder={t("advisor.nichePlaceholder")}
                      value={niche}
                      onChange={(e) => setNiche(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="goal">{t("advisor.goal")}</Label>
                    <Select value={goal} onValueChange={setGoal}>
                      <SelectTrigger id="goal">
                        <SelectValue placeholder={t("advisor.selectGoal")} />
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

                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || !platform || !timezone}
                    className="w-full"
                    size="lg"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("advisor.analyzing")}
                      </>
                    ) : (
                      <>
                        <Clock className="mr-2 h-4 w-4" />
                        {t("advisor.analyze")}
                      </>
                    )}
                  </Button>
                </div>

                {times.length > 0 && (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary" />
                          {t("advisor.bestTimes")}
                        </Label>
                        <Button onClick={handleCopy} variant="outline" size="sm">
                          <Copy className="mr-2 h-3 w-3" />
                          {t("wizard.copyPrompt")}
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {times.map((time, index) => (
                          <div key={index} className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                            <p className="font-medium">{time}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        {t("advisor.whyWorks")}
                      </Label>
                      <div className="p-4 bg-secondary/50 rounded-lg border border-border">
                        <p className="whitespace-pre-wrap">{explanation}</p>
                      </div>
                    </div>

                    {tips.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-base font-semibold flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-primary" />
                          {t("advisor.proTip")}
                        </Label>
                        <div className="space-y-2">
                          {tips.map((tip, index) => (
                            <div key={index} className="p-3 bg-secondary/50 rounded-lg border border-border italic">
                              <p>{tip}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={showLimitModal} onOpenChange={setShowLimitModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("generator.limit_reached_title")}</DialogTitle>
            <DialogDescription>
              {t("advisor.limitMessage")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLimitModal(false)}>
              {t("common.close")}
            </Button>
            <Button onClick={() => navigate("/#pricing")}>
              {t("generator.btn_upgrade")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default PostTimeAdvisor;