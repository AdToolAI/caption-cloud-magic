import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Video } from 'lucide-react';
import { VideoCreatorDialog } from './VideoCreatorDialog';

interface VideoCreatorButtonProps {
  onVideoCreated?: (videoUrl: string) => void;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export const VideoCreatorButton = ({ 
  onVideoCreated, 
  variant = 'default',
  size = 'default',
  className 
}: VideoCreatorButtonProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setDialogOpen(true)}
        className={className}
      >
        <Video className="h-4 w-4 mr-2" />
        Werbevideo erstellen
      </Button>

      <VideoCreatorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onVideoCreated={(url) => {
          onVideoCreated?.(url);
          setDialogOpen(false);
        }}
      />
    </>
  );
};
