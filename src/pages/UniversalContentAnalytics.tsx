import { useState } from 'react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useContentAnalytics } from '@/hooks/useContentAnalytics';
import { VideoPerformanceMetrics } from '@/components/analytics/VideoPerformanceMetrics';
import { TemplateROIAnalysis } from '@/components/analytics/TemplateROIAnalysis';
import { CostAnalysis } from '@/components/analytics/CostAnalysis';
import { EngineComparison } from '@/components/analytics/EngineComparison';
import { AnalyticsExport } from '@/components/analytics/AnalyticsExport';
import { Loader2 } from 'lucide-react';

export default function UniversalContentAnalytics() {
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: new Date()
  });

  const formattedDateRange = {
    start: format(dateRange.start, 'yyyy-MM-dd'),
    end: format(dateRange.end, 'yyyy-MM-dd')
  };

  const { data, loading, refetch } = useContentAnalytics(formattedDateRange);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">📊 Advanced Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Umfassende Performance-Analyse für deine Video-Content-Strategie
          </p>
        </div>

        {/* Date Range Selector */}
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {format(dateRange.start, 'dd.MM.yyyy', { locale: de })} - {format(dateRange.end, 'dd.MM.yyyy', { locale: de })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="flex gap-4 p-4">
                    <div>
                      <p className="text-sm font-medium mb-2">Von</p>
                      <Calendar
                        mode="single"
                        selected={dateRange.start}
                        onSelect={(date) => date && setDateRange({ ...dateRange, start: date })}
                        locale={de}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Bis</p>
                      <Calendar
                        mode="single"
                        selected={dateRange.end}
                        onSelect={(date) => date && setDateRange({ ...dateRange, end: date })}
                        locale={de}
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setDateRange({
                    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    end: new Date()
                  })}
                >
                  7 Tage
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setDateRange({
                    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                    end: new Date()
                  })}
                >
                  30 Tage
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setDateRange({
                    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                    end: new Date()
                  })}
                >
                  90 Tage
                </Button>
              </div>
            </div>

            <Button onClick={refetch} variant="outline" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Aktualisieren
            </Button>
          </div>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : data ? (
          <Tabs defaultValue="performance" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="performance">Video Performance</TabsTrigger>
              <TabsTrigger value="roi">Template ROI</TabsTrigger>
              <TabsTrigger value="costs">Kostenanalyse</TabsTrigger>
              <TabsTrigger value="engines">Engine Vergleich</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            <TabsContent value="performance">
              <VideoPerformanceMetrics videos={data.videoPerformance} />
            </TabsContent>

            <TabsContent value="roi">
              <TemplateROIAnalysis templates={data.templateROI} />
            </TabsContent>

            <TabsContent value="costs">
              <CostAnalysis costData={data.costAnalysis} />
            </TabsContent>

            <TabsContent value="engines">
              <EngineComparison engineData={data.engineComparison} />
            </TabsContent>

            <TabsContent value="export">
              <AnalyticsExport data={data} dateRange={formattedDateRange} />
            </TabsContent>
          </Tabs>
        ) : (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">Keine Daten verfügbar</p>
          </Card>
        )}
      </main>

      <Footer />
    </div>
  );
}
