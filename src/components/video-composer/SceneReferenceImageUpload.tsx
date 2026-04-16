import { useCallback, useRef, useState } from 'react';
import { Upload, X, ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB
const ACCEPTED_IMAGE = ['image/jpeg', 'image/png', 'image/webp'];

interface SceneReferenceImageUploadProps {
  projectId?: string;
  sceneId: string;
  referenceImageUrl?: string;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

/**
 * Compact image-only uploader for AI sources.
 * Used as a visual reference (image-to-video) for Hailuo / Kling.
 */
export default function SceneReferenceImageUpload({
  projectId,
  sceneId,
  referenceImageUrl,
  onChange,
  disabled = false,
}: SceneReferenceImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file || disabled) return;

      if (!ACCEPTED_IMAGE.includes(file.type)) {
        toast.error('Bitte ein Bild wählen (JPG, PNG oder WEBP).');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(
          `Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximal 20 MB erlaubt.`
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
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${user.id}/${projectFolder}/ref-${sceneId}-${Date.now()}.${ext}`;

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
        onChange(pub.publicUrl);
        toast.success('Referenzbild hinzugefügt — die KI orientiert sich daran.');
      } catch (err) {
        console.error('[SceneReferenceImageUpload] Upload error:', err);
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
    if (!referenceImageUrl) {
      onChange(null);
      return;
    }
    try {
      const marker = '/composer-uploads/';
      const idx = referenceImageUrl.indexOf(marker);
      if (idx !== -1) {
        const path = referenceImageUrl.substring(idx + marker.length).split('?')[0];
        await supabase.storage.from('composer-uploads').remove([path]);
      }
    } catch (err) {
      console.warn('[SceneReferenceImageUpload] Storage remove failed (ignored):', err);
    }
    onChange(null);
    toast.success('Referenzbild entfernt');
  }, [referenceImageUrl, onChange]);

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
  if (referenceImageUrl && !uploading) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-primary flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            Referenzbild aktiv
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[10px] text-destructive hover:bg-destructive/10"
            onClick={handleRemove}
            disabled={disabled}
          >
            <X className="h-3 w-3 mr-1" /> Entfernen
          </Button>
        </div>
        <div className="flex items-start gap-2">
          <div className="relative w-20 h-20 rounded-md overflow-hidden border border-primary/30 bg-black flex-shrink-0">
            <img
              src={referenceImageUrl}
              alt="KI-Referenzbild"
              className="w-full h-full object-cover"
            />
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug pt-0.5">
            Die KI orientiert sich am Bildinhalt und Stil dieses Bildes (Image-to-Video).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
        <ImageIcon className="h-3 w-3" />
        Referenzbild (optional)
      </span>
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
          'relative border border-dashed rounded-md px-3 py-2 text-center transition-all cursor-pointer',
          dragOver
            ? 'border-primary bg-primary/10'
            : 'border-border/40 bg-background/30 hover:border-primary/40 hover:bg-background/50',
          (disabled || uploading) && 'opacity-60 cursor-not-allowed'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE.join(',')}
          disabled={disabled || uploading}
          onChange={(e) => handleFile(e.target.files?.[0] || null)}
          className="hidden"
        />
        {uploading ? (
          <div className="space-y-1.5 py-1">
            <Loader2 className="h-4 w-4 mx-auto text-primary animate-spin" />
            <Progress value={progress} className="h-1 max-w-[140px] mx-auto" />
            <p className="text-[9px] text-muted-foreground">{progress}%</p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <Upload className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[10px] text-foreground">
              Bild hochladen — die KI orientiert sich daran
            </p>
          </div>
        )}
      </div>
      <p className="text-[9px] text-muted-foreground/70">
        JPG / PNG / WEBP · max. 20 MB · optional
      </p>
    </div>
  );
}
