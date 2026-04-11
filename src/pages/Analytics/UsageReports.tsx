import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { CreditUsageDashboard } from '@/components/analytics/CreditUsageDashboard';
import { SavingsRecommendations } from '@/components/analytics/SavingsRecommendations';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUsageReports } from '@/hooks/useUsageReports';
import { CostBreakdownPie } from '@/components/analytics/CostBreakdownPie';
import { RenderEngineComparison } from '@/components/analytics/RenderEngineComparison';
import { useTranslation } from '@/hooks/useTranslation';

export default function UsageReports() {
  const { reports, savingsAnalysis } = useUsageReports();
  const { t } = useTranslation();
  const latestReport = reports[0];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div>
              <h1 className="text-3xl font-bold">{t('usageReports.title')}</h1>
              <p className="text-muted-foreground">{t('usageReports.subtitle')}</p>
            </div>

            <CreditUsageDashboard />

            <Tabs defaultValue="savings" className="space-y-4">
              <TabsList>
                <TabsTrigger value="savings">{t('usageReports.tabSavings')}</TabsTrigger>
                <TabsTrigger value="breakdown">{t('usageReports.tabBreakdown')}</TabsTrigger>
                <TabsTrigger value="engines">{t('usageReports.tabEngines')}</TabsTrigger>
              </TabsList>

              <TabsContent value="savings" className="space-y-4">
                <SavingsRecommendations />
              </TabsContent>

              <TabsContent value="breakdown" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {latestReport?.breakdown_by_feature && (
                    <CostBreakdownPie 
                      data={latestReport.breakdown_by_feature}
                      title={t('usageReports.breakdownByFeature')}
                      description={t('usageReports.creditDistFeature')}
                    />
                  )}
                  {latestReport?.breakdown_by_engine && (
                    <CostBreakdownPie 
                      data={latestReport.breakdown_by_engine}
                      title={t('usageReports.breakdownByEngine')}
                      description={t('usageReports.creditDistEngine')}
                    />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="engines" className="space-y-4">
                {savingsAnalysis && (
                  <RenderEngineComparison
                    remotionCredits={latestReport?.breakdown_by_engine?.['remotion'] || 0}
                    shotstackCredits={latestReport?.breakdown_by_engine?.['shotstack'] || 0}
                    remotionCount={savingsAnalysis.stats.remotionCount}
                    shotstackCount={savingsAnalysis.stats.shotstackCount}
                  />
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
