import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTemplateAnalytics } from "@/hooks/useTemplateAnalytics";
import { TrendingUp, Eye, MousePointer, FileText, Share2 } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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
          <p className="text-center text-muted-foreground">Keine Analytics-Daten verfügbar</p>
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
            <CardTitle className="text-sm font-medium">Gesamte Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_views || 0}</div>
            <p className="text-xs text-muted-foreground">Letzte {days} Tage</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auswahl-Rate</CardTitle>
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
            <CardTitle className="text-sm font-medium">Conversion-Rate</CardTitle>
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
            <CardTitle className="text-sm font-medium">Publish-Rate</CardTitle>
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
            <CardTitle>Conversion Funnel</CardTitle>
            <CardDescription>Von View bis Publish</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm">Views</span>
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
                  <span className="text-sm">Projekte erstellt</span>
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
                  <span className="text-sm">Veröffentlicht</span>
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
          <CardTitle>Performance Trends</CardTitle>
          <CardDescription>Tägliche Metriken über {days} Tage</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="funnel" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="funnel">Funnel Metriken</TabsTrigger>
              <TabsTrigger value="daily">Tägliche Activity</TabsTrigger>
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
                  <Line type="monotone" dataKey="publishes" stroke="#8b5cf6" name="Veröffentlicht" />
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
              Aktive A/B Tests
            </CardTitle>
            <CardDescription>Laufende Tests für dieses Template</CardDescription>
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
