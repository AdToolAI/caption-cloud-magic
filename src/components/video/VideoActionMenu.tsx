import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreVertical, Download, Share2, Trash2, Eye } from 'lucide-react';
import { useVideoHistory } from '@/hooks/useVideoHistory';
import { useState } from 'react';
import { VideoPreviewPlayer } from './VideoPreviewPlayer';
import { VideoShareDialog } from './VideoShareDialog';
import type { VideoCreation } from '@/types/video';

interface VideoActionMenuProps {
  video: VideoCreation;
}

export const VideoActionMenu = ({ video }: VideoActionMenuProps) => {
  const { deleteVideo, trackDownload, isDeletingVideo } = useVideoHistory();
  const [showPreview, setShowPreview] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const handleDownload = () => {
    if (video.output_url) {
      trackDownload(video.id);
      window.open(video.output_url, '_blank');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={isDeletingVideo}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {video.status === 'completed' && video.output_url && (
            <>
              <DropdownMenuItem onClick={() => setShowPreview(true)}>
                <Eye className="h-4 w-4 mr-2" />
                Vorschau
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Herunterladen
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowShare(true)}>
                <Share2 className="h-4 w-4 mr-2" />
                Teilen
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem 
            onClick={() => deleteVideo(video.id)}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Löschen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {video.output_url && (
        <>
          <VideoPreviewPlayer
            open={showPreview}
            onOpenChange={setShowPreview}
            videoUrl={video.output_url}
            title={`Video ${video.id.slice(0, 8)}`}
          />
          <VideoShareDialog
            open={showShare}
            onOpenChange={setShowShare}
            video={video}
          />
        </>
      )}
    </>
  );
};
