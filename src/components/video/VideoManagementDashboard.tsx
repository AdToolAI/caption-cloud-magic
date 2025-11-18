import { useMemo } from 'react';
import { VideoHistoryTable } from './VideoHistoryTable';
import { Card } from '@/components/ui/card';
import { useVideoHistory } from '@/hooks/useVideoHistory';
import { useVideoTemplates } from '@/hooks/useVideoTemplates';
import { Loader2 } from 'lucide-react';

export const VideoManagementDashboard = () => {
  const { videos, isLoading, error } = useVideoHistory();
  const { data: templates } = useVideoTemplates();

  const templatesById = useMemo(
    () => Object.fromEntries((templates || []).map((t) => [t.id, t])),
    [templates]
  );

  const stats = {
    total: videos.length,
    completed: videos.filter(v => v.status === 'completed').length,
    pending: videos.filter(v => v.status === 'pending').length,
    failed: videos.filter(v => v.status === 'failed').length
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-2">
        <p className="text-red-600 font-medium">
          Fehler beim Laden deiner Videos
        </p>
        <p className="text-sm text-muted-foreground">
          {(error as Error).message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="text-2xl font-bold text-foreground">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Fertig</div>
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">In Bearbeitung</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Fehlgeschlagen</div>
          <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
        </Card>
      </div>

      {/* Video Table */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">Meine Videos</h2>
        <VideoHistoryTable videos={videos} templatesById={templatesById} />
      </Card>
    </div>
  );
};
