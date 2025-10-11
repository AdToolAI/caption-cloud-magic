import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Loader2, SearchCheck, TrendingUp, MessageSquare, Lightbulb } from "lucide-react";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";

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
      // Split captions by separator
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
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getCtaBadgeVariant = (strength: string) => {
    if (strength === "Strong") return "default";
    if (strength === "Weak") return "secondary";
    return "destructive";
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <SearchCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">{t("audit_title")}</h1>
          <p className="text-muted-foreground">{t("audit_subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Input Section */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("audit_input_label")}</CardTitle>
            <CardDescription>
              Separate multiple captions with "---" (up to 10 captions)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder={t("audit_input_placeholder")}
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              className="min-h-[200px]"
              maxLength={2500}
            />

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">
                  {t("audit_platform_label")}
                </label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger>
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
                  className="w-full"
                >
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
          </CardContent>
        </Card>

        {/* Average Score Card */}
        {avgScore !== null && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {t("audit_avg_score")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className={`text-5xl font-bold mb-2 ${getScoreColor(avgScore)}`}>
                  {avgScore.toFixed(0)}
                </div>
                <Progress value={avgScore} className="h-3 mb-4" />
                <p className="text-sm text-muted-foreground">
                  {avgScore >= 80 && "Excellent engagement potential"}
                  {avgScore >= 60 && avgScore < 80 && "Good, with room for improvement"}
                  {avgScore < 60 && "Needs optimization"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Results Section */}
      {result && (
        <div className="mt-8 space-y-6">
          {/* Overall Feedback */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {t("audit_overall_feedback")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">{result.overall_feedback}</p>
            </CardContent>
          </Card>

          {/* Individual Caption Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>{t("audit_results_title")}</CardTitle>
              <CardDescription>
                Detailed analysis for each caption ({result.captions.length} total)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {result.captions.map((caption, index) => (
                  <AccordionItem key={index} value={`caption-${index}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`text-2xl font-bold ${getScoreColor(caption.engagement_score)}`}>
                            {caption.engagement_score}
                          </div>
                          <div className="text-left flex-1">
                            <p className="font-medium text-sm line-clamp-1">
                              {caption.original_text.substring(0, 60)}...
                            </p>
                            <div className="flex gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {caption.emotion}
                              </Badge>
                              <Badge variant={getCtaBadgeVariant(caption.cta_strength)} className="text-xs">
                                CTA: {caption.cta_strength}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-4">
                        <div className="bg-muted p-4 rounded-lg">
                          <p className="text-sm">{caption.original_text}</p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              {t("audit_word_count")}
                            </p>
                            <p className="font-semibold">{caption.word_count}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              {t("audit_reading_level")}
                            </p>
                            <p className="font-semibold">{caption.reading_level}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              {t("audit_emotion")}
                            </p>
                            <p className="font-semibold">{caption.emotion}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">
                              {t("audit_cta_strength")}
                            </p>
                            <p className="font-semibold">{caption.cta_strength}</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-2">{caption.summary}</p>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Lightbulb className="h-4 w-4 text-yellow-500" />
                            <p className="text-sm font-semibold">{t("audit_suggestions")}</p>
                          </div>
                          <ul className="space-y-2">
                            {caption.suggestions.map((suggestion, i) => (
                              <li key={i} className="text-sm text-muted-foreground flex gap-2">
                                <span>•</span>
                                <span>{suggestion}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      )}

      <PlanLimitDialog
        open={showLimitDialog}
        onOpenChange={setShowLimitDialog}
        feature="Content Audit"
      />
    </div>
  );
}
