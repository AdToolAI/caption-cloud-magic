import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Brain, Loader2, TrendingUp, AlertTriangle, Lightbulb, Target } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface AnalysisResult {
  strengths: string[];
  weaknesses: string[];
  tips: string[];
  strategy: string;
}

export function AIStrategyPanel() {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [rawMarkdown, setRawMarkdown] = useState<string>("");

  const runAnalysis = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-performance-strategy", {
        body: {},
      });

      if (error) {
        if ((error as any)?.status === 429) {
          toast.error("Zu viele Anfragen. Bitte versuche es später erneut.");
          return;
        }
        if ((error as any)?.status === 402) {
          toast.error("Credits aufgebraucht. Bitte lade dein Konto auf.");
          return;
        }
        throw error;
      }

      if (data?.analysis) {
        setAnalysis(data.analysis);
        setRawMarkdown(data.rawMarkdown || "");
      }
      toast.success("KI-Analyse abgeschlossen!");
    } catch (err: any) {
      console.error("Analysis error:", err);
      toast.error(`Fehler bei der Analyse: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!analysis) {
    return (
      <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <Brain className="h-12 w-12 text-primary" />
          <h3 className="text-xl font-semibold">KI-Performance-Analyse</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Lass die KI deine Social-Media-Daten auswerten und erhalte personalisierte 
            Tipps zur kosteneffizienten Steigerung deiner Performance.
          </p>
          <Button onClick={runAnalysis} disabled={loading} size="lg">
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Brain className="h-4 w-4 mr-2" />
            )}
            {loading ? "Analysiere..." : "Jetzt analysieren"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          KI-Analyse Ergebnis
        </h3>
        <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Erneut analysieren"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-green-500/20 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Stärken
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {analysis.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Verbesserungspotenzial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {analysis.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-orange-500 mt-0.5">!</span>
                  {w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            Konkrete Tipps
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {analysis.tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-bold text-primary">{i + 1}.</span>
                {tip}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4" />
            Strategie-Empfehlung
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{analysis.strategy}</ReactMarkdown>
        </CardContent>
      </Card>
    </div>
  );
}
