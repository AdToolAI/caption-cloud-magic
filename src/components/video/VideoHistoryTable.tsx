import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VideoStatusBadge } from './VideoStatusBadge';
import { VideoActionMenu } from './VideoActionMenu';
import { VersionAnalytics } from './VersionAnalytics';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { History, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react';

interface VideoHistoryTableProps {
  videos: any[];
  templatesById?: Record<string, any>;
}

export const VideoHistoryTable = ({ videos, templatesById }: VideoHistoryTableProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (videoId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(videoId)) {
      newExpanded.delete(videoId);
    } else {
      newExpanded.add(videoId);
    }
    setExpandedRows(newExpanded);
  };

  if (videos.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Noch keine Videos erstellt
      </div>
    );
  }

  // Group videos by parent
  const groupedVideos = videos.reduce<Record<string, any[]>>((acc, video) => {
    const parentId = video.parent_video_id || video.id;
    if (!acc[parentId]) {
      acc[parentId] = [];
    }
    acc[parentId].push(video);
    return acc;
  }, {});

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Template</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Erstellt</TableHead>
          <TableHead>Qualität</TableHead>
          <TableHead className="text-right">Aktionen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.entries(groupedVideos).map(([parentId, groupVideos]: [string, any[]]) => {
          const mainVideo = groupVideos.find(v => !v.parent_video_id) || groupVideos[0];
          const template = templatesById?.[mainVideo.template_id];
          const templateName = template?.name || 'Template';
          const hasVersions = groupVideos.length > 1;
          const isExpanded = expandedRows.has(mainVideo.id);

          return (
            <>
              <TableRow key={mainVideo.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {hasVersions && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => toggleRow(mainVideo.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{templateName}</span>
                        {hasVersions && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <History className="h-3 w-3" />
                            {groupVideos.length}
                          </Badge>
                        )}
                      </div>
                      {mainVideo.version_number && mainVideo.version_number > 1 && (
                        <Badge variant="outline" className="text-xs">
                          v{mainVideo.version_number}
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <VideoStatusBadge status={mainVideo.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(mainVideo.created_at), {
                    addSuffix: true,
                    locale: de,
                  })}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {mainVideo.quality || '1080p'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <VideoActionMenu video={mainVideo} />
                </TableCell>
              </TableRow>

              {/* Expanded Versions */}
              {hasVersions && isExpanded && (
                <TableRow>
                  <TableCell colSpan={5} className="bg-muted/30">
                    <div className="pl-10 py-4 space-y-4">
                      {/* Analytics */}
                      <VersionAnalytics versions={groupVideos} />

                      {/* Version List */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          <BarChart3 className="h-4 w-4" />
                          Alle Versionen
                        </h4>
                        <div className="space-y-2">
                          {groupVideos
                            .sort((a, b) => (b.version_number || 0) - (a.version_number || 0))
                            .map((version) => {
                              const versionTemplate = templatesById?.[version.template_id];
                              const versionTemplateName = versionTemplate?.name || 'Template';

                              return (
                                <div
                                  key={version.id}
                                  className="flex items-center justify-between p-3 border rounded-lg bg-background hover:bg-muted/50 transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="font-mono">
                                      v{version.version_number}
                                    </Badge>
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">
                                          {versionTemplateName}
                                        </span>
                                        <VideoStatusBadge status={version.status} />
                                      </div>
                                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        <span>
                                          {formatDistanceToNow(new Date(version.created_at), {
                                            addSuffix: true,
                                            locale: de,
                                          })}
                                        </span>
                                        <span>{version.download_count || 0} Downloads</span>
                                        <span>{version.share_count || 0} Shares</span>
                                      </div>
                                    </div>
                                  </div>
                                  <VideoActionMenu video={version} />
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          );
        })}
      </TableBody>
    </Table>
  );
};
