import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface JobMetrics {
  pending: number;
  processing: number;
  avgQueueTime: number;
  completedToday: number;
  failedToday: number;
}

interface TimelineData {
  time: string;
  pending: number;
  processing: number;
}

export function LiveJobsMonitor() {
  const [metrics, setMetrics] = useState<JobMetrics>({
    pending: 0,
    processing: 0,
    avgQueueTime: 0,
    completedToday: 0,
    failedToday: 0,
  });
  const [timeline, setTimeline] = useState<TimelineData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      // Get current pending and processing jobs
      const { data: activeJobs, error: activeError } = await supabase
        .from('ai_jobs')
        .select('status, created_at, updated_at')
        .in('status', ['pending', 'processing']);

      if (activeError) throw activeError;

      const pending = activeJobs?.filter(j => j.status === 'pending').length || 0;
      const processing = activeJobs?.filter(j => j.status === 'processing').length || 0;

      // Calculate average queue time for pending jobs
      let avgQueueTime = 0;
      if (pending > 0 && activeJobs) {
        const pendingJobs = activeJobs.filter(j => j.status === 'pending');
        const queueTimes = pendingJobs.map(j => 
          (new Date().getTime() - new Date(j.created_at).getTime()) / 1000
        );
        avgQueueTime = queueTimes.reduce((sum, time) => sum + time, 0) / queueTimes.length;
      }

      // Get today's completed and failed jobs
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count: completedCount } = await supabase
        .from('ai_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('completed_at', today.toISOString());

      const { count: failedCount } = await supabase
        .from('ai_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('completed_at', today.toISOString());

      setMetrics({
        pending,
        processing,
        avgQueueTime: Math.round(avgQueueTime),
        completedToday: completedCount || 0,
        failedToday: failedCount || 0,
      });

      // Update timeline
      setTimeline(prev => {
        const now = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const newData = [...prev, { time: now, pending, processing }];
        return newData.slice(-20); // Keep last 20 data points
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching job metrics:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();

    // Set up realtime subscription
    const channel = supabase
      .channel('ai-jobs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_jobs'
        },
        () => {
          fetchMetrics();
        }
      )
      .subscribe();

    // Fallback polling every 10 seconds
    const interval = setInterval(fetchMetrics, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const getStatusColor = () => {
    const total = metrics.pending + metrics.processing;
    if (total === 0) return 'text-green-500';
    if (total < 5) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getStatusBadge = () => {
    const total = metrics.pending + metrics.processing;
    if (total === 0) return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">System Idle</Badge>;
    if (total < 5) return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Normal Load</Badge>;
    return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">High Load</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Live Operations Monitor</h2>
          <p className="text-muted-foreground">Real-time AI job queue status</p>
        </div>
        {getStatusBadge()}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Jobs</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${getStatusColor()}`}>
              {metrics.pending}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Waiting in queue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-500">
              {metrics.processing}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Currently running
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Queue Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics.avgQueueTime}s
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Average wait time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">
              {metrics.completedToday}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Successfully finished
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Today</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">
              {metrics.failedToday}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Errors occurred
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queue Timeline (Last 20 Updates)</CardTitle>
          <CardDescription>Real-time view of pending and processing jobs</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 12 }}
              />
              <YAxis />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="pending" 
                stroke="hsl(var(--warning))" 
                strokeWidth={2}
                name="Pending"
              />
              <Line 
                type="monotone" 
                dataKey="processing" 
                stroke="hsl(var(--chart-1))" 
                strokeWidth={2}
                name="Processing"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
