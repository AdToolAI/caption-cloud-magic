import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Sparkles } from "lucide-react";
import { InsightCard } from "./InsightCard";
import { generateAllInsights } from "@/lib/insightRules";
import {
  aggregateBestTime,
  aggregatePostType,
  aggregateHashtags,
  aggregateCaptionLength,
  aggregateTrend,
} from "@/lib/postMetricsAggregation";

export const CaptionInsightsTab = () => {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<any[]>([]);

  useEffect(() => {
    fetchAndGenerateInsights();
  }, []);

  const fetchAndGenerateInsights = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: posts, error: postsError } = await supabase
        .from('post_metrics')
        .select('*')
        .eq('user_id', user.id)
        .gte('posted_at', new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString())
        .order('posted_at', { ascending: false });

      if (postsError) throw postsError;

      if (!posts || posts.length < 10) {
        setInsights([]);
        setLoading(false);
        return;
      }

      const generatedInsights = generateAllInsights({
        bestTime: aggregateBestTime(posts),
        postType: aggregatePostType(posts),
        hashtags: aggregateHashtags(posts),
        captionLen: aggregateCaptionLength(posts),
        trend: aggregateTrend(posts),
      }, language);

      setInsights(generatedInsights);
    } catch (error) {
      console.error('Error generating insights:', error);
      toast({
        title: t('common.error') !== 'common.error' ? t('common.error') : 'Error',
        description: t('performance.insights.notEnoughData'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{t('performance.insights.actionRecs') !== 'performance.insights.actionRecs' ? t('performance.insights.actionRecs') : t('performance.insights.recommendations')}</h2>
          <p className="text-muted-foreground">{t('performance.insights.based28days') !== 'performance.insights.based28days' ? t('performance.insights.based28days') : t('performance.insights.subtitle')}</p>
        </div>
        <Button onClick={fetchAndGenerateInsights} disabled={loading} variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('performance.insights.recalculate')}
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : insights.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {insights.map((insight, i) => (
            <InsightCard key={i} {...insight} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {t('performance.insights.notEnoughData')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
