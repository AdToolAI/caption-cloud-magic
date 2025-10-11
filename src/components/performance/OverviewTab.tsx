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
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
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
  }, []);

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch post metrics
      const { data: posts, error } = await supabase
        .from('post_metrics')
        .select('*')
        .eq('user_id', user.id)
        .order('posted_at', { ascending: true });

      if (error) throw error;

      if (posts && posts.length > 0) {
        // Calculate stats
        const avgEng = posts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / posts.length;
        
        // Best day/hour analysis
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

        // Engagement over time
        const engData = posts.slice(-30).map(p => ({
          date: new Date(p.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          engagement: p.engagement_rate || 0
        }));
        setEngagementData(engData);

        // Top posts
        const topPosts = [...posts]
          .sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))
          .slice(0, 10)
          .map(p => ({
            caption: p.caption_text?.substring(0, 30) + '...' || 'No caption',
            engagement: p.engagement_rate || 0,
            platform: p.provider
          }));
        setTopPostsData(topPosts);

        // Provider distribution
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
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('performance.kpi.avgEngagement')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgEngagement.toFixed(2)}%</div>
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
            <CardTitle className="text-sm font-medium">{t('performance.kpi.bestDay')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.bestDay || 'N/A'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('performance.kpi.bestHour')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.bestHour || 'N/A'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button onClick={fetchOverviewData} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('performance.actions.syncLatest')}
        </Button>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engagement Over Time */}
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

        {/* Provider Distribution */}
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

        {/* Top Posts */}
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