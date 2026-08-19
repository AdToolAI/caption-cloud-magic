import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRenderQueue } from '@/hooks/useRenderQueue';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

export const QueueStatsChart = () => {
  const { getQueueStats } = useRenderQueue();
  const [stats, setStats] = useState<any[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const data = await getQueueStats();
    if (data) {
      // Group by date
      const grouped: any = {};
      data.forEach((stat: any) => {
        if (!grouped[stat.date]) {
          grouped[stat.date] = { date: stat.date, remotion: 0, shotstack: 0 };
        }
        grouped[stat.date][stat.engine] = stat.total_jobs;
      });

      setStats(Object.values(grouped));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Queue Statistiken
        </CardTitle>
        <CardDescription>
          Render-Jobs der letzten 30 Tage nach Engine
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stats.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="remotion" fill="hsl(var(--primary))" name="Remotion" />
              <Bar dataKey="shotstack" fill="hsl(var(--secondary))" name="Shotstack" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Noch keine Statistiken verfügbar
          </div>
        )}
      </CardContent>
    </Card>
  );
};
