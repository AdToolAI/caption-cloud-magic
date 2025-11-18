import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { VideoStatusBadge } from './VideoStatusBadge';
import { VideoActionMenu } from './VideoActionMenu';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface VideoHistoryTableProps {
  videos: any[];
  templatesById?: Record<string, any>;
}

export const VideoHistoryTable = ({ videos, templatesById }: VideoHistoryTableProps) => {
  if (videos.length === 0) {
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
          <TableHead>Vorschau</TableHead>
          <TableHead>Template</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Erstellt</TableHead>
          <TableHead>Qualität</TableHead>
          <TableHead className="text-right">Aktionen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {videos.map((video) => {
          const template = templatesById?.[video.template_id];
          const thumbnail = video.thumbnail_url || template?.thumbnail_url || '/placeholder.svg';
          const templateName = template?.name || 'Template';
          const templateCategory = template?.category || 'Werbevideo';

          return (
            <TableRow key={video.id}>
              <TableCell>
                <img
                  src={thumbnail}
                  alt={templateName}
                  className="w-16 h-10 object-cover rounded"
                />
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-medium text-foreground">{templateName}</div>
                  <div className="text-sm text-muted-foreground">{templateCategory}</div>
                </div>
              </TableCell>
              <TableCell>
                <VideoStatusBadge status={video.status} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(video.created_at), { addSuffix: true, locale: de })}
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">{video.quality || '1080p'}</span>
              </TableCell>
              <TableCell className="text-right">
                <VideoActionMenu video={video} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
