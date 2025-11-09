import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface QueryDataPoint {
  time: string;
  avgTime: number;
  p95Time: number;
}

export function QueryPerformanceChart() {
  const [data, setData] = useState<QueryDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQueryPerformance();
    const interval = setInterval(fetchQueryPerformance, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchQueryPerformance = async () => {
    try {
      // Fetch events from last 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 600000).toISOString();
      
      const { data: events } = await supabase
        .from('app_events')
        .select('occurred_at, payload_json')
        .gte('occurred_at', tenMinutesAgo)
        .order('occurred_at', { ascending: true });

      if (events) {
        // Group by minute and calculate stats
        const grouped = events.reduce((acc, event) => {
          const minute = new Date(event.occurred_at).toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
          if (!acc[minute]) {
            acc[minute] = [];
          }
          const payload = event.payload_json as any;
          const duration = payload?.duration_ms as number;
          if (duration) {
            acc[minute].push(duration);
          }
          return acc;
        }, {} as Record<string, number[]>);

        const chartData: QueryDataPoint[] = Object.entries(grouped).map(([time, durations]) => {
          durations.sort((a, b) => a - b);
          const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
          const p95Index = Math.floor(durations.length * 0.95);
          const p95 = durations[p95Index] || durations[durations.length - 1];

          return {
            time: time.slice(11, 16), // HH:MM
            avgTime: Math.round(avg),
            p95Time: Math.round(p95),
          };
        });

        setData(chartData.slice(-10)); // Last 10 minutes
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching query performance:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Query Performance</CardTitle>
          <CardDescription>Response time trends</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading chart...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Query Performance</CardTitle>
        <CardDescription>Average and P95 response times over last 10 minutes</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="time" 
              className="text-xs"
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis 
              className="text-xs"
              stroke="hsl(var(--muted-foreground))"
              label={{ value: 'ms', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Line 
              type="monotone" 
              dataKey="avgTime" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              name="Average"
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="p95Time" 
              stroke="hsl(var(--destructive))" 
              strokeWidth={2}
              name="P95"
              dot={false}
              strokeDasharray="5 5"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
