import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertCircle, CheckCircle } from "lucide-react";

interface ConsistencyScoreProps {
  score: number;
  brandKit: any;
}

export function ConsistencyScore({ score, brandKit }: ConsistencyScoreProps) {
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
        </div>

        <div>
          <Progress value={score} className="h-3" />
          <p className="text-xs text-muted-foreground text-center mt-2">
            Basierend auf deinen letzten Inhalten
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
      </CardContent>
    </Card>
  );
}
