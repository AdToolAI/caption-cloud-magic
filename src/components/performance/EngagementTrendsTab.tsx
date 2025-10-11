import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";

export const EngagementTrendsTab = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [mediaTypeData, setMediaTypeData] = useState<any[]>([]);
  const [topPosts, setTopPosts] = useState<any[]>([]);

  useEffect(() => {
    fetchTrendsData();
  }, []);

  const fetchTrendsData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: posts, error } = await supabase
        .from('post_metrics')
        .select('*')
        .eq('user_id', user.id)
        .order('engagement_rate', { ascending: false });

      if (error) throw error;

      if (posts && posts.length > 0) {
        // Day of week analysis
        const dayEngagement: Record<string, { total: number, count: number }> = {};
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        posts.forEach(post => {
          if (post.posted_at && post.engagement_rate) {
            const date = new Date(post.posted_at);
            const day = days[date.getDay()];
            
            dayEngagement[day] = dayEngagement[day] || { total: 0, count: 0 };
            dayEngagement[day].total += post.engagement_rate;
            dayEngagement[day].count += 1;
          }
        });

        const heatData = days.map(day => ({
          day,
          engagement: dayEngagement[day] ? dayEngagement[day].total / dayEngagement[day].count : 0
        }));
        setHeatmapData(heatData);

        // Media type comparison
        const mediaCount: Record<string, { total: number, count: number }> = {};
        posts.forEach(post => {
          const type = post.media_type || 'unknown';
          mediaCount[type] = mediaCount[type] || { total: 0, count: 0 };
          mediaCount[type].total += post.engagement_rate || 0;
          mediaCount[type].count += 1;
        });

        const mediaData = Object.entries(mediaCount).map(([type, data]) => ({
          type: type.charAt(0).toUpperCase() + type.slice(1),
          engagement: data.total / data.count
        }));
        setMediaTypeData(mediaData);

        // Top 20 posts
        setTopPosts(posts.slice(0, 20));
      }
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getColor = (value: number) => {
    if (value > 5) return 'hsl(160 84 39)';  // success/emerald
    if (value > 3) return 'hsl(25 95 53)';   // warning/orange
    return 'hsl(0 84 60)';                   // danger/red
  };

  return (
    <div className="space-y-6">
      {/* Day of Week Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>{t('performance.trends.dayOfWeek')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={heatmapData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="engagement" radius={[8, 8, 0, 0]}>
                {heatmapData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getColor(entry.engagement)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Media Type Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>{t('performance.trends.mediaType')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={mediaTypeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="type" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="engagement" fill="#6366F1" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Posts Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('performance.trends.topPosts')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('performance.table.caption')}</TableHead>
                <TableHead>{t('performance.table.platform')}</TableHead>
                <TableHead>{t('performance.table.engagement')}</TableHead>
                <TableHead>{t('performance.table.likes')}</TableHead>
                <TableHead>{t('performance.table.comments')}</TableHead>
                <TableHead>{t('performance.table.date')}</TableHead>
                <TableHead>{t('performance.table.link')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topPosts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell className="max-w-xs truncate">{post.caption_text || 'No caption'}</TableCell>
                  <TableCell className="capitalize">{post.provider}</TableCell>
                  <TableCell>{post.engagement_rate?.toFixed(2)}%</TableCell>
                  <TableCell>{post.likes || 0}</TableCell>
                  <TableCell>{post.comments || 0}</TableCell>
                  <TableCell>{new Date(post.posted_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {post.post_url && (
                      <a href={post.post_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 text-primary hover:text-primary/80" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};