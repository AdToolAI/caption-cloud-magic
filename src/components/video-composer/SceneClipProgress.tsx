import { Loader2, XCircle, Sparkles, Clock, Image as ImageIcon, Film } from 'lucide-react';
import type { ComposerScene } from '@/types/video-composer';

interface SceneClipProgressProps {
  scene: ComposerScene;
  index: number;
}

/**
 * Visual progress display for a scene's preview slot.
 * Shows skeleton + loader while generating, error state on failure,
 * video on ready, and friendly placeholder when pending.
 */
export function SceneClipProgress({ scene, index }: SceneClipProgressProps) {
  // READY → show video / image
  if (scene.clipUrl && scene.clipStatus === 'ready') {
    if (scene.uploadType === 'image') {
      return (
        <div className="relative w-full h-full">
          <img src={scene.clipUrl} alt={`Szene ${index + 1}`} className="w-full h-full object-cover" />
          <div className="absolute top-1 right-1 bg-black/60 backdrop-blur rounded px-1.5 py-0.5 flex items-center gap-1">
            <ImageIcon className="h-2.5 w-2.5 text-white" />
            <span className="text-[8px] text-white font-medium">Ken Burns</span>
          </div>
        </div>
      );
    }
    return <video src={scene.clipUrl} className="w-full h-full object-cover" muted controls />;
  }

  // GENERATING → animated skeleton
  if (scene.clipStatus === 'generating') {
    return (
      <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-accent/20 via-primary/10 to-accent/20 animate-pulse flex flex-col items-center justify-center gap-1">
        {/* Shimmer overlay */}
        <div
          className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]"
          style={{
            background: 'linear-gradient(90deg, transparent, hsl(var(--accent) / 0.25), transparent)',
            animation: 'shimmer 1.8s infinite',
          }}
        />
        <Loader2 className="h-5 w-5 text-accent animate-spin relative z-10" />
        <span className="text-[9px] text-accent font-medium relative z-10">KI rendert…</span>
        <span className="text-[8px] text-muted-foreground relative z-10">~30–60s</span>
        <style>{`
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    );
  }

  // FAILED → red error state
  if (scene.clipStatus === 'failed') {
    return (
      <div className="w-full h-full bg-destructive/10 border border-destructive/30 flex flex-col items-center justify-center gap-1">
        <XCircle className="h-5 w-5 text-destructive" />
        <span className="text-[9px] text-destructive font-medium">Fehlgeschlagen</span>
      </div>
    );
  }

  // PENDING → placeholder
  const Icon = scene.clipSource === 'upload' ? Film : scene.clipSource === 'stock' ? Film : Sparkles;
  return (
    <div className="w-full h-full bg-muted/20 border border-dashed border-border/40 flex flex-col items-center justify-center gap-1">
      <Icon className="h-4 w-4 text-muted-foreground/50" />
      <span className="text-[9px] text-muted-foreground/60">Szene {index + 1}</span>
      <span className="text-[8px] text-muted-foreground/40 flex items-center gap-0.5">
        <Clock className="h-2 w-2" /> bereit zum Generieren
      </span>
    </div>
  );
}
