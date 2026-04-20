import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SystemMonitor } from '@/components/admin/SystemMonitor';
import { ConversionFunnel } from '@/components/admin/ConversionFunnel';
import { EmailDashboard } from '@/pages/admin/EmailDashboard';
import { ProviderHealth } from '@/pages/admin/ProviderHealth';
import { CacheHealth } from '@/pages/admin/CacheHealth';
import { CostMonitor } from '@/pages/admin/CostMonitor';
import Alerts from '@/pages/admin/Alerts';
import { SentryDashboard } from '@/pages/admin/SentryDashboard';
import { BugReportsAdmin } from '@/pages/admin/BugReportsAdmin';
import { SmokeTestsAdmin } from '@/pages/admin/SmokeTestsAdmin';
import { AISuperuserAdmin } from '@/pages/admin/AISuperuserAdmin';
import { Activity, TrendingUp, Mail, Gauge, Database, DollarSign, Bell, Bug, ShieldAlert, HeartPulse, Bot } from 'lucide-react';

export default function Admin() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Überwache das System, die Conversion und Email-Zustellung
        </p>
      </div>

      <Tabs defaultValue="bugs" className="space-y-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="bugs" className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Bug Reports
          </TabsTrigger>
          <TabsTrigger value="sentry" className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Sentry
          </TabsTrigger>
          <TabsTrigger value="smoke" className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4" />
            Smoke Tests
          </TabsTrigger>
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
          <TabsTrigger value="provider-health" className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            Provider Health
          </TabsTrigger>
          <TabsTrigger value="cache-health" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Cache Health
          </TabsTrigger>
          <TabsTrigger value="cost-monitor" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Cost Monitor
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alerts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bugs">
          <BugReportsAdmin />
        </TabsContent>

        <TabsContent value="sentry">
          <SentryDashboard />
        </TabsContent>

        <TabsContent value="smoke">
          <SmokeTestsAdmin />
        </TabsContent>

        <TabsContent value="funnel">
          <ConversionFunnel />
        </TabsContent>

        <TabsContent value="monitor">
          <SystemMonitor />
        </TabsContent>

        <TabsContent value="emails">
          <EmailDashboard />
        </TabsContent>

        <TabsContent value="provider-health">
          <ProviderHealth />
        </TabsContent>

        <TabsContent value="cache-health">
          <CacheHealth />
        </TabsContent>

        <TabsContent value="cost-monitor">
          <CostMonitor />
        </TabsContent>

        <TabsContent value="alerts">
          <Alerts />
        </TabsContent>
      </Tabs>
    </div>
  );
}
