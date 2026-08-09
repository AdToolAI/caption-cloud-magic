import { tx } from "@/lib/i18nText";
import { Card } from '@/components/ui/card';
import { CostAnalysis as CostData } from '@/hooks/useContentAnalytics';
import { DollarSign, TrendingDown, Video } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface Props {
  costData: CostData;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--secondary))', 'hsl(var(--muted))'];

export function CostAnalysis({ costData }: Props) {
  const pieData = costData.cost_by_template.map(t => ({
    name: t.template_name,
    value: t.total_cost
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4" />
            {tx({ de: "Gesamtkosten", en: "Total cost", es: "Coste total" })}
          </div>
          <p className="text-2xl font-bold">${costData.total_render_cost.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">{tx({ de: "Alle Renders", en: "All renders", es: "Todos los renders" })}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Video className="h-4 w-4" />
            {tx({ de: "Kosten pro Video", en: "Cost per video", es: "Coste por vídeo" })}
          </div>
          <p className="text-2xl font-bold">${costData.avg_cost_per_video.toFixed(3)}</p>
          <p className="text-xs text-muted-foreground mt-1">{tx({ de: "Durchschnitt", en: "Average", es: "Promedio" })}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <TrendingDown className="h-4 w-4" />
            {tx({ de: "Optimierungspotenzial", en: "Optimization potential", es: "Potencial de optimización" })}
          </div>
          <p className="text-2xl font-bold">12%</p>
          <p className="text-xs text-muted-foreground mt-1">{tx({ de: "Geschätzte Einsparung", en: "Estimated savings", es: "Ahorro estimado" })}</p>
        </Card>
      </div>

      {/* Cost Trend */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">{tx({ de: "Kostenverlauf (30 Tage)", en: "Cost history (30 days)", es: "Historial de costes (30 días)" })}</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={costData.cost_trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
            <Line 
              type="monotone" 
              dataKey="cost" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))' }}
              name={tx({ de: "Kosten", en: "Cost", es: "Coste" })}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Cost by Template */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">{tx({ de: "Kosten nach Template", en: "Cost by template", es: "Coste por plantilla" })}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="hsl(var(--primary))"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Template Cost Breakdown */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">{tx({ de: "Template Kostenübersicht", en: "Template cost overview", es: "Resumen de costes de la plantilla" })}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={costData.cost_by_template}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="template_name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
              <Bar dataKey="total_cost" fill="hsl(var(--primary))" name="tx({ de: "Gesamtkosten", en: "Total cost", es: "Coste total" })" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">{tx({ de: "Detaillierte Kostenaufstellung", en: "Detailed cost breakdown", es: "Desglose detallado de costes" })}</h3>
        <div className="space-y-2">
          {costData.cost_by_template.map((item) => {
            const costPerVideo = item.total_cost / item.video_count;
            return (
              <div key={item.template_name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">{item.template_name}</p>
                  <p className="text-sm text-muted-foreground">{tx({ de: `${item.video_count} Videos`, en: `${item.video_count} videos`, es: `${item.video_count} vídeos` })}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">${item.total_cost.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">{tx({ de: `${costPerVideo.toFixed(3)} pro Video`, en: `${costPerVideo.toFixed(3)} per video`, es: `${costPerVideo.toFixed(3)} por vídeo` })}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
