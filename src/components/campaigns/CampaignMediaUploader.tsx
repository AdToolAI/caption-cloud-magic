import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Image, Video, Edit } from "lucide-react";
import { toast } from "sonner";

export interface UploadedMedia {
  id: string;
  type: 'image' | 'video';
  url: string;
  file: File;
  preview: string;
  title: string;
  fileName: string;
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
  const [editingMedia, setEditingMedia] = useState<UploadedMedia | null>(null);
  const [titleDialogOpen, setTitleDialogOpen] = useState(false);

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
        const fileName = file.name;
        const title = fileName.split('.')[0]; // Default: filename without extension

        newMedia.push({
          id: Math.random().toString(36),
          type,
          url: '', // Will be set after upload to Supabase
          file,
          preview,
          title,
          fileName,
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
                  alt={media.title} 
                  className="aspect-square object-cover w-full"
                />
              )}
              
              {/* Remove Button */}
              <Button
                size="icon"
                variant="destructive"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 z-10"
                onClick={() => handleRemove(media.id)}
              >
                <X className="h-4 w-4" />
              </Button>

              {/* Title Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <p className="text-white text-xs font-medium truncate">
                  {media.title}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-1 right-1 h-6 w-6 p-0 text-white hover:bg-white/20"
                  onClick={() => {
                    setEditingMedia(media);
                    setTitleDialogOpen(true);
                  }}
                >
                  <Edit className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Title Editor Dialog */}
      <Dialog open={titleDialogOpen} onOpenChange={setTitleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Titel bearbeiten</DialogTitle>
          </DialogHeader>
          
          {editingMedia && (
            <div className="space-y-4">
              <div>
                {editingMedia.type === 'video' ? (
                  <div className="aspect-video bg-muted flex items-center justify-center rounded">
                    <Video className="h-16 w-16 text-muted-foreground" />
                  </div>
                ) : (
                  <img 
                    src={editingMedia.preview} 
                    alt="Preview" 
                    className="w-full rounded"
                  />
                )}
              </div>
              
              <div>
                <Label>Titel</Label>
                <Input
                  value={editingMedia.title}
                  onChange={(e) => {
                    setEditingMedia({ ...editingMedia, title: e.target.value });
                  }}
                  placeholder="z.B. 'Produktvorstellung Sommer 2025'"
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Dateiname: {editingMedia.fileName}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline"
              onClick={() => setTitleDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button onClick={() => {
              if (editingMedia) {
                const updated = uploadedMedia.map(m => 
                  m.id === editingMedia.id ? editingMedia : m
                );
                setUploadedMedia(updated);
                onMediaChange(updated);
                setTitleDialogOpen(false);
                toast.success('Titel aktualisiert');
              }
            }}>
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}