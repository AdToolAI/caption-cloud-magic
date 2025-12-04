import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, Film, Check, Play, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { VideoImportStepProps, SelectedVideo } from '@/types/directors-cut';

export function VideoImportStep({ selectedVideo, onVideoSelect }: VideoImportStepProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch videos from media library
  const { data: libraryVideos, isLoading: isLoadingLibrary } = useQuery({
    queryKey: ['library-videos-for-directors-cut'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('video_creations')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .not('output_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (error) throw error;
      return data || [];
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Bitte melde dich an');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      toast.error('Bitte wähle eine Video-Datei aus');
      return;
    }

    // Validate file size (max 500MB)
    if (file.size > 500 * 1024 * 1024) {
      toast.error('Video darf maximal 500MB groß sein');
      return;
    }

    // Validate video duration (max 10 minutes) BEFORE upload
    const duration = await getVideoDuration(file);
    if (duration > 600) {
      toast.error(
        'Videos dürfen maximal 10 Minuten lang sein. Für längere Videos: Erstelle mehrere Sequenzen à 10 Minuten und kombiniere sie anschließend.',
        { duration: 6000 }
      );
      return;
    }

    setIsUploading(true);

    try {
      // Upload to Supabase Storage
      const fileName = `${user.id}/${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('video-assets')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('video-assets')
        .getPublicUrl(uploadData.path);

      // Get video duration
      const duration = await getVideoDuration(file);

      const video: SelectedVideo = {
        url: publicUrl,
        name: file.name,
        duration,
        source: 'upload',
      };

      onVideoSelect(video);
      setPreviewUrl(publicUrl);
      toast.success('Video erfolgreich hochgeladen');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Fehler beim Hochladen des Videos');
    } finally {
      setIsUploading(false);
    }
  };

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => resolve(30); // Default duration
      video.src = URL.createObjectURL(file);
    });
  };

  const handleLibrarySelect = (video: any) => {
    const metadata = video.metadata as Record<string, any> || {};
    const selected: SelectedVideo = {
      id: video.id,
      url: video.output_url,
      name: metadata?.title || video.project_name || 'Video aus Mediathek',
      duration: video.duration_in_frames ? video.duration_in_frames / 30 : undefined,
      thumbnail_url: video.thumbnail_url,
      source: 'media_library',
    };
    onVideoSelect(selected);
    setPreviewUrl(video.output_url);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="library" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="library">
            <Film className="w-4 h-4 mr-2" />
            Aus Mediathek
          </TabsTrigger>
          <TabsTrigger value="upload">
            <Upload className="w-4 h-4 mr-2" />
            Hochladen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-4">
          {isLoadingLibrary ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : libraryVideos && libraryVideos.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pr-4">
                {libraryVideos.map((video: any) => {
                  const isSelected = selectedVideo?.id === video.id;
                  const metadata = video.metadata as Record<string, any> || {};
                  const durationSec = video.duration_in_frames ? Math.round(video.duration_in_frames / 30) : null;
                  const videoTitle = metadata?.title || 'Unbenanntes Video';
                  return (
                    <Card
                      key={video.id}
                      className={`
                        relative cursor-pointer overflow-hidden transition-all
                        hover:ring-2 hover:ring-primary/50
                        ${isSelected ? 'ring-2 ring-primary' : ''}
                      `}
                      onClick={() => handleLibrarySelect(video)}
                    >
                      <div className="aspect-video bg-muted relative">
                        {video.thumbnail_url ? (
                          <img
                            src={video.thumbnail_url}
                            alt={videoTitle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                              <Check className="w-5 h-5 text-primary-foreground" />
                            </div>
                          </div>
                        )}
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                          {durationSec ? `${durationSec}s` : '--'}
                        </div>
                      </div>
                      <div className="p-2">
                        <p className="text-sm font-medium truncate">
                          {videoTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(video.created_at).toLocaleDateString('de-DE')}
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Film className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Keine Videos in der Mediathek</p>
              <p className="text-sm text-muted-foreground">
                Erstelle zuerst ein Video im Universal Creator
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          <div
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
              transition-colors hover:border-primary/50 hover:bg-accent/50
              ${isUploading ? 'opacity-50 pointer-events-none' : ''}
            `}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            {isUploading ? (
              <div className="flex flex-col items-center">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-3" />
                <p className="text-lg font-medium">Video wird hochgeladen...</p>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-lg font-medium mb-1">Video hochladen</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Klicke oder ziehe ein Video hierher
                </p>
                <p className="text-xs text-muted-foreground">
                  Unterstützte Formate: MP4, MOV, WebM • Max. 500MB
                </p>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Video Preview */}
      {previewUrl && (
        <div className="mt-6">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Play className="w-4 h-4" />
            Video-Vorschau
          </h3>
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              src={previewUrl}
              controls
              className="w-full h-full"
            />
          </div>
          {selectedVideo && (
            <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
              <span>📁 {selectedVideo.name}</span>
              {selectedVideo.duration && (
                <span>⏱️ {Math.round(selectedVideo.duration)} Sekunden</span>
              )}
              <span className="text-primary">✓ Ausgewählt</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
