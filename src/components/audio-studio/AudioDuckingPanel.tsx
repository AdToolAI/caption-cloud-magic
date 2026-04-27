import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Download, Sparkles, Volume2, AudioLines, Loader2, Music, Mic } from 'lucide-react';
import { useAudioDucking } from '@/hooks/useAudioDucking';
import { DuckingEnvelopeOverlay } from './DuckingEnvelopeOverlay';
import { DUCKING_PRESETS, type DuckingPresetKey, type DuckingSettings } from '@/lib/duckingEnvelope';

interface AudioDuckingPanelProps {
  speechUrl: string | null;
  musicUrl: string | null;
  transcript?: Array<{ word: string; start: number; end: number; type: 'normal' | 'filler' | 'pause' }>;
  speechLabel?: string;
  musicLabel?: string;
  onMixExported?: (url: string) => void;
}

export function AudioDuckingPanel({
  speechUrl,
  musicUrl,
  transcript,
  speechLabel = 'Voiceover',
  musicLabel = 'Musik',
  onMixExported,
}: AudioDuckingPanelProps) {
  const [presetKey, setPresetKey] = useState<DuckingPresetKey | 'custom'>('standard');
  const [custom, setCustom] = useState<DuckingSettings>(DUCKING_PRESETS.standard);

  const settings: DuckingSettings = presetKey === 'custom' ? custom : DUCKING_PRESETS[presetKey];

  const {
    isLoading,
    isPlaying,
    isExporting,
    currentTime,
    duration,
    intervals,
    automation,
    play,
    pause,
    seek,
    exportMix,
  } = useAudioDucking({ speechUrl, musicUrl, transcript, settings });

  const speechCoverage = useMemo(() => {
    if (!duration || intervals.length === 0) return 0;
    const total = intervals.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
    return (total / duration) * 100;
  }, [intervals, duration]);

  const usingTranscript = (transcript?.length ?? 0) > 0;

  const handleExport = async () => {
    const result = await exportMix();
    if (result?.url) onMixExported?.(result.url);
  };

  const handleSettingChange = (patch: Partial<DuckingSettings>) => {
    setCustom(prev => ({ ...prev, ...patch }));
    setPresetKey('custom');
  };

  if (!speechUrl || !musicUrl) {
    return (
      <Card className="p-8 backdrop-blur-xl bg-card/60 border-border/50 text-center">
        <AudioLines className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
        <h3 className="text-lg font-semibold mb-2">Sprache + Musik benötigt</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Lade ein Voiceover hoch <span className="text-primary">und</span> wähle einen
          Musik-Track (über AI Music, Beat-Sync oder die Bibliothek), um Audio Ducking zu nutzen.
        </p>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <Card className="backdrop-blur-xl bg-gradient-to-br from-primary/10 via-card/60 to-cyan-500/10 border-primary/30 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center">
              <Volume2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-lg font-bold">Audio Ducking</h3>
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                  {usingTranscript ? 'Transkript-präzise' : 'RMS-Erkennung'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Musik wird automatisch leiser, wenn Sprache erkannt wird
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="lg"
              variant="outline"
              onClick={() => (isPlaying ? pause() : play(currentTime >= duration ? 0 : currentTime))}
              disabled={isLoading || duration === 0}
              className="border-primary/40"
            >
              {isPlaying ? <Pause className="w-5 h-5 mr-2" /> : <Play className="w-5 h-5 mr-2" />}
              {isPlaying ? 'Pause' : 'Live-Mix abspielen'}
            </Button>
            <Button
              size="lg"
              onClick={handleExport}
              disabled={isLoading || isExporting || duration === 0}
              className="bg-gradient-to-r from-primary to-cyan-500"
            >
              {isExporting
                ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Exportiere…</>
                : <><Download className="w-5 h-5 mr-2" />Mix exportieren</>}
            </Button>
          </div>
        </div>
      </Card>

      {/* Visualisation */}
      <Card className="backdrop-blur-xl bg-card/60 border-border/50 p-4 space-y-3">
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Speech track */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mic className="w-4 h-4 text-cyan-400" />
                  {speechLabel}
                </div>
                <span className="text-xs text-muted-foreground">
                  {intervals.length} Sprach-Block{intervals.length === 1 ? '' : 'e'} · {speechCoverage.toFixed(0)}% Sprache
                </span>
              </div>
              <div className="relative h-20 rounded-lg bg-muted/30 border border-border/50 overflow-hidden cursor-pointer"
                onClick={(e) => {
                  if (duration <= 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const f = (e.clientX - rect.left) / rect.width;
                  seek(f * duration);
                }}
              >
                {/* Speech segments */}
                <svg viewBox="0 0 100 80" preserveAspectRatio="none" className="w-full h-full block">
                  {intervals.map((iv, i) => {
                    const x = duration > 0 ? (iv.start / duration) * 100 : 0;
                    const w = duration > 0 ? Math.max(0.2, ((iv.end - iv.start) / duration) * 100) : 0;
                    return (
                      <rect
                        key={i}
                        x={x}
                        y={20}
                        width={w}
                        height={40}
                        fill="hsl(var(--primary) / 0.5)"
                        rx={1}
                      />
                    );
                  })}
                  {duration > 0 && (
                    <line
                      x1={(currentTime / duration) * 100}
                      y1={0}
                      x2={(currentTime / duration) * 100}
                      y2={80}
                      stroke="hsl(var(--foreground))"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
              </div>
            </div>

            {/* Music track w/ ducking envelope */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Music className="w-4 h-4 text-primary" />
                  {musicLabel}
                  <Badge variant="secondary" className="text-[10px]">
                    -{settings.reductionDb} dB beim Sprechen
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
              <div className="relative h-20 rounded-lg bg-muted/30 border border-border/50 overflow-hidden cursor-pointer"
                onClick={(e) => {
                  if (duration <= 0) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const f = (e.clientX - rect.left) / rect.width;
                  seek(f * duration);
                }}
              >
                <DuckingEnvelopeOverlay
                  automation={automation}
                  intervals={intervals}
                  duration={duration}
                  currentTime={currentTime}
                  height={80}
                />
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Presets */}
      <Card className="backdrop-blur-xl bg-card/60 border-border/50 p-4">
        <Label className="text-sm font-medium mb-3 block">Preset</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {([
            { key: 'subtle', label: 'Subtil', sub: '-6 dB', icon: Sparkles },
            { key: 'standard', label: 'Standard', sub: '-12 dB', icon: Volume2 },
            { key: 'aggressive', label: 'Aggressiv', sub: '-18 dB', icon: AudioLines },
            { key: 'custom', label: 'Custom', sub: 'Manuell', icon: Sparkles },
          ] as const).map(p => (
            <button
              key={p.key}
              onClick={() => setPresetKey(p.key)}
              className={`p-3 rounded-lg border transition-all text-left ${
                presetKey === p.key
                  ? 'border-primary bg-primary/10 shadow-[0_0_20px_hsl(var(--primary)/0.2)]'
                  : 'border-border/50 hover:border-primary/40 bg-muted/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <p.icon className={`w-4 h-4 ${presetKey === p.key ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="text-sm font-semibold">{p.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{p.sub}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Fine-tuning */}
      <Card className="backdrop-blur-xl bg-card/60 border-border/50 p-4 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm">Reduktion</Label>
            <span className="text-sm tabular-nums text-primary font-medium">-{settings.reductionDb} dB</span>
          </div>
          <Slider
            value={[settings.reductionDb]}
            min={3}
            max={30}
            step={1}
            onValueChange={([v]) => handleSettingChange({ reductionDb: v })}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm">Attack (Geschwindigkeit runter)</Label>
            <span className="text-sm tabular-nums text-primary font-medium">{settings.attackMs} ms</span>
          </div>
          <Slider
            value={[settings.attackMs]}
            min={20}
            max={500}
            step={10}
            onValueChange={([v]) => handleSettingChange({ attackMs: v })}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm">Release (Geschwindigkeit hoch)</Label>
            <span className="text-sm tabular-nums text-primary font-medium">{settings.releaseMs} ms</span>
          </div>
          <Slider
            value={[settings.releaseMs]}
            min={100}
            max={2000}
            step={50}
            onValueChange={([v]) => handleSettingChange({ releaseMs: v })}
          />
        </div>
        {!usingTranscript && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Threshold (RMS-Schwelle)</Label>
              <span className="text-sm tabular-nums text-primary font-medium">{settings.threshold.toFixed(2)}</span>
            </div>
            <Slider
              value={[settings.threshold * 100]}
              min={1}
              max={20}
              step={1}
              onValueChange={([v]) => handleSettingChange({ threshold: v / 100 })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Tipp: Mit Transkript wird dieser Wert ignoriert — Wort-Timestamps sind präziser.
            </p>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
