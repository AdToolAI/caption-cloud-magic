import { tx } from "@/lib/i18nText";
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Download, Save, Loader2, Volume2, AudioLines, RotateCcw, Wand2 } from 'lucide-react';
import {
  useStemMixer,
  STEM_META,
  DEFAULT_STEM_STATE,
  type StemTrack,
  type StemMixerState,
  type StemType,
} from '@/hooks/useStemMixer';

interface StemMixerPanelProps {
  stems: StemTrack[];
  sourceTitle?: string;
  onMixSaved?: (url: string) => void;
}

const PRESETS: Record<string, { label: string; desc: string; state: Partial<Record<StemType, Partial<StemMixerState[StemType]>>>; master?: number }> = {
  flat: {
    label: tx({ de: 'Original', en: 'Original', es: 'Original' }),
    desc: tx({ de: 'Alle Stems auf Unity', en: 'All stems at unity', es: 'Todas las pistas en unidad' }),
    state: {},
  },
  karaoke: {
    label: 'Karaoke',
    desc: tx({ de: 'Vocals raus', en: 'Vocals out', es: 'Vocales fuera' }),
    state: { vocals: { muted: true } },
  },
  acapella: {
    label: 'Acapella',
    desc: tx({ de: 'Nur Vocals', en: 'Vocals only', es: 'Solo vocales' }),
    state: {
      vocals: { volume: 1.2 },
      drums: { muted: true },
      bass: { muted: true },
      other: { muted: true },
    },
  },
  instrumental: {
    label: 'Instrumental',
    desc: tx({ de: 'Beat + Bass + Other', en: 'Beat + Bass + Other', es: 'Ritmo + Bajo + Otros' }),
    state: { vocals: { muted: true } },
  },
  drumsbass: {
    label: 'Drums + Bass',
    desc: tx({ de: 'Rhythm Section', en: 'Rhythm Section', es: 'Sección rítmica' }),
    state: {
      vocals: { muted: true },
      other: { muted: true },
      drums: { volume: 1.1 },
      bass: { volume: 1.1 },
    },
  },
  vocalfocus: {
    label: 'Vocal Focus',
    desc: tx({ de: 'Vocals laut, Rest leise', en: 'Vocals loud, others quiet', es: 'Voces fuertes, el resto en silencio' }),
    state: {
      vocals: { volume: 1.3 },
      drums: { volume: 0.6 },
      bass: { volume: 0.6 },
      other: { volume: 0.5 },
    },
  },
};

export function StemMixerPanel({ stems, sourceTitle, onMixSaved }: StemMixerPanelProps) {
  const [state, setState] = useState<StemMixerState>(DEFAULT_STEM_STATE);
  const [masterVolume, setMasterVolume] = useState(1.0);
  const [activePreset, setActivePreset] = useState<string>('flat');

  const {
    isLoading,
    isPlaying,
    isExporting,
    currentTime,
    duration,
    levels,
    buffers,
    play,
    pause,
    seek,
    exportMix,
    downloadStem,
  } = useStemMixer({ stems, state, masterVolume });

  const loadedStems = useMemo(
    () => (Object.keys(buffers) as StemType[]).filter(t => buffers[t]),
    [buffers],
  );

  const applyPreset = (key: string) => {
    setActivePreset(key);
    const preset = PRESETS[key];
    if (!preset) return;
    setState(prev => {
      const next: StemMixerState = {
        vocals: { ...DEFAULT_STEM_STATE.vocals },
        drums:  { ...DEFAULT_STEM_STATE.drums },
        bass:   { ...DEFAULT_STEM_STATE.bass },
        other:  { ...DEFAULT_STEM_STATE.other },
      };
      for (const t of ['vocals', 'drums', 'bass', 'other'] as StemType[]) {
        const overrides = preset.state[t];
        if (overrides) next[t] = { ...next[t], ...overrides };
      }
      return next;
    });
    if (preset.master !== undefined) setMasterVolume(preset.master);
  };

  const updateChannel = (type: StemType, patch: Partial<StemMixerState[StemType]>) => {
    setActivePreset('custom');
    setState(prev => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  };

  const handleSave = async () => {
    const result = await exportMix(sourceTitle ? `${sourceTitle} (Stem Mix)` : undefined);
    if (result?.url) onMixSaved?.(result.url);
  };

  const fmtTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Empty state
  if (stems.length === 0) {
    return (
      <Card className="p-12 bg-card/40 backdrop-blur-md border-border/40">
        <div className="text-center space-y-4">
          <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
            <AudioLines className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold tracking-tight">{tx({ de: 'Stem-Mixer', en: 'Stem Mixer', es: 'Mezclador de pistas' })}</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              {tx({ de: 'Wähle einen Track in der Bibliothek und klicke auf ', en: 'Select a track in the library and click on ', es: 'Selecciona una pista en la biblioteca y haz clic en ' })}
              <strong>Stems extrahieren</strong>{tx({ de: ". Die separierten Spuren erscheinen", en: ". The separated tracks appear", es: ". Las pistas separadas aparecen" })}
              {tx({ de: "automatisch hier zum Mixen.", en: "automatically here for mixing.", es: "automáticamente aquí para mezclar." })}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {(['vocals', 'drums', 'bass', 'other'] as StemType[]).map(t => (
              <Badge key={t} variant="outline" className="px-3 py-1">
                {STEM_META[t].emoji} {STEM_META[t].label}
              </Badge>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header / Transport */}
      <Card className="p-6 bg-gradient-to-br from-card/60 to-card/30 backdrop-blur-md border-border/40">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AudioLines className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold tracking-tight">Stem Mixer</h3>
              <Badge variant="secondary" className="ml-2">
                {loadedStems.length} / 4 Spuren
              </Badge>
            </div>
            {sourceTitle && (
              <p className="text-sm text-muted-foreground">{sourceTitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="lg"
              variant={isPlaying ? 'secondary' : 'default'}
              onClick={() => isPlaying ? pause() : play(currentTime)}
              disabled={isLoading || loadedStems.length === 0}
              className="min-w-[120px]"
            >
              {isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              {isPlaying ? 'Pause' : 'Play Mix'}
            </Button>
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={isExporting || isLoading || loadedStems.length === 0}
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {tx({ de: 'Mix speichern', en: 'Save Mix', es: 'Guardar mezcla' })}
            </Button>
          </div>
        </div>

        {/* Loading / Scrubber */}
        {isLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> {tx({ de: 'Stems werden dekodiert…', en: 'Stems are being decoded…', es: 'Las pistas se están decodificando...' })}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <Slider
              value={[currentTime]}
              max={duration || 0.001}
              step={0.01}
              onValueChange={([v]) => seek(v)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{fmtTime(currentTime)}</span>
              <span>{fmtTime(duration)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* Presets */}
      <Card className="p-4 bg-card/40 backdrop-blur-md border-border/40">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{tx({ de: 'Mix-Presets', en: 'Mix Presets', es: 'Ajustes preestablecidos' })}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESETS).map(([key, p]) => (
            <Button
              key={key}
              size="sm"
              variant={activePreset === key ? 'default' : 'outline'}
              onClick={() => applyPreset(key)}
              className="text-xs"
              title={p.desc}
            >
              {p.label}
            </Button>
          ))}
          {activePreset === 'custom' && (
            <Badge variant="secondary" className="ml-auto self-center">Custom Mix</Badge>
          )}
        </div>
      </Card>

      {/* Channel Strips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(['vocals', 'drums', 'bass', 'other'] as StemType[]).map(type => {
          const meta = STEM_META[type];
          const ch = state[type];
          const hasBuffer = !!buffers[type];
          const level = levels[type] || 0;
          const anySolo = (Object.keys(state) as StemType[]).some(k => state[k]?.solo);
          const effectivelyMuted = ch.muted || (anySolo && !ch.solo);

          return (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card
                className="p-4 bg-card/50 backdrop-blur-md border-border/40 relative overflow-hidden"
                style={{
                  borderColor: hasBuffer && !effectivelyMuted ? meta.color : undefined,
                  borderWidth: hasBuffer && !effectivelyMuted ? 1 : undefined,
                }}
              >
                {/* Top: label */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{meta.emoji}</span>
                    <div>
                      <div className="text-sm font-bold tracking-tight">{meta.label}</div>
                      {!hasBuffer && (
                        <div className="text-[10px] text-muted-foreground">{tx({ de: 'nicht geladen', en: 'not loaded', es: 'no cargado' })}</div>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => downloadStem(type)}
                    disabled={!hasBuffer || isExporting}
                    title={`${meta.label} als WAV exportieren`}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* VU Meter */}
                <div className="h-2 bg-muted/40 rounded-full overflow-hidden mb-3">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: meta.color }}
                    animate={{ width: `${Math.min(100, level * 200)}%` }}
                    transition={{ duration: 0.05, ease: 'linear' }}
                  />
                </div>

                {/* Volume */}
                <div className="space-y-1.5 mb-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Volume</span>
                    <span className="font-mono tabular-nums">
                      {Math.round(ch.volume * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[ch.volume]}
                    min={0}
                    max={1.5}
                    step={0.01}
                    onValueChange={([v]) => updateChannel(type, { volume: v })}
                    disabled={!hasBuffer}
                  />
                </div>

                {/* Pan */}
                <div className="space-y-1.5 mb-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Pan</span>
                    <span className="font-mono tabular-nums">
                      {ch.pan === 0 ? 'C' : ch.pan < 0 ? `L${Math.round(-ch.pan * 100)}` : `R${Math.round(ch.pan * 100)}`}
                    </span>
                  </div>
                  <Slider
                    value={[ch.pan]}
                    min={-1}
                    max={1}
                    step={0.01}
                    onValueChange={([v]) => updateChannel(type, { pan: v })}
                    disabled={!hasBuffer}
                  />
                </div>

                {/* Mute / Solo */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant={ch.muted ? 'destructive' : 'outline'}
                    onClick={() => updateChannel(type, { muted: !ch.muted })}
                    disabled={!hasBuffer}
                    className="h-8 text-xs font-bold"
                  >
                    M
                  </Button>
                  <Button
                    size="sm"
                    variant={ch.solo ? 'default' : 'outline'}
                    onClick={() => updateChannel(type, { solo: !ch.solo })}
                    disabled={!hasBuffer}
                    className="h-8 text-xs font-bold"
                    style={ch.solo ? { background: meta.color, color: 'hsl(var(--primary-foreground))' } : undefined}
                  >
                    S
                  </Button>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Master */}
      <Card className="p-4 bg-gradient-to-r from-primary/10 to-accent/10 backdrop-blur-md border-primary/20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 min-w-[120px]">
            <Volume2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">Master</span>
          </div>
          <Slider
            value={[masterVolume]}
            min={0}
            max={1.5}
            step={0.01}
            onValueChange={([v]) => setMasterVolume(v)}
            className="flex-1"
          />
          <span className="text-sm font-mono tabular-nums min-w-[50px] text-right">
            {Math.round(masterVolume * 100)}%
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setState(DEFAULT_STEM_STATE); setMasterVolume(1); setActivePreset('flat'); }}
            title={tx({ de: 'Mixer zurücksetzen', en: 'Reset Mixer', es: 'Reiniciar mezclador' })}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
