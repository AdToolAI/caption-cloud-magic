import { useCallback, useRef, useState } from 'react';
import { Upload, X, Film, ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
const ACCEPTED_VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
const ACCEPTED_IMAGE = ['image/jpeg', 'image/png', 'image/webp'];

interface SceneMediaUploadProps {
  projectId?: string;
  sceneId: string;
  uploadUrl?: string;
  uploadType?: 'video' | 'image';
  onChange: (url: string | null, type: 'video' | 'image' | null) => void;
  disabled?: boolean;
}

export default function SceneMediaUpload({
  projectId,
  sceneId,
  uploadUrl,
  uploadType,
  onChange,
  disabled = false,
}: SceneMediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file || disabled) return;

      const isVideo = ACCEPTED_VIDEO.includes(file.type);
      const isImage = ACCEPTED_IMAGE.includes(file.type);

      if (!isVideo && !isImage) {
        toast.error('Nicht unterstütztes Format. Bitte MP4, MOV, WEBM, JPG, PNG oder WEBP wählen.');
        return;
      }
      const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (file.size > limit) {
        toast.error(
          `Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximal ${
            isVideo ? '200' : '20'
          } MB erlaubt.`
        );
        return;
      }

      setUploading(true);
      setProgress(5);

      try {
        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();
        if (authErr || !user) throw new Error('Nicht angemeldet');

        const projectFolder = projectId || 'draft';
        const ext = file.name.split('.').pop()?.toLowerCase() || (isVideo ? 'mp4' : 'jpg');
        const fileName = `${user.id}/${projectFolder}/${sceneId}-${Date.now()}.${ext}`;

        setProgress(20);

        const { error: uploadErr } = await supabase.storage
          .from('composer-uploads')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: true,
            contentType: file.type,
          });

        if (uploadErr) throw new Error(uploadErr.message);

        setProgress(85);

        const { data: pub } = supabase.storage.from('composer-uploads').getPublicUrl(fileName);
        if (!pub?.publicUrl) throw new Error('Public URL konnte nicht erstellt werden');

        setProgress(100);
        onChange(pub.publicUrl, isVideo ? 'video' : 'image');
        toast.success(
          `${isVideo ? 'Video' : 'Bild'} hochgeladen (${(file.size / 1024 / 1024).toFixed(1)} MB)`
        );
      } catch (err) {
        console.error('[SceneMediaUpload] Upload error:', err);
        toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
      } finally {
        setTimeout(() => {
          setUploading(false);
          setProgress(0);
        }, 400);
      }
    },
    [disabled, projectId, sceneId, onChange]
  );

  const handleRemove = useCallback(async () => {
    if (!uploadUrl) {
      onChange(null, null);
      return;
    }
    try {
      // Try to extract path from public URL
      const marker = '/composer-uploads/';
      const idx = uploadUrl.indexOf(marker);
      if (idx !== -1) {
        const path = uploadUrl.substring(idx + marker.length).split('?')[0];
        await supabase.storage.from('composer-uploads').remove([path]);
      }
    } catch (err) {
      console.warn('[SceneMediaUpload] Storage remove failed (ignored):', err);
    }
    onChange(null, null);
    toast.success('Datei entfernt');
  }, [uploadUrl, onChange]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // Preview state
  if (uploadUrl && !uploading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            {uploadType === 'image' ? (
              <ImageIcon className="h-3 w-3 text-primary" />
            ) : (
              <Film className="h-3 w-3 text-primary" />
            )}
            Eigene {uploadType === 'image' ? 'Bilddatei' : 'Videodatei'} hochgeladen
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10"
            onClick={handleRemove}
            disabled={disabled}
          >
            <X className="h-3 w-3 mr-1" /> Entfernen
          </Button>
        </div>
        <div className="relative rounded-md overflow-hidden border border-border/40 bg-black">
          {uploadType === 'image' ? (
            <img src={uploadUrl} alt="Scene upload preview" className="w-full max-h-48 object-contain" />
          ) : (
            <video src={uploadUrl} controls className="w-full max-h-48 object-contain bg-black" />
          )}
        </div>
        {uploadType === 'image' && (
          <div className="flex items-start gap-1.5 text-[10px] text-primary/80 bg-primary/5 border border-primary/20 rounded px-2 py-1.5">
            <Sparkles className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>Wird im finalen Video mit Ken-Burns-Effekt animiert (sanftes Zoomen & Schwenken).</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <span className="text-[10px] text-muted-foreground">Eigene Datei hochladen</span>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          'relative border-2 border-dashed rounded-md p-4 text-center transition-all cursor-pointer',
          dragOver
            ? 'border-primary bg-primary/10'
            : 'border-border/40 bg-background/30 hover:border-primary/40 hover:bg-background/50',
          (disabled || uploading) && 'opacity-60 cursor-not-allowed'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={[...ACCEPTED_VIDEO, ...ACCEPTED_IMAGE].join(',')}
          disabled={disabled || uploading}
          onChange={(e) => handleFile(e.target.files?.[0] || null)}
          className="hidden"
        />
        {uploading ? (
          <div className="space-y-2 py-2">
            <Loader2 className="h-5 w-5 mx-auto text-primary animate-spin" />
            <Progress value={progress} className="h-1.5 max-w-[180px] mx-auto" />
            <p className="text-[10px] text-muted-foreground">{progress}% hochgeladen…</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 mb-1.5">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <Film className="h-4 w-4 text-muted-foreground/60" />
              <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
            </div>
            <p className="text-[11px] text-foreground font-medium">
              Video oder Bild hierher ziehen
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              MP4, MOV, WEBM bis 200 MB · JPG, PNG, WEBP bis 20 MB
            </p>
          </>
        )}
      </div>
    </div>
  );
}
