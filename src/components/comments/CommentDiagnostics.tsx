import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  Target,
  Lightbulb
} from "lucide-react";

interface DiagnosticsData {
  mood: string;
  risk: string;
  generalStatement: string;
  recommendations: Array<{
    title: string;
    detail: string;
    impact: string;
    eta: string;
  }>;
  quoteTargets: {
    positiveRateCurrent: number;
    positiveRateTarget: number;
    replyRateCurrent: number;
    replyRateTarget: number;
  };
}

interface CommentDiagnosticsProps {
  data: DiagnosticsData | null;
  loading: boolean;
}

export const CommentDiagnostics = ({ data, loading }: CommentDiagnosticsProps) => {
  if (loading) {
    return (
      <Card className="p-6 space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-3/4"></div>
          <div className="h-4 bg-muted rounded"></div>
          <div className="h-4 bg-muted rounded w-5/6"></div>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Noch keine Diagnose verfügbar.</p>
          <p className="text-sm mt-2">Importiere Kommentare und analysiere sie.</p>
        </div>
      </Card>
    );
  }

  const getMoodIcon = () => {
    if (data.mood === "Gut") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (data.mood === "Kritisch") return <AlertTriangle className="h-5 w-5 text-red-600" />;
    return <TrendingUp className="h-5 w-5 text-yellow-600" />;
  };

  const getMoodVariant = () => {
    if (data.mood === "Gut") return "default";
    if (data.mood === "Kritisch") return "destructive";
    return "secondary";
  };

  const getRiskVariant = () => {
    if (data.risk === "Hoch") return "destructive";
    if (data.risk === "Mittel") return "secondary";
    return "outline";
  };

  const getImpactColor = (impact: string) => {
    if (impact === "hoch") return "text-red-600";
    if (impact === "mittel") return "text-yellow-600";
    return "text-green-600";
  };

  return (
    <div className="space-y-4">
      {/* Status Badges */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {getMoodIcon()}
            <span className="font-semibold">Stimmung</span>
          </div>
          <Badge variant={getMoodVariant()}>{data.mood}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold">Risiko</span>
          </div>
          <Badge variant={getRiskVariant()}>{data.risk}</Badge>
        </div>
      </Card>

      {/* General Statement */}
      <Card className="p-4">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          Gesamt-Aussage
        </h3>
        <p className="text-sm text-muted-foreground">{data.generalStatement}</p>
      </Card>

      {/* Quote Targets */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Target className="h-4 w-4" />
          Ziele
        </h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Positive-Quote</span>
              <span className="font-mono">
                {(data.quoteTargets.positiveRateCurrent * 100).toFixed(0)}% / {(data.quoteTargets.positiveRateTarget * 100).toFixed(0)}%
              </span>
            </div>
            <Progress 
              value={(data.quoteTargets.positiveRateCurrent / data.quoteTargets.positiveRateTarget) * 100} 
              className="h-2"
            />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Antwort-Quote</span>
              <span className="font-mono">
                {(data.quoteTargets.replyRateCurrent * 100).toFixed(0)}% / {(data.quoteTargets.replyRateTarget * 100).toFixed(0)}%
              </span>
            </div>
            <Progress 
              value={(data.quoteTargets.replyRateCurrent / data.quoteTargets.replyRateTarget) * 100} 
              className="h-2"
            />
          </div>
        </div>
      </Card>

      {/* Recommendations */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Verbesserungs-Vorschläge</h3>
        <div className="space-y-3">
          {data.recommendations.map((rec, idx) => (
            <div key={idx} className="border-l-2 border-primary pl-3 py-1">
              <div className="flex items-start justify-between mb-1">
                <h4 className="font-medium text-sm">{rec.title}</h4>
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  {rec.eta}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{rec.detail}</p>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Impact:</span>
                <span className={`text-xs font-medium ${getImpactColor(rec.impact)}`}>
                  {rec.impact}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
