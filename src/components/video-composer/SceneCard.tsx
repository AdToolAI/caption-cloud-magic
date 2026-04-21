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
  Sparkles, Upload, Video, Image as ImageIcon, Wand2,
} from 'lucide-react';
import type {
  ComposerScene,
  SceneType,
  ClipSource,
  ClipQuality,
  TransitionStyle,
  ComposerCharacter,
} from '@/types/video-composer';
import { SCENE_TYPE_LABELS, CLIP_SOURCE_LABELS, getClipCost, getClipRate, QUALITY_LABELS } from '@/types/video-composer';

import SceneMediaUpload from './SceneMediaUpload';
import SceneReferenceImageUpload from './SceneReferenceImageUpload';
import { CharacterShotBadge, CharacterShotPicker } from './CharacterShotBadge';

interface SceneCardProps {
  scene: ComposerScene;
  index: number;
  totalScenes: number;
  projectId?: string;
  characters?: ComposerCharacter[];
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
  characters,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  language,
}: SceneCardProps) {
  const lang = (language === 'es' ? 'es' : language === 'en' ? 'en' : 'de') as 'de' | 'en' | 'es';
  const clipSourceIcon = scene.clipSource.startsWith('ai-') ? Sparkles : scene.clipSource === 'stock' ? Video : Upload;
  const ClipIcon = clipSourceIcon;
  const activeChar = scene.characterShot
    ? characters?.find((c) => c.id === scene.characterShot!.characterId)
    : undefined;

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
                {scene.characterShot && scene.characterShot.shotType !== 'absent' && (
                  <CharacterShotBadge shot={scene.characterShot} characterName={activeChar?.name} />
                )}
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
              {(['ai-hailuo', 'ai-kling', 'ai-image', 'stock', 'upload'] as ClipSource[]).map((src) => {
                const label =
                  src === 'upload'
                    ? 'Eigenes Video'
                    : CLIP_SOURCE_LABELS[src]?.de || src;
                const isImage = src === 'ai-image';
                return (
                  <button
                    key={src}
                    onClick={() => onUpdate({ clipSource: src })}
                    className={`px-2 py-1 rounded text-[10px] border transition-all flex items-center gap-1 ${
                      scene.clipSource === src
                        ? isImage
                          ? 'border-green-500/60 bg-green-500/10 text-green-300'
                          : 'border-primary bg-primary/10 text-primary'
                        : 'border-border/40 text-muted-foreground hover:border-border'
                    }`}
                  >
                    {isImage && <ImageIcon className="h-2.5 w-2.5" />}
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Effects badges (AI-selected procedural effects layered above the clip) */}
            {scene.effects && scene.effects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1">
                  <Wand2 className="h-2.5 w-2.5" />
                  Effekte
                </span>
                {scene.effects.map((eff, i) => (
                  <Badge
                    key={`${eff.id}-${i}`}
                    variant="outline"
                    className="text-[9px] px-1.5 py-0 h-4 border-amber-500/30 bg-amber-500/5 text-amber-300/90"
                  >
                    {eff.id}
                  </Badge>
                ))}
              </div>
            )}

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

            {/* Character Shot picker — only when characters are defined in the briefing AND it's an AI scene */}
            {scene.clipSource.startsWith('ai-') && characters && characters.length > 0 && (
              <CharacterShotPicker
                characters={characters}
                value={scene.characterShot}
                onChange={(next) => onUpdate({ characterShot: next })}
              />
            )}
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
                  <Textarea
                    value={scene.aiPrompt || ''}
                    onChange={(e) => onUpdate({ aiPrompt: e.target.value })}
                    placeholder="Describe the scene visually in English..."
                    rows={3}
                    className="text-xs bg-background/50 resize-none"
                  />
                  <p className="text-[10px] leading-relaxed text-muted-foreground/80 italic">
                    {lang === 'de'
                      ? 'ℹ️ Untertitel, Captions und eingebrannte Texte werden automatisch ausgeschlossen — füge sie später im Tab „Voiceover & Untertitel" hinzu.'
                      : lang === 'es'
                      ? 'ℹ️ Subtítulos, captions y textos incrustados se excluyen automáticamente — añádelos luego en la pestaña "Voz y subtítulos".'
                      : 'ℹ️ Subtitles, captions and burned-in text are automatically excluded — add them later in the "Voice & Subtitles" tab.'}
                  </p>
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

            {/* Transitions disabled in Composer — handled in Director's Cut */}
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/40 border border-border/30"
              title="Übergänge werden im Universal Director's Cut nachträglich hinzugefügt (sauberer & flexibler)."
            >
              <span className="text-[10px] text-muted-foreground">
                Harter Schnitt → Übergänge im Director's Cut
              </span>
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
