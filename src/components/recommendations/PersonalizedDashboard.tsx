import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, Clock, Target } from 'lucide-react';
import { useUserBehavior } from '@/hooks/useUserBehavior';
import { ProactiveAlertBanner } from '@/components/dashboard/ProactiveAlertBanner';

export function PersonalizedDashboard() {
  const [recommendations, setRecommendations] = useState<any>(null);
  const { getPersonalizedRecommendations } = useUserBehavior();

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    const data = await getPersonalizedRecommendations();
    setRecommendations(data);
  };

  if (!recommendations) {
    return (
      <Card className="p-8 text-center">
        <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary animate-pulse" />
        <p className="text-muted-foreground">Lade Empfehlungen...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Proactive Alert Banner - shows issues from AI Companion diagnostics */}
      <ProactiveAlertBanner />
      
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{recommendations.stats?.total_views}</p>
              <p className="text-xs text-muted-foreground">Template Views</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-success/10 rounded-full flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{recommendations.stats?.total_projects}</p>
              <p className="text-xs text-muted-foreground">Projekte erstellt</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-warning/10 rounded-full flex items-center justify-center">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{recommendations.stats?.total_selections}</p>
              <p className="text-xs text-muted-foreground">Template Auswahlen</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Personalisierte Empfehlungen
        </h3>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Bevorzugter Content-Typ</p>
            <Badge variant="secondary" className="text-sm">
              {recommendations.preferred_content_type}
            </Badge>
          </div>

          {recommendations.templates && recommendations.templates.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Deine Top Templates</p>
              <div className="space-y-2">
                {recommendations.templates.map((template: any) => (
                  <Card key={template.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{template.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {template.category} • {template.platform}
                        </p>
                      </div>
                      <Badge variant="outline">{template.content_type}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {recommendations.ai_insights && (
            <div>
              <p className="text-sm font-medium mb-2">AI Insights</p>
              <Card className="p-4 bg-primary/5">
                <p className="text-sm whitespace-pre-wrap">{recommendations.ai_insights}</p>
              </Card>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
