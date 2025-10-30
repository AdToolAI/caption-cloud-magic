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

export const CaptionInsightsTab = () => {
  const { t } = useTranslation();
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

      // Client-side aggregation from post_metrics
      // Fetch last 28 days of posts
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

      // Client-side aggregation
      const bestTimeData = aggregateBestTime(posts);
      const postTypeData = aggregatePostType(posts);
      const hashtagData = aggregateHashtags(posts);
      const captionLenData = aggregateCaptionLength(posts);
      const trendData = aggregateTrend(posts);

      // Generate insights from rules
      const generatedInsights = generateAllInsights({
        bestTime: bestTimeData,
        postType: postTypeData,
        hashtags: hashtagData,
        captionLen: captionLenData,
        trend: trendData,
      });

      setInsights(generatedInsights);
    } catch (error) {
      console.error('Error generating insights:', error);
      toast({
        title: 'Fehler',
        description: 'Insights konnten nicht geladen werden.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Aggregation functions
  const aggregateBestTime = (posts: any[]) => {
    const grouped = posts.reduce((acc, post) => {
      const date = new Date(post.posted_at);
      const weekday = date.getDay();
      const hour = date.getHours();
      const key = `${post.platform}_${weekday}_${hour}`;
      
      if (!acc[key]) {
        acc[key] = { platform: post.platform, weekday, hour, total: 0, count: 0 };
      }
      
      const reach = post.reach || 1;
      const engagements = post.engagements || 0;
      acc[key].total += (engagements / reach) * 100;
      acc[key].count += 1;
      
      return acc;
    }, {} as Record<string, any>);

    return Object.values(grouped).map((g: any) => ({
      platform: g.platform,
      weekday: g.weekday,
      hour: g.hour,
      avg_eng_rate: g.total / g.count,
      n: g.count
    }));
  };

  const aggregatePostType = (posts: any[]) => {
    const grouped = posts.reduce((acc, post) => {
      const key = `${post.platform}_${post.media_type || 'unknown'}`;
      
      if (!acc[key]) {
        acc[key] = { platform: post.platform, post_type: post.media_type || 'unknown', total: 0, count: 0 };
      }
      
      const reach = post.reach || 1;
      const engagements = post.engagements || 0;
      acc[key].total += (engagements / reach) * 100;
      acc[key].count += 1;
      
      return acc;
    }, {} as Record<string, any>);

    return Object.values(grouped)
      .filter((g: any) => g.count >= 3)
      .map((g: any) => ({
        platform: g.platform,
        post_type: g.post_type,
        avg_eng_rate: g.total / g.count,
        n: g.count
      }));
  };

  const aggregateHashtags = (posts: any[]) => {
    const tagStats = posts.reduce((acc, post) => {
      const hashtags = post.hashtags || [];
      const reach = post.reach || 1;
      const engagements = post.engagements || 0;
      const engRate = (engagements / reach) * 100;
      
      hashtags.forEach((tag: string) => {
        if (!acc[tag]) {
          acc[tag] = { tag, total: 0, count: 0 };
        }
        acc[tag].total += engRate;
        acc[tag].count += 1;
      });
      
      return acc;
    }, {} as Record<string, any>);

    return Object.values(tagStats)
      .filter((t: any) => t.count >= 3)
      .map((t: any) => ({
        tag: t.tag,
        avg_eng_rate: t.total / t.count,
        uses: t.count
      }))
      .sort((a, b) => b.avg_eng_rate - a.avg_eng_rate)
      .slice(0, 20);
  };

  const aggregateCaptionLength = (posts: any[]) => {
    const grouped = posts.reduce((acc, post) => {
      const len = (post.caption_text || '').length;
      const bucket = len < 80 ? 'kurz' : len <= 220 ? 'mittel' : 'lang';
      
      if (!acc[bucket]) {
        acc[bucket] = { bucket, total: 0, count: 0 };
      }
      
      const reach = post.reach || 1;
      const engagements = post.engagements || 0;
      acc[bucket].total += (engagements / reach) * 100;
      acc[bucket].count += 1;
      
      return acc;
    }, {} as Record<string, any>);

    return Object.values(grouped).map((g: any) => ({
      bucket: g.bucket,
      avg_eng_rate: g.total / g.count,
      n: g.count
    }));
  };

  const aggregateTrend = (posts: any[]) => {
    const now = Date.now();
    const recent7d = posts
      .filter(p => new Date(p.posted_at).getTime() > now - 7 * 24 * 60 * 60 * 1000)
      .reduce((sum, p) => {
        const reach = p.reach || 1;
        const engagements = p.engagements || 0;
        return sum + (engagements / reach) * 100;
      }, 0) / Math.max(posts.filter(p => new Date(p.posted_at).getTime() > now - 7 * 24 * 60 * 60 * 1000).length, 1);

    const baseline14d = posts
      .filter(p => new Date(p.posted_at).getTime() > now - 14 * 24 * 60 * 60 * 1000)
      .reduce((sum, p) => {
        const reach = p.reach || 1;
        const engagements = p.engagements || 0;
        return sum + (engagements / reach) * 100;
      }, 0) / Math.max(posts.filter(p => new Date(p.posted_at).getTime() > now - 14 * 24 * 60 * 60 * 1000).length, 1);

    return { recent7d, baseline14d };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Handlungsempfehlungen</h2>
          <p className="text-muted-foreground">Basierend auf deinen letzten 28 Tagen</p>
        </div>
        <Button onClick={fetchAndGenerateInsights} disabled={loading} variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Neu berechnen
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
              Noch nicht genug Daten für Insights (mind. 10 Posts nötig)
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};