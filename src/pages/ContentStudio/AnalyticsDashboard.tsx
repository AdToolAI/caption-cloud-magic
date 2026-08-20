import { tx } from "@/lib/i18nText";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, Video, Eye, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { uiLocale } from '@/lib/uiLocale';

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
      toast.error(tx({ de: 'Fehler beim Laden der Analytics', en: 'Error loading analytics', es: 'Error al cargar los análisis' }));
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
      title: tx({ de: "Videos erstellt", en: "Videos created", es: "Vídeos creados" }),
      value: analytics.overview.total_videos,
      icon: Video,
      color: "text-blue-500"
    },
    {
      title: tx({ de: "Gesamt Aufrufe", en: "Total Views", es: "Vistas totales" }),
      value: analytics.overview.total_views.toLocaleString(),
      icon: Eye,
      color: "text-green-500"
    },
    {
      title: tx({ de: "Ø Engagement", en: "Avg Engagement", es: "Promedio de compromiso" }),
      value: `${analytics.overview.avg_engagement}%`,
      icon: TrendingUp,
      color: "text-purple-500"
    },
    {
      title: tx({ de: "Videos/Monat", en: "Videos/Month", es: "Vídeos/Mes" }),
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
            <h1 className="text-3xl font-bold">{tx({ de: 'Content Performance', en: 'Content Performance', es: 'Rendimiento del contenido' })}</h1>
            <p className="text-muted-foreground mt-1">
              {tx({ de: 'Analysiere die Performance deiner Videos', en: 'Analyze the performance of your videos', es: 'Analiza el rendimiento de tus vídeos' })}
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">{tx({ de: '7 Tage', en: '7 Days', es: '7 Días' })}</SelectItem>
                <SelectItem value="30d">{tx({ de: '30 Tage', en: '30 Days', es: '30 Días' })}</SelectItem>
                <SelectItem value="90d">{tx({ de: '90 Tage', en: '90 Days', es: '90 Días' })}</SelectItem>
                <SelectItem value="all">{tx({ de: "Alle Zeit", en: "All time", es: "Todo el tiempo" })}</SelectItem>
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
            <CardTitle>{tx({ de: 'Performance nach Content-Type', en: 'Performance by Content Type', es: 'Rendimiento por tipo de contenido' })}</CardTitle>
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
                <Bar dataKey="engagement" fill="hsl(var(--primary))" name={tx({ de: 'Engagement %', en: 'Engagement %', es: 'Compromiso %' })} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Templates */}
        <Card>
          <CardHeader>
            <CardTitle>{tx({ de: '🏆 Top Performing Templates', en: '🏆 Top Performing Templates', es: '🏆 Plantillas de mejor rendimiento' })}</CardTitle>
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
                        {template.usage_count} {tx({ de: '× verwendet', en: '× used', es: '× usado' })}
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
            <CardTitle>{tx({ de: '📅 Timeline (Letzte 30 Tage)', en: '📅 Timeline (Last 30 Days)', es: '📅 Cronología (Últimos 30 días)' })}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={analytics.timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date: string | number) => new Date(date).toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit' })}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(date: any) => new Date(date).toLocaleDateString(uiLocale())}
                />
                <Line 
                  type="monotone" 
                  dataKey="videos_created" 
                  stroke="hsl(var(--primary))" 
                  name={tx({ de: 'Videos erstellt', en: 'Videos created', es: 'Vídeos creados' })}
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="views" 
                  stroke="hsl(var(--chart-2))" 
                  name={tx({ de: 'Aufrufe', en: 'Views', es: 'Vistas' })}
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