import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { EnhanceVideoPanel } from '@/components/ai-video/EnhanceVideoPanel';
import { useTx } from '@/lib/i18nText';

/**
 * Dialog wrapper around the single enhance surface.
 *
 * Every entry point (media library lightbox, Director's Cut, AI Video Studio)
 * renders the SAME panel, which talks to useEnhanceVideo -> `video-enhance`.
 * There is deliberately no second pricing, wallet or persistence path here.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The already-stored source video. No download/reupload happens. */
  sourceUrl?: string;
  sourceAssetId?: string;
  onCompleted?: (outputUrl: string) => void;
}

export function EnhanceVideoDialog({
  open,
  onOpenChange,
  sourceUrl,
  sourceAssetId,
  onCompleted,
}: Props) {
  const tx = useTx();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">
          {tx({ de: 'Video verbessern', en: 'Enhance video', es: 'Mejorar vídeo' })}
        </DialogTitle>
        <EnhanceVideoPanel
          initialSourceUrl={sourceUrl}
          initialSourceAssetId={sourceAssetId}
          onCompleted={onCompleted}
        />
      </DialogContent>
    </Dialog>
  );
}
