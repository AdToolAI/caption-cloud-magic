import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

interface UsageChartProps {
  data: Array<{
    date: string;
    credits: number;
  }>;
}

export const UsageChart = ({ data }: UsageChartProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Credit-Verbrauch
        </CardTitle>
        <CardDescription>
          Täglicher Verbrauch über die Zeit
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="credits" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                name="Credits"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Keine Daten verfügbar
          </div>
        )}
      </CardContent>
    </Card>
  );
};
