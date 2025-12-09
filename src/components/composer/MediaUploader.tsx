import { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, X, Image as ImageIcon, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface MediaUploaderProps {
  selectedMedia: File[];
  onMediaChange: (files: File[]) => void;
}

const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 1024 * 1024 * 1024; // 1GB

export function MediaUploader({ selectedMedia, onMediaChange }: MediaUploaderProps) {
  const { toast } = useToast();
  const [isDragActive, setIsDragActive] = useState(false);

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files) return;

      const newFiles = Array.from(files);
      const hasVideo = selectedMedia.some((f) => f.type.startsWith("video/"));
      const newHasVideo = newFiles.some((f) => f.type.startsWith("video/"));

      // Validation: Cannot mix images and videos
      if (hasVideo && newFiles.some((f) => !f.type.startsWith("video/"))) {
        toast({
          title: "Ungültige Auswahl",
          description: "Bilder und Videos können nicht gemischt werden.",
          variant: "destructive",
        });
        return;
      }

      if (newHasVideo && selectedMedia.length > 0) {
        toast({
          title: "Ungültige Auswahl",
          description: "Bilder und Videos können nicht gemischt werden.",
          variant: "destructive",
        });
        return;
      }

      // Validation: Max 1 video or 4 images
      if (newHasVideo && (newFiles.length > 1 || selectedMedia.length > 0)) {
        toast({
          title: "Ungültige Auswahl",
          description: "Nur 1 Video erlaubt.",
          variant: "destructive",
        });
        return;
      }

      if (!newHasVideo && selectedMedia.length + newFiles.length > MAX_IMAGES) {
        toast({
          title: "Zu viele Dateien",
          description: `Maximal ${MAX_IMAGES} Bilder erlaubt.`,
          variant: "destructive",
        });
        return;
      }

      // Validation: File sizes
      for (const file of newFiles) {
        const isVideo = file.type.startsWith("video/");
        const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

        if (file.size > maxSize) {
          toast({
            title: "Datei zu groß",
            description: `${file.name} überschreitet das ${isVideo ? "1GB" : "10MB"} Limit.`,
            variant: "destructive",
          });
          return;
        }

        // Validation: File types
        const validImageTypes = ["image/jpeg", "image/png", "image/webp"];
        const validVideoTypes = ["video/mp4", "video/quicktime"];

        if (!isVideo && !validImageTypes.includes(file.type)) {
          toast({
            title: "Ungültiger Dateityp",
            description: `${file.name} muss JPEG, PNG oder WEBP sein.`,
            variant: "destructive",
          });
          return;
        }

        if (isVideo && !validVideoTypes.includes(file.type)) {
          toast({
            title: "Ungültiger Dateityp",
            description: `${file.name} muss MP4 oder MOV sein.`,
            variant: "destructive",
          });
          return;
        }
      }

      onMediaChange([...selectedMedia, ...newFiles]);
    },
    [selectedMedia, onMediaChange, toast]
  );

  const handleRemove = (index: number) => {
    const newMedia = [...selectedMedia];
    newMedia.splice(index, 1);
    onMediaChange(newMedia);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragActive(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground">Medien (optional)</label>

      {/* Upload Area */}
      <motion.div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => document.getElementById("media-input")?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300",
          "bg-muted/20 backdrop-blur-sm border-white/20",
          "hover:border-primary/50 hover:bg-muted/30 hover:shadow-[0_0_25px_hsla(43,90%,68%,0.15)]",
          isDragActive && "border-primary bg-primary/10 shadow-[0_0_30px_hsla(43,90%,68%,0.25)]"
        )}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        {/* Animated Border Glow when Dragging */}
        {isDragActive && (
          <motion.div
            className="absolute inset-0 rounded-xl border-2 border-primary"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}

        <motion.div
          animate={isDragActive ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <Upload className={cn(
            "h-10 w-10 mx-auto mb-3 transition-colors",
            isDragActive ? "text-primary" : "text-muted-foreground"
          )} />
        </motion.div>
        
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Drag & Drop</span> oder klicken zum Upload
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Max. 4 Bilder (10MB) oder 1 Video (1GB)
        </p>
        
        <input
          id="media-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </motion.div>

      {/* Preview */}
      <AnimatePresence mode="popLayout">
        {selectedMedia.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="grid grid-cols-2 gap-2"
          >
            {selectedMedia.map((file, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="relative p-3 bg-muted/30 backdrop-blur-sm border-white/10 hover:border-white/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      file.type.startsWith("video/") 
                        ? "bg-cyan-500/20 text-cyan-400" 
                        : "bg-primary/20 text-primary"
                    )}>
                      {file.type.startsWith("video/") ? (
                        <Video className="h-5 w-5" />
                      ) : (
                        <ImageIcon className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.size > 0 
                          ? `${(file.size / 1024 / 1024).toFixed(2)} MB` 
                          : 'Streaming-Video'
                        }
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive" 
                      onClick={() => handleRemove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
