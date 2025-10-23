import { useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, X, Image as ImageIcon, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MediaUploaderProps {
  selectedMedia: File[];
  onMediaChange: (files: File[]) => void;
}

const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

export function MediaUploader({ selectedMedia, onMediaChange }: MediaUploaderProps) {
  const { toast } = useToast();

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files) return;

      const newFiles = Array.from(files);
      const hasVideo = selectedMedia.some((f) => f.type.startsWith("video/"));
      const newHasVideo = newFiles.some((f) => f.type.startsWith("video/"));

      // Validation: Cannot mix images and videos
      if (hasVideo && newFiles.some((f) => !f.type.startsWith("video/"))) {
        toast({
          title: "Invalid selection",
          description: "Cannot mix images and videos.",
          variant: "destructive",
        });
        return;
      }

      if (newHasVideo && selectedMedia.length > 0) {
        toast({
          title: "Invalid selection",
          description: "Cannot mix images and videos.",
          variant: "destructive",
        });
        return;
      }

      // Validation: Max 1 video or 4 images
      if (newHasVideo && (newFiles.length > 1 || selectedMedia.length > 0)) {
        toast({
          title: "Invalid selection",
          description: "Only 1 video allowed.",
          variant: "destructive",
        });
        return;
      }

      if (!newHasVideo && selectedMedia.length + newFiles.length > MAX_IMAGES) {
        toast({
          title: "Too many files",
          description: `Maximum ${MAX_IMAGES} images allowed.`,
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
            title: "File too large",
            description: `${file.name} exceeds ${isVideo ? "100MB" : "10MB"} limit.`,
            variant: "destructive",
          });
          return;
        }

        // Validation: File types
        const validImageTypes = ["image/jpeg", "image/png", "image/webp"];
        const validVideoTypes = ["video/mp4", "video/quicktime"];

        if (!isVideo && !validImageTypes.includes(file.type)) {
          toast({
            title: "Invalid file type",
            description: `${file.name} must be JPEG, PNG, or WEBP.`,
            variant: "destructive",
          });
          return;
        }

        if (isVideo && !validVideoTypes.includes(file.type)) {
          toast({
            title: "Invalid file type",
            description: `${file.name} must be MP4 or MOV.`,
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
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Media (optional)</label>

      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer"
        onClick={() => document.getElementById("media-input")?.click()}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Drag & Drop or click to upload
          <br />
          <span className="text-xs">Max 4 images (10MB each) or 1 video (100MB)</span>
        </p>
        <input
          id="media-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </div>

      {/* Preview */}
      {selectedMedia.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {selectedMedia.map((file, index) => (
            <Card key={index} className="relative p-2">
              <div className="flex items-center gap-2">
                {file.type.startsWith("video/") ? (
                  <Video className="h-8 w-8 text-primary" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-primary" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemove(index)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
