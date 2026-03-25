import { motion } from "framer-motion";
import { Download, FolderPlus, Copy, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ImageCardProps {
  image: {
    id?: string;
    url: string;
    prompt?: string;
    style?: string;
    aspectRatio?: string;
  };
  index: number;
  onDownload?: (url: string) => void;
  onSaveToAlbum?: (image: any) => void;
  onOpenLightbox?: (image: any) => void;
}

export function ImageCard({ image, index, onDownload, onSaveToAlbum, onOpenLightbox }: ImageCardProps) {
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
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className="group relative rounded-xl overflow-hidden border border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/40 hover:shadow-[0_0_20px_rgba(var(--primary),0.15)] transition-all duration-300"
    >
      <div className="aspect-square overflow-hidden cursor-pointer" onClick={() => onOpenLightbox?.(image)}>
        <img
          src={image.url}
          alt={image.prompt || 'Generated image'}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
      </div>

      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
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
        <div className="flex items-center gap-1 mt-2">
          <Button size="icon" variant="ghost" className="h-7 w-7 bg-muted/50 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); handleDownload(); }}>
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 bg-muted/50 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onSaveToAlbum?.(image); }}>
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 bg-muted/50 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onOpenLightbox?.(image); }}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
