import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { VideoStatusBadge } from './VideoStatusBadge';
import { VideoActionMenu } from './VideoActionMenu';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface VideoHistoryTableProps {
  videos: any[];
}

export const VideoHistoryTable = ({ videos }: VideoHistoryTableProps) => {
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
        {videos.map((video) => (
          <TableRow key={video.id}>
            <TableCell>
              <img
                src={video.video_templates.thumbnail_url}
                alt={video.video_templates.name}
                className="w-16 h-10 object-cover rounded"
              />
            </TableCell>
            <TableCell>
              <div>
                <div className="font-medium text-foreground">{video.video_templates.name}</div>
                <div className="text-sm text-muted-foreground">{video.video_templates.category}</div>
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
        ))}
      </TableBody>
    </Table>
  );
};
