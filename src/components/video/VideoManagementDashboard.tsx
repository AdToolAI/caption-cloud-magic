import { useState, useMemo } from 'react';
import { UnifiedProjectsTable } from './UnifiedProjectsTable';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUnifiedProjects } from '@/hooks/useUnifiedProjects';
import { useVideoTemplates } from '@/hooks/useVideoTemplates';
import { Loader2 } from 'lucide-react';

export const VideoManagementDashboard = () => {
  const [contentTypeFilter, setContentTypeFilter] = useState('all');
  const { data: projects, isLoading, error } = useUnifiedProjects(contentTypeFilter);
  const { data: templates } = useVideoTemplates();

  const templatesById = useMemo(
    () => Object.fromEntries((templates || []).map((t) => [t.id, t])),
    [templates]
  );

  const stats = useMemo(() => {
    if (!projects) return {
      total: 0,
      completed: 0,
      pending: 0,
      failed: 0,
      contentStudio: 0,
      legacy: 0,
      ads: 0,
      stories: 0,
      reels: 0
    };

    return {
      total: projects.length,
      completed: projects.filter(p => p.status === 'completed').length,
      pending: projects.filter(p => p.status === 'rendering' || p.status === 'draft').length,
      failed: projects.filter(p => p.status === 'failed').length,
      contentStudio: projects.filter(p => p.source === 'content_studio').length,
      legacy: projects.filter(p => p.source === 'video_manager').length,
      ads: projects.filter(p => p.content_type === 'ad').length,
      stories: projects.filter(p => p.content_type === 'story').length,
      reels: projects.filter(p => p.content_type === 'reel').length
    };
  }, [projects]);

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
      {/* Content Type Filter */}
      <div className="flex items-center gap-3">
        <Label className="shrink-0">Content-Type:</Label>
        <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle ({stats.total})</SelectItem>
            <SelectItem value="ad">Werbevideos ({stats.ads})</SelectItem>
            <SelectItem value="story">Stories ({stats.stories})</SelectItem>
            <SelectItem value="reel">Reels ({stats.reels})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Enhanced Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Content Studio</div>
          <div className="text-2xl font-bold text-primary">{stats.contentStudio}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Video Manager</div>
          <div className="text-2xl font-bold text-muted-foreground">{stats.legacy}</div>
        </Card>
      </div>

      {/* Unified Projects Table */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">Meine Projekte</h2>
        <UnifiedProjectsTable projects={projects || []} templatesById={templatesById} />
      </Card>
    </div>
  );
};
