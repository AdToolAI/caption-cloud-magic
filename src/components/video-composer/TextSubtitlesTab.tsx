import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ChevronUp, ChevronDown, Type, Subtitles, Sparkles, AlertTriangle, Wand2, Copy,
} from 'lucide-react';
import type {
  ComposerScene,
  AssemblyConfig,
  SubtitlesConfig,
  TextPosition,
  TextAnimation,
} from '@/types/video-composer';
import { DEFAULT_TEXT_OVERLAY, DEFAULT_SUBTITLES_CONFIG } from '@/types/video-composer';
import { useTranslation } from '@/hooks/useTranslation';
import { toast } from '@/hooks/use-toast';

interface TextSubtitlesTabProps {
  scenes: ComposerScene[];
  onUpdateScenes: (scenes: ComposerScene[]) => void;
  assemblyConfig: AssemblyConfig;
  onUpdateAssembly: (config: Partial<AssemblyConfig>) => void;
  language: string;
  onGoToAudio: () => void;
}

const TEXT_POSITIONS: TextPosition[] = ['top', 'center', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
const TEXT_ANIMATIONS: TextAnimation[] = ['none', 'fade-in', 'scale-bounce', 'slide-left', 'slide-right', 'word-by-word', 'glow-pulse'];
const FONT_FAMILIES = ['Inter', 'Roboto', 'Montserrat', 'Poppins', 'Bebas Neue', 'Playfair Display'];

// Map TextPosition to absolute CSS position for the live preview indicator
const POSITION_TO_CSS: Record<TextPosition, string> = {
  top: 'top-1 left-1/2 -translate-x-1/2',
  center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  bottom: 'bottom-1 left-1/2 -translate-x-1/2',
  'top-left': 'top-1 left-1',
  'top-right': 'top-1 right-1',
  'bottom-left': 'bottom-1 left-1',
  'bottom-right': 'bottom-1 right-1',
};

export default function TextSubtitlesTab({
  scenes,
  onUpdateScenes,
  assemblyConfig,
  onUpdateAssembly,
  language,
  onGoToAudio,
}: TextSubtitlesTabProps) {
  const { t } = useTranslation();
  const lang = (language === 'es' ? 'es' : language === 'en' ? 'en' : 'de') as 'de' | 'en' | 'es';
  const subtitles: SubtitlesConfig = assemblyConfig.subtitles ?? DEFAULT_SUBTITLES_CONFIG;
  const [openSceneId, setOpenSceneId] = useState<string | null>(scenes[0]?.id ?? null);

  const overlayCount = useMemo(
    () => scenes.filter(s => (s.textOverlay?.text || '').trim().length > 0).length,
    [scenes]
  );

  const updateScene = (sceneId: string, patch: Partial<ComposerScene>) => {
    onUpdateScenes(scenes.map(s => (s.id === sceneId ? { ...s, ...patch } : s)));
  };

  const updateOverlay = (sceneId: string, patch: Partial<typeof DEFAULT_TEXT_OVERLAY>) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const next = { ...DEFAULT_TEXT_OVERLAY, ...(scene.textOverlay || {}), ...patch };
    updateScene(sceneId, { textOverlay: next });
  };

  const updateSubtitles = (patch: Partial<SubtitlesConfig>) => {
    onUpdateAssembly({ subtitles: { ...subtitles, ...patch } });
  };
  const updateSubtitleStyle = (patch: Partial<SubtitlesConfig['style']>) => {
    onUpdateAssembly({ subtitles: { ...subtitles, style: { ...subtitles.style, ...patch } } });
  };

  const applyStyleToAll = (sourceSceneId: string) => {
    const src = scenes.find(s => s.id === sourceSceneId);
    if (!src?.textOverlay) return;
    const { text: _ignore, ...stylePart } = src.textOverlay;
    onUpdateScenes(
      scenes.map(s => ({
        ...s,
        textOverlay: { ...DEFAULT_TEXT_OVERLAY, ...(s.textOverlay || {}), ...stylePart },
      }))
    );
    toast({ title: t('videoComposer.styleAppliedAll') });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ── GLOBAL SUBTITLES ───────────────────────────── */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Subtitles className="h-4 w-4 text-primary" />
            {t('videoComposer.subtitlesGlobal')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('videoComposer.subtitlesAutoLabel')}</p>
              <p className="text-[11px] text-muted-foreground">
                {t('videoComposer.subtitlesAutoDesc')}
              </p>
            </div>
            <Switch
              checked={subtitles.enabled}
              onCheckedChange={(v) => updateSubtitles({ enabled: v })}
            />
          </div>

          {subtitles.enabled && (
            <>
              <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-2.5">
                <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t('videoComposer.subtitlesHint')}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('videoComposer.subtitlesLanguage')}</Label>
                  <Select value={subtitles.language} onValueChange={(v) => updateSubtitles({ language: v })}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="de">🇩🇪 Deutsch</SelectItem>
                      <SelectItem value="en">🇬🇧 English</SelectItem>
                      <SelectItem value="es">🇪🇸 Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('videoComposer.subtitlesFont')}</Label>
                  <Select value={subtitles.style.font} onValueChange={(v) => updateSubtitleStyle({ font: v })}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_FAMILIES.map(f => (
                        <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t('videoComposer.subtitlesSize')}: {subtitles.style.size}px
                  </Label>
                  <Slider
                    value={[subtitles.style.size]}
                    onValueChange={([v]) => updateSubtitleStyle({ size: v })}
                    min={20}
                    max={72}
                    step={2}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('videoComposer.subtitlesPosition')}</Label>
                  <div className="flex gap-2">
                    {(['top', 'bottom'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => updateSubtitleStyle({ position: p })}
                        className={`flex-1 px-3 py-1.5 rounded-md border text-xs transition-all ${
                          subtitles.style.position === p
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border/40 text-muted-foreground hover:border-border'
                        }`}
                      >
                        {p === 'top' ? t('videoComposer.posTop') : t('videoComposer.posBottom')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('videoComposer.subtitlesColor')}</Label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={subtitles.style.color}
                      onChange={(e) => updateSubtitleStyle({ color: e.target.value })}
                      className="h-9 w-12 rounded border border-border/40 bg-background/50 cursor-pointer"
                    />
                    <Input
                      value={subtitles.style.color}
                      onChange={(e) => updateSubtitleStyle({ color: e.target.value })}
                      className="text-xs h-9 bg-background/50 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('videoComposer.subtitlesBackground')}</Label>
                  <Select
                    value={subtitles.style.background || 'none'}
                    onValueChange={(v) => updateSubtitleStyle({ background: v === 'none' ? '' : v })}
                  >
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">{t('videoComposer.subtitlesBgNone')}</SelectItem>
                      <SelectItem value="rgba(0,0,0,0.55)" className="text-xs">{t('videoComposer.subtitlesBgDark')}</SelectItem>
                      <SelectItem value="rgba(0,0,0,0.85)" className="text-xs">{t('videoComposer.subtitlesBgSolid')}</SelectItem>
                      <SelectItem value="rgba(255,255,255,0.85)" className="text-xs">{t('videoComposer.subtitlesBgLight')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Live preview */}
              <div className="rounded-lg border border-border/40 bg-black/40 aspect-video relative overflow-hidden">
                <div
                  className="absolute left-1/2 -translate-x-1/2 px-3 py-1 rounded-sm whitespace-nowrap"
                  style={{
                    top: subtitles.style.position === 'top' ? '8%' : undefined,
                    bottom: subtitles.style.position === 'bottom' ? '8%' : undefined,
                    color: subtitles.style.color,
                    background: subtitles.style.background || 'transparent',
                    fontFamily: subtitles.style.font,
                    fontSize: Math.max(10, subtitles.style.size / 3),
                    fontWeight: 600,
                  }}
                >
                  {t('videoComposer.subtitlesPreviewLine')}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── PER-SCENE OVERLAYS ──────────────────────── */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Type className="h-4 w-4 text-primary" />
              {t('videoComposer.sceneOverlays')}
            </span>
            <Badge variant="outline" className="text-[10px] font-normal">
              {overlayCount}/{scenes.length} {t('videoComposer.withText')}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {scenes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              {t('videoComposer.noScenesYet')}
            </p>
          )}

          {scenes.map((scene, idx) => {
            const overlay = scene.textOverlay || DEFAULT_TEXT_OVERLAY;
            const isOpen = openSceneId === scene.id;
            const hasText = (overlay.text || '').trim().length > 0;
            const aiConflict = scene.clipSource.startsWith('ai-');
            const thumb = scene.uploadType === 'image' ? scene.uploadUrl : (scene.clipUrl || scene.uploadUrl);

            return (
              <Collapsible key={scene.id} open={isOpen} onOpenChange={(o) => setOpenSceneId(o ? scene.id : null)}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-3 w-full text-left rounded-lg border border-border/40 bg-background/40 p-2.5 hover:border-border transition-colors">
                    {/* Thumb + position indicator */}
                    <div className="relative w-20 h-12 rounded bg-muted/30 border border-border/20 flex-shrink-0 overflow-hidden">
                      {thumb ? (
                        scene.uploadType === 'image' ? (
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <video src={thumb} className="w-full h-full object-cover" muted />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Type className="h-3.5 w-3.5 text-muted-foreground/40" />
                        </div>
                      )}
                      {hasText && (
                        <div
                          className={`absolute ${POSITION_TO_CSS[overlay.position]} px-1 py-0.5 rounded-sm bg-black/70 text-[7px] font-semibold leading-none truncate max-w-[80%]`}
                          style={{ color: overlay.color || '#FFFFFF' }}
                        >
                          Aa
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {t('videoComposer.scene')} {idx + 1}
                        <span className="text-muted-foreground ml-1.5 font-normal">· {scene.durationSeconds}s</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {hasText ? `"${overlay.text}"` : t('videoComposer.noOverlayText')}
                      </p>
                    </div>

                    {hasText && (
                      <Badge className="bg-primary/15 text-primary border-0 text-[10px] font-normal">
                        <Type className="h-2.5 w-2.5 mr-1" />
                        {overlay.position}
                      </Badge>
                    )}
                    {isOpen
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent className="space-y-3 pt-3 px-1 pb-1">
                  {aiConflict && (
                    <div className="flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
                      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-amber-200/80 leading-snug">
                        {t('videoComposer.overlayAiConflict')}
                      </p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{t('videoComposer.overlayText')}</Label>
                    <Textarea
                      value={overlay.text || ''}
                      onChange={(e) => updateOverlay(scene.id, { text: e.target.value })}
                      placeholder={t('videoComposer.overlayPlaceholder')}
                      rows={2}
                      className="text-xs bg-background/50 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{t('videoComposer.position')}</Label>
                      <Select
                        value={overlay.position}
                        onValueChange={(v) => updateOverlay(scene.id, { position: v as TextPosition })}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TEXT_POSITIONS.map((p) => (
                            <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{t('videoComposer.animation')}</Label>
                      <Select
                        value={overlay.animation}
                        onValueChange={(v) => updateOverlay(scene.id, { animation: v as TextAnimation })}
                      >
                        <SelectTrigger className="h-8 text-xs bg-background/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TEXT_ANIMATIONS.map((a) => (
                            <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{t('videoComposer.color')}</Label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={overlay.color || '#FFFFFF'}
                          onChange={(e) => updateOverlay(scene.id, { color: e.target.value })}
                          className="h-8 w-10 rounded border border-border/40 bg-background/50 cursor-pointer"
                        />
                        <Input
                          value={overlay.color || '#FFFFFF'}
                          onChange={(e) => updateOverlay(scene.id, { color: e.target.value })}
                          className="text-[11px] h-8 bg-background/50 font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        {t('videoComposer.fontSize')}: {overlay.fontSize ?? 48}px
                      </Label>
                      <Slider
                        value={[overlay.fontSize ?? 48]}
                        onValueChange={([v]) => updateOverlay(scene.id, { fontSize: v })}
                        min={16}
                        max={120}
                        step={2}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => applyStyleToAll(scene.id)}
                      className="h-7 text-[11px] gap-1.5"
                    >
                      <Copy className="h-3 w-3" />
                      {t('videoComposer.applyStyleAll')}
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      {/* Continue */}
      <div className="flex justify-end">
        <Button onClick={onGoToAudio} className="gap-2">
          <Wand2 className="h-4 w-4" />
          {t('videoComposer.continueToAudio')}
        </Button>
      </div>
    </div>
  );
}
