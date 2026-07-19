/**
 * SceneReferenceImageSlot — pro-Szenen Referenzbild-Slot.
 *
 * Sichtbar NUR wenn Lip-Sync deaktiviert ist (bei aktivem Lip-Sync würden
 * Charakter-Anchor + Szenen-Ref kollidieren). Upload landet im Bucket
 * `ai-video-reference` unter `${userId}/...` (RLS-Constraint) und wird per
 * `onUpdate({ referenceImageUrl })` in `composer_scenes.reference_image_url`
 * persistiert. Die i2v-Engines lesen das Feld bereits als Startframe.
 */
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Image as ImageIcon, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { ComposerScene } from '@/types/video-composer';

interface Props {
  scene: ComposerScene;
  onUpdate: (updates: Partial<ComposerScene>) => void;
  className?: string;
}

export default function SceneReferenceImageSlot({ scene, onUpdate, className }: Props) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const lipSyncOn = !!scene.lipSyncWithVoiceover;
  if (lipSyncOn) return null;

  const handleUpload = async (file: File) => {
    if (!user) {
      toast.error('Bitte einloggen, um ein Referenzbild hochzuladen.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Datei zu groß (max. 10 MB).');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `${user.id}/scene-ref-${scene.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('ai-video-reference')
        .upload(path, file, { upsert: true, contentType: file.type || 'image/png' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from('ai-video-reference')
        .getPublicUrl(path);
      onUpdate({ referenceImageUrl: publicUrl } as Partial<ComposerScene>);
      toast.success('Referenzbild gesetzt — wird als i2v-Startframe verwendet.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  };

  const clear = () => {
    onUpdate({ referenceImageUrl: undefined } as Partial<ComposerScene>);
  };

  return (
    <div
      className={
        'rounded-xl border border-primary/20 bg-card/40 px-3 py-3 space-y-2 ' +
        (className ?? '')
      }
    >
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
          <ImageIcon className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-foreground">
            Szenen-Referenzbild (optional)
          </div>
          <p className="text-[10px] text-muted-foreground line-clamp-2">
            Wird als Startframe (i2v-Anchor) an das AI-Video-Modell übergeben. Nur verfügbar, wenn Lip-Sync deaktiviert ist.
          </p>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = '';
        }}
      />

      {scene.referenceImageUrl ? (
        <div className="relative rounded-lg overflow-hidden border border-primary/30 bg-black/40">
          <img
            src={scene.referenceImageUrl}
            alt="Szenen-Referenzbild"
            className="w-full max-h-48 object-contain"
          />
          <button
            type="button"
            onClick={clear}
            className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/70 backdrop-blur border border-destructive/40 text-[10px] uppercase tracking-wider text-destructive hover:bg-destructive/15 transition-colors"
            title="Referenzbild entfernen"
          >
            <X className="h-3 w-3" />
            Entfernen
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          className="w-full gap-2 border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? 'Lädt hoch…' : 'Bild hochladen (PNG/JPG/WEBP · max. 10 MB)'}
        </Button>
      )}
    </div>
  );
}
