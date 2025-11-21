import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, Clock, CheckCircle2, XCircle, TrendingUp, HardDrive } from 'lucide-react';

interface PerformanceStats {
  total_renders: number;
  success_rate: number;
  avg_render_time_sec: number;
  total_credits_used: number;
  storage_used_gb: number;
  by_engine: {
    remotion: { count: number; avg_time: number };
    shotstack: { count: number; avg_time: number };
  };
  by_status: {
    completed: number;
    failed: number;
    processing: number;
    queued: number;
  };
  recent_jobs: Array<{
    id: string;
    status: string;
    created_at: string;
    completed_at: string;
    render_time_sec: number;
  }>;
}

export default function VideoPerformanceDashboard() {
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d');

  useEffect(() => {
    loadStats();
  }, [period]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const periodHours = period === '24h' ? 24 : period === '7d' ? 168 : 720;
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - periodHours);

      // Fetch render queue stats
      const { data: renders, error: renderError } = await supabase
        .from('render_queue')
        .select('*')
        .gte('created_at', startDate.toISOString());

      if (renderError) throw renderError;

      // Calculate stats
      const completed = renders?.filter(r => r.status === 'completed') || [];
      const failed = renders?.filter(r => r.status === 'failed') || [];
      const processing = renders?.filter(r => r.status === 'processing') || [];
      const queued = renders?.filter(r => r.status === 'queued') || [];

      const avgRenderTime = completed.length > 0
        ? completed.reduce((sum, r) => {
            const start = new Date(r.started_at || r.created_at).getTime();
            const end = new Date(r.completed_at || new Date()).getTime();
            return sum + (end - start) / 1000;
          }, 0) / completed.length
        : 0;

      // Fetch credits used
      const { data: batchRenders } = await supabase
        .from('batch_renders')
        .select('credits_used')
        .gte('created_at', startDate.toISOString());

      const totalCredits = batchRenders?.reduce((sum, b) => sum + (b.credits_used || 0), 0) || 0;

      // Fetch storage usage
      const { data: profiles } = await supabase
        .from('profiles')
        .select('storage_used_mb');

      const totalStorageMb = profiles?.reduce((sum, p) => sum + (p.storage_used_mb || 0), 0) || 0;

      setStats({
        total_renders: renders?.length || 0,
        success_rate: completed.length / Math.max(completed.length + failed.length, 1) * 100,
        avg_render_time_sec: Math.round(avgRenderTime),
        total_credits_used: totalCredits,
        storage_used_gb: Math.round(totalStorageMb / 1024 * 100) / 100,
        by_engine: {
          remotion: { 
            count: completed.filter(r => r.engine === 'remotion').length,
            avg_time: 0 // TODO: Calculate
          },
          shotstack: {
            count: completed.filter(r => r.engine === 'shotstack').length,
            avg_time: 0 // TODO: Calculate
          }
        },
        by_status: {
          completed: completed.length,
          failed: failed.length,
          processing: processing.length,
          queued: queued.length
        },
        recent_jobs: completed.slice(-10).map(r => ({
          id: r.id,
          status: r.status,
          created_at: r.created_at,
          completed_at: r.completed_at || '',
          render_time_sec: 0 // TODO: Calculate
        }))
      });

    } catch (error) {
      console.error('Load stats error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="container py-8">
        <div className="text-center">Lade Performance-Daten...</div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Video Performance Dashboard</h1>
        <p className="text-muted-foreground">Rendering-Statistiken und Systemauslastung</p>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2">
        {(['24h', '7d', '30d'] as const).map(p => (
          <Badge
            key={p}
            variant={period === p ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setPeriod(p)}
          >
            {p === '24h' ? '24 Stunden' : p === '7d' ? '7 Tage' : '30 Tage'}
          </Badge>
        ))}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt Renders</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_renders}</div>
            <p className="text-xs text-muted-foreground">
              {stats.by_status.completed} abgeschlossen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Erfolgsrate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.success_rate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.by_status.failed} fehlgeschlagen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ø Render-Zeit</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avg_render_time_sec}s</div>
            <p className="text-xs text-muted-foreground">
              Pro Video
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits verwendet</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_credits_used}</div>
            <p className="text-xs text-muted-foreground">
              Im gewählten Zeitraum
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Status-Verteilung</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{stats.by_status.completed}</div>
              <div className="text-sm text-muted-foreground">Abgeschlossen</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">{stats.by_status.failed}</div>
              <div className="text-sm text-muted-foreground">Fehlgeschlagen</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{stats.by_status.processing}</div>
              <div className="text-sm text-muted-foreground">In Bearbeitung</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-500">{stats.by_status.queued}</div>
              <div className="text-sm text-muted-foreground">In Warteschlange</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Engine Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Remotion Engine</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-2">{stats.by_engine.remotion.count}</div>
            <p className="text-sm text-muted-foreground">Renders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shotstack Engine</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-2">{stats.by_engine.shotstack.count}</div>
            <p className="text-sm text-muted-foreground">Renders</p>
          </CardContent>
        </Card>
      </div>

      {/* Storage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Storage-Nutzung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold mb-2">{stats.storage_used_gb} GB</div>
          <p className="text-sm text-muted-foreground">Gesamt verwendeter Speicherplatz</p>
        </CardContent>
      </Card>
    </div>
  );
}
