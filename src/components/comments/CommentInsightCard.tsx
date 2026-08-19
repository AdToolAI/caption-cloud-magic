import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, AlertTriangle, Target } from "lucide-react";

interface CommentInsightCardProps {
  title: string;
  evidence: string;
  interpretation: string;
  action: string;
  impact: 'hoch' | 'mittel' | 'niedrig';
}

export function CommentInsightCard({ 
  title, 
  evidence, 
  interpretation, 
  action, 
  impact 
}: CommentInsightCardProps) {
  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'hoch': return 'bg-red-500';
      case 'mittel': return 'bg-yellow-500';
      default: return 'bg-blue-500';
    }
  };

  const getIcon = () => {
    if (impact === 'hoch') return <AlertTriangle className="h-5 w-5" />;
    if (title.toLowerCase().includes('lead')) return <Target className="h-5 w-5" />;
    return <TrendingUp className="h-5 w-5" />;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <div className="mt-0.5">{getIcon()}</div>
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          <Badge className={`${getImpactColor(impact)} text-white border-0`}>
            {impact.charAt(0).toUpperCase() + impact.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Beleg</p>
          <p className="text-sm">{evidence}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Interpretation</p>
          <p className="text-sm">{interpretation}</p>
        </div>
        <div className="bg-muted/50 p-3 rounded-lg">
          <p className="text-sm font-medium mb-2">📋 Empfohlene Maßnahme</p>
          <p className="text-sm">{action}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="text-xs">
            Als Aufgabe speichern
          </Button>
          <Button size="sm" variant="ghost" className="text-xs">
            In CSV exportieren
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
