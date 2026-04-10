import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, Check } from 'lucide-react';
import { usePostOptimization } from '@/hooks/usePostOptimization';
import { useTranslation } from '@/hooks/useTranslation';

interface OptimizationPanelProps {
  post_id?: string;
  draft_id?: string;
  caption?: string;
  hashtags?: string[];
  platforms?: string[];
}

export function OptimizationPanel({ post_id, draft_id, caption, hashtags, platforms }: OptimizationPanelProps) {
  const { loading, optimization, analyzePost, applyOptimizations } = usePostOptimization();
  const { t } = useTranslation();
  const [selectedImprovements, setSelectedImprovements] = useState<number[]>([]);

  const handleAnalyze = async () => { await analyzePost({ post_id, draft_id, caption, hashtags, platforms }); };
  const handleToggleImprovement = (index: number) => { setSelectedImprovements(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]); };
  const handleApply = async () => { if (optimization) { await applyOptimizations(optimization.optimization_id, selectedImprovements); setSelectedImprovements([]); } };

  const getImpactColor = (impact: string) => {
    switch (impact) { case 'high': return 'text-success'; case 'medium': return 'text-warning'; default: return 'text-muted-foreground'; }
  };

  return (
    <div className="space-y-4">
      {!optimization && (
        <Card className="p-6 text-center">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h3 className="text-lg font-semibold mb-2">{t('composer.aiOptimization')}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t('composer.aiOptimizationDesc')}</p>
          <Button onClick={handleAnalyze} disabled={loading} className="gap-2">
            <TrendingUp className="h-4 w-4" />
            {loading ? t('composer.analyzing') : t('composer.optimizePost')}
          </Button>
        </Card>
      )}

      {optimization && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{t('composer.optimizationScore')}</h3>
                <p className="text-sm text-muted-foreground">{t('composer.scoreDesc', { score: optimization.score })}</p>
              </div>
              <div className="text-3xl font-bold text-primary">{optimization.score}%</div>
            </div>
            {optimization.optimal_posting_time && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">{t('composer.bestPostingTime')}</p>
                <p className="text-xs text-muted-foreground mt-1">{optimization.optimal_posting_time}</p>
              </div>
            )}
          </Card>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">{t('composer.improvementSuggestions')}</h4>
            {optimization.improvements.map((improvement, index) => (
              <Card key={index} className={`p-4 cursor-pointer transition-all ${selectedImprovements.includes(index) ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`} onClick={() => handleToggleImprovement(index)}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{improvement.category}</Badge>
                    <span className={`text-xs font-medium ${getImpactColor(improvement.impact)}`}>
                      {improvement.impact === 'high' && t('composer.highImpact')}
                      {improvement.impact === 'medium' && t('composer.mediumImpact')}
                      {improvement.impact === 'low' && t('composer.lowImpact')}
                    </span>
                  </div>
                  {selectedImprovements.includes(index) && <Check className="h-5 w-5 text-primary" />}
                </div>
                <p className="text-sm text-muted-foreground mb-2">{improvement.reason}</p>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('composer.current')}</p>
                  <p className="text-sm bg-muted p-2 rounded">{improvement.current}</p>
                </div>
                <div className="space-y-1 mt-2">
                  <p className="text-xs text-muted-foreground">{t('composer.suggested')}</p>
                  <p className="text-sm bg-primary/10 p-2 rounded font-medium">{improvement.suggested}</p>
                </div>
                {improvement.estimated_gain && <p className="text-xs text-success mt-2">📈 {improvement.estimated_gain}</p>}
              </Card>
            ))}
          </div>

          {optimization.hook_alternatives && optimization.hook_alternatives.length > 0 && (
            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-2">{t('composer.alternativeHooks')}</h4>
              <div className="space-y-2">
                {optimization.hook_alternatives.map((hook, idx) => (
                  <p key={idx} className="text-sm p-2 bg-muted rounded">{hook}</p>
                ))}
              </div>
            </Card>
          )}

          {selectedImprovements.length > 0 && (
            <Button onClick={handleApply} disabled={loading} className="w-full gap-2">
              <Check className="h-4 w-4" />
              {t('composer.applyImprovements', { count: selectedImprovements.length })}
            </Button>
          )}

          <Button variant="outline" onClick={handleAnalyze} disabled={loading} className="w-full">
            {t('composer.reanalyze')}
          </Button>
        </div>
      )}
    </div>
  );
}
