/**
 * SceneCardSummaryHeader — collapsed-by-default "studio-set" row.
 *
 * Shows a single, scannable line per scene: index, type, duration, provider,
 * Director Score pill and expand/move/delete affordances. Clicking the row
 * toggles the full SceneCard body (Phase A of the Studio-Set UX refactor).
 *
 * Pure presentational layer — runs the same composeFinalPrompt +
 * evaluateSceneQuality the full Director Console uses, so the score chip
 * here is always consistent with what the user sees once expanded.
 */
import { useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Sparkles,
  Trash2,
  Video,
  Upload,
  ImageIcon,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  composeFinalPrompt,
  type DirectorLanguage,
} from '@/lib/motion-studio/composeFinalPrompt';
import { evaluateSceneQuality } from '@/lib/motion-studio/qualityScore';
import type { ComposerScene } from '@/types/video-composer';
import { SCENE_TYPE_LABELS, CLIP_SOURCE_LABELS, getClipCost } from '@/types/video-composer';

interface Props {
  scene: ComposerScene;
  index: number;
  totalScenes: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  language: DirectorLanguage;
}

const sceneTypeColor: Record<string, string> = {
  hook: 'bg-red-500/15 text-red-300 border-red-500/30',
  problem: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  solution: 'bg-green-500/15 text-green-300 border-green-500/30',
  demo: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'social-proof': 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  cta: 'bg-primary/15 text-primary border-primary/30',
  custom: 'bg-muted text-muted-foreground border-border/40',
};

const STATUS = {
  en: { good: 'Ready', mid: 'Polish', bad: 'Fix' },
  de: { good: 'Bereit', mid: 'Feinschliff', bad: 'Lücken' },
  es: { good: 'Listo', mid: 'Pulir', bad: 'Faltas' },
} as const;

const EXPAND_LABEL = {
  en: { open: 'Open studio', close: 'Collapse' },
  de: { open: 'Studio öffnen', close: 'Einklappen' },
  es: { open: 'Abrir estudio', close: 'Cerrar' },
} as const;

function scoreTone(score: number): { ring: string; chip: string; status: 'good' | 'mid' | 'bad' } {
  if (score >= 85)
    return {
      ring: 'border-emerald-400/40 bg-emerald-400/5',
      chip: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30',
      status: 'good',
    };
  if (score >= 65)
    return {
      ring: 'border-amber-400/40 bg-amber-400/5',
      chip: 'bg-amber-400/10 text-amber-300 border-amber-400/30',
      status: 'mid',
    };
  return {
    ring: 'border-rose-500/50 bg-rose-500/5',
    chip: 'bg-rose-500/10 text-rose-300 border-rose-500/40',
    status: 'bad',
  };
}

export default function SceneCardSummaryHeader({
  scene,
  index,
  totalScenes,
  isExpanded,
  onToggleExpand,
  onMoveUp,
  onMoveDown,
  onDelete,
  language,
}: Props) {
  const isAi = scene.clipSource.startsWith('ai-');

  // Only run the heavy compose for AI scenes (stock/upload don't have a prompt-quality dimension)
  const score = useMemo(() => {
    if (!isAi) return null;
    const composed = composeFinalPrompt({
      rawPrompt: scene.aiPrompt || '',
      directorModifiers: scene.directorModifiers,
      shotDirector: scene.shotDirector,
      cinematicStylePresetId: scene.cinematicPresetSlug,
      audioPlan: scene.audioPlan,
      language,
    });
    const result = evaluateSceneQuality({
      scene,
      finalPrompt: composed.finalPrompt,
      negativePrompt: composed.negativePrompt,
      language,
    });
    return result.score;
  }, [
    isAi,
    scene,
    language,
  ]);

  const tone = score != null ? scoreTone(score) : null;
  const sceneTypeKey = (scene.sceneType ?? 'custom') as keyof typeof sceneTypeColor;
  const sceneTypeClass = sceneTypeColor[sceneTypeKey] ?? sceneTypeColor.custom;

  const ClipIcon = isAi ? Sparkles : scene.clipSource.startsWith('stock') ? Video : Upload;

  const cost = getClipCost(scene.clipSource, scene.clipQuality || 'standard', scene.durationSeconds);
  const thumbUrl =
    scene.clipUrl ||
    scene.uploadUrl ||
    scene.referenceImageUrl ||
    null;
  const thumbIsImage =
    scene.uploadType === 'image' ||
    scene.clipSource === 'ai-image' ||
    scene.clipSource === 'stock-image' ||
    Boolean(scene.referenceImageUrl);

  // Title preview = first non-empty line of script/prompt, max 80 chars
  const titlePreview = useMemo(() => {
    const candidate =
      (scene.dialogScript || '').trim() ||
      (scene.aiPrompt || '').trim() ||
      (scene.script || '').trim();
    if (!candidate) return '';
    const firstLine = candidate.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
    const cleaned = firstLine.replace(/^[A-Za-zÀ-ÿ][\w\s.'-]{0,40}\s*[:：]\s*/, '').trim();
    return cleaned.length > 80 ? cleaned.slice(0, 77) + '…' : cleaned;
  }, [scene.dialogScript, scene.aiPrompt, scene.script]);

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 cursor-pointer select-none transition-colors',
        'hover:bg-primary/5 rounded-lg',
        isExpanded && 'border-b border-border/30 rounded-b-none mb-2',
      )}
      onClick={onToggleExpand}
      role="button"
      aria-expanded={isExpanded}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleExpand();
        }
      }}
    >
      {/* Drag handle + index (move buttons stay clickable, stop propagation) */}
      <div
        className="flex flex-col items-center gap-0.5 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
        <span className="text-[10px] font-mono text-muted-foreground">{index + 1}</span>
      </div>

      {/* Thumbnail / icon */}
      <div className="w-14 h-10 rounded-md bg-muted/30 border border-border/30 flex items-center justify-center shrink-0 overflow-hidden">
        {thumbUrl && thumbIsImage ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : thumbUrl ? (
          <video src={thumbUrl} className="w-full h-full object-cover" muted />
        ) : (
          <ClipIcon className="h-4 w-4 text-muted-foreground/40" />
        )}
      </div>

      {/* Type + meta + title preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="outline"
            className={cn('text-[9px] h-4 px-1.5 border', sceneTypeClass)}
          >
            {SCENE_TYPE_LABELS[scene.sceneType]?.[language] || scene.sceneType}
          </Badge>
          <span className="text-[10px] font-mono text-muted-foreground">
            {scene.durationSeconds}s
          </span>
          <span className="text-[10px] text-primary/80 font-mono">€{cost.toFixed(2)}</span>
          <span className="text-[10px] text-muted-foreground/60 truncate max-w-[180px]">
            · {CLIP_SOURCE_LABELS[scene.clipSource]?.[language] || scene.clipSource}
          </span>
          {tone && (
            <Badge
              variant="outline"
              className={cn('text-[9px] h-4 px-1.5 border font-mono gap-1', tone.chip)}
              title={`Director Score: ${score}/100 — ${STATUS[language][tone.status]}`}
            >
              {score}
              <span className="opacity-70">· {STATUS[language][tone.status]}</span>
            </Badge>
          )}
        </div>
        {titlePreview && (
          <div className="text-xs text-foreground/80 truncate mt-0.5">{titlePreview}</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
          onClick={onMoveUp}
          disabled={index === 0}
          title="Move up"
        >
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
          onClick={onMoveDown}
          disabled={index === totalScenes - 1}
          title="Move down"
        >
          <ChevronDown className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground/60 hover:text-rose-400"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] gap-1 text-primary hover:text-primary"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          title={isExpanded ? EXPAND_LABEL[language].close : EXPAND_LABEL[language].open}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              {EXPAND_LABEL[language].close}
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" />
              {EXPAND_LABEL[language].open}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
