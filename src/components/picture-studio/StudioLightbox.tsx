import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FolderPlus, Trash2, X, Sparkles, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useImageUpscaler, type UpscaleFactor } from "@/hooks/useImageUpscaler";

interface StudioLightboxProps {
  image: {
    id?: string;
    url: string;
    prompt?: string;
    style?: string;
    aspectRatio?: string;
    upscale_factor?: number | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload?: (url: string) => void;
  onSaveToAlbum?: (image: any) => void;
  onDelete?: (image: any) => void;
  onUpscaled?: (upscaled: { id?: string; url: string; previewUrl: string; factor: UpscaleFactor; parentId: string | null }, original: any) => void;
}

export function StudioLightbox({ image, open, onOpenChange, onDownload, onSaveToAlbum, onDelete, onUpscaled }: StudioLightboxProps) {
  const { t } = useTranslation();
  const { upscale, upscalingId } = useImageUpscaler();
  if (!image) return null;

  const isUpscaling = upscalingId === (image.id || image.url);
  const alreadyUpscaled = !!image.upscale_factor;

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

  const handleUpscale = async (factor: UpscaleFactor) => {
    const result = await upscale({
      imageUrl: image.url,
      imageId: image.id,
      factor,
      prompt: image.prompt,
    });
    if (result && onUpscaled) {
      onUpscaled(result, image);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] p-0 gap-0 bg-background border-border overflow-hidden">
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 z-10 h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>

          {alreadyUpscaled && (
            <Badge className="absolute top-3 left-3 z-10 bg-primary/90 text-primary-foreground">
              <Sparkles className="h-3 w-3 mr-1" /> {image.upscale_factor}× HD
            </Badge>
          )}

          <div className="bg-white flex items-center justify-center min-h-[300px] max-h-[70vh] relative">
            <img
              src={image.url}
              alt={image.prompt || 'Studio image'}
              className="max-w-full max-h-[70vh] object-contain"
            />
            {isUpscaling && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-sm font-medium">AI Upscaling läuft… (kann 30–90s dauern)</p>
              </div>
            )}
          </div>

          <div className="p-4 space-y-3">
            {image.prompt && (
              <p className="text-sm text-muted-foreground">{image.prompt}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" /> {t('picStudio.download')}
              </Button>
              {!alreadyUpscaled && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      disabled={isUpscaling}
                      className="bg-gradient-to-r from-primary to-primary/80"
                    >
                      <Sparkles className="h-4 w-4 mr-1" /> AI Upscale
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => handleUpscale(2)}>
                      <Sparkles className="h-3.5 w-3.5 mr-2 text-primary" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">Upscale 2×</div>
                        <div className="text-[10px] text-muted-foreground">€0.03 · ~2K → 4K</div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleUpscale(4)}>
                      <Sparkles className="h-3.5 w-3.5 mr-2 text-primary" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">Upscale 4×</div>
                        <div className="text-[10px] text-muted-foreground">€0.06 · Print-Quality</div>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {onSaveToAlbum && (
                <Button variant="outline" size="sm" onClick={() => { onSaveToAlbum(image); onOpenChange(false); }}>
                  <FolderPlus className="h-4 w-4 mr-1" /> {t('picStudio.toAlbum')}
                </Button>
              )}
              {onDelete && (
                <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => { onDelete(image); onOpenChange(false); }}>
                  <Trash2 className="h-4 w-4 mr-1" /> {t('picStudio.deleteLabel')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
