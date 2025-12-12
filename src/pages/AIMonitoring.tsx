import { useState, useEffect } from 'react';
import { Footer } from '@/components/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Activity, TrendingUp, Clock, Zap, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface AIUsageStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  estimatedCost: number;
  peakHour: { hour: number; count: number } | null;
}

export default function AIMonitoring() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AIUsageStats>({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    estimatedCost: 0,
    peakHour: null,
  });
  const [loading, setLoading] = useState(true);
  const [recentCalls, setRecentCalls] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchUsageStats();
    }
  }, [user]);

  const fetchUsageStats = async () => {
    try {
      setLoading(true);
      
      // Fetch app events to calculate usage
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const { data: events, error } = await supabase
        .from('app_events')
        .select('*')
        .eq('user_id', user?.id)
        .in('event_type', ['caption.created', 'background.generated', 'bio.generated'])
        .gte('occurred_at', monthAgo.toISOString())
        .order('occurred_at', { ascending: false });

      if (error) throw error;

      // Calculate stats
      const todayStart = new Date(today.setHours(0, 0, 0, 0));
      const eventsToday = events?.filter(e => new Date(e.occurred_at) >= todayStart) || [];
      const eventsThisWeek = events?.filter(e => new Date(e.occurred_at) >= weekAgo) || [];
      const eventsThisMonth = events || [];

      // Calculate peak hour
      const hourCounts: Record<number, number> = {};
      eventsThisWeek.forEach(event => {
        const hour = new Date(event.occurred_at).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });
      
      const peakHour = Object.entries(hourCounts).reduce((peak, [hour, count]) => {
        return count > (peak?.count || 0) ? { hour: parseInt(hour), count } : peak;
      }, null as { hour: number; count: number } | null);

      // Estimate cost (rough calculation)
      const estimatedCost = eventsThisMonth.length * 0.001; // ~1 cent per call

      setStats({
        today: eventsToday.length,
        thisWeek: eventsThisWeek.length,
        thisMonth: eventsThisMonth.length,
        estimatedCost,
        peakHour,
      });

      setRecentCalls(events?.slice(0, 10) || []);
    } catch (error: any) {
      console.error('Error fetching usage stats:', error);
      toast.error('Fehler beim Laden der Statistiken');
    } finally {
      setLoading(false);
    }
  };

  const getEventTypeLabel = (eventType: string) => {
    const labels: Record<string, string> = {
      'caption.created': 'Caption generiert',
      'background.generated': 'Background generiert',
      'bio.generated': 'Bio generiert',
    };
    return labels[eventType] || eventType;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">AI Usage Monitoring</h1>
          <p className="text-muted-foreground">Überwache deine Lovable AI Nutzung und Kosten</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Heute</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.today}</div>
              <p className="text-xs text-muted-foreground">AI Calls</p>
              <Progress value={(stats.today / 100) * 100} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Diese Woche</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.thisWeek}</div>
              <p className="text-xs text-muted-foreground">AI Calls</p>
              <div className="text-xs text-muted-foreground mt-2">
                Ø {Math.round(stats.thisWeek / 7)} Calls/Tag
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Dieser Monat</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.thisMonth}</div>
              <p className="text-xs text-muted-foreground">AI Calls gesamt</p>
              <div className="text-xs text-muted-foreground mt-2">
                Est. €{stats.estimatedCost.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Peak Zeit</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {stats.peakHour ? (
                <>
                  <div className="text-2xl font-bold">{stats.peakHour.hour}:00</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.peakHour.count} Calls diese Woche
                  </p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">Keine Daten</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alert Card */}
        {stats.today > 50 && (
          <Card className="mb-8 border-warning">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-warning" />
                <CardTitle className="text-warning">Hohe Nutzung erkannt</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                Du hast heute bereits {stats.today} AI Calls gemacht. 
                Bei sehr hoher Nutzung könntest du Lovable AI Rate Limits erreichen.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Recent Calls */}
        <Card>
          <CardHeader>
            <CardTitle>Letzte AI Calls</CardTitle>
            <CardDescription>Die 10 neuesten AI Aufrufe</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {loading ? (
                <div className="text-sm text-muted-foreground">Lade...</div>
              ) : recentCalls.length === 0 ? (
                <div className="text-sm text-muted-foreground">Keine AI Calls gefunden</div>
              ) : (
                recentCalls.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{getEventTypeLabel(call.event_type)}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(call.occurred_at)}
                      </span>
                    </div>
                    <Badge variant="secondary">
                      {call.source}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
