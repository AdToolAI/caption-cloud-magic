import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VideoImportStep } from '@/components/directors-cut/steps/VideoImportStep';
import { useTranslation } from '@/hooks/useTranslation';
import type { SelectedVideo } from '@/types/directors-cut';

interface VideoImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedVideo: SelectedVideo | null;
  onVideoSelect: (video: SelectedVideo | null) => void;
}

export function VideoImportDialog({ open, onOpenChange, selectedVideo, onVideoSelect }: VideoImportDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('dc.importVideo')}</DialogTitle>
          <DialogDescription>{t('dc.importVideoDesc')}</DialogDescription>
        </DialogHeader>
        <VideoImportStep
          selectedVideo={selectedVideo}
          onVideoSelect={(video) => {
            onVideoSelect(video);
            if (video) onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
