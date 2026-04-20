import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SystemMonitor } from '@/components/admin/SystemMonitor';
import { ConversionFunnel } from '@/components/admin/ConversionFunnel';
import { EmailDashboard } from '@/pages/admin/EmailDashboard';
import { Activity, TrendingUp, Mail } from 'lucide-react';

export default function Admin() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Überwache das System, die Conversion und Email-Zustellung
        </p>
      </div>

      <Tabs defaultValue="funnel" className="space-y-6">
        <TabsList>
          <TabsTrigger value="funnel" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Conversion Funnel
          </TabsTrigger>
          <TabsTrigger value="monitor" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Monitor
          </TabsTrigger>
          <TabsTrigger value="emails" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Monitor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="funnel">
          <ConversionFunnel />
        </TabsContent>

        <TabsContent value="monitor">
          <SystemMonitor />
        </TabsContent>

        <TabsContent value="emails">
          <EmailDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
