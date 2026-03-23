import { useState } from "react";
import { motion } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, CheckCircle2, ArrowRight, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface PromptAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (prompt: string) => void;
}

export function PromptAssistantDialog({ open, onOpenChange, onApply }: PromptAssistantDialogProps) {
  const { t } = useTranslation();

  const [platform, setPlatform] = useState("");
  const [goal, setGoal] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [tone, setTone] = useState("");
  const [keywords, setKeywords] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [explanation, setExplanation] = useState("");
  const [sampleCaption, setSampleCaption] = useState("");

  const handleGenerate = async () => {
    if (!platform || !goal || !businessType || !tone) {
      toast.error(t("wizard.fillFields"));
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
      toast.success(t("wizard.success"));
    } catch (error: any) {
      console.error("Error generating prompt:", error);
      toast.error(error.message || t("common.error"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    onApply(optimizedPrompt);
    onOpenChange(false);
    toast.success("Prompt übernommen!");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(optimizedPrompt);
    toast.success(t("wizard.copied"));
  };

  const handleReset = () => {
    setOptimizedPrompt("");
    setExplanation("");
    setSampleCaption("");
    setPlatform("");
    setGoal("");
    setBusinessType("");
    setTone("");
    setKeywords("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-card/95 backdrop-blur-xl border-white/10">
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("wizard.infoTitle")}
          </SheetTitle>
          <SheetDescription>{t("wizard.infoDescription")}</SheetDescription>
        </SheetHeader>

        {!optimizedPrompt ? (
          <div className="space-y-4">
            {/* Platform */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("wizard.platform")}</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="bg-muted/20 border-white/10 h-11">
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

            {/* Goal */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("wizard.goal")}</Label>
              <Select value={goal} onValueChange={setGoal}>
                <SelectTrigger className="bg-muted/20 border-white/10 h-11">
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

            {/* Business Type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("wizard.businessType")}</Label>
              <Input
                placeholder={t("wizard.businessPlaceholder")}
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="bg-muted/20 border-white/10 h-11"
              />
            </div>

            {/* Tone */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("wizard.tone")}</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="bg-muted/20 border-white/10 h-11">
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

            {/* Keywords */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("wizard.keywords")}</Label>
              <Input
                placeholder={t("wizard.keywordsPlaceholder")}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="bg-muted/20 border-white/10 h-11"
              />
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !platform || !goal || !businessType || !tone}
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/80"
              size="lg"
            >
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
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Success Header */}
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">{t("wizard.results")}</span>
            </div>

            {/* Optimized Prompt */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-primary">{t("wizard.optimizedPrompt")}</Label>
              <div className="p-3 rounded-xl bg-muted/20 border border-white/10">
                <p className="whitespace-pre-wrap text-sm">{optimizedPrompt}</p>
              </div>
            </div>

            {/* Explanation */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-primary">{t("wizard.whyItWorks")}</Label>
              <div className="p-3 rounded-xl bg-muted/20 border border-white/10">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{explanation}</p>
              </div>
            </div>

            {/* Sample Caption */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold text-primary">{t("wizard.example")}</Label>
              <div className="p-3 rounded-xl bg-muted/20 border border-white/10">
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{sampleCaption}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={handleApply} className="w-full h-11 bg-gradient-to-r from-primary to-primary/80" size="lg">
                <ArrowRight className="mr-2 h-4 w-4" />
                In Generator übernehmen
              </Button>
              <div className="flex gap-2">
                <Button onClick={handleCopy} variant="outline" className="flex-1 h-10 border-white/20">
                  <Copy className="mr-2 h-4 w-4" />
                  {t("wizard.copyPrompt")}
                </Button>
                <Button onClick={handleReset} variant="outline" className="flex-1 h-10 border-white/20">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("wizard.newIdea")}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </SheetContent>
    </Sheet>
  );
}
