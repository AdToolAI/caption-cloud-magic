import { tx } from "@/lib/i18nText";
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, Link2 } from 'lucide-react';
import { useFrameContinuity } from '@/hooks/useFrameContinuity';
import { toast } from '@/hooks/use-toast';
import type { ComposerScene } from '@/types/video-composer';

/**
 * Artlist-style Frame-Picker.
 * Lets the user scrub through the source clip and pick ANY frame as the
 * `referenceImageUrl` (i2v start frame) of the target scene. Also marks the
 * pair as `continuityLocked` so the render-pipeline can apply the default
 * 0.3s crossfade for paired scenes.
 */
export interface FramePickerOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceScene: ComposerScene;
  targetScene: ComposerScene;
  targetSceneIndex: number; // 1-based for label
  projectId?: string;
  onApply: (next: {
    referenceImageUrl: string;
    framePickSeconds: number;
    continuationSourceSceneId: string;
  }) => void;
}

export default function FramePickerOverlay({
  open,
  onOpenChange,
  sourceScene,
  targetScene,
  targetSceneIndex,
  projectId,
  onApply,
}: FramePickerOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number>(sourceScene.durationSeconds || 5);
  const [time, setTime] = useState<number>(Math.max(0, (sourceScene.durationSeconds || 5) - 0.05));
  const [isApplying, setIsApplying] = useState(false);
  const { extractLastFrame } = useFrameContinuity();

  useEffect(() => {
    if (!open) return;
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      const d = v.duration || sourceScene.durationSeconds || 5;
      setDuration(d);
      const t = Math.max(0.05, d - 0.05);
      setTime(t);
      try {
        v.currentTime = t;
      } catch {
        /* ignore */
      }
    };
    v.addEventListener('loadedmetadata', onMeta);
    return () => v.removeEventListener('loadedmetadata', onMeta);
  }, [open, sourceScene.durationSeconds]);

  const handleSeek = (vals: number[]) => {
    const t = vals[0] ?? 0;
    setTime(t);
    const v = videoRef.current;
    if (v) {
      try {
        v.currentTime = t;
      } catch {
        /* ignore */
      }
    }
  };

  const handleApply = async () => {
    if (!sourceScene.clipUrl) {
      toast({ title: tx({ de: "Kein Clip vorhanden", en: "No clip available", es: "No hay clip disponible" }), variant: 'destructive' });
      return;
    }
    setIsApplying(true);
    try {
      const result = await extractLastFrame({
        videoUrl: sourceScene.clipUrl,
        sceneId: sourceScene.id,
        projectId,
        durationSeconds: time, // exact picked timestamp
      });
      if (!result) return;
      onApply({
        referenceImageUrl: result.lastFrameUrl,
        framePickSeconds: time,
        continuationSourceSceneId: sourceScene.id,
      });
      toast({
        title: tx({ de: "Frame übernommen ✨", en: "Frame applied ✨", es: "Frame aplicado ✨" }),
        description: tx({ de: `Szene ${targetSceneIndex} startet jetzt bei ${time.toFixed(2)}s der Quelle.`, en: `Scene ${targetSceneIndex} now starts at ${time.toFixed(2)}s of source.`, es: `La escena ${targetSceneIndex} ahora comienza en ${time.toFixed(2)}s de la fuente.` }),
      });
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            {tx({ de: "Frame wählen", en: "Pick frame", es: "Elegir fotograma" })} → {tx({ de: "Szene", en: "Scene", es: "Escena" })} {targetSceneIndex}
          </DialogTitle>
          <DialogDescription>
            Scrubbe durch den Clip und wähle den exakten Frame, der als nahtloses
            Startbild der nächsten Szene dienen soll.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {sourceScene.clipUrl && (
            <video
              ref={videoRef}
              src={sourceScene.clipUrl}
              crossOrigin="anonymous"
              muted
              playsInline
              className="w-full rounded-lg border border-border/40 bg-black"
            />
          )}
          <div className="space-y-2">
            <Slider
              value={[time]}
              min={0}
              max={Math.max(0.05, duration - 0.05)}
              step={0.05}
              onValueChange={handleSeek}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{time.toFixed(2)}s</span>
              <span>{duration.toFixed(2)}s</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApplying}>
            tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })
          </Button>
          <Button onClick={handleApply} disabled={isApplying || !sourceScene.clipUrl}>
            {isApplying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                tx({ de: "Übernehme…", en: "Applying…", es: "Aplicando…" })
              </>
            ) : (
              <>
                <Link2 className="mr-2 h-4 w-4" />
                tx({ de: "Als Startbild übernehmen", en: "Apply as starting image", es: "Aplicar como imagen de inicio" })
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
