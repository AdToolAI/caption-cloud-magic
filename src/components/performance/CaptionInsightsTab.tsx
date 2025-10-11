import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, TrendingUp, Clock, Target } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const CaptionInsightsTab = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [userPlan, setUserPlan] = useState<string>('free');

  useEffect(() => {
    fetchInsights();
    fetchUserPlan();
  }, []);

  const fetchUserPlan = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .single();

      if (data) {
        setUserPlan(data.plan || 'free');
      }
    } catch (error) {
      console.error('Error fetching user plan:', error);
    }
  };

  const fetchInsights = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('performance_ai_insights')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setInsights(data.summary_json);
      }
    } catch (error: any) {
      console.error('Error fetching insights:', error);
    }
  };

  const generateInsights = async () => {
    // Check if user has Pro plan
    if (userPlan === 'free') {
      toast({
        title: 'Upgrade to Pro',
        description: 'AI Insights are only available on the Pro plan.',
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch recent posts
      const { data: posts, error: postsError } = await supabase
        .from('post_metrics')
        .select('*')
        .eq('user_id', user.id)
        .order('posted_at', { ascending: false })
        .limit(100);

      if (postsError) throw postsError;

      if (!posts || posts.length === 0) {
        toast({
          title: t('performance.insights.noPosts'),
          description: t('performance.insights.noPostsDescription'),
          variant: "destructive"
        });
        return;
      }

      // Call AI analysis endpoint
      const { data: aiResult, error: aiError } = await supabase.functions.invoke('analyze-performance', {
        body: { posts }
      });

      if (aiError) throw aiError;

      // Save insights
      const dateRangeStart = new Date(posts[posts.length - 1].posted_at);
      const dateRangeEnd = new Date(posts[0].posted_at);

      const { error: insertError } = await supabase
        .from('performance_ai_insights')
        .insert({
          user_id: user.id,
          date_range_start: dateRangeStart.toISOString().split('T')[0],
          date_range_end: dateRangeEnd.toISOString().split('T')[0],
          summary_json: aiResult
        });

      if (insertError) throw insertError;

      setInsights(aiResult);

      toast({
        title: t('common.success'),
        description: t('performance.insights.generated')
      });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{t('performance.insights.title')}</h2>
          <p className="text-muted-foreground">{t('performance.insights.subtitle')}</p>
        </div>
        <Button onClick={generateInsights} disabled={loading}>
          <Sparkles className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? t('common.generating') : t('performance.insights.generate')}
        </Button>
      </div>

      {insights ? (
        <div className="space-y-4">
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {t('performance.insights.summary')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{insights.summary}</p>
            </CardContent>
          </Card>

          {/* Top Styles */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                {t('performance.insights.topStyles')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {insights.top_styles?.map((style: string, index: number) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-primary font-semibold">{index + 1}.</span>
                    <span>{style}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Best Times */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {t('performance.insights.bestTimes')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {insights.best_times?.map((time: any, index: number) => (
                  <div key={index} className="border-l-4 border-primary pl-4">
                    <p className="font-semibold capitalize">{time.provider}</p>
                    <ul className="text-sm text-muted-foreground">
                      {time.windows?.map((window: string, idx: number) => (
                        <li key={idx}>• {window}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                {t('performance.insights.recommendations')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {insights.recommendations?.map((rec: string, index: number) => (
                  <Alert key={index}>
                    <AlertDescription className="flex items-start gap-2">
                      <span className="text-primary font-bold text-lg">{index + 1}</span>
                      <span>{rec}</span>
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">{t('performance.insights.empty')}</p>
            <Button onClick={generateInsights} disabled={loading}>
              {loading ? t('common.generating') : t('performance.insights.generateFirst')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};