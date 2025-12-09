import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SystemMonitor } from '@/components/admin/SystemMonitor';
import { Shield, Activity } from 'lucide-react';

export default function Admin() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Überwache das System
        </p>
      </div>

      <Tabs defaultValue="monitor" className="space-y-6">
        <TabsList>
          <TabsTrigger value="monitor" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Monitor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monitor">
          <SystemMonitor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
