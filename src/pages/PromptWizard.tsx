import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, Sparkles, ArrowRight, Info, CheckCircle2, RefreshCw } from "lucide-react";
import PromptWizardHeroHeader from "@/components/prompt-wizard/PromptWizardHeroHeader";

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
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Hero Header */}
          <PromptWizardHeroHeader />

          {/* Main Form Card - Glassmorphism */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="relative backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-8
                       shadow-[0_0_40px_hsla(var(--primary)/0.08)]"
          >
            {/* Internal Glow */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />
            
            <div className="relative space-y-6">
              {/* Card Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 
                                flex items-center justify-center shadow-[0_0_20px_hsla(var(--primary)/0.2)]">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">{t("wizard.infoTitle")}</h2>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5" />
                    {t("wizard.infoDescription")}
                  </p>
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="platform" className="text-sm font-medium">{t("wizard.platform")}</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger 
                      id="platform"
                      className="bg-muted/20 border-white/10 focus:border-primary/60 
                                 focus:ring-2 focus:ring-primary/20 h-12"
                    >
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
                  <Label htmlFor="goal" className="text-sm font-medium">{t("wizard.goal")}</Label>
                  <Select value={goal} onValueChange={setGoal}>
                    <SelectTrigger 
                      id="goal"
                      className="bg-muted/20 border-white/10 focus:border-primary/60 
                                 focus:ring-2 focus:ring-primary/20 h-12"
                    >
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
                  <Label htmlFor="businessType" className="text-sm font-medium">{t("wizard.businessType")}</Label>
                  <Input
                    id="businessType"
                    placeholder={t("wizard.businessPlaceholder")}
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className="bg-muted/20 border-white/10 focus:border-primary/60 
                               focus:ring-2 focus:ring-primary/20 h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tone" className="text-sm font-medium">{t("wizard.tone")}</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger 
                      id="tone"
                      className="bg-muted/20 border-white/10 focus:border-primary/60 
                                 focus:ring-2 focus:ring-primary/20 h-12"
                    >
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
                <Label htmlFor="keywords" className="text-sm font-medium">{t("wizard.keywords")}</Label>
                <Input
                  id="keywords"
                  placeholder={t("wizard.keywordsPlaceholder")}
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  className="bg-muted/20 border-white/10 focus:border-primary/60 
                             focus:ring-2 focus:ring-primary/20 h-12"
                />
              </div>

              {/* Generate Button with Shimmer */}
              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !platform || !goal || !businessType || !tone}
                  className="w-full h-14 text-base font-semibold relative overflow-hidden group
                             bg-gradient-to-r from-primary to-primary/80
                             hover:shadow-[0_0_30px_hsla(var(--primary)/0.4)]
                             transition-all duration-300 disabled:opacity-50"
                  size="lg"
                >
                  {/* Shimmer Effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent 
                                  translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {t("wizard.generating")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-5 w-5" />
                      {t("wizard.generate")}
                    </>
                  )}
                </Button>
              </motion.div>
            </div>
          </motion.div>

          {/* Results Card */}
          {optimizedPrompt && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="relative backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-8
                         shadow-[0_0_40px_hsla(var(--primary)/0.08)]"
            >
              {/* Internal Glow */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-500/5 via-transparent to-primary/5 pointer-events-none" />
              
              <div className="relative space-y-6">
                {/* Success Header */}
                <div className="flex items-center gap-3 mb-6">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.2, 1] }}
                    transition={{ duration: 0.5 }}
                    className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center
                               shadow-[0_0_20px_hsla(142,76%,36%,0.2)]"
                  >
                    <CheckCircle2 className="h-6 w-6 text-green-400" />
                  </motion.div>
                  <div>
                    <h2 className="text-xl font-semibold">{t("wizard.results")}</h2>
                    <p className="text-sm text-muted-foreground">Dein optimierter Prompt ist bereit</p>
                  </div>
                </div>

                {/* Optimized Prompt */}
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="space-y-2"
                >
                  <Label className="text-base font-semibold text-primary">{t("wizard.optimizedPrompt")}</Label>
                  <div className="p-4 rounded-xl bg-muted/20 border border-white/10">
                    <p className="whitespace-pre-wrap text-sm">{optimizedPrompt}</p>
                  </div>
                </motion.div>

                {/* Explanation */}
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-2"
                >
                  <Label className="text-base font-semibold text-primary">{t("wizard.whyItWorks")}</Label>
                  <div className="p-4 rounded-xl bg-muted/20 border border-white/10">
                    <p className="whitespace-pre-wrap text-sm">{explanation}</p>
                  </div>
                </motion.div>

                {/* Sample Caption */}
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-2"
                >
                  <Label className="text-base font-semibold text-primary">{t("wizard.example")}</Label>
                  <div className="p-4 rounded-xl bg-muted/20 border border-white/10">
                    <p className="whitespace-pre-wrap text-sm">{sampleCaption}</p>
                  </div>
                </motion.div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex-1">
                    <Button 
                      onClick={handleUseInGenerator} 
                      className="w-full h-12 bg-gradient-to-r from-primary to-primary/80
                                 hover:shadow-[0_0_20px_hsla(var(--primary)/0.3)]
                                 transition-all duration-300"
                      size="lg"
                    >
                      <ArrowRight className="mr-2 h-4 w-4" />
                      {t("wizard.useInGenerator")}
                    </Button>
                  </motion.div>
                  
                  <Button 
                    onClick={handleCopy} 
                    variant="outline" 
                    size="lg"
                    className="h-12 border-white/20 hover:bg-white/5 hover:border-primary/40"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t("wizard.copyPrompt")}
                  </Button>
                  
                  <Button 
                    onClick={handleNewIdea} 
                    variant="outline" 
                    size="lg"
                    className="h-12 border-white/20 hover:bg-white/5 hover:border-primary/40"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t("wizard.newIdea")}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PromptWizard;
