import { dateFnsLocale } from '@/lib/uiLocale';
import { tx } from "@/lib/i18nText";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertCircle, CheckCircle, Trophy, Target, ScanSearch } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface ConsistencyScoreProps {
  score: number | null;
  brandKit: any;
}

export function ConsistencyScore({ score, brandKit }: ConsistencyScoreProps) {
  const { data: recentChecks = [] } = useQuery({
    queryKey: ['consistency-recent', brandKit.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brand_consistency_history')
        .select('*')
        .eq('brand_kit_id', brandKit.id)
        .order('analyzed_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data || [];
    }
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return tx({ de: "Exzellent", en: "Excellent", es: "Excelente" });
    if (score >= 80) return tx({ de: "Sehr gut", en: "Very good", es: "Muy bueno" });
    if (score >= 70) return tx({ de: "Gut", en: "Good", es: "Bueno" });
    if (score >= 60) return tx({ de: "Akzeptabel", en: "Acceptable", es: "Aceptable" });
    return tx({ de: "Verbesserung nötig", en: "Improvement needed", es: "Mejora necesaria" });
  };

  // Real feedback extracted from analyzed content, when available.
  const realFeedbackItems: string[] = recentChecks
    .flatMap((check: any) => {
      const fb = check?.feedback;
      if (!fb) return [];
      if (Array.isArray(fb?.suggestions)) return fb.suggestions;
      if (Array.isArray(fb)) return fb;
      if (typeof fb?.text === "string") return [fb.text];
      return [];
    })
    .filter((t: any) => typeof t === "string" && t.trim().length > 0)
    .slice(0, 4);

  const hasRealFeedback = realFeedbackItems.length > 0;

  const genericSuggestions = [
    {
      icon: score !== null && score >= 80 ? CheckCircle : AlertCircle,
      text: score !== null && score >= 80
        ? tx({ de: "Deine Marke ist konsistent! Weiter so!", en: "Your brand is consistent! Keep it up!", es: "¡Tu marca es consistente! ¡Sigue así!" })
        : tx({ de: "Nutze deine Primärfarbe häufiger in Posts", en: "Use your primary color more often in posts", es: "Usa tu color primario con más frecuencia en las publicaciones" })
    },
    {
      icon: TrendingUp,
      text: tx({ de: `Tonalität "${brandKit.brand_tone}" beibehalten`, en: `Maintain tonality "${brandKit.brand_tone}"`, es: `Mantener la tonalidad "${brandKit.brand_tone}"` })
    },
    {
      icon: TrendingUp,
      text: tx({ de: "Empfohlene Hashtags in jedem Post verwenden", en: "Use recommended hashtags in every post", es: "Usar hashtags recomendados en cada publicación" })
    }
  ];

  const hasMasterBadge = score !== null && score >= 90;
  const hasProBadge = score !== null && score >= 80;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Brand Consistency Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          {score === null ? (
            <>
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ScanSearch className="h-10 w-10" />
                <div className="text-lg font-semibold">
                  {tx({ de: "Noch nicht analysiert", en: "Not analyzed yet", es: "Aún no analizado" })}
                </div>
                <p className="text-xs max-w-xs">
                  {tx({ de: "Führe einen Scan durch, um einen echten Consistency Score für dieses Marken-Set zu erhalten.", en: "Run a scan to get a real consistency score for this brand kit.", es: "Ejecuta un análisis para obtener una puntuación de consistencia real para este kit de marca." })}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className={`text-6xl font-bold ${getScoreColor(score)}`}>
                {score}
              </div>
              <Badge variant="secondary" className="mt-2">
                {getScoreLabel(score)}
              </Badge>
            </>
          )}

          {(hasMasterBadge || hasProBadge) && (
            <div className="flex justify-center gap-2 mt-3">
              {hasMasterBadge && (
                <Badge variant="default" className="bg-gradient-to-r from-yellow-500 to-orange-500">
                  <Trophy className="h-3 w-3 mr-1" />
                  Brand Master
                </Badge>
              )}
              {hasProBadge && !hasMasterBadge && (
                <Badge variant="default" className="bg-gradient-to-r from-blue-500 to-purple-500">
                  <Target className="h-3 w-3 mr-1" />
                  Brand Pro
                </Badge>
              )}
            </div>
          )}
        </div>

        {score !== null && (
          <div>
            <Progress value={score} className="h-3" />
            <p className="text-xs text-muted-foreground text-center mt-2">
              {tx({ de: `Basierend auf ${recentChecks.length} ${recentChecks.length === 1 ? "Analyse" : "Analysen"}`, en: `Based on ${recentChecks.length} ${recentChecks.length === 1 ? "analysis" : "analyses"}`, es: `Basado en ${recentChecks.length} ${recentChecks.length === 1 ? "análisis" : "análisis"}` })}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">
            {hasRealFeedback
              ? tx({ de: "Verbesserungsvorschläge (aus deiner Analyse):", en: "Suggestions for improvement (from your analysis):", es: "Sugerencias de mejora (de tu análisis):" })
              : tx({ de: "Generische Tipps — nicht auf Basis deiner Inhalte:", en: "Generic tips — not based on your content:", es: "Consejos genéricos — no basados en tu contenido:" })}
          </p>
          {hasRealFeedback
            ? realFeedbackItems.map((text, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 mt-0.5 text-primary" />
                  <span>{text}</span>
                </div>
              ))
            : genericSuggestions.map((suggestion, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <suggestion.icon className="h-4 w-4 mt-0.5" />
                  <span>{suggestion.text}</span>
                </div>
              ))}
        </div>

        {recentChecks.length > 0 && (
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-2">{tx({ de: "Letzte Analysen", en: "Recent analyses", es: "Análisis recientes" })}</p>
            <div className="space-y-2">
              {recentChecks.slice(0, 3).map((check: any) => (
                <div key={check.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{check.content_type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(check.analyzed_at), 'dd.MM.', { locale: dateFnsLocale() })}
                    </span>
                  </div>
                  <span className={`font-semibold ${
                    check.score >= 80 ? 'text-green-500' : 
                    check.score >= 60 ? 'text-yellow-500' : 'text-red-500'
                  }`}>
                    {check.score}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}