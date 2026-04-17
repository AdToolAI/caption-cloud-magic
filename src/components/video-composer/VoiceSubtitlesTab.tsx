import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Type, Subtitles, Sparkles,
  Wand2, Film, Mic, Loader2, Info, Edit2, Trash2, Check, X,
} from 'lucide-react';
import ComposerSequencePreview from './ComposerSequencePreview';
import { VoicePreviewButton } from '@/components/voices/VoicePreviewButton';
import { VoiceoverScriptGenerator } from '@/components/universal-creator/VoiceoverScriptGenerator';
import { AdvancedVoiceSettings, type VoiceSettings } from '@/components/video/AdvancedVoiceSettings';
import { sortVoicesPremiumFirst, type VoiceMeta } from '@/lib/elevenlabs-voices';
import { supabase } from '@/integrations/supabase/client';
import type {
  ComposerScene,
  AssemblyConfig,
  SubtitlesConfig,
  SubtitleSegment,
  GlobalTextOverlay,
} from '@/types/video-composer';
import { DEFAULT_SUBTITLES_CONFIG } from '@/types/video-composer';
import { useTranslation } from '@/hooks/useTranslation';
import { toast } from '@/hooks/use-toast';
import { TextOverlayEditor2028 } from '@/components/directors-cut/features/TextOverlayEditor2028';

interface VoiceSubtitlesTabProps {
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

const POSITION_TO_CSS: Record<TextPosition, string> = {
  top: 'top-1 left-1/2 -translate-x-1/2',
  center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  bottom: 'bottom-1 left-1/2 -translate-x-1/2',
  'top-left': 'top-1 left-1',
  'top-right': 'top-1 right-1',
  'bottom-left': 'bottom-1 left-1',
  'bottom-right': 'bottom-1 right-1',
};

const formatTimeShort = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
};

export default function VoiceSubtitlesTab({
  scenes,
  onUpdateScenes,
  assemblyConfig,
  onUpdateAssembly,
  language,
  onGoToAudio,
}: VoiceSubtitlesTabProps) {
  const { t } = useTranslation();
  const subtitles: SubtitlesConfig = assemblyConfig.subtitles ?? DEFAULT_SUBTITLES_CONFIG;
  const voiceover = assemblyConfig.voiceover;
  const [openSceneId, setOpenSceneId] = useState<string | null>(scenes[0]?.id ?? null);

  // ── Voice loader ─────────────────────────────────────────────────
  const [voices, setVoices] = useState<VoiceMeta[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const initialLang = (language === 'es' ? 'es' : language === 'en' ? 'en' : 'de') as 'de' | 'en' | 'es';
  const [voiceLangTab, setVoiceLangTab] = useState<'de' | 'en' | 'es'>(initialLang);

  useEffect(() => {
    (async () => {
      setLoadingVoices(true);
      try {
        const { data, error } = await supabase.functions.invoke('list-voices', { body: { language: 'all' } });
        if (error) throw error;
        setVoices(sortVoicesPremiumFirst<VoiceMeta>(data?.voices || []));
      } catch (err) {
        console.error('[VoiceSubtitlesTab] Failed to load voices:', err);
      } finally {
        setLoadingVoices(false);
      }
    })();
  }, []);

  const voicesForTab = useMemo(
    () => voices.filter((v) => v.language === voiceLangTab || (v.supportedLanguages || []).includes(voiceLangTab)),
    [voices, voiceLangTab],
  );
  const fallbackVoice = { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' };

  // ── Voiceover state ──────────────────────────────────────────────
  const [generatingVo, setGeneratingVo] = useState(false);
  const [scriptGenOpen, setScriptGenOpen] = useState(false);

  // Voice tuning (speed + ElevenLabs settings) — synced from/to assemblyConfig.voiceover
  const [speed, setSpeed] = useState<number>(voiceover?.speed ?? 1.0);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    stability: voiceover?.stability ?? 0.5,
    similarityBoost: voiceover?.similarityBoost ?? 0.75,
    styleExaggeration: voiceover?.styleExaggeration ?? 0.0,
    useSpeakerBoost: voiceover?.useSpeakerBoost ?? true,
  });

  // Hydrate when voiceover loads from a saved draft
  useEffect(() => {
    if (!voiceover) return;
    if (typeof voiceover.speed === 'number') setSpeed(voiceover.speed);
    setVoiceSettings({
      stability: voiceover.stability ?? 0.5,
      similarityBoost: voiceover.similarityBoost ?? 0.75,
      styleExaggeration: voiceover.styleExaggeration ?? 0.0,
      useSpeakerBoost: voiceover.useSpeakerBoost ?? true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceover?.voiceId]);

  const totalSceneDuration = useMemo(
    () => scenes.reduce((sum, s) => sum + (s.durationSeconds || 0), 0),
    [scenes],
  );

  const generateScriptFromScenes = () => {
    const script = scenes
      .filter(s => s.textOverlay?.text)
      .map(s => s.textOverlay.text)
      .join('. ');
    if (voiceover && script) {
      onUpdateAssembly({ voiceover: { ...voiceover, script } });
      toast({
        title: t('videoComposer.scriptGenerated'),
        description: t('videoComposer.scriptGeneratedDesc').replace('{count}', String(script.split(/\s+/).length)),
      });
    } else if (!script) {
      toast({ title: t('videoComposer.noOverlayTextsForScript'), variant: 'destructive' });
    }
  };

  const handleGenerateVoiceover = async () => {
    if (!voiceover?.script?.trim()) {
      toast({ title: t('videoComposer.scriptMissing'), variant: 'destructive' });
      return;
    }
    setGeneratingVo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht eingeloggt');

      const selected = voices.find(v => v.id === voiceover.voiceId);

      const { data, error } = await supabase.functions.invoke('generate-voiceover', {
        body: {
          text: voiceover.script,
          voiceId: voiceover.voiceId,
          projectId: `composer-${Date.now()}`,
          stability: voiceSettings.stability,
          similarityBoost: voiceSettings.similarityBoost,
          style: voiceSettings.styleExaggeration,
          useSpeakerBoost: voiceSettings.useSpeakerBoost,
          modelId: selected?.recommended_model,
          speed,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Voiceover failed');

      onUpdateAssembly({
        voiceover: {
          ...voiceover,
          audioUrl: data.audioUrl,
          speed,
          stability: voiceSettings.stability,
          similarityBoost: voiceSettings.similarityBoost,
          styleExaggeration: voiceSettings.styleExaggeration,
          useSpeakerBoost: voiceSettings.useSpeakerBoost,
        },
      });
      toast({ title: t('videoComposer.voGenerated'), description: `~${data.duration}s` });
    } catch (err: any) {
      toast({ title: t('videoComposer.voError'), description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingVo(false);
    }
  };

  // ── Subtitle generation ──────────────────────────────────────────
  const [generatingSubs, setGeneratingSubs] = useState(false);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editStart, setEditStart] = useState(0);
  const [editEnd, setEditEnd] = useState(0);

  const handleGenerateSubtitles = async () => {
    if (!voiceover?.audioUrl) {
      toast({ title: t('videoComposer.noVoiceoverYet'), variant: 'destructive' });
      return;
    }
    setGeneratingSubs(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-subtitles', {
        body: { audioUrl: voiceover.audioUrl, language: subtitles.language },
      });
      if (error) throw error;
      const segs = (data?.subtitles || []) as SubtitleSegment[];
      onUpdateAssembly({
        subtitles: { ...subtitles, enabled: true, segments: segs },
      });
      toast({
        title: t('videoComposer.subSegmentsGenerated').replace('{count}', String(segs.length)),
      });
    } catch (err: any) {
      toast({ title: t('videoComposer.subGenError'), description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingSubs(false);
    }
  };

  const startEditSegment = (seg: SubtitleSegment) => {
    setEditingSegmentId(seg.id);
    setEditText(seg.text);
    setEditStart(seg.startTime);
    setEditEnd(seg.endTime);
  };
  const saveEditSegment = (id: string) => {
    const updated = (subtitles.segments || []).map(s =>
      s.id === id ? { ...s, text: editText, startTime: editStart, endTime: editEnd } : s
    );
    onUpdateAssembly({ subtitles: { ...subtitles, segments: updated } });
    setEditingSegmentId(null);
  };
  const deleteSegment = (id: string) => {
    const updated = (subtitles.segments || []).filter(s => s.id !== id);
    onUpdateAssembly({ subtitles: { ...subtitles, segments: updated } });
  };

  // ── Per-scene overlays helpers ───────────────────────────────────
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
  const updateSubtitles = (patch: Partial<SubtitlesConfig>) =>
    onUpdateAssembly({ subtitles: { ...subtitles, ...patch } });
  const updateSubtitleStyle = (patch: Partial<SubtitlesConfig['style']>) =>
    onUpdateAssembly({ subtitles: { ...subtitles, style: { ...subtitles.style, ...patch } } });

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
      {/* ── FULL SEQUENCE PREVIEW ──────────────────────── */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            {t('videoComposer.previewFullVideo')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ComposerSequencePreview
            scenes={scenes}
            subtitles={subtitles}
            voiceoverUrl={voiceover?.audioUrl ?? null}
          />
        </CardContent>
      </Card>

      {/* ── VOICEOVER ─────────────────────────────────── */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" /> {t('videoComposer.voiceover')}
            </CardTitle>
            <Switch
              checked={!!voiceover?.enabled}
              onCheckedChange={(checked) => {
                const first = voicesForTab[0] || voices[0] || fallbackVoice;
                onUpdateAssembly({
                  voiceover: checked
                    ? { enabled: true, voiceId: first.id, voiceName: first.name, script: '' }
                    : null,
                });
              }}
            />
          </div>
        </CardHeader>
        {voiceover?.enabled && (
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span>{t('videoComposer.voHint')}</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('videoComposer.voLanguage')}</Label>
              <Tabs value={voiceLangTab} onValueChange={(v) => setVoiceLangTab(v as 'de' | 'en' | 'es')}>
                <TabsList className="grid w-full grid-cols-3 h-8">
                  <TabsTrigger value="de" className="text-xs">🇩🇪 DE</TabsTrigger>
                  <TabsTrigger value="en" className="text-xs">🇬🇧 EN</TabsTrigger>
                  <TabsTrigger value="es" className="text-xs">🇪🇸 ES</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                {t('videoComposer.voVoice')}
                <span className="text-muted-foreground ml-1.5 font-normal">({voicesForTab.length} {t('videoComposer.voicesAvailable')})</span>
              </Label>
              <div className="flex items-center gap-2">
                <Select
                  value={voiceover.voiceId}
                  onValueChange={(v) => {
                    const voice = voices.find((vo) => vo.id === v);
                    onUpdateAssembly({ voiceover: { ...voiceover, voiceId: v, voiceName: voice?.name || '' } });
                  }}
                  disabled={loadingVoices}
                >
                  <SelectTrigger className="bg-background/50 flex-1">
                    <SelectValue placeholder={loadingVoices ? t('videoComposer.loadingVoices') : t('videoComposer.chooseVoice')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {voicesForTab.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        <span className="flex items-center gap-2">
                          {v.tier === 'premium' && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-primary/15 text-primary border-primary/20">
                              Premium
                            </Badge>
                          )}
                          <span>{v.name}</span>
                          {v.gender && <span className="text-xs text-muted-foreground">({v.gender})</span>}
                          {v.accent && <span className="text-[10px] text-muted-foreground">— {v.accent}</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {voiceover.voiceId && (
                  <VoicePreviewButton voiceId={voiceover.voiceId} language={voiceLangTab} size="sm" className="shrink-0" />
                )}
              </div>
            </div>

            {/* ── VOICE TUNING ──────────────────────────── */}
            <div className="space-y-3 p-3 rounded-lg border border-border/40 bg-background/30">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary" />
                {t('videoComposer.voiceTuning')}
              </Label>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <Label className="text-xs">{t('videoComposer.speed')}</Label>
                  <span className="text-xs text-muted-foreground">{speed.toFixed(2)}x</span>
                </div>
                <Slider
                  value={[speed]}
                  onValueChange={([v]) => setSpeed(v)}
                  min={0.7}
                  max={1.2}
                  step={0.05}
                />
              </div>
              <AdvancedVoiceSettings onSettingsChange={setVoiceSettings} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t('videoComposer.voScript')}</Label>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={() => setScriptGenOpen(true)}>
                    <Sparkles className="h-3 w-3 mr-1" />
                    {t('videoComposer.aiGenerator')}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={generateScriptFromScenes}>
                    <Wand2 className="h-3 w-3 mr-1" />
                    {t('videoComposer.fromScenes')}
                  </Button>
                </div>
              </div>
              <Textarea
                value={voiceover.script}
                onChange={(e) => onUpdateAssembly({ voiceover: { ...voiceover, script: e.target.value } })}
                placeholder={t('videoComposer.voScriptPlaceholder')}
                rows={4}
                className="bg-background/50 resize-none text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                {voiceover.script.split(/\s+/).filter(Boolean).length} {t('videoComposer.words')} · ~{Math.ceil(voiceover.script.split(/\s+/).filter(Boolean).length / 150 * 60)}s
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleGenerateVoiceover} disabled={generatingVo || !voiceover.script.trim()} className="gap-2 flex-1">
                {generatingVo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                {generatingVo ? t('videoComposer.generating') : t('videoComposer.generateVo')}
              </Button>
            </div>
            {voiceover.audioUrl && (
              <p className="text-[10px] text-emerald-400">✓ {t('videoComposer.voReady')} — {t('videoComposer.voPlaysInPreview')}</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── AUTOMATIC SUBTITLES (from voiceover) ──────── */}
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
              <p className="text-[11px] text-muted-foreground">{t('videoComposer.subtitlesAutoDesc')}</p>
            </div>
            <Switch
              checked={subtitles.enabled}
              onCheckedChange={(v) => updateSubtitles({ enabled: v })}
            />
          </div>

          {subtitles.enabled && (
            <>
              {/* Generate from voiceover */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {voiceover?.audioUrl
                      ? t('videoComposer.generateSubsFromVoHint')
                      : t('videoComposer.noVoiceoverYet')}
                  </p>
                </div>
                <Button
                  onClick={handleGenerateSubtitles}
                  disabled={!voiceover?.audioUrl || generatingSubs}
                  size="sm"
                  className="w-full gap-2"
                >
                  {generatingSubs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {generatingSubs ? t('videoComposer.generating') : t('videoComposer.generateSubsFromVo')}
                </Button>
              </div>

              {/* Style picker */}
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
                    min={20} max={72} step={2}
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

              {/* Generated segments list */}
              {subtitles.segments && subtitles.segments.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      {t('videoComposer.subtitleSegments')} ({subtitles.segments.length})
                    </Label>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto rounded-lg border border-border/40 bg-background/40 p-2">
                    {subtitles.segments.map((seg) => (
                      <div key={seg.id} className="rounded-md border border-border/30 bg-card/40 p-2">
                        {editingSegmentId === seg.id ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="number" step="0.1" min="0" value={editStart}
                                onChange={(e) => setEditStart(parseFloat(e.target.value) || 0)}
                                className="h-7 text-[11px]"
                              />
                              <Input
                                type="number" step="0.1" min="0" value={editEnd}
                                onChange={(e) => setEditEnd(parseFloat(e.target.value) || 0)}
                                className="h-7 text-[11px]"
                              />
                            </div>
                            <Input
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="h-7 text-[11px]"
                            />
                            <div className="flex gap-1.5 justify-end">
                              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setEditingSegmentId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                              <Button size="sm" className="h-6 px-2" onClick={() => saveEditSegment(seg.id)}>
                                <Check className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-20">
                              {formatTimeShort(seg.startTime)}–{formatTimeShort(seg.endTime)}
                            </span>
                            <p className="text-xs flex-1 truncate">{seg.text}</p>
                            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => startEditSegment(seg)}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-destructive hover:text-destructive" onClick={() => deleteSegment(seg.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Note: live style preview happens in the main player above. */}
              <p className="text-[10px] text-muted-foreground text-center pt-1">
                {t('videoComposer.subtitlesStyleLiveHint')}
              </p>
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
                        min={16} max={120} step={2}
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
          {t('videoComposer.continueToMusic')}
        </Button>
      </div>

      {/* AI Script Generator dialog */}
      <VoiceoverScriptGenerator
        open={scriptGenOpen}
        onClose={() => setScriptGenOpen(false)}
        defaultDuration={totalSceneDuration}
        onScriptGenerated={(script) => {
          if (voiceover) {
            onUpdateAssembly({ voiceover: { ...voiceover, script } });
          }
        }}
      />
    </div>
  );
}
