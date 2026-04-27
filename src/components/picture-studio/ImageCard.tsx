import { motion } from "framer-motion";
import { Download, FolderPlus, Maximize2, Trash2, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useImageUpscaler, type UpscaleFactor } from "@/hooks/useImageUpscaler";

interface ImageCardProps {
  image: {
    id?: string;
    url: string;
    prompt?: string;
    style?: string;
    aspectRatio?: string;
    upscale_factor?: number | null;
    parent_id?: string | null;
  };
  index: number;
  onDownload?: (url: string) => void;
  onSaveToAlbum?: (image: any) => void;
  onOpenLightbox?: (image: any) => void;
  onDelete?: (image: any) => void;
  onUpscaled?: (upscaled: { id?: string; url: string; previewUrl: string; factor: UpscaleFactor; parentId: string | null }, original: any) => void;
}

export function ImageCard({ image, index, onDownload, onSaveToAlbum, onOpenLightbox, onDelete, onUpscaled }: ImageCardProps) {
  const { upscale, upscalingId } = useImageUpscaler();
  const isUpscalingThis = upscalingId === (image.id || image.url);
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
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!image.id) return;
    e.dataTransfer.setData('application/json', JSON.stringify(image));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className="group relative rounded-xl overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/40 hover:shadow-[0_0_20px_rgba(var(--primary),0.15)] transition-all duration-300"
    >
      <div
        draggable={!!image.id}
        onDragStart={handleDragStart as any}
        className="contents"
      >
      <div
        className="overflow-hidden cursor-pointer bg-white p-2 flex items-center justify-center relative"
        style={{ aspectRatio: image.aspectRatio?.replace(':', ' / ') || '1 / 1' }}
        onClick={() => onOpenLightbox?.(image)}
      >
        <img
          src={image.url}
          alt={image.prompt || 'Generated image'}
          className="w-full h-full object-contain"
          onError={(e) => {
            const target = e.currentTarget;
            if (!target.dataset.retried) {
              target.dataset.retried = 'true';
              target.src = image.url + '?t=' + Date.now();
            }
          }}
        />
        {/* Upscaling overlay */}
        {isUpscalingThis && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs text-foreground font-medium">Upscaling…</p>
          </div>
        )}
        {/* Upscale badge */}
        {alreadyUpscaled && (
          <Badge className="absolute top-2 left-2 bg-primary/90 text-primary-foreground text-[10px] h-5 z-10">
            <Sparkles className="h-2.5 w-2.5 mr-0.5" /> {image.upscale_factor}× HD
          </Badge>
        )}
      </div>

      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 pointer-events-none">
        {image.prompt && (
          <p className="text-xs text-foreground/80 line-clamp-2 mb-2">{image.prompt}</p>
        )}
        <div className="flex items-center gap-1">
          {image.style && (
            <Badge variant="secondary" className="text-[10px] bg-muted/80 backdrop-blur-sm">
              {image.style}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 mt-2 pointer-events-auto">
          <Button size="icon" variant="ghost" className="h-7 w-7 bg-muted/50 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); handleDownload(); }}>
            <Download className="h-3.5 w-3.5" />
          </Button>
          {!alreadyUpscaled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 bg-primary/30 backdrop-blur-sm hover:bg-primary/50 text-primary-foreground"
                  onClick={(e) => e.stopPropagation()}
                  disabled={isUpscalingThis}
                  title="AI Upscale"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
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
            <Button size="icon" variant="ghost" className="h-7 w-7 bg-muted/50 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onSaveToAlbum(image); }}>
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7 bg-muted/50 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onOpenLightbox?.(image); }}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
          {onDelete && (
            <Button size="icon" variant="ghost" className="h-7 w-7 bg-destructive/20 backdrop-blur-sm hover:bg-destructive/40 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(image); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      </div>
    </motion.div>
  );
}
