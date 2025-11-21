import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TemplateROI } from '@/hooks/useContentAnalytics';
import { TrendingUp, DollarSign, Video, Eye } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  templates: TemplateROI[];
}

export function TemplateROIAnalysis({ templates }: Props) {
  const chartData = templates.slice(0, 10).map(t => ({
    name: t.template_name.substring(0, 15),
    roi: t.roi_score,
    cost: t.total_cost,
    revenue: t.revenue_generated || 0
  }));

  const totalMetrics = {
    templates: templates.length,
    totalVideos: templates.reduce((sum, t) => sum + t.total_videos, 0),
    totalRevenue: templates.reduce((sum, t) => sum + (t.revenue_generated || 0), 0),
    totalCost: templates.reduce((sum, t) => sum + t.total_cost, 0)
  };

  const avgROI = templates.reduce((sum, t) => sum + t.roi_score, 0) / templates.length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Video className="h-4 w-4" />
            Active Templates
          </div>
          <p className="text-2xl font-bold">{totalMetrics.templates}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4" />
            Avg. ROI Score
          </div>
          <p className="text-2xl font-bold">{avgROI.toFixed(1)}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4" />
            Total Revenue
          </div>
          <p className="text-2xl font-bold">${totalMetrics.totalRevenue.toFixed(0)}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Eye className="h-4 w-4" />
            Total Videos
          </div>
          <p className="text-2xl font-bold">{totalMetrics.totalVideos}</p>
        </Card>
      </div>

      {/* ROI Chart */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Template ROI Vergleich</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="roi" name="ROI Score">
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.roi > avgROI ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Templates Table */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Template Performance Breakdown</h3>
        <div className="space-y-3">
          {templates.map((template, idx) => {
            const isTopPerformer = template.roi_score > avgROI * 1.5;
            const performanceColor = template.roi_score > avgROI ? 'text-success' : 'text-muted-foreground';

            return (
              <div key={template.template_id} className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-sm">
                  {idx + 1}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{template.template_name}</p>
                    {isTopPerformer && <Badge variant="default">Top Performer</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{template.total_videos} Videos erstellt</p>
                </div>

                <div className="grid grid-cols-5 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Views</p>
                    <p className="font-semibold">{template.total_views.toLocaleString('de-DE')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Engagement</p>
                    <p className="font-semibold">{template.avg_engagement.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Kosten</p>
                    <p className="font-semibold">${template.total_cost.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Revenue</p>
                    <p className="font-semibold">${(template.revenue_generated || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ROI Score</p>
                    <p className={`font-bold ${performanceColor}`}>{template.roi_score.toFixed(1)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
