import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, Video, Eye, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface AnalyticsData {
  overview: {
    total_videos: number;
    completed_videos: number;
    total_views: number;
    avg_engagement: number;
    most_used_content_type: string;
  };
  by_content_type: Record<string, {
    videos: number;
    avg_engagement: number;
    views: number;
  }>;
  top_templates: Array<{
    template_id: string;
    name: string;
    usage_count: number;
    avg_engagement: number;
  }>;
  timeline: Array<{
    date: string;
    videos_created: number;
    views: number;
  }>;
}

export default function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  useEffect(() => {
    if (userId) {
      loadAnalytics();
      setupRealtimeSubscription();
    }
  }, [userId, dateRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      
      let date_range = undefined;
      if (dateRange !== 'all') {
        const days = parseInt(dateRange.replace('d', ''));
        const start = new Date();
        start.setDate(start.getDate() - days);
        date_range = {
          start: start.toISOString(),
          end: new Date().toISOString()
        };
      }

      const { data, error } = await supabase.functions.invoke('get-content-analytics', {
        body: { date_range }
      });

      if (error) throw error;
      setAnalytics(data);
    } catch (error) {
      console.error('Analytics load error:', error);
      toast.error('Fehler beim Laden der Analytics');
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel('content-analytics')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_projects',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          if ((payload.new as any)?.status === 'completed') {
            loadAnalytics();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  if (loading || !analytics) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const statCards = [
    {
      title: "Videos erstellt",
      value: analytics.overview.total_videos,
      icon: Video,
      color: "text-blue-500"
    },
    {
      title: "Gesamt Aufrufe",
      value: analytics.overview.total_views.toLocaleString(),
      icon: Eye,
      color: "text-green-500"
    },
    {
      title: "Ø Engagement",
      value: `${analytics.overview.avg_engagement}%`,
      icon: TrendingUp,
      color: "text-purple-500"
    },
    {
      title: "Videos/Monat",
      value: Math.round(analytics.overview.total_videos / 3),
      icon: BarChart3,
      color: "text-orange-500"
    }
  ];

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Content Performance</h1>
            <p className="text-muted-foreground mt-1">
              Analysiere die Performance deiner Videos
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 Tage</SelectItem>
                <SelectItem value="30d">30 Tage</SelectItem>
                <SelectItem value="90d">90 Tage</SelectItem>
                <SelectItem value="all">Alle Zeit</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {statCards.map((stat, index) => (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Performance by Content Type */}
        <Card>
          <CardHeader>
            <CardTitle>Performance nach Content-Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={Object.entries(analytics.by_content_type).map(([type, data]) => ({
                type: type.charAt(0).toUpperCase() + type.slice(1),
                engagement: data.avg_engagement,
                videos: data.videos
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="engagement" fill="hsl(var(--primary))" name="Engagement %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Templates */}
        <Card>
          <CardHeader>
            <CardTitle>🏆 Top Performing Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.top_templates.slice(0, 5).map((template, index) => (
                <div key={template.template_id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-muted-foreground">
                      {index + 1}
                    </span>
                    <div>
                      <div className="font-medium">{template.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {template.usage_count}× verwendet
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{template.avg_engagement}%</div>
                    <div className="text-xs text-muted-foreground">Engagement</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>📅 Timeline (Letzte 30 Tage)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={analytics.timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date: string | number) => new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(date: any) => new Date(date).toLocaleDateString('de-DE')}
                />
                <Line 
                  type="monotone" 
                  dataKey="videos_created" 
                  stroke="hsl(var(--primary))" 
                  name="Videos erstellt"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="views" 
                  stroke="hsl(var(--chart-2))" 
                  name="Aufrufe"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}