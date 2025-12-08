import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Upload, X, Image, Video, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PostMediaUploaderProps {
  mediaUrl?: string;
  mediaType?: "image" | "video";
  onMediaChange: (url: string | undefined, type: "image" | "video" | undefined) => void;
  className?: string;
}

export function PostMediaUploader({
  mediaUrl,
  mediaType,
  onMediaChange,
  className,
}: PostMediaUploaderProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleUpload = useCallback(async (file: File) => {
    if (!user) {
      toast({ title: "Nicht angemeldet", variant: "destructive" });
      return;
    }

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isVideo && !isImage) {
      toast({ title: "Nur Bilder und Videos erlaubt", variant: "destructive" });
      return;
    }

    const maxSize = isVideo ? 1024 * 1024 * 1024 : 100 * 1024 * 1024; // 1GB für Videos, 100MB für Bilder
    if (file.size > maxSize) {
      toast({
        title: `Datei zu groß`,
        description: `Maximum: ${isVideo ? "1GB" : "100MB"}`,
        variant: "destructive",
      });
      return;
    }

    try {
      setUploading(true);
      const ext = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("media-assets")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("media-assets")
        .getPublicUrl(fileName);

      onMediaChange(urlData.publicUrl, isVideo ? "video" : "image");
      toast({ title: "Medium hochgeladen" });
    } catch (error) {
      console.error("Upload error:", error);
      toast({ title: "Upload fehlgeschlagen", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [user, onMediaChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleRemove = useCallback(() => {
    onMediaChange(undefined, undefined);
  }, [onMediaChange]);

  if (mediaUrl) {
    return (
      <div className={cn("relative rounded-xl overflow-hidden border border-white/20 bg-black/40 backdrop-blur-sm", className)}>
        {mediaType === "video" ? (
          <video
            src={mediaUrl}
            className="w-full h-48 object-cover"
            controls
            playsInline
          />
        ) : (
          <img
            src={mediaUrl}
            alt="Post media"
            className="w-full h-48 object-cover"
          />
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={handleRemove}
            className="h-8"
          >
            <X className="h-4 w-4 mr-1" />
            Entfernen
          </Button>
        </div>
        <div className="absolute top-2 left-2">
          {mediaType === "video" ? (
            <div className="bg-primary/90 text-primary-foreground px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 shadow-lg">
              <Video className="h-3.5 w-3.5" />
              Video
            </div>
          ) : (
            <div className="bg-cyan/90 text-black px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 shadow-lg">
              <Image className="h-3.5 w-3.5" />
              Bild
            </div>
          )}
        </div>
        <div className="absolute bottom-2 right-2">
          <div className="bg-green-500/90 text-white px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1 shadow-lg">
            ✓ Hochgeladen
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-lg p-4 text-center transition-all cursor-pointer",
        dragOver
          ? "border-primary bg-primary/10"
          : "border-white/20 hover:border-white/40 bg-white/5",
        className
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={uploading}
      />
      {uploading ? (
        <div className="flex flex-col items-center gap-2 py-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Wird hochgeladen...</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-4">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Bild oder Video hier ablegen
          </span>
          <span className="text-xs text-muted-foreground/70">
            oder klicken zum Auswählen
          </span>
        </div>
      )}
    </div>
  );
}
