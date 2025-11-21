import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PublishToSocialTab } from '@/components/composer/PublishToSocialTab';
import { Send } from 'lucide-react';

interface PublishNowButtonProps {
  block: {
    id: string;
    content_items?: {
      thumb_url?: string;
      caption?: string;
      hashtags?: string[];
      type?: string;
    };
  };
  onPublished?: () => void;
}

export function PublishNowButton({ block, onPublished }: PublishNowButtonProps) {
  const [open, setOpen] = useState(false);

  const content = block.content_items;
  if (!content) return null;

  const videoUrl = content.thumb_url || '';
  const caption = content.caption || '';
  const hashtags = content.hashtags || [];

  const handlePublished = () => {
    setOpen(false);
    onPublished?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2">
          <Send className="h-4 w-4" />
          Jetzt veröffentlichen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Auf Social Media veröffentlichen</DialogTitle>
        </DialogHeader>
        <PublishToSocialTab
          videoUrl={videoUrl}
          defaultCaption={caption}
          defaultHashtags={hashtags}
          onPublished={handlePublished}
        />
      </DialogContent>
    </Dialog>
  );
}
