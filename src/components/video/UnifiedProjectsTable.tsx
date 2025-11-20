import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { VideoStatusBadge } from './VideoStatusBadge';
import { VideoActionMenu } from './VideoActionMenu';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Video, Film, Camera, BookOpen, MessageSquare, Newspaper } from 'lucide-react';
import type { UnifiedProject } from '@/hooks/useUnifiedProjects';

interface UnifiedProjectsTableProps {
  projects: UnifiedProject[];
  templatesById?: Record<string, any>;
}

const contentTypeIcons = {
  ad: Video,
  story: Camera,
  reel: Film,
  tutorial: BookOpen,
  testimonial: MessageSquare,
  news: Newspaper
};

const contentTypeLabels = {
  ad: 'Werbevideo',
  story: 'Story',
  reel: 'Reel',
  tutorial: 'Tutorial',
  testimonial: 'Testimonial',
  news: 'News'
};

export const UnifiedProjectsTable = ({ projects, templatesById }: UnifiedProjectsTableProps) => {
  if (projects.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Noch keine Videos erstellt
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Projekt</TableHead>
          <TableHead>Content-Type</TableHead>
          <TableHead>Quelle</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Erstellt</TableHead>
          <TableHead className="text-right">Aktionen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => {
          const Icon = contentTypeIcons[project.content_type];
          const template = templatesById?.[project.template_id || ''];
          const displayName = project.project_name || template?.name || 'Untitled Project';

          return (
            <TableRow key={project.id}>
              <TableCell>
                <div className="space-y-1">
                  <div className="font-medium">{displayName}</div>
                  {project.credits_used && (
                    <div className="text-xs text-muted-foreground">
                      {project.credits_used} Credits
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="gap-1.5">
                  <Icon className="h-3 w-3" />
                  {contentTypeLabels[project.content_type]}
                </Badge>
              </TableCell>
              <TableCell>
                {project.source === 'content_studio' ? (
                  <Badge className="bg-primary/10 text-primary border-primary/20">
                    Content Studio
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    Video Manager
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <VideoStatusBadge 
                  status={(project.status === 'draft' ? 'pending' : project.status) as 'completed' | 'pending' | 'rendering' | 'failed'} 
                />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(project.created_at), {
                  addSuffix: true,
                  locale: de,
                })}
              </TableCell>
              <TableCell className="text-right">
                <VideoActionMenu 
                  video={{
                    id: project.id,
                    status: (project.status === 'draft' ? 'pending' : project.status) as 'completed' | 'pending' | 'rendering' | 'failed',
                    output_url: project.output_urls?.default || Object.values(project.output_urls)[0] || null,
                    user_id: '',
                    template_id: project.template_id || '',
                    customizations: {},
                    render_id: project.render_id || null,
                    error_message: null,
                    credits_used: project.credits_used || 0,
                    created_at: project.created_at,
                    updated_at: project.created_at
                  } as any} 
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
