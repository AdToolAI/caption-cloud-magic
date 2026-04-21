import { Card } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Bucket { hour: string; total: number; success: number; failed: number }

export const RenderTrendChart = ({ data }: { data: Bucket[] }) => {
  const formatted = data.map(d => ({
    ...d,
    label: new Date(d.hour).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit',
    }),
  }));

  return (
    <Card className="p-6">
      <h3 className="font-semibold mb-4">Render Volume — Last 7 Days (per hour)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            interval={Math.floor(formatted.length / 8)}
          />
          <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Area
            type="monotone"
            dataKey="success"
            stackId="1"
            stroke="hsl(var(--success))"
            fill="hsl(var(--success))"
            fillOpacity={0.6}
            name="Success"
          />
          <Area
            type="monotone"
            dataKey="failed"
            stackId="1"
            stroke="hsl(var(--destructive))"
            fill="hsl(var(--destructive))"
            fillOpacity={0.7}
            name="Failed"
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
};
