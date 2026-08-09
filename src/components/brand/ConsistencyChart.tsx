import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { tx } from "@/lib/i18nText";

interface ConsistencyChartProps {
  brandKitId: string;
}

export function ConsistencyChart({ brandKitId }: ConsistencyChartProps) {
  const { data: historyData = [] } = useQuery({
    queryKey: ['consistency-history', brandKitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brand_consistency_history')
        .select('*')
        .eq('brand_kit_id', brandKitId)
        .order('analyzed_at', { ascending: true })
        .limit(30);

      if (error) throw error;
      return data || [];
    }
  });

  const chartData = historyData.map((item: any) => ({
    date: format(new Date(item.analyzed_at), 'dd.MM', { locale: de }),
    score: item.score,
    type: item.content_type
  }));

  const avgScore = historyData.length > 0
    ? Math.round(historyData.reduce((sum: number, item: any) => sum + item.score, 0) / historyData.length)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          {tx({ de: 'Konsistenz-Verlauf', en: 'Consistency History', es: 'Historial de consistencia' })}
        </CardTitle>
        <CardDescription>
          {tx({ de: 'Entwicklung deiner Marken-Konsistenz über die Zeit', en: 'Evolution of your brand consistency over time', es: 'Evolución de la consistencia de tu marca a lo largo del tiempo' })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {historyData.length > 0 ? (
          <>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">{tx({ de: 'Durchschnittlicher Score', en: 'Average score', es: 'Puntuación media' })}</p>
              <p className="text-3xl font-bold text-primary">{avgScore}%</p>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis 
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="score" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>{tx({ de: 'Noch keine Konsistenz-Daten vorhanden', en: 'No consistency data yet', es: 'Aún no hay datos de consistencia' })}</p>
            <p className="text-sm mt-1">{tx({ de: 'Erstelle Inhalte, um deinen Score zu tracken', en: 'Create content to track your score', es: 'Crea contenido para seguir tu puntuación' })}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}