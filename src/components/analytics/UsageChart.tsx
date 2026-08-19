import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { tx } from '@/lib/i18nText';

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
          {tx({ de: "Täglicher Verbrauch über die Zeit", en: "Daily consumption over time", es: "Consumo diario a lo largo del tiempo" })}
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
            {tx({ de: "Keine Daten verfügbar", en: "No data available", es: "No hay datos disponibles" })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
