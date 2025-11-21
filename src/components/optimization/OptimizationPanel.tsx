import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, Check } from 'lucide-react';
import { usePostOptimization } from '@/hooks/usePostOptimization';

interface OptimizationPanelProps {
  post_id?: string;
  draft_id?: string;
  caption?: string;
  hashtags?: string[];
  platforms?: string[];
}

export function OptimizationPanel({
  post_id,
  draft_id,
  caption,
  hashtags,
  platforms,
}: OptimizationPanelProps) {
  const { loading, optimization, analyzePost, applyOptimizations } = usePostOptimization();
  const [selectedImprovements, setSelectedImprovements] = useState<number[]>([]);

  const handleAnalyze = async () => {
    await analyzePost({ post_id, draft_id, caption, hashtags, platforms });
  };

  const handleToggleImprovement = (index: number) => {
    setSelectedImprovements(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleApply = async () => {
    if (optimization) {
      await applyOptimizations(optimization.optimization_id, selectedImprovements);
      setSelectedImprovements([]);
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'text-success';
      case 'medium': return 'text-warning';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      {!optimization && (
        <Card className="p-6 text-center">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h3 className="text-lg font-semibold mb-2">AI-Optimierung</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Lass die KI deinen Post analysieren und Verbesserungen vorschlagen
          </p>
          <Button onClick={handleAnalyze} disabled={loading} className="gap-2">
            <TrendingUp className="h-4 w-4" />
            {loading ? 'Analysiere...' : 'Post optimieren'}
          </Button>
        </Card>
      )}

      {optimization && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Optimierungs-Score</h3>
                <p className="text-sm text-muted-foreground">
                  Dein Post erhält {optimization.score}/100 Punkte
                </p>
              </div>
              <div className="text-3xl font-bold text-primary">
                {optimization.score}%
              </div>
            </div>

            {optimization.optimal_posting_time && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">📅 Beste Posting-Zeit</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {optimization.optimal_posting_time}
                </p>
              </div>
            )}
          </Card>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Verbesserungsvorschläge</h4>
            {optimization.improvements.map((improvement, index) => (
              <Card
                key={index}
                className={`p-4 cursor-pointer transition-all ${
                  selectedImprovements.includes(index)
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-primary/50'
                }`}
                onClick={() => handleToggleImprovement(index)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {improvement.category}
                    </Badge>
                    <span className={`text-xs font-medium ${getImpactColor(improvement.impact)}`}>
                      {improvement.impact === 'high' && '🔥 Hoher Impact'}
                      {improvement.impact === 'medium' && '⚡ Mittlerer Impact'}
                      {improvement.impact === 'low' && '💡 Niedriger Impact'}
                    </span>
                  </div>
                  {selectedImprovements.includes(index) && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>

                <p className="text-sm text-muted-foreground mb-2">{improvement.reason}</p>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Aktuell:</p>
                  <p className="text-sm bg-muted p-2 rounded">{improvement.current}</p>
                </div>

                <div className="space-y-1 mt-2">
                  <p className="text-xs text-muted-foreground">Vorschlag:</p>
                  <p className="text-sm bg-primary/10 p-2 rounded font-medium">
                    {improvement.suggested}
                  </p>
                </div>

                {improvement.estimated_gain && (
                  <p className="text-xs text-success mt-2">
                    📈 {improvement.estimated_gain}
                  </p>
                )}
              </Card>
            ))}
          </div>

          {optimization.hook_alternatives && optimization.hook_alternatives.length > 0 && (
            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-2">Alternative Hooks</h4>
              <div className="space-y-2">
                {optimization.hook_alternatives.map((hook, idx) => (
                  <p key={idx} className="text-sm p-2 bg-muted rounded">
                    {hook}
                  </p>
                ))}
              </div>
            </Card>
          )}

          {selectedImprovements.length > 0 && (
            <Button onClick={handleApply} disabled={loading} className="w-full gap-2">
              <Check className="h-4 w-4" />
              {selectedImprovements.length} Verbesserung(en) anwenden
            </Button>
          )}

          <Button variant="outline" onClick={handleAnalyze} disabled={loading} className="w-full">
            Neu analysieren
          </Button>
        </div>
      )}
    </div>
  );
}
