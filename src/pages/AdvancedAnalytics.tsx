import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Hash, TrendingUp, Award, DollarSign, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AdvancedAnalytics() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState("instagram");
  
  const [hashtagData, setHashtagData] = useState<any[]>([]);
  const [bestContent, setBestContent] = useState<any[]>([]);
  const [campaignROI, setCampaignROI] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadAnalytics();
    }
  }, [user, platform]);

  const loadAnalytics = async () => {
    if (!user) return;
    
    try {
      // Load hashtag performance
      const { data: hashtags } = await supabase
        .from('hashtag_performance')
        .select('*')
        .eq('platform', platform)
        .order('avg_engagement_rate', { ascending: false })
        .limit(10);
      
      setHashtagData(hashtags || []);

      // Load best content
      const { data: best } = await supabase
        .from('best_content')
        .select('*')
        .eq('platform', platform)
        .order('engagement_score', { ascending: false })
        .limit(5);
      
      setBestContent(best || []);

      // Load campaign ROI
      const { data: roi } = await supabase
        .from('campaign_roi')
        .select('*')
        .eq('platform', platform)
        .order('created_at', { ascending: false });
      
      setCampaignROI(roi || []);
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  };

  const analyzeHashtags = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-hashtags', {
        body: { platform }
      });

      if (error) throw error;

      toast({
        title: t('analytics.hashtagAnalysisComplete'),
        description: `${data.totalAnalyzed} ${t('analytics.hashtagsAnalyzed')}`,
      });

      loadAnalytics();
    } catch (error) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const identifyBestContent = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('identify-best-content', {
        body: { platform, limit: 10 }
      });

      if (error) throw error;

      toast({
        title: t('analytics.analysisComplete'),
        description: `${data.analyzed} ${t('analytics.postsAnalyzed')}`,
      });

      loadAnalytics();
    } catch (error) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('analytics.title')}</h1>
        <p className="text-muted-foreground">{t('analytics.subtitle')}</p>
      </div>

      <Tabs defaultValue="hashtags" className="space-y-6">
        <TabsList>
          <TabsTrigger value="hashtags">
            <Hash className="h-4 w-4 mr-2" />
            {t('analytics.hashtags')}
          </TabsTrigger>
          <TabsTrigger value="best-content">
            <Award className="h-4 w-4 mr-2" />
            {t('analytics.bestContent')}
          </TabsTrigger>
          <TabsTrigger value="roi">
            <DollarSign className="h-4 w-4 mr-2" />
            {t('analytics.roi')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hashtags" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.hashtagPerformance')}</CardTitle>
              <CardDescription>{t('analytics.hashtagDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={analyzeHashtags} disabled={loading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('analytics.analyzeNow')}
              </Button>

              <div className="space-y-3">
                {hashtagData.map((hashtag) => (
                  <div key={hashtag.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-semibold">{hashtag.hashtag}</p>
                      <p className="text-sm text-muted-foreground">
                        {hashtag.posts_count} {t('analytics.posts')} · {hashtag.total_reach} {t('analytics.reach')}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {hashtag.avg_engagement_rate.toFixed(2)}% {t('analytics.engagement')}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="best-content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.topPerformingContent')}</CardTitle>
              <CardDescription>{t('analytics.bestContentDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={identifyBestContent} disabled={loading}>
                <TrendingUp className="h-4 w-4 mr-2" />
                {t('analytics.identifyBest')}
              </Button>

              <div className="space-y-4">
                {bestContent.map((content) => (
                  <Card key={content.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm line-clamp-2">{content.caption_text}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {new Date(content.posted_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge>{content.engagement_score} {t('analytics.score')}</Badge>
                      </div>
                    </CardHeader>
                    {content.insights_json && (
                      <CardContent>
                        <div className="flex gap-2 flex-wrap">
                          {content.insights_json.strengths?.map((strength: string, idx: number) => (
                            <Badge key={idx} variant="outline">{strength}</Badge>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roi" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('analytics.campaignROI')}</CardTitle>
              <CardDescription>{t('analytics.roiDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              {campaignROI.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {t('analytics.noCampaigns')}
                </p>
              ) : (
                <div className="space-y-3">
                  {campaignROI.map((campaign) => (
                    <div key={campaign.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-semibold">{campaign.campaign_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(campaign.start_date).toLocaleDateString()} - 
                          {campaign.end_date ? new Date(campaign.end_date).toLocaleDateString() : t('analytics.ongoing')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">
                          {campaign.roi_percent ? `${campaign.roi_percent}%` : 'N/A'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t('analytics.roi')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
