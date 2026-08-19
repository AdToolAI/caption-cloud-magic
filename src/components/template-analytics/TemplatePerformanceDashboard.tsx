import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTemplateAnalytics } from "@/hooks/useTemplateAnalytics";
import { TrendingUp, Eye, MousePointer, FileText, Share2 } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { tx } from "@/lib/i18nText";

interface TemplatePerformanceDashboardProps {
  templateId: string;
  days?: number;
}

export function TemplatePerformanceDashboard({ templateId, days = 30 }: TemplatePerformanceDashboardProps) {
  const { data, loading, error } = useTemplateAnalytics(templateId, { days });

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">{tx({ de: 'Keine Analytics-Daten verfügbar', en: 'No analytics data available', es: 'No hay datos de análisis disponibles' })}</p>
        </CardContent>
      </Card>
    );
  }

  const { summary, conversion, daily_metrics } = data;

  // Prepare chart data
  const chartData = daily_metrics.map(metric => ({
    date: new Date(metric.date).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' }),
    views: metric.total_views,
    selections: metric.total_selections,
    creates: metric.projects_created,
    publishes: metric.projects_published,
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tx({ de: 'Gesamte Views', en: 'Total views', es: 'Vistas totales' })}</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_views || 0}</div>
            <p className="text-xs text-muted-foreground">{tx({ de: 'Letzte', en: 'Last', es: 'Últimos' })} {days} {tx({ de: 'Tage', en: 'days', es: 'días' })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tx({ de: 'Auswahl-Rate', en: 'Selection rate', es: 'Tasa de selección' })}</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.selection_rate?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.total_selections || 0} Auswahlen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tx({ de: 'Conversion-Rate', en: 'Conversion rate', es: 'Tasa de conversión' })}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.conversion_rate?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.total_projects || 0} Projekte erstellt
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tx({ de: 'Publish-Rate', en: 'Publish rate', es: 'Tasa de publicación' })}</CardTitle>
            <Share2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.publish_rate?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.total_publishes || 0} veröffentlicht
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Funnel */}
      {conversion && (
        <Card>
          <CardHeader>
            <CardTitle>{tx({ de: 'Conversion Funnel', en: 'Conversion funnel', es: 'Embudo de conversión' })}</CardTitle>
            <CardDescription>{tx({ de: 'Von View bis Publish', en: 'From view to publish', es: 'De la vista a la publicación' })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm">{tx({ de: 'Views', en: 'Views', es: 'Vistas' })}</span>
                </div>
                <div className="text-right">
                  <div className="font-bold">{conversion.total_views}</div>
                  <div className="text-xs text-muted-foreground">100%</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm">Auswahlen</span>
                </div>
                <div className="text-right">
                  <div className="font-bold">{conversion.total_selections}</div>
                  <div className="text-xs text-muted-foreground">
                    {conversion.selection_rate.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="text-sm">{tx({ de: 'Projekte erstellt', en: 'Projects created', es: 'Proyectos creados' })}</span>
                </div>
                <div className="text-right">
                  <div className="font-bold">{conversion.total_creates}</div>
                  <div className="text-xs text-muted-foreground">
                    {conversion.create_rate.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <span className="text-sm">{tx({ de: 'Veröffentlicht', en: 'Published', es: 'Publicado' })}</span>
                </div>
                <div className="text-right">
                  <div className="font-bold">{conversion.total_publishes}</div>
                  <div className="text-xs text-muted-foreground">
                    {conversion.publish_rate.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Charts */}
      <Card>
        <CardHeader>
          <CardTitle>{tx({ de: 'Performance Trends', en: 'Performance trends', es: 'Tendencias de rendimiento' })}</CardTitle>
          <CardDescription>{tx({ de: 'Tägliche Metriken über', en: 'Daily metrics over', es: 'Métricas diarias durante' })} {days} {tx({ de: 'Tage', en: 'days', es: 'días' })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="funnel" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="funnel">{tx({ de: 'Funnel Metriken', en: 'Funnel metrics', es: 'Métricas de embudo' })}</TabsTrigger>
              <TabsTrigger value="daily">{tx({ de: 'Tägliche Activity', en: 'Daily activity', es: 'Actividad diaria' })}</TabsTrigger>
            </TabsList>

            <TabsContent value="funnel" className="pt-4">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="views" stroke="#3b82f6" name="Views" />
                  <Line type="monotone" dataKey="selections" stroke="#10b981" name="Auswahlen" />
                  <Line type="monotone" dataKey="creates" stroke="#f59e0b" name="Erstellt" />
                  <Line type="monotone" dataKey="publishes" stroke="#8b5cf6" name={tx({ de: "Veröffentlicht", en: "Published", es: "Publicado" })} />
                </LineChart>
              </ResponsiveContainer>
            </TabsContent>

            <TabsContent value="daily" className="pt-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="views" fill="#3b82f6" name="Views" />
                  <Bar dataKey="selections" fill="#10b981" name="Auswahlen" />
                </BarChart>
              </ResponsiveContainer>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Active A/B Tests */}
      {data.active_tests && data.active_tests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {tx({ de: "Aktive A/B Tests", en: "Active A/B tests", es: "Pruebas A/B activas" })}
            </CardTitle>
            <CardDescription>{tx({ de: "Laufende Tests für dieses Template", en: "Running tests for this template", es: "Pruebas en curso para esta plantilla" })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.active_tests.map((test: any) => (
                <div key={test.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{test.test_name}</div>
                    <div className="text-sm text-muted-foreground">
                      Gestartet: {new Date(test.started_at).toLocaleDateString('de-DE')}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-primary">
                    {test.status}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
