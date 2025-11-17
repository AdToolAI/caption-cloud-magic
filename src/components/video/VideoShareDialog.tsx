import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useVideoHistory } from '@/hooks/useVideoHistory';
import { Instagram, Facebook, Twitter, Linkedin, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { VideoCreation } from '@/types/video';

interface VideoShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: VideoCreation;
}

export const VideoShareDialog = ({ open, onOpenChange, video }: VideoShareDialogProps) => {
  const { trackShare } = useVideoHistory();
  const { toast } = useToast();

  const handleShare = (platform: string) => {
    trackShare({
      videoId: video.id,
      platform,
      shareUrl: video.output_url
    });

    toast({
      title: 'Video geteilt',
      description: `Video auf ${platform} geteilt`
    });
  };

  const copyLink = () => {
    if (video.output_url) {
      navigator.clipboard.writeText(video.output_url);
      toast({ title: 'Link kopiert' });
    }
  };

  const platforms = [
    { name: 'Instagram', icon: Instagram, action: () => handleShare('instagram') },
    { name: 'Facebook', icon: Facebook, action: () => handleShare('facebook') },
    { name: 'Twitter', icon: Twitter, action: () => handleShare('twitter') },
    { name: 'LinkedIn', icon: Linkedin, action: () => handleShare('linkedin') }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Video teilen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {platforms.map((platform) => (
              <Button
                key={platform.name}
                variant="outline"
                className="flex items-center gap-2"
                onClick={platform.action}
              >
                <platform.icon className="h-4 w-4" />
                {platform.name}
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={video.output_url || ''}
              readOnly
              className="flex-1 px-3 py-2 border rounded-md bg-muted text-sm"
            />
            <Button variant="outline" size="icon" onClick={copyLink}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
