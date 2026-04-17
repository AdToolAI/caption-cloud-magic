// (no useState needed after overlay editor moved to TextSubtitlesTab)
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
  Sparkles, Upload, Video, Type, AlertTriangle, Lightbulb,
} from 'lucide-react';
import type {
  ComposerScene,
  SceneType,
  ClipSource,
  ClipQuality,
  TransitionStyle,
} from '@/types/video-composer';
import { SCENE_TYPE_LABELS, CLIP_SOURCE_LABELS, getClipCost, getClipRate, QUALITY_LABELS, DEFAULT_TEXT_OVERLAY } from '@/types/video-composer';

import SceneMediaUpload from './SceneMediaUpload';
import SceneReferenceImageUpload from './SceneReferenceImageUpload';

interface SceneCardProps {
  scene: ComposerScene;
  index: number;
  totalScenes: number;
  projectId?: string;
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

// Text overlay editing has moved to the dedicated "Text & Subtitles" tab.

export default function SceneCard({
  scene,
  index,
  totalScenes,
  projectId,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  language,
}: SceneCardProps) {
  const lang = (language === 'es' ? 'es' : language === 'en' ? 'en' : 'de') as 'de' | 'en' | 'es';
  const clipSourceIcon = scene.clipSource.startsWith('ai-') ? Sparkles : scene.clipSource === 'stock' ? Video : Upload;
  const ClipIcon = clipSourceIcon;

  const overlay = scene.textOverlay || DEFAULT_TEXT_OVERLAY;
  const hasOverlayText = (overlay.text || '').trim().length > 0;

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
                <span className="text-[10px] text-primary">€{getClipCost(scene.clipSource, scene.clipQuality || 'standard', scene.durationSeconds).toFixed(2)}</span>
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
            <div className="flex flex-wrap gap-2">
              {(['ai-hailuo', 'ai-kling', 'stock', 'upload'] as ClipSource[]).map((src) => {
                const label =
                  src === 'upload'
                    ? 'Eigenes Video'
                    : CLIP_SOURCE_LABELS[src]?.de || src;
                return (
                  <button
                    key={src}
                    onClick={() => onUpdate({ clipSource: src })}
                    className={`px-2 py-1 rounded text-[10px] border transition-all ${
                      scene.clipSource === src
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/40 text-muted-foreground hover:border-border'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Quality Tier — only for AI sources */}
            {scene.clipSource.startsWith('ai-') && (
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-[10px] text-muted-foreground">Qualität:</Label>
                <div className="flex gap-1">
                  {(['standard', 'pro'] as ClipQuality[]).map((q) => {
                    const isActive = (scene.clipQuality || 'standard') === q;
                    const rate = getClipRate(scene.clipSource, q);
                    return (
                      <button
                        key={q}
                        onClick={() => onUpdate({ clipQuality: q })}
                        className={`px-2 py-1 rounded text-[10px] border transition-all ${
                          isActive
                            ? q === 'pro'
                              ? 'border-amber-500/60 bg-amber-500/10 text-amber-400'
                              : 'border-primary bg-primary/10 text-primary'
                            : 'border-border/40 text-muted-foreground hover:border-border'
                        }`}
                      >
                        {QUALITY_LABELS[scene.clipSource][q]} — €{rate.toFixed(2)}/s
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Prompt / Keywords / Upload */}
            {scene.clipSource.startsWith('ai-') && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] text-muted-foreground">
                      {lang === 'de'
                        ? 'KI-Prompt (EN) — bearbeitbar'
                        : lang === 'es'
                        ? 'Prompt IA (EN) — editable'
                        : 'AI Prompt (EN) — editable'}
                    </Label>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-2">
                      <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        {lang === 'de'
                          ? 'Tipp: Dieser Prompt ist nur eine Vorlage. Passe ihn an dein Produkt und deine Vision an — je präziser (Setting, Kamera, Stimmung, Verwendung), desto besser das Ergebnis.'
                          : lang === 'es'
                          ? 'Consejo: Este prompt es solo una plantilla. Adáptalo a tu producto y visión — cuanto más preciso (escenario, cámara, ambiente, uso), mejor será el resultado.'
                          : 'Tip: This prompt is only a template. Adapt it to your product and vision — the more specific (setting, camera, mood, usage), the better the result.'}
                      </p>
                    </div>
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                      <p className="text-[10px] leading-relaxed text-amber-200/80">
                        {lang === 'de'
                          ? 'Hinweis: Jede Szene wird einzeln von der KI generiert — Personen können zwischen Szenen optisch variieren. Die exakt gleiche Person über mehrere Clips ist technisch nicht möglich.'
                          : lang === 'es'
                          ? 'Nota: Cada escena se genera por separado con IA — las personas pueden variar visualmente entre escenas. La misma persona exacta en varios clips no es técnicamente posible.'
                          : 'Note: Each scene is generated separately by the AI — people may vary visually between scenes. The exact same person across multiple clips is technically not possible.'}
                      </p>
                    </div>
                  </div>
                  <Textarea
                    value={scene.aiPrompt || ''}
                    onChange={(e) => onUpdate({ aiPrompt: e.target.value })}
                    placeholder="Describe the scene visually in English..."
                    rows={3}
                    className="text-xs bg-background/50 resize-none"
                  />
                </div>
                <SceneReferenceImageUpload
                  projectId={projectId}
                  sceneId={scene.id}
                  referenceImageUrl={scene.referenceImageUrl}
                  onChange={(url) => onUpdate({ referenceImageUrl: url ?? undefined })}
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
                <p className="text-[9px] text-muted-foreground/70">
                  Wir suchen automatisch passende Stock-Videos im Clips-Tab.
                </p>
              </div>
            )}

            {scene.clipSource === 'upload' && (
              <SceneMediaUpload
                projectId={projectId}
                sceneId={scene.id}
                uploadUrl={scene.uploadUrl}
                uploadType={scene.uploadType}
                onChange={(url, type) =>
                  onUpdate({
                    uploadUrl: url ?? undefined,
                    uploadType: type ?? undefined,
                    clipUrl: url ?? undefined,
                    clipStatus: url ? 'ready' : 'pending',
                  })
                }
              />
            )}

            {/* Text Overlay — moved to dedicated "Text & Subtitles" tab */}
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/30 px-2 py-1.5">
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground min-w-0">
                <Type className="h-3 w-3 shrink-0 text-primary/70" />
                {hasOverlayText ? (
                  <>
                    <span className="text-foreground/80 truncate">"{overlay.text}"</span>
                    <Badge variant="outline" className="text-[9px] font-normal capitalize shrink-0">
                      {overlay.position}
                    </Badge>
                  </>
                ) : (
                  <span>
                    {lang === 'de'
                      ? 'Text & Untertitel im Tab „Text" bearbeiten'
                      : lang === 'es'
                      ? 'Edita texto y subtítulos en la pestaña "Texto"'
                      : 'Edit text & subtitles in the "Text" tab'}
                  </span>
                )}
              </span>
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
          <div className="w-24 h-16 rounded bg-muted/30 border border-border/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {scene.uploadType === 'image' && scene.uploadUrl ? (
              <img src={scene.uploadUrl} alt="" className="w-full h-full object-cover" />
            ) : scene.clipUrl ? (
              <video src={scene.clipUrl} className="w-full h-full object-cover" muted />
            ) : scene.uploadUrl ? (
              <video src={scene.uploadUrl} className="w-full h-full object-cover" muted />
            ) : (
              <ClipIcon className="h-5 w-5 text-muted-foreground/30" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
