import { useState } from 'react';
import { Footer } from '@/components/Footer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { de, enUS, es } from 'date-fns/locale';
import { useTranslation } from '@/hooks/useTranslation';
import { useContentAnalytics } from '@/hooks/useContentAnalytics';
import { VideoPerformanceMetrics } from '@/components/analytics/VideoPerformanceMetrics';
import { TemplateROIAnalysis } from '@/components/analytics/TemplateROIAnalysis';
import { CostAnalysis } from '@/components/analytics/CostAnalysis';
import { EngineComparison } from '@/components/analytics/EngineComparison';
import { AnalyticsExport } from '@/components/analytics/AnalyticsExport';
import { Loader2 } from 'lucide-react';

export default function UniversalContentAnalytics() {
  const { t, language } = useTranslation();
  const dateLocale = language === 'de' ? de : language === 'es' ? es : enUS;
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
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{t("analyticsPage.title")}</h1>
          <p className="text-muted-foreground">
            {t("analyticsPage.subtitle")}
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
                    {format(dateRange.start, 'dd.MM.yyyy', { locale: dateLocale })} - {format(dateRange.end, 'dd.MM.yyyy', { locale: dateLocale })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="flex gap-4 p-4">
                    <div>
                      <p className="text-sm font-medium mb-2">{t("analyticsPage.from")}</p>
                      <Calendar
                        mode="single"
                        selected={dateRange.start}
                        onSelect={(date) => date && setDateRange({ ...dateRange, start: date })}
                        locale={dateLocale}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">{t("analyticsPage.to")}</p>
                      <Calendar
                        mode="single"
                        selected={dateRange.end}
                        onSelect={(date) => date && setDateRange({ ...dateRange, end: date })}
                        locale={dateLocale}
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
                  {t("analyticsPage.days7")}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setDateRange({
                    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                    end: new Date()
                  })}
                >
                  {t("analyticsPage.days30")}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setDateRange({
                    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                    end: new Date()
                  })}
                >
                  {t("analyticsPage.days90")}
                </Button>
              </div>
            </div>

            <Button onClick={refetch} variant="outline" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {t("analyticsPage.refresh")}
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
              <TabsTrigger value="performance">{t("analyticsPage.tabPerformance")}</TabsTrigger>
              <TabsTrigger value="roi">{t("analyticsPage.tabRoi")}</TabsTrigger>
              <TabsTrigger value="costs">{t("analyticsPage.tabCosts")}</TabsTrigger>
              <TabsTrigger value="engines">{t("analyticsPage.tabEngines")}</TabsTrigger>
              <TabsTrigger value="export">{t("analyticsPage.tabExport")}</TabsTrigger>
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
            <p className="text-muted-foreground">{t("analyticsPage.noData")}</p>
          </Card>
        )}
      </main>

      <Footer />
    </div>
  );
}
