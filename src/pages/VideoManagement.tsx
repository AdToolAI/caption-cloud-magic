import { VideoManagementDashboard } from '@/components/video/VideoManagementDashboard';
import { BatchVideoUpload } from '@/components/video/BatchVideoUpload';
import { ContentStudioUpgradeBanner } from '@/components/content-studio/ContentStudioUpgradeBanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVideoTemplates } from '@/hooks/useVideoTemplates';

export default function VideoManagement() {
  const { data: templates } = useVideoTemplates();
  const firstTemplate = templates?.[0];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Video Manager</h1>
        <p className="text-muted-foreground">Verwalte deine erstellten Videos und starte Batch-Uploads</p>
      </div>

      {/* Content Studio Upgrade Banner */}
      <ContentStudioUpgradeBanner />

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList>
          <TabsTrigger value="dashboard">Meine Videos</TabsTrigger>
          <TabsTrigger value="batch">Batch Upload</TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard" className="mt-6">
          <VideoManagementDashboard />
        </TabsContent>
        
        <TabsContent value="batch" className="mt-6">
          {firstTemplate ? (
            <BatchVideoUpload
              templateId={firstTemplate.id}
              requiredFields={firstTemplate.customizable_fields
                .filter(f => f.required)
                .map(f => f.key)}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Keine Templates verfügbar
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
