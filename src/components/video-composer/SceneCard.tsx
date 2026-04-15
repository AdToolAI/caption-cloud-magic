import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronUp, ChevronDown, Trash2, GripVertical,
  Sparkles, ImageIcon, Upload, Video,
} from 'lucide-react';
import type {
  ComposerScene,
  SceneType,
  ClipSource,
  TransitionStyle,
  TextPosition,
  TextAnimation,
} from '@/types/video-composer';
import { SCENE_TYPE_LABELS, CLIP_SOURCE_LABELS, CLIP_SOURCE_COSTS } from '@/types/video-composer';

interface SceneCardProps {
  scene: ComposerScene;
  index: number;
  totalScenes: number;
  onUpdate: (updates: Partial<ComposerScene>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  language: string;
}

const SCENE_TYPES: SceneType[] = ['hook', 'problem', 'solution', 'demo', 'social-proof', 'cta', 'custom'];

const sceneTypeColor: Record<SceneType, string> = {
  hook: 'bg-red-500/20 text-red-400',
  problem: 'bg-orange-500/20 text-orange-400',
  solution: 'bg-green-500/20 text-green-400',
  demo: 'bg-blue-500/20 text-blue-400',
  'social-proof': 'bg-purple-500/20 text-purple-400',
  cta: 'bg-primary/20 text-primary',
  custom: 'bg-muted text-muted-foreground',
};

export default function SceneCard({
  scene,
  index,
  totalScenes,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  language,
}: SceneCardProps) {
  const lang = (language === 'es' ? 'es' : language === 'en' ? 'en' : 'de') as 'de' | 'en' | 'es';
  const clipSourceIcon = scene.clipSource.startsWith('ai-') ? Sparkles : scene.clipSource === 'stock' ? Video : Upload;
  const ClipIcon = clipSourceIcon;

  return (
    <Card className="border-border/40 bg-card/80 group">
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Drag handle + order */}
          <div className="flex flex-col items-center gap-1 pt-1">
            <GripVertical className="h-4 w-4 text-muted-foreground/40" />
            <span className="text-[10px] font-mono text-muted-foreground">{index + 1}</span>
            <div className="flex flex-col gap-0.5 mt-1">
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={onMoveUp} disabled={index === 0}>
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={onMoveDown} disabled={index === totalScenes - 1}>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-3">
            {/* Top row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Select value={scene.sceneType} onValueChange={(v) => onUpdate({ sceneType: v as SceneType })}>
                  <SelectTrigger className="h-7 w-auto gap-1 text-xs border-none p-0 px-2">
                    <Badge className={`${sceneTypeColor[scene.sceneType]} text-[10px] border-none`}>
                      {SCENE_TYPE_LABELS[scene.sceneType]?.[lang] || scene.sceneType}
                    </Badge>
                  </SelectTrigger>
                  <SelectContent>
                    {SCENE_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">
                        {SCENE_TYPE_LABELS[t]?.[lang] || t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="text-xs text-muted-foreground">{scene.durationSeconds}s</span>
                <span className="text-[10px] text-primary">€{(CLIP_SOURCE_COSTS[scene.clipSource] || 0).toFixed(2)}</span>
              </div>

              <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Duration slider */}
            <Slider
              value={[scene.durationSeconds]}
              onValueChange={([v]) => onUpdate({ durationSeconds: v })}
              min={3}
              max={15}
              step={1}
              className="w-full"
            />

            {/* Clip source */}
            <div className="flex gap-2">
              {(['ai-hailuo', 'ai-kling', 'stock', 'upload'] as ClipSource[]).map((src) => (
                <button
                  key={src}
                  onClick={() => onUpdate({ clipSource: src })}
                  className={`px-2 py-1 rounded text-[10px] border transition-all ${
                    scene.clipSource === src
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/40 text-muted-foreground hover:border-border'
                  }`}
                >
                  {CLIP_SOURCE_LABELS[src]?.de || src}
                </button>
              ))}
            </div>

            {/* Prompt / Keywords */}
            {scene.clipSource.startsWith('ai-') && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">KI-Prompt (EN)</Label>
                <Textarea
                  value={scene.aiPrompt || ''}
                  onChange={(e) => onUpdate({ aiPrompt: e.target.value })}
                  placeholder="Describe the scene visually in English..."
                  rows={2}
                  className="text-xs bg-background/50 resize-none"
                />
              </div>
            )}

            {scene.clipSource === 'stock' && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Stock-Suchbegriffe</Label>
                <Input
                  value={scene.stockKeywords || ''}
                  onChange={(e) => onUpdate({ stockKeywords: e.target.value })}
                  placeholder="z.B. business meeting, happy team"
                  className="text-xs bg-background/50"
                />
              </div>
            )}

            {/* Text Overlay */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Text-Overlay</Label>
              <Input
                value={scene.textOverlay?.text || ''}
                onChange={(e) =>
                  onUpdate({
                    textOverlay: { ...scene.textOverlay, text: e.target.value },
                  })
                }
                placeholder="Optionaler Text über dem Video"
                className="text-xs bg-background/50"
              />
            </div>

            {/* Transition */}
            <div className="flex items-center gap-2">
              <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Übergang:</Label>
              <Select
                value={scene.transitionType}
                onValueChange={(v) => onUpdate({ transitionType: v as TransitionStyle })}
              >
                <SelectTrigger className="h-6 text-[10px] w-24 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['fade', 'crossfade', 'wipe', 'slide', 'zoom', 'none'] as TransitionStyle[]).map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Thumbnail preview */}
          <div className="w-24 h-16 rounded bg-muted/30 border border-border/20 flex items-center justify-center flex-shrink-0">
            {scene.clipUrl ? (
              <video src={scene.clipUrl} className="w-full h-full object-cover rounded" muted />
            ) : (
              <ClipIcon className="h-5 w-5 text-muted-foreground/30" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
