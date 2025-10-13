import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Lightbulb, Target, MessageSquare } from "lucide-react";

interface PerformanceScoresProps {
  hookScore?: number;
  hookTip?: string;
  readabilityScore?: number;
  ctaScore?: number;
}

export const PerformanceScores = ({ 
  hookScore = 0, 
  hookTip = "", 
  readabilityScore = 0, 
  ctaScore = 0 
}: PerformanceScoresProps) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-warning";
    return "text-danger";
  };

  const getScoreBadge = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Needs Work";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Performance Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hook Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Hook Score</span>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getScoreColor(hookScore)}`}>
                {hookScore}
              </span>
              <Badge variant={hookScore >= 80 ? "default" : "secondary"}>
                {getScoreBadge(hookScore)}
              </Badge>
            </div>
          </div>
          <Progress value={hookScore} className="h-2" />
          {hookTip && (
            <div className="flex gap-2 p-3 bg-muted rounded-lg text-sm">
              <Lightbulb className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{hookTip}</span>
            </div>
          )}
        </div>

        {/* Readability Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Lesbarkeit</span>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getScoreColor(readabilityScore)}`}>
                {readabilityScore}
              </span>
              <Badge variant={readabilityScore >= 80 ? "default" : "secondary"}>
                {getScoreBadge(readabilityScore)}
              </Badge>
            </div>
          </div>
          <Progress value={readabilityScore} className="h-2" />
        </div>

        {/* CTA Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">CTA Klarheit</span>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getScoreColor(ctaScore)}`}>
                {ctaScore}
              </span>
              <Badge variant={ctaScore >= 80 ? "default" : "secondary"}>
                {getScoreBadge(ctaScore)}
              </Badge>
            </div>
          </div>
          <Progress value={ctaScore} className="h-2" />
        </div>

        {/* Success Checklist */}
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Success Checklist
          </h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className={hookScore >= 70 ? "text-success" : "text-muted-foreground"}>
                {hookScore >= 70 ? "✓" : "○"}
              </span>
              <span>Starker Hook</span>
            </li>
            <li className="flex items-center gap-2">
              <span className={readabilityScore >= 80 ? "text-success" : "text-muted-foreground"}>
                {readabilityScore >= 80 ? "✓" : "○"}
              </span>
              <span>Gut lesbar</span>
            </li>
            <li className="flex items-center gap-2">
              <span className={ctaScore >= 70 ? "text-success" : "text-muted-foreground"}>
                {ctaScore >= 70 ? "✓" : "○"}
              </span>
              <span>Klare Handlungsaufforderung</span>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};