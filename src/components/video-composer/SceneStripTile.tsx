/**
 * SceneStripTile — compact 16:9 thumbnail tile for the cinematic filmstrip.
 *
 * Renders a scene as a glanceable visual card showing:
 *   - Best available preview (firstFrameUrl > referenceImageUrl > clipUrl video poster > gradient fallback)
 *   - Scene type badge (Hook / Problem / Lösung / Demo / …)
 *   - Render status pill (Bereit / Pending / Generating)
 *   - Cast avatar dots (max 4)
 *   - Index + title + duration + cost
 *
 * Active state: gold ring + glow. Click selects the scene in the parent.
 * Reorder/Delete actions are owned by the parent via children (drag handle from SortableSceneItem).
 */
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Check, Loader2, AlertCircle, Sparkles, Image as ImageIcon } from 'lucide-react';
import type { ComposerScene, ComposerCharacter } from '@/types/video-composer';
import { getClipCost } from '@/types/video-composer';
import { useTranslation } from '@/hooks/useTranslation';

const NOT_RENDERED_L10N: Record<'de' | 'en' | 'es', string> = {
  de: 'Noch nicht gerendert',
  en: 'Not rendered yet',
  es: 'Aún no renderizado',
};

interface SceneStripTileProps {
  scene: ComposerScene;
  index: number;
  isActive: boolean;
  characters?: ComposerCharacter[];
  onSelect: () => void;
}

const SCENE_TYPE_LABEL: Record<string, string> = {
  hook: 'Hook',
  problem: 'Problem',
  solution: 'Lösung',
  demo: 'Demo',
  'social-proof': 'Social Proof',
  cta: 'CTA',
  custom: 'Custom',
};

const STATUS_STYLE: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  ready: {
    label: 'Bereit',
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    icon: Check,
  },
  generating: {
    label: 'Render',
    cls: 'bg-primary/15 text-primary border-primary/30 animate-pulse',
    icon: Loader2,
  },
  failed: {
    label: 'Fehler',
    cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    icon: AlertCircle,
  },
  pending: {
    label: 'Wartet',
    cls: 'bg-muted/40 text-muted-foreground border-border/40',
    icon: Sparkles,
  },
};

function pickThumbnail(scene: ComposerScene): { kind: 'image' | 'video' | 'none'; src?: string } {
  // Only real scene outputs — never the anchor / `referenceImageUrl`, which
  // is shared across all scenes and would fake a render result.
  if (scene.firstFrameUrl) return { kind: 'image', src: scene.firstFrameUrl };
  if (scene.lastFrameUrl) return { kind: 'image', src: scene.lastFrameUrl };
  if (scene.clipUrl) return { kind: 'video', src: scene.clipUrl };
  return { kind: 'none' };
}

function SceneStripTileImpl({ scene, index, isActive, characters, onSelect }: SceneStripTileProps) {
  const { language } = useTranslation();
  const notRendered = NOT_RENDERED_L10N[(language as 'de' | 'en' | 'es') ?? 'de'] ?? NOT_RENDERED_L10N.de;
  const thumb = pickThumbnail(scene);
  const status = STATUS_STYLE[scene.clipStatus] ?? STATUS_STYLE.pending;
  const StatusIcon = status.icon;
  const typeLabel = SCENE_TYPE_LABEL[scene.sceneType] ?? scene.sceneType;
  const cost = getClipCost(scene.clipSource, scene.clipQuality || 'standard', scene.durationSeconds);

  // Cast dots: any character whose id appears in scene.characterIds (or scene.cast).
  const sceneCastIds: string[] =
    (scene as any).characterIds ??
    (scene as any).cast ??
    [];
  const sceneChars = (characters || []).filter((c) => sceneCastIds.includes(c.id)).slice(0, 4);

  // Promptpreview as fallback title.
  const titleText =
    (scene as any).title ||
    scene.aiPrompt?.slice(0, 64) ||
    `Szene ${index + 1}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative w-full text-left rounded-xl overflow-hidden transition-all',
        'bg-card/40 border backdrop-blur-sm',
        isActive
          ? 'border-primary/60 shadow-[0_0_24px_-4px_hsl(var(--primary)/0.45)] ring-1 ring-primary/30'
          : 'border-border/40 hover:border-border/80 hover:bg-card/60',
      )}
      aria-pressed={isActive}
      data-scene-tile={scene.id}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gradient-to-br from-muted/40 to-background overflow-hidden">
        {thumb.kind === 'image' && (
          <img
            src={thumb.src}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}
        {thumb.kind === 'video' && (
          <video
            src={thumb.src}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        )}
        {thumb.kind === 'none' && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground/50">
            <ImageIcon className="h-6 w-6" />
            <span className="text-[9px] uppercase tracking-[0.14em]">Noch nicht gerendert</span>
          </div>
        )}

        {/* Bottom gradient for legibility */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background/95 via-background/40 to-transparent pointer-events-none" />

        {/* Top-left: type badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-background/70 backdrop-blur-md border border-border/40 text-foreground/90">
            {typeLabel}
          </span>
        </div>

        {/* Top-right: status pill */}
        <div className="absolute top-2 right-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border backdrop-blur-md',
              status.cls,
            )}
          >
            <StatusIcon className={cn('h-2.5 w-2.5', scene.clipStatus === 'generating' && 'animate-spin')} />
            {status.label}
          </span>
        </div>

        {/* Bottom-left: index + title */}
        <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-mono text-primary/80 leading-none">
              {String(index + 1).padStart(2, '0')}
            </div>
            <div className="text-xs font-medium text-foreground truncate mt-0.5">
              {titleText}
            </div>
          </div>

          {/* Cast dots */}
          {sceneChars.length > 0 && (
            <div className="flex -space-x-1.5 shrink-0">
              {sceneChars.map((c) => (
                <div
                  key={c.id}
                  title={c.name}
                  className="h-4 w-4 rounded-full border border-background bg-gradient-to-br from-primary/70 to-primary/30 flex items-center justify-center text-[7px] font-bold text-background"
                >
                  {(c.name || '?').slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer meta */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-border/30 text-[10px] text-muted-foreground">
        <span>{scene.durationSeconds}s · {scene.clipSource?.replace(/^ai-/, 'KI ')}</span>
        <span className="font-mono text-primary/80">€{cost.toFixed(2)}</span>
      </div>
    </button>
  );
}

export const SceneStripTile = memo(SceneStripTileImpl);
export default SceneStripTile;
