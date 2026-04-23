import { useState, useMemo, useEffect, useRef } from 'react';
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
import { padAudioToExactWav } from '@/lib/audioToWav';
import { probeMediaDuration } from '@/lib/probeMp4Duration';
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

const FONT_FAMILIES = ['Inter', 'Roboto', 'Montserrat', 'Poppins', 'Bebas Neue', 'Playfair Display'];

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
  // Keep latest voiceover in a ref so async callbacks (e.g. browser-decoded
  // duration probe after VO generation) can read the *current* state instead
  // of a stale closure value captured at the moment of generation.
  const voiceoverRef = useRef(voiceover);
  useEffect(() => { voiceoverRef.current = voiceover; }, [voiceover]);
  const globalOverlays: GlobalTextOverlay[] = assemblyConfig.globalTextOverlays ?? [];
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);

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
    const script = (globalOverlays || [])
      .filter(o => (o.text || '').trim().length > 0)
      .map(o => o.text.trim())
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

      const serverDuration = Number(data.duration) || 0;
      onUpdateAssembly({
        voiceover: {
          ...voiceover,
          audioUrl: data.audioUrl,
          // Server returns bit-exact duration from MP3 bytes (CBR 128 kbps).
          // We additionally verify with browser-decoded metadata below for
          // maximum precision (handles edge cases like ID3 tags / VBR).
          durationSeconds: serverDuration,
          speed,
          stability: voiceSettings.stability,
          similarityBoost: voiceSettings.similarityBoost,
          styleExaggeration: voiceSettings.styleExaggeration,
          useSpeakerBoost: voiceSettings.useSpeakerBoost,
        },
      });

      // Verify with browser-decoded duration (most precise — overrides server estimate).
      // Capture audioUrl locally so the probe callback can't be affected by
      // a stale `voiceover` from the closure if the user changes settings mid-probe.
      const generatedUrl: string = data.audioUrl;
      try {
        const probe = new (window as any).Audio();
        probe.preload = 'metadata';
        probe.src = generatedUrl;
        probe.addEventListener('loadedmetadata', async () => {
          const realDur = probe.duration;
          if (!isFinite(realDur) || realDur <= 0) return;

          if (Math.abs(realDur - serverDuration) > 0.05) {
            console.log('[VO] browser-verified duration:', realDur.toFixed(3), 's (server:', serverDuration, 's)');
            onUpdateAssembly({
              voiceover: {
                ...voiceoverRef.current,
                audioUrl: generatedUrl,
                durationSeconds: realDur,
              },
            });
          }

          // ── WAV pre-render pass (ONE-TRACK VO POLICY) ──────────────
          // Convert the MP3 to a sample-accurate WAV. The WAV is intentionally
          // DECOUPLED from scene geometry — it's just the spoken audio plus a
          // generous silence tail. This guarantees:
          //   • The voiceover plays as ONE continuous, uncut audio stream
          //     across all scene boundaries (no per-scene seams).
          //   • Slight scene-duration drift (Hailuo clips, frame rounding,
          //     edge-function padding) cannot truncate or stutter the VO.
          // The Remotion renderer uses a single <Audio> over the full
          // composition — silence at the end is simply not played past
          // durationInFrames, which is harmless.
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Pad to VO duration + 2.0s safety tail. Independent of scenes.
            const SAFETY_TAIL_SECONDS = 2.0;
            const wavDuration = realDur + SAFETY_TAIL_SECONDS;
            const { blob, exactSeconds } = await padAudioToExactWav(generatedUrl, wavDuration);
            console.log(`[VO] WAV pad applied (one-track mode) — VO ${realDur.toFixed(3)}s + ${SAFETY_TAIL_SECONDS}s tail = ${exactSeconds.toFixed(3)}s | size ${(blob.size / 1024).toFixed(1)} KB`);


            const wavPath = `${user.id}/${Date.now()}-voiceover.wav`;
            const { data: upload, error: upErr } = await supabase.storage
              .from('voiceover-audio')
              .upload(wavPath, blob, { contentType: 'audio/wav', cacheControl: '3600', upsert: false });
            if (upErr) throw upErr;

            const { data: { publicUrl } } = supabase.storage
              .from('voiceover-audio')
              .getPublicUrl(upload.path);

            // Swap to deterministic WAV for the renderer.
            // NOTE: keep durationSeconds = realDur (actual VO length) so
            // subtitle sync logic remains correct — the WAV is intentionally
            // longer (silence-padded) but the spoken content ends at realDur.
            onUpdateAssembly({
              voiceover: {
                ...voiceoverRef.current,
                audioUrl: publicUrl,
                durationSeconds: realDur,
              },
            });
            console.log('[VO] WAV uploaded and swapped:', publicUrl, '(padded to', exactSeconds.toFixed(3), 's)');
          } catch (wavErr) {
            console.warn('[VO] WAV pre-render failed, falling back to MP3:', wavErr);
          }
        }, { once: true });
      } catch (e) {
        console.warn('[VO] browser duration probe failed:', e);
      }

      toast({ title: t('videoComposer.voGenerated'), description: `~${serverDuration.toFixed(1)}s` });
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

  // ── Subtitles helpers ─────────────────────────────────────────────
  const updateSubtitles = (patch: Partial<SubtitlesConfig>) =>
    onUpdateAssembly({ subtitles: { ...subtitles, ...patch } });
  const updateSubtitleStyle = (patch: Partial<SubtitlesConfig['style']>) =>
    onUpdateAssembly({ subtitles: { ...subtitles, style: { ...subtitles.style, ...patch } } });

  // ── One-time migration: legacy per-scene textOverlays → globalTextOverlays
  const migratedRef = (globalOverlays.length > 0);
  useEffect(() => {
    if (migratedRef) return;
    const legacy = scenes.filter(s => (s.textOverlay?.text || '').trim().length > 0);
    if (legacy.length === 0) return;

    // Compute scene start offsets for accurate timing
    let acc = 0;
    const offsets = new Map<string, { start: number; end: number }>();
    for (const s of scenes) {
      const dur = s.durationSeconds || 0;
      offsets.set(s.id, { start: acc, end: acc + dur });
      acc += dur;
    }

    // Map legacy positions to Director's-Cut positions
    const posMap: Record<string, GlobalTextOverlay['position']> = {
      top: 'top',
      center: 'center',
      bottom: 'bottom',
      'top-left': 'topLeft',
      'top-right': 'topRight',
      'bottom-left': 'bottomLeft',
      'bottom-right': 'bottomRight',
    };

    const migrated: GlobalTextOverlay[] = legacy.map((s, i) => {
      const o = s.textOverlay;
      const off = offsets.get(s.id) || { start: 0, end: (s.durationSeconds || 3) };
      return {
        id: `migrated-${s.id}-${i}`,
        text: o.text,
        animation: 'fadeIn',
        position: posMap[o.position] || 'center',
        startTime: off.start,
        endTime: off.end,
        style: {
          fontSize: 'lg',
          color: o.color || '#FFFFFF',
          backgroundColor: 'transparent',
          shadow: true,
          fontFamily: o.fontFamily || 'sans-serif',
        },
      };
    });

    onUpdateAssembly({ globalTextOverlays: migrated });

    // ── Clear legacy per-scene text_overlay so the renderer can't double-burn it.
    // Without this, the backend keeps reading the old DB column and burns the
    // hook into the final render even when the user has overlays disabled.
    (async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const sceneIds = legacy.map(s => s.id).filter(Boolean);
        if (sceneIds.length > 0) {
          await supabase
            .from('composer_scenes')
            .update({ text_overlay: { text: '', position: 'bottom', animation: 'fade-in', fontSize: 48, color: '#FFFFFF' } as any })
            .in('id', sceneIds);
        }
      } catch (e) {
        console.warn('[VoiceSubtitlesTab] Failed to clear legacy text_overlay rows:', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


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
            globalTextOverlays={
              assemblyConfig.textOverlaysEnabled === false ? [] : globalOverlays
            }
            onTimeUpdate={(time) => setPreviewCurrentTime(time)}
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

      {/* ── GLOBAL TIMELINE TEXT-OVERLAYS ───────────────────────── */}
      {(() => {
        const overlaysEnabled = assemblyConfig.textOverlaysEnabled !== false;
        return (
          <Card className="border-border/40 bg-card/80">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Type className="h-4 w-4 text-primary" />
                  {t('videoComposer.textOverlays')}
                </CardTitle>
                <Switch
                  checked={overlaysEnabled}
                  onCheckedChange={(checked) =>
                    onUpdateAssembly({ textOverlaysEnabled: checked })
                  }
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('videoComposer.textOverlaysHint')}
              </p>
            </CardHeader>
            <CardContent>
              {!overlaysEnabled && (
                <div className="flex items-start gap-2 p-3 mb-3 rounded-lg bg-muted/40 border border-border/40 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{t('videoComposer.textOverlaysDisabledHint')}</span>
                </div>
              )}
              <div
                className={
                  overlaysEnabled
                    ? ''
                    : 'opacity-50 pointer-events-none select-none'
                }
                aria-disabled={!overlaysEnabled}
              >
                <TextOverlayEditor2028
                  overlays={globalOverlays}
                  onOverlaysChange={(next) => onUpdateAssembly({ globalTextOverlays: next })}
                  videoDuration={Math.max(totalSceneDuration, 1)}
                  currentTime={previewCurrentTime}
                />
              </div>
            </CardContent>
          </Card>
        );
      })()}

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
