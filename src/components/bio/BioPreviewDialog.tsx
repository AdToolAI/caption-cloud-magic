import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from "@/hooks/useTranslation";

interface BioPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  bioText: string;
  platform: string;
}

export function BioPreviewDialog({ open, onClose, bioText, platform }: BioPreviewDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("bio_preview")} - {platform}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mock Profile Preview */}
          <div className="border rounded-lg p-4 bg-card">
            <div className="flex items-start gap-3 mb-3">
              <Avatar className="w-16 h-16">
                <AvatarFallback>YB</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="font-semibold">Your Brand</h3>
                <p className="text-sm text-muted-foreground">@yourbrand</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm whitespace-pre-wrap">{bioText}</p>
            </div>

            {platform === "instagram" && (
              <div className="grid grid-cols-3 gap-1 mt-4 pt-4 border-t">
                <div className="aspect-square bg-muted rounded"></div>
                <div className="aspect-square bg-muted rounded"></div>
                <div className="aspect-square bg-muted rounded"></div>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            This is a preview of how your bio might look on {platform}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
