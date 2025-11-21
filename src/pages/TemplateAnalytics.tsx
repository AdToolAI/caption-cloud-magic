import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplatePerformanceDashboard } from '@/components/template-analytics/TemplatePerformanceDashboard';
import { ABTestManager } from '@/components/template-analytics/ABTestManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TestTube } from "lucide-react";

export default function TemplateAnalytics() {
  const { templateId } = useParams<{ templateId: string }>();
  const [timeRange, setTimeRange] = useState(30);

  if (!templateId) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              Kein Template ausgewählt
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Template Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Performance-Metriken, Conversion-Tracking und A/B Testing für deine Templates
        </p>
      </div>

      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="testing" className="flex items-center gap-2">
            <TestTube className="h-4 w-4" />
            A/B Testing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="mt-6">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Zeitraum auswählen</CardTitle>
                <CardDescription>Analysiere die Performance über verschiedene Zeiträume</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  {[7, 14, 30, 60, 90].map((days) => (
                    <button
                      key={days}
                      onClick={() => setTimeRange(days)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        timeRange === days
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      {days} Tage
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <TemplatePerformanceDashboard templateId={templateId} days={timeRange} />
          </div>
        </TabsContent>

        <TabsContent value="testing" className="mt-6">
          <ABTestManager templateId={templateId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
