import { Card } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface Props {
  outcomes: { success: number; failed: number; oom: number; timeout: number };
}

export const OutcomesDonut = ({ outcomes }: Props) => {
  const data = [
    { name: 'Success', value: outcomes.success, color: 'hsl(var(--success))' },
    { name: 'Failed', value: outcomes.failed, color: 'hsl(var(--destructive))' },
    { name: 'OOM', value: outcomes.oom, color: 'hsl(var(--warning))' },
    { name: 'Timeout', value: outcomes.timeout, color: 'hsl(var(--muted-foreground))' },
  ].filter(d => d.value > 0);

  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <Card className="p-6">
      <h3 className="font-semibold mb-4">Render Outcomes (24h)</h3>
      {total === 0 ? (
        <div className="h-[280px] flex items-center justify-center text-muted-foreground">
          No data in the last 24h
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
            >
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div className="text-xs text-muted-foreground mt-2 text-center">
        Total: {total} renders
      </div>
    </Card>
  );
};
