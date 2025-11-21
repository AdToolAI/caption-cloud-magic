import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Image, Loader2, RefreshCw, Upload } from 'lucide-react';

interface ThumbnailManagerProps {
  videoCreationId: string;
  videoUrl: string;
  currentThumbnailUrl?: string;
  onThumbnailUpdated?: () => void;
}

export const ThumbnailManager = ({
  videoCreationId,
  videoUrl,
  currentThumbnailUrl,
  onThumbnailUpdated,
}: ThumbnailManagerProps) => {
  const [loading, setLoading] = useState(false);
  const [timestampSec, setTimestampSec] = useState(1.0);
  const { toast } = useToast();

  const regenerateThumbnail = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-thumbnail', {
        body: {
          video_creation_id: videoCreationId,
          video_url: videoUrl,
          timestamp_sec: timestampSec,
        },
      });

      if (error) throw error;

      toast({
        title: 'Thumbnail generiert',
        description: 'Das Thumbnail wurde erfolgreich erstellt',
      });

      onThumbnailUpdated?.();
    } catch (error) {
      console.error('Error regenerating thumbnail:', error);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Thumbnail konnte nicht generiert werden',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const uploadCustomThumbnail = async (file: File) => {
    setLoading(true);
    try {
      // Upload to Supabase Storage
      const fileName = `${videoCreationId}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from('video-assets')
        .upload(`thumbnails/${fileName}`, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('video-assets')
        .getPublicUrl(`thumbnails/${fileName}`);

      // Update video_creations
      const { error: updateError } = await supabase
        .from('video_creations')
        .update({
          thumbnail_url: publicUrl,
          custom_thumbnail_uploaded: true,
        })
        .eq('id', videoCreationId);

      if (updateError) throw updateError;

      toast({
        title: 'Thumbnail hochgeladen',
        description: 'Ihr benutzerdefiniertes Thumbnail wurde gespeichert',
      });

      onThumbnailUpdated?.();
    } catch (error) {
      console.error('Error uploading thumbnail:', error);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Thumbnail konnte nicht hochgeladen werden',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="w-5 h-5" />
          Thumbnail-Verwaltung
        </CardTitle>
        <CardDescription>
          Thumbnail automatisch generieren oder eigenes hochladen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Thumbnail Preview */}
        {currentThumbnailUrl && (
          <div className="space-y-2">
            <Label>Aktuelles Thumbnail</Label>
            <img
              src={currentThumbnailUrl}
              alt="Video thumbnail"
              className="w-full rounded-lg border border-border"
            />
          </div>
        )}

        {/* Regenerate Thumbnail */}
        <div className="space-y-2">
          <Label htmlFor="timestamp">Zeitstempel (Sekunden)</Label>
          <div className="flex gap-2">
            <Input
              id="timestamp"
              type="number"
              value={timestampSec}
              onChange={(e) => setTimestampSec(parseFloat(e.target.value))}
              min={0}
              step={0.1}
              placeholder="1.0"
            />
            <Button
              onClick={regenerateThumbnail}
              disabled={loading}
              variant="outline"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Generiere Thumbnail an bestimmter Stelle im Video
          </p>
        </div>

        {/* Upload Custom Thumbnail */}
        <div className="space-y-2">
          <Label htmlFor="thumbnail-upload">Eigenes Thumbnail hochladen</Label>
          <div className="flex gap-2">
            <Input
              id="thumbnail-upload"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  uploadCustomThumbnail(file);
                }
              }}
              disabled={loading}
            />
            <Button
              onClick={() => document.getElementById('thumbnail-upload')?.click()}
              disabled={loading}
              variant="outline"
            >
              <Upload className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
