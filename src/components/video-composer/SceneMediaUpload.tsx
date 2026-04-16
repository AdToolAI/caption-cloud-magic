import { useCallback, useRef, useState } from 'react';
import { Upload, X, Film, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
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

      // Reject images explicitly — they belong in the AI reference image slot
      if (isImage) {
        toast.error(
          'Bitte Video-Datei wählen — Bilder gehören zur KI-Referenz (im KI-Tab unter dem Prompt).'
        );
        return;
      }
      if (!isVideo) {
        toast.error('Nicht unterstütztes Format. Bitte MP4, MOV oder WEBM wählen.');
        return;
      }
      if (file.size > MAX_VIDEO_BYTES) {
        toast.error(
          `Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximal 200 MB erlaubt.`
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
        const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
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
        onChange(pub.publicUrl, 'video');
        toast.success(`Video hochgeladen (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
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
            <Film className="h-3 w-3 text-primary" />
            Eigenes Video hochgeladen
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
          <video src={uploadUrl} controls className="w-full max-h-48 object-contain bg-black" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <span className="text-[10px] text-muted-foreground">Eigenes Video hochladen</span>
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
          accept={ACCEPTED_VIDEO.join(',')}
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
            </div>
            <p className="text-[11px] text-foreground font-medium">
              Video hierher ziehen
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              MP4, MOV, WEBM · max. 200 MB
            </p>
            <p className="text-[9px] text-muted-foreground/60 mt-1">
              💡 Bilder gehören zur KI-Referenz (im KI-Tab)
            </p>
          </>
        )}
      </div>
    </div>
  );
}
