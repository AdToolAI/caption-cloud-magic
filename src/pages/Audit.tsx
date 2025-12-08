import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Loader2, SearchCheck, TrendingUp, MessageSquare, Lightbulb, Type, FileText } from "lucide-react";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { AuditHeroHeader } from "@/components/audit/AuditHeroHeader";

interface AuditCaption {
  original_text: string;
  word_count: number;
  reading_level: string;
  emotion: string;
  cta_strength: string;
  engagement_score: number;
  summary: string;
  suggestions: string[];
}

interface AuditResult {
  captions: AuditCaption[];
  overall_feedback: string;
  language: string;
}

export default function Audit() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [captionText, setCaptionText] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [showLimitDialog, setShowLimitDialog] = useState(false);

  const captionCount = captionText.split("---").filter(c => c.trim()).length;

  const handleAnalyze = async () => {
    if (!captionText.trim()) {
      toast({
        title: t("error"),
        description: "Please enter at least one caption",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setResult(null);
    setAvgScore(null);

    try {
      const captions = captionText
        .split("---")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      const { data: functionData, error: functionError } = await supabase.functions.invoke(
        "analyze-audit",
        {
          body: {
            captions,
            platform,
            language: t("language"),
          },
        }
      );

      if (functionError) {
        if (functionError.message?.includes("Daily limit reached")) {
          setShowLimitDialog(true);
          return;
        }
        throw functionError;
      }

      setResult(functionData.result);
      setAvgScore(functionData.avg_score);

      toast({
        title: t("success"),
        description: "Analysis complete!",
      });
    } catch (error) {
      console.error("Analysis error:", error);
      toast({
        title: t("error"),
        description: error instanceof Error ? error.message : "Failed to analyze captions",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "from-green-500/20 to-emerald-500/20";
    if (score >= 60) return "from-yellow-500/20 to-orange-500/20";
    return "from-red-500/20 to-rose-500/20";
  };

  const getCtaBadgeVariant = (strength: string) => {
    if (strength === "Strong") return "default";
    if (strength === "Weak") return "secondary";
    return "destructive";
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <AuditHeroHeader captionCount={captionCount > 0 && captionText.trim() ? captionCount : 0} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Input Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                     shadow-[0_0_40px_hsla(43,90%,68%,0.08)] lg:col-span-2"
        >
          {/* Card Title with Icon-Box */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20
                            flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.2)]">
              <Type className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{t("audit_input_label")}</h3>
              <p className="text-sm text-muted-foreground">
                Trenne mehrere Captions mit "---" (max. 10)
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <Textarea
              placeholder={t("audit_input_placeholder")}
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              className="min-h-[200px] bg-muted/20 border-white/10 focus:border-primary/60
                         focus:ring-2 focus:ring-primary/20 rounded-xl resize-none"
              maxLength={2500}
            />

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  {t("audit_platform_label")}
                </label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="bg-muted/20 border-white/10 focus:border-primary/60
                                           focus:ring-2 focus:ring-primary/20 h-12 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Instagram">Instagram</SelectItem>
                    <SelectItem value="TikTok">TikTok</SelectItem>
                    <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                    <SelectItem value="Facebook">Facebook</SelectItem>
                    <SelectItem value="X">X (Twitter)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !captionText.trim()}
                  size="lg"
                  className="group relative overflow-hidden bg-gradient-to-r from-primary to-primary/80
                             h-12 rounded-xl shadow-[0_0_20px_hsla(43,90%,68%,0.3)]
                             hover:shadow-[0_0_30px_hsla(43,90%,68%,0.5)] transition-all duration-300"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent
                                   -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("audit_analyzing")}
                    </>
                  ) : (
                    <>
                      <SearchCheck className="mr-2 h-4 w-4" />
                      {t("audit_analyze_button")}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Average Score Card */}
        {avgScore !== null ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                       shadow-[0_0_40px_hsla(43,90%,68%,0.12)]"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getScoreBg(avgScore)}
                              flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.2)]`}>
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">{t("audit_avg_score")}</h3>
            </div>

            {/* Animated Score Ring */}
            <div className="relative mx-auto w-32 h-32 mb-4">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
                <defs>
                  <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="100%" stopColor="hsl(187, 85%, 53%)" />
                  </linearGradient>
                </defs>
                <circle 
                  cx="64" cy="64" r="56" 
                  stroke="currentColor" 
                  strokeWidth="8"
                  fill="none" 
                  className="text-muted/20" 
                />
                <motion.circle
                  cx="64" cy="64" r="56"
                  stroke="url(#scoreGradient)"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: avgScore / 100 }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  style={{ 
                    strokeDasharray: "351.86",
                    strokeDashoffset: 0,
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.span 
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className={`text-4xl font-bold ${getScoreColor(avgScore)}`}
                >
                  {avgScore.toFixed(0)}
                </motion.span>
              </div>
            </div>

            <p className="text-sm text-muted-foreground text-center">
              {avgScore >= 80 && "Exzellentes Engagement-Potenzial"}
              {avgScore >= 60 && avgScore < 80 && "Gut, mit Raum für Verbesserungen"}
              {avgScore < 60 && "Benötigt Optimierung"}
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="backdrop-blur-xl bg-card/30 border border-white/5 rounded-2xl p-6
                       flex flex-col items-center justify-center text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center mb-4">
              <TrendingUp className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              Dein Durchschnitts-Score erscheint hier nach der Analyse
            </p>
          </motion.div>
        )}
      </div>

      {/* Analyzing State */}
      {isAnalyzing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-8 backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-12 text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/30 to-cyan-500/30
                       flex items-center justify-center shadow-[0_0_30px_hsla(43,90%,68%,0.3)]"
          >
            <SearchCheck className="h-8 w-8 text-primary" />
          </motion.div>
          <p className="text-lg text-muted-foreground">{t("audit_analyzing")}</p>
          <p className="text-sm text-muted-foreground/60 mt-2">
            KI analysiert {captionCount} Caption{captionCount !== 1 ? 's' : ''}...
          </p>
        </motion.div>
      )}

      {/* Results Section */}
      {result && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 space-y-6"
        >
          {/* Overall Feedback */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                       shadow-[0_0_30px_hsla(43,90%,68%,0.08)]"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20
                              flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.2)]">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">{t("audit_overall_feedback")}</h3>
            </div>
            <p className="text-muted-foreground leading-relaxed">{result.overall_feedback}</p>
          </motion.div>

          {/* Individual Caption Analysis */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                       shadow-[0_0_30px_hsla(43,90%,68%,0.08)]"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20
                              flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.2)]">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{t("audit_results_title")}</h3>
                <p className="text-sm text-muted-foreground">
                  Detaillierte Analyse für {result.captions.length} Caption{result.captions.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <Accordion type="single" collapsible className="w-full space-y-3">
              {result.captions.map((caption, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                >
                  <AccordionItem 
                    value={`caption-${index}`}
                    className="border border-white/10 rounded-xl overflow-hidden bg-muted/10
                               hover:bg-muted/20 transition-colors"
                  >
                    <AccordionTrigger className="hover:no-underline px-4 py-4">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-4 flex-1">
                          {/* Score Circle */}
                          <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${getScoreBg(caption.engagement_score)}
                                          flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.15)]
                                          border border-white/10`}>
                            <span className={`text-xl font-bold ${getScoreColor(caption.engagement_score)}`}>
                              {caption.engagement_score}
                            </span>
                          </div>
                          
                          <div className="text-left flex-1">
                            <p className="font-medium text-sm line-clamp-1 mb-2">
                              {caption.original_text.substring(0, 60)}...
                            </p>
                            <div className="flex gap-2 flex-wrap">
                              <Badge 
                                variant="outline" 
                                className="text-xs bg-primary/10 text-primary border-primary/30
                                           shadow-[0_0_8px_hsla(43,90%,68%,0.15)]"
                              >
                                {caption.emotion}
                              </Badge>
                              <Badge 
                                variant={getCtaBadgeVariant(caption.cta_strength)} 
                                className="text-xs"
                              >
                                CTA: {caption.cta_strength}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-4 pt-2">
                        {/* Original Text Box */}
                        <div className="bg-muted/20 border border-white/10 p-4 rounded-xl">
                          <p className="text-sm leading-relaxed">{caption.original_text}</p>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-muted/10 border border-white/5 rounded-xl p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">
                              {t("audit_word_count")}
                            </p>
                            <p className="font-bold text-primary">{caption.word_count}</p>
                          </div>
                          <div className="bg-muted/10 border border-white/5 rounded-xl p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">
                              {t("audit_reading_level")}
                            </p>
                            <p className="font-bold text-cyan-400">{caption.reading_level}</p>
                          </div>
                          <div className="bg-muted/10 border border-white/5 rounded-xl p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">
                              {t("audit_emotion")}
                            </p>
                            <p className="font-bold text-purple-400">{caption.emotion}</p>
                          </div>
                          <div className="bg-muted/10 border border-white/5 rounded-xl p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">
                              {t("audit_cta_strength")}
                            </p>
                            <p className="font-bold text-primary">{caption.cta_strength}</p>
                          </div>
                        </div>

                        {/* Summary */}
                        <div className="bg-muted/10 border border-white/5 rounded-xl p-4">
                          <p className="text-sm text-muted-foreground">{caption.summary}</p>
                        </div>

                        {/* Suggestions */}
                        <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 
                                        border border-yellow-500/20 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center
                                            shadow-[0_0_12px_hsla(45,90%,60%,0.3)]">
                              <Lightbulb className="h-4 w-4 text-yellow-400" />
                            </div>
                            <p className="font-semibold text-yellow-400">{t("audit_suggestions")}</p>
                          </div>
                          <ul className="space-y-2">
                            {caption.suggestions.map((suggestion, i) => (
                              <motion.li
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex gap-2 text-sm text-muted-foreground"
                              >
                                <span className="text-yellow-400">•</span>
                                <span>{suggestion}</span>
                              </motion.li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>
          </motion.div>
        </motion.div>
      )}

      <PlanLimitDialog
        open={showLimitDialog}
        onOpenChange={setShowLimitDialog}
        feature="Content Audit"
      />
    </div>
  );
}
