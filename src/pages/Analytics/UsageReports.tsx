import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { CreditUsageDashboard } from '@/components/analytics/CreditUsageDashboard';
import { SavingsRecommendations } from '@/components/analytics/SavingsRecommendations';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUsageReports } from '@/hooks/useUsageReports';
import { CostBreakdownPie } from '@/components/analytics/CostBreakdownPie';
import { RenderEngineComparison } from '@/components/analytics/RenderEngineComparison';

export default function UsageReports() {
  const { reports, savingsAnalysis } = useUsageReports();
  const latestReport = reports[0];

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div>
              <h1 className="text-3xl font-bold">Usage Reports</h1>
              <p className="text-muted-foreground">Credit-Verbrauch und Kosten-Optimierung</p>
            </div>

            <CreditUsageDashboard />

            <Tabs defaultValue="savings" className="space-y-4">
              <TabsList>
                <TabsTrigger value="savings">Spar-Potenzial</TabsTrigger>
                <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
                <TabsTrigger value="engines">Engine-Vergleich</TabsTrigger>
              </TabsList>

              <TabsContent value="savings" className="space-y-4">
                <SavingsRecommendations />
              </TabsContent>

              <TabsContent value="breakdown" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {latestReport?.breakdown_by_feature && (
                    <CostBreakdownPie 
                      data={latestReport.breakdown_by_feature}
                      title="Breakdown nach Feature"
                      description="Credit-Verteilung nach Funktionen"
                    />
                  )}
                  {latestReport?.breakdown_by_engine && (
                    <CostBreakdownPie 
                      data={latestReport.breakdown_by_engine}
                      title="Breakdown nach Engine"
                      description="Credit-Verteilung nach Render-Engine"
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
};
