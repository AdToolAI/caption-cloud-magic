import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { CreditUsageDashboard } from '@/components/analytics/CreditUsageDashboard';

export default function UsageReports() {
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
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};
