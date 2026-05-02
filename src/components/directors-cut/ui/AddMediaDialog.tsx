import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Film, 
  Image, 
  Upload, 
  Library, 
  Clock, 
  Check,
  Loader2 
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface MediaItem {
  type: 'video' | 'image';
  url: string;
  duration: number;
  name: string;
  thumbnail?: string;
}

interface AddMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMediaSelect: (media: MediaItem) => void;
}

export function AddMediaDialog({ 
  open, 
  onOpenChange, 
  onMediaSelect 
}: AddMediaDialogProps) {
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [imageDuration, setImageDuration] = useState(5);
  const [uploading, setUploading] = useState(false);

  // Fetch videos from the user's full media library
  // Sources: video_creations (renders) + media_assets (uploads, type=video) + content_items (AI/campaign)
  const { data: videos, isLoading: loadingVideos } = useQuery({
    queryKey: ['dc-add-media-videos'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // 1) Video creations (renders)
      const { data: creations } = await supabase
        .from('video_creations')
        .select('id, output_url, thumbnail_url, created_at, metadata, customizations')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .not('output_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);

      // 2) Manual uploads
      const { data: uploads } = await supabase
        .from('media_assets')
        .select('id, storage_path, type, created_at, metadata')
        .eq('user_id', user.id)
        .eq('type', 'video')
        .order('created_at', { ascending: false })
        .limit(50);

      // 3) Content items (AI / campaign) — joined via workspace
      const { data: ws } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      let contentItems: any[] = [];
      if (ws?.workspace_id) {
        const { data: items } = await supabase
          .from('content_items')
          .select('id, title, thumb_url, duration_sec, created_at, source')
          .eq('workspace_id', ws.workspace_id)
          .eq('type', 'video')
          .order('created_at', { ascending: false })
          .limit(50);
        contentItems = items || [];
      }

      const normCreations = (creations || []).map((v: any) => {
        const meta = v.metadata || {};
        const cust = v.customizations || {};
        return {
          id: `vc-${v.id}`,
          url: v.output_url as string,
          thumbnail_url: v.thumbnail_url as string | null,
          title: meta.title || meta.name || cust.title || (meta.prompt ? String(meta.prompt).slice(0, 50) : 'Video'),
          duration_seconds: Number(meta.duration_seconds || meta.duration || cust.duration || 10),
          created_at: v.created_at,
        };
      });

      const normUploads = (uploads || []).map((u: any) => {
        const { data: { publicUrl } } = supabase.storage.from('media-assets').getPublicUrl(u.storage_path);
        const meta = (u.metadata || {}) as any;
        return {
          id: `ma-${u.id}`,
          url: publicUrl,
          thumbnail_url: null,
          title: meta.original_name || 'Upload',
          duration_seconds: Number(meta.duration_seconds || 10),
          created_at: u.created_at,
        };
      });

      const normContent = contentItems
        .filter((c: any) => c.thumb_url)
        .map((c: any) => ({
          id: `ci-${c.id}`,
          url: c.thumb_url as string,
          thumbnail_url: c.thumb_url as string | null,
          title: c.title || 'Content',
          duration_seconds: Number(c.duration_sec || 10),
          created_at: c.created_at,
        }));

      return [...normCreations, ...normUploads, ...normContent]
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    },
    enabled: open,
  });

  // Fetch images from media_assets (manual uploads, type=image)
  const { data: images, isLoading: loadingImages } = useQuery({
    queryKey: ['dc-add-media-images'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data } = await supabase
        .from('media_assets')
        .select('id, storage_path, created_at, metadata')
        .eq('user_id', user.id)
        .eq('type', 'image')
        .order('created_at', { ascending: false })
        .limit(60);

      return (data || []).map((row: any) => {
        const { data: { publicUrl } } = supabase.storage.from('media-assets').getPublicUrl(row.storage_path);
        const meta = (row.metadata || {}) as any;
        return {
          id: row.id,
          url: publicUrl,
          name: meta.original_name || 'Bild',
          thumbnail_url: publicUrl,
        };
      });
    },
    enabled: open,
  });

  const handleSelectVideo = useCallback((video: any) => {
    setSelectedMedia({
      type: 'video',
      url: video.output_url,
      duration: video.duration_seconds || 10,
      name: video.title || 'Video',
      thumbnail: video.thumbnail_url,
    });
  }, []);

  const handleSelectImage = useCallback((image: any) => {
    setSelectedMedia({
      type: 'image',
      url: image.url,
      duration: imageDuration,
      name: image.name || 'Bild',
      thumbnail: image.thumbnail_url || image.url,
    });
  }, [imageDuration]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const isVideo = file.type.startsWith('video/');

      const bucket = isVideo ? 'video-uploads' : 'images';
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      setSelectedMedia({
        type: isVideo ? 'video' : 'image',
        url: publicUrl,
        duration: isVideo ? 10 : imageDuration,
        name: file.name,
      });
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  }, [imageDuration]);

  const handleConfirm = useCallback(() => {
    if (selectedMedia) {
      // Update image duration if changed
      if (selectedMedia.type === 'image') {
        onMediaSelect({ ...selectedMedia, duration: imageDuration });
      } else {
        onMediaSelect(selectedMedia);
      }
      onOpenChange(false);
      setSelectedMedia(null);
    }
  }, [selectedMedia, imageDuration, onMediaSelect, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            Medien hinzufügen
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="videos" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="videos" className="gap-1.5">
              <Film className="h-4 w-4" />
              Videos
            </TabsTrigger>
            <TabsTrigger value="images" className="gap-1.5">
              <Image className="h-4 w-4" />
              Bilder
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-1.5">
              <Upload className="h-4 w-4" />
              Upload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="mt-4">
            <ScrollArea className="h-[300px] pr-4">
              {loadingVideos ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : videos && videos.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {videos.map((video: any) => (
                    <motion.div
                      key={video.id}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => handleSelectVideo(video)}
                      className={cn(
                        "relative aspect-video rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
                        selectedMedia?.url === video.output_url
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-transparent hover:border-primary/50"
                      )}
                    >
                      {video.thumbnail_url ? (
                        <img 
                          src={video.thumbnail_url} 
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <Film className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-1 left-1 right-1">
                        <p className="text-[10px] text-white truncate">{video.title || 'Video'}</p>
                        <p className="text-[9px] text-white/70">{video.duration_seconds?.toFixed(1)}s</p>
                      </div>
                      {selectedMedia?.url === video.output_url && (
                        <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Film className="h-12 w-12 mb-2 opacity-50" />
                  <p className="text-sm">Keine Videos in der Mediathek</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="images" className="mt-4 space-y-4">
            <ScrollArea className="h-[250px] pr-4">
              {loadingImages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : images && images.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {images.map((image: any) => (
                    <motion.div
                      key={image.id}
                      whileHover={{ scale: 1.02 }}
                      onClick={() => handleSelectImage(image)}
                      className={cn(
                        "relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
                        selectedMedia?.url === image.url
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-transparent hover:border-primary/50"
                      )}
                    >
                      <img 
                        src={image.thumbnail_url || image.url} 
                        alt={image.name}
                        className="w-full h-full object-cover"
                      />
                      {selectedMedia?.url === image.url && (
                        <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Image className="h-12 w-12 mb-2 opacity-50" />
                  <p className="text-sm">Keine Bilder in der Mediathek</p>
                </div>
              )}
            </ScrollArea>

            {/* Image Duration Slider */}
            {selectedMedia?.type === 'image' && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  Anzeigedauer: {imageDuration}s
                </Label>
                <Slider
                  value={[imageDuration]}
                  onValueChange={([v]) => setImageDuration(v)}
                  min={1}
                  max={30}
                  step={0.5}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <div className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 text-center">
              <input
                type="file"
                accept="video/*,image/*"
                onChange={handleFileUpload}
                className="hidden"
                id="media-upload"
                disabled={uploading}
              />
              <label 
                htmlFor="media-upload" 
                className="cursor-pointer flex flex-col items-center gap-3"
              >
                {uploading ? (
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                ) : (
                  <Upload className="h-12 w-12 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium">Video oder Bild hochladen</p>
                  <p className="text-sm text-muted-foreground">
                    Klicken oder Datei hierher ziehen
                  </p>
                </div>
              </label>

              {selectedMedia && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">{selectedMedia.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedMedia.type === 'video' ? 'Video' : 'Bild'} ausgewählt
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!selectedMedia}
            className="gap-1.5"
          >
            <Check className="h-4 w-4" />
            Hinzufügen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}