import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FolderPlus, Trash2, X } from "lucide-react";

interface StudioLightboxProps {
  image: {
    id?: string;
    url: string;
    prompt?: string;
    style?: string;
    aspectRatio?: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload?: (url: string) => void;
  onSaveToAlbum?: (image: any) => void;
  onDelete?: (image: any) => void;
}

export function StudioLightbox({ image, open, onOpenChange, onDownload, onSaveToAlbum, onDelete }: StudioLightboxProps) {
  if (!image) return null;

  const handleDownload = async () => {
    if (onDownload) {
      onDownload(image.url);
      return;
    }
    const response = await fetch(image.url);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studio-${image.style || 'image'}-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] p-0 gap-0 bg-background border-border overflow-hidden">
        <div className="relative">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 z-10 h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Image */}
          <div className="bg-white flex items-center justify-center min-h-[300px] max-h-[70vh]">
            <img
              src={image.url}
              alt={image.prompt || 'Studio image'}
              className="max-w-full max-h-[70vh] object-contain"
            />
          </div>

          {/* Info + Actions */}
          <div className="p-4 space-y-3">
            {image.prompt && (
              <p className="text-sm text-muted-foreground">{image.prompt}</p>
            )}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" /> Download
              </Button>
              {onSaveToAlbum && (
                <Button variant="outline" size="sm" onClick={() => { onSaveToAlbum(image); onOpenChange(false); }}>
                  <FolderPlus className="h-4 w-4 mr-1" /> In Album
                </Button>
              )}
              {onDelete && (
                <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => { onDelete(image); onOpenChange(false); }}>
                  <Trash2 className="h-4 w-4 mr-1" /> Löschen
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
