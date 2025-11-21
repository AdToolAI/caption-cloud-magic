import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TemplateManager } from '@/components/admin/TemplateManager';
import { FieldMappingManager } from '@/components/admin/FieldMappingManager';
import { SystemMonitor } from '@/components/admin/SystemMonitor';
import { LogViewer } from '@/components/content-studio/LogViewer';
import { CacheMonitor } from '@/components/content-studio/CacheMonitor';
import { Shield, Database, Activity, FileCode, HardDrive } from 'lucide-react';

export default function Admin() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Verwalte Templates, Field-Mappings und überwache das System
        </p>
      </div>

      <Tabs defaultValue="templates" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="mappings" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Field-Mappings
          </TabsTrigger>
          <TabsTrigger value="monitor" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Monitor
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="cache" className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Cache
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <TemplateManager />
        </TabsContent>

        <TabsContent value="mappings">
          <FieldMappingManager />
        </TabsContent>

        <TabsContent value="monitor">
          <SystemMonitor />
        </TabsContent>

        <TabsContent value="logs">
          <LogViewer />
        </TabsContent>

        <TabsContent value="cache">
          <CacheMonitor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
