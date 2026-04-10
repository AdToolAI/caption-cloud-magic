import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Users, Clock, Hash, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

const COLORS = ['hsl(239 84 67)', 'hsl(160 84 39)', 'hsl(25 95 53)', 'hsl(0 84 60)', 'hsl(262 83 58)', 'hsl(330 81 60)'];

export const OverviewTab = () => {
  const { t, language } = useTranslation();
  const locale = language === 'de' ? 'de-DE' : language === 'es' ? 'es-ES' : 'en-US';
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    avgEngagement: number;
    totalPosts: number;
    bestDay: string;
    bestHour: string;
    topStyle: string;
    igFollowers?: number;
    igReachToday?: number;
    igTopPosts?: any[];
    fbImpressions?: number;
    fbPostEngagements?: number;
    fbTotalActions?: number;
    fbVideoViews?: number;
    fbFansTotal?: number;
  }>({
    avgEngagement: 0,
    totalPosts: 0,
    bestDay: '',
    bestHour: '',
    topStyle: ''
  });
  const [engagementData, setEngagementData] = useState<any[]>([]);
  const [topPostsData, setTopPostsData] = useState<any[]>([]);
  const [providerData, setProviderData] = useState<any[]>([]);

  useEffect(() => {
    fetchOverviewData();
    fetchInstagramData();
    fetchFacebookData();
  }, []);

  const fetchInstagramData = async () => {
    try {
      const { data: accountData } = await supabase
        .from('ig_account_daily')
        .select('*')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (accountData) {
        setStats(prev => ({
          ...prev,
          igFollowers: accountData.followers_count,
          igReachToday: accountData.reach_day
        }));
      }

      const date28DaysAgo = new Date();
      date28DaysAgo.setDate(date28DaysAgo.getDate() - 28);

      const { data: topPosts } = await supabase
        .from('ig_media')
        .select(`
          *,
          ig_media_metrics (
            reach,
            saved,
            plays
          )
        `)
        .gte('timestamp', date28DaysAgo.toISOString())
        .order('timestamp', { ascending: false });

      if (topPosts) {
        const postsWithMetrics = topPosts
          .map((post: any) => ({
            ...post,
            totalEngagement: (post.ig_media_metrics?.reach || 0) + (post.ig_media_metrics?.saved || 0)
          }))
          .sort((a, b) => b.totalEngagement - a.totalEngagement)
          .slice(0, 10);

        setStats(prev => ({
          ...prev,
          igTopPosts: postsWithMetrics
        }));
      }
    } catch (error) {
      console.error('Error fetching Instagram data:', error);
    }
  };

  const fetchFacebookData = async () => {
    try {
      const { data: fbData } = await supabase
        .from('fb_page_daily')
        .select('*')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fbData) {
        setStats(prev => ({
          ...prev,
          fbImpressions: fbData.impressions,
          fbPostEngagements: fbData.post_engagements,
          fbTotalActions: fbData.total_actions,
          fbVideoViews: fbData.video_views,
          fbFansTotal: fbData.fans_total
        }));
      }
    } catch (error) {
      console.error('Error fetching Facebook data:', error);
    }
  };

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: posts, error } = await supabase
        .from('post_metrics')
        .select('*')
        .eq('user_id', user.id)
        .order('posted_at', { ascending: true });

      if (error) throw error;

      if (posts && posts.length > 0) {
        const avgEng = posts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / posts.length;
        
        const dayCount: Record<string, { total: number, count: number }> = {};
        const hourCount: Record<string, { total: number, count: number }> = {};
        
        posts.forEach(post => {
          if (post.posted_at && post.engagement_rate) {
            const date = new Date(post.posted_at);
            const day = date.toLocaleDateString('en-US', { weekday: 'long' });
            const hour = date.getHours();
            
            dayCount[day] = dayCount[day] || { total: 0, count: 0 };
            dayCount[day].total += post.engagement_rate;
            dayCount[day].count += 1;
            
            hourCount[hour] = hourCount[hour] || { total: 0, count: 0 };
            hourCount[hour].total += post.engagement_rate;
            hourCount[hour].count += 1;
          }
        });

        const bestDay = Object.entries(dayCount)
          .map(([day, data]) => ({ day, avg: data.total / data.count }))
          .sort((a, b) => b.avg - a.avg)[0]?.day || '';

        const bestHour = Object.entries(hourCount)
          .map(([hour, data]) => ({ hour, avg: data.total / data.count }))
          .sort((a, b) => b.avg - a.avg)[0]?.hour || '';

        setStats({
          avgEngagement: avgEng,
          totalPosts: posts.length,
          bestDay,
          bestHour: bestHour ? `${bestHour}:00` : '',
          topStyle: 'Short Hook'
        });

        const engData = posts.slice(-30).map(p => ({
          date: new Date(p.posted_at).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
          engagement: p.engagement_rate || 0
        }));
        setEngagementData(engData);

        const topPosts = [...posts]
          .sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))
          .slice(0, 10)
          .map(p => ({
            caption: p.caption_text?.substring(0, 30) + '...' || 'No caption',
            engagement: p.engagement_rate || 0,
            platform: p.provider
          }));
        setTopPostsData(topPosts);

        const providerCount = posts.reduce((acc: Record<string, number>, p) => {
          acc[p.provider] = (acc[p.provider] || 0) + 1;
          return acc;
        }, {});

        const provData = Object.entries(providerCount).map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value
        }));
        setProviderData(provData);
      }
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
      {/* Instagram KPIs */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Instagram</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Followers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.igFollowers?.toLocaleString(locale) || '-'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('performance.overviewTab.reachToday')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.igReachToday?.toLocaleString(locale) || '-'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('performance.kpi.totalPosts')}</CardTitle>
              <Hash className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPosts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('performance.kpi.avgEngagement')}</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgEngagement.toFixed(2)}%</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Facebook KPIs */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Facebook Page</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('performance.overviewTab.impressionsToday')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.fbImpressions?.toLocaleString(locale) || '-'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Post Engagements</CardTitle>
              <Hash className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.fbPostEngagements?.toLocaleString(locale) || '-'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Actions</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.fbTotalActions?.toLocaleString(locale) || '-'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Video Views</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.fbVideoViews?.toLocaleString(locale) || '-'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('performance.overviewTab.fansTotal')}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.fbFansTotal?.toLocaleString(locale) || '-'}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Top Instagram Posts (last 28 days) */}
      {stats.igTopPosts && stats.igTopPosts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('performance.overviewTab.top10IgPosts')}</CardTitle>
            <CardDescription>{t('performance.overviewTab.sortedByEngagement')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 font-medium">{t('performance.overviewTab.dateCol')}</th>
                    <th className="p-2 font-medium">{t('performance.overviewTab.typeCol')}</th>
                    <th className="p-2 text-right font-medium">Reach</th>
                    <th className="p-2 text-right font-medium">Saved</th>
                    <th className="p-2 text-right font-medium">Plays</th>
                    <th className="p-2 font-medium">{t('performance.overviewTab.linkCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.igTopPosts.map((post) => (
                    <tr key={post.media_id} className="border-b hover:bg-muted/50">
                      <td className="p-2">{new Date(post.timestamp).toLocaleDateString(locale)}</td>
                      <td className="p-2">
                        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                          {post.media_type}
                        </span>
                      </td>
                      <td className="text-right p-2">{post.ig_media_metrics?.reach?.toLocaleString(locale) || '0'}</td>
                      <td className="text-right p-2">{post.ig_media_metrics?.saved?.toLocaleString(locale) || '0'}</td>
                      <td className="text-right p-2">
                        {post.media_type === 'VIDEO' || post.media_type === 'REEL' 
                          ? (post.ig_media_metrics?.plays?.toLocaleString(locale) || '0')
                          : '-'
                        }
                      </td>
                      <td className="p-2">
                        <a 
                          href={post.permalink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-sm"
                        >
                          {t('performance.overviewTab.viewPost')}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button 
          onClick={() => {
            fetchOverviewData();
            fetchInstagramData();
            fetchFacebookData();
          }} 
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('performance.overviewTab.refreshAll')}
        </Button>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('performance.charts.engagementOverTime')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={engagementData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="engagement" stroke="#6366F1" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('performance.charts.providerDistribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={providerData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {providerData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('performance.charts.topPosts')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topPostsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="caption" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="engagement" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
