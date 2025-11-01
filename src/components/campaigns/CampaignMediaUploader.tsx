import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, X, Image, Video } from "lucide-react";
import { toast } from "sonner";

interface UploadedMedia {
  id: string;
  type: 'image' | 'video';
  url: string;
  file: File;
  preview: string;
}

interface CampaignMediaUploaderProps {
  onMediaChange: (media: UploadedMedia[]) => void;
  maxFiles?: number;
}

export function CampaignMediaUploader({ 
  onMediaChange, 
  maxFiles = 20 
}: CampaignMediaUploaderProps) {
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (files.length === 0) return;
    
    // Validate file count
    if (uploadedMedia.length + files.length > maxFiles) {
      toast.error(`Maximal ${maxFiles} Dateien erlaubt`);
      return;
    }

    // Validate file types and sizes
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      
      if (!isImage && !isVideo) {
        toast.error(`${file.name} ist kein Bild oder Video`);
        return;
      }

      if (file.size > 100 * 1024 * 1024) { // 100MB limit
        toast.error(`${file.name} ist zu groß (max. 100MB)`);
        return;
      }
    }

    setIsUploading(true);

    try {
      const newMedia: UploadedMedia[] = [];

      for (const file of files) {
        const type = file.type.startsWith('video/') ? 'video' : 'image';
        const preview = URL.createObjectURL(file);

        newMedia.push({
          id: Math.random().toString(36),
          type,
          url: '', // Will be set after upload to Supabase
          file,
          preview,
        });
      }

      const updated = [...uploadedMedia, ...newMedia];
      setUploadedMedia(updated);
      onMediaChange(updated);
      
      toast.success(`${files.length} Datei(en) hinzugefügt`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Fehler beim Hochladen');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = (id: string) => {
    const updated = uploadedMedia.filter(m => m.id !== id);
    setUploadedMedia(updated);
    onMediaChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          Medien für Kampagne hochladen (optional)
        </label>
        <span className="text-xs text-muted-foreground">
          {uploadedMedia.length}/{maxFiles}
        </span>
      </div>

      {/* Upload Area */}
      <Card className="border-2 border-dashed p-6 text-center hover:border-primary/50 transition-colors">
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileSelect}
          disabled={isUploading || uploadedMedia.length >= maxFiles}
          className="hidden"
          id="campaign-media-upload"
        />
        <label 
          htmlFor="campaign-media-upload" 
          className="cursor-pointer flex flex-col items-center gap-2"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Bilder & Videos hochladen
          </p>
          <p className="text-xs text-muted-foreground">
            Bis zu {maxFiles} Dateien • Max. 100MB pro Datei
          </p>
        </label>
      </Card>

      {/* Media Preview Grid */}
      {uploadedMedia.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {uploadedMedia.map((media) => (
            <Card key={media.id} className="relative group overflow-hidden">
              {media.type === 'video' ? (
                <div className="aspect-square bg-muted flex items-center justify-center">
                  <Video className="h-12 w-12 text-muted-foreground" />
                </div>
              ) : (
                <img 
                  src={media.preview} 
                  alt="Preview" 
                  className="aspect-square object-cover w-full"
                />
              )}
              
              {/* Remove Button */}
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                onClick={() => handleRemove(media.id)}
              >
                <X className="h-4 w-4" />
              </Button>

              {/* Type Badge */}
              <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                {media.type === 'video' ? '🎥 Video' : '🖼️ Bild'}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}