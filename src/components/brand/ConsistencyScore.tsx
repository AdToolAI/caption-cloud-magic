import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertCircle, CheckCircle, Trophy, Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface ConsistencyScoreProps {
  score: number;
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
    if (score >= 90) return "Exzellent";
    if (score >= 80) return "Sehr gut";
    if (score >= 70) return "Gut";
    if (score >= 60) return "Akzeptabel";
    return "Verbesserung nötig";
  };

  const suggestions = [
    {
      type: score >= 80 ? "success" : "tip",
      icon: score >= 80 ? CheckCircle : AlertCircle,
      text: score >= 80 
        ? "Deine Marke ist konsistent! Weiter so!" 
        : "Nutze deine Primärfarbe häufiger in Posts"
    },
    {
      type: "tip",
      icon: TrendingUp,
      text: `Tonalität "${brandKit.brand_tone}" beibehalten`
    },
    {
      type: "tip",
      icon: TrendingUp,
      text: "Empfohlene Hashtags in jedem Post verwenden"
    }
  ];

  const hasMasterBadge = score >= 90;
  const hasProBadge = score >= 80;

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
          <div className={`text-6xl font-bold ${getScoreColor(score)}`}>
            {score}
          </div>
          <Badge variant="secondary" className="mt-2">
            {getScoreLabel(score)}
          </Badge>

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

        <div>
          <Progress value={score} className="h-3" />
          <p className="text-xs text-muted-foreground text-center mt-2">
            Basierend auf {recentChecks.length} {recentChecks.length === 1 ? 'Analyse' : 'Analysen'}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Verbesserungsvorschläge:</p>
          {suggestions.map((suggestion, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm">
              <suggestion.icon className={`h-4 w-4 mt-0.5 ${
                suggestion.type === "success" ? "text-green-500" : "text-primary"
              }`} />
              <span>{suggestion.text}</span>
            </div>
          ))}
        </div>

        {recentChecks.length > 0 && (
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-2">Letzte Analysen</p>
            <div className="space-y-2">
              {recentChecks.slice(0, 3).map((check: any) => (
                <div key={check.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{check.content_type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(check.analyzed_at), 'dd.MM.', { locale: de })}
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