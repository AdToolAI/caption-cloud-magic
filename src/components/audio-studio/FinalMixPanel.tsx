import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Download, Upload, Save, Mic, Music2, AudioLines, Volume2,
  Trash2, Sparkles, Activity, FileAudio, Plus, X, Loader2, Headphones
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useFinalMixer, FinalMixSource, LOUDNESS_TARGETS } from '@/hooks/useFinalMixer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FinalMixPanelProps {
  /** Vorhandene Quellen, die automatisch eingefügt werden sollen */
  initialSources?: Array<Omit<FinalMixSource, 'pan' | 'volume' | 'muted' | 'offsetSec'>>;
  onMixSaved?: () => void;
}

const KIND_META: Record<FinalMixSource['kind'], { icon: typeof Mic; color: string; label: string }> = {
  voice: { icon: Mic, color: 'from-cyan-500 to-blue-500', label: 'Voice' },
  music: { icon: Music2, color: 'from-primary to-purple-500', label: 'Music' },
  stems: { icon: AudioLines, color: 'from-emerald-500 to-cyan-500', label: 'Stems' },
  sfx: { icon: Sparkles, color: 'from-amber-500 to-rose-500', label: 'SFX' },
  other: { icon: FileAudio, color: 'from-slate-500 to-zinc-500', label: 'Other' },
};

export function FinalMixPanel({ initialSources, onMixSaved }: FinalMixPanelProps) {
  const mixer = useFinalMixer();
  const [measuredLufs, setMeasuredLufs] = useState<number | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportFormat, setExportFormat] = useState<'wav' | 'download'>('wav');

  // auto-add provided sources once
  useEffect(() => {
    if (initialSources?.length) {
      initialSources.forEach(s => mixer.addSource(s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddFromUrl = async () => {
    const url = prompt('Audio-URL einfügen (https://...)');
    if (!url) return;
    mixer.addSource({
      id: `url-${Date.now()}`,
      label: url.split('/').pop() || 'Externe Quelle',
      url,
      kind: 'other',
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    mixer.addSource({
      id: `upload-${Date.now()}`,
      label: file.name,
      url,
      kind: file.type.startsWith('audio/') ? 'other' : 'other',
    });
  };

  const handleMeasure = async () => {
    setMeasuring(true);
    try {
      const buf = await mixer.renderOffline();
      if (!buf) {
        toast.error('Keine Quellen zum Messen');
        return;
      }
      const { lufs } = mixer.measureLUFS(buf);
      setMeasuredLufs(lufs);
    } finally {
      setMeasuring(false);
    }
  };

  const handleExport = async () => {
    if (mixer.sources.length === 0) {
      toast.error('Mindestens eine Quelle hinzufügen');
      return;
    }
    setSaving(true);
    try {
      const blob = await mixer.exportMix();
      if (!blob) {
        toast.error('Export fehlgeschlagen');
        return;
      }

      if (exportFormat === 'download') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `final-mix-${Date.now()}.wav`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success('Download gestartet');
        return;
      }

      // Save to bibliothek
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Bitte einloggen');
        return;
      }

      const fileName = `${user.id}/final-mix/${Date.now()}.wav`;
      const { error: upErr } = await supabase.storage
        .from('audio-studio')
        .upload(fileName, blob, { contentType: 'audio/wav' });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('audio-studio').getPublicUrl(fileName);

      const { error: insErr } = await supabase.from('universal_audio_assets').insert({
        user_id: user.id,
        title: `Final Mix · ${mixer.target.label}`,
        source: 'final_mix',
        processing_preset: 'final_mix',
        url: pub.publicUrl,
        duration_seconds: Math.round(mixer.maxDuration),
        effect_config: {
          target: mixer.target,
          measured_lufs: measuredLufs,
          sources: mixer.sources.map(s => ({
            label: s.label,
            kind: s.kind,
            volume: s.volume,
            pan: s.pan,
            muted: s.muted,
            offset: s.offsetSec,
          })),
        },
      });
      if (insErr) throw insErr;

      toast.success('Final Mix gespeichert', {
        description: `Normalisiert auf ${mixer.target.label} (${mixer.target.lufs} LUFS)`,
      });
      onMixSaved?.();
    } catch (e: any) {
      console.error('[FinalMix] export error', e);
      toast.error('Export fehlgeschlagen', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const lufsColor = useMemo(() => {
    if (measuredLufs === null) return 'text-muted-foreground';
    const delta = Math.abs(measuredLufs - mixer.target.lufs);
    if (delta < 1) return 'text-emerald-400';
    if (delta < 3) return 'text-amber-400';
    return 'text-rose-400';
  }, [measuredLufs, mixer.target.lufs]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="relative overflow-hidden backdrop-blur-xl bg-gradient-to-br from-primary/10 via-card/60 to-cyan-500/10 border-primary/30 p-5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/15 rounded-full blur-[80px] pointer-events-none" />
        <div className="relative flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shrink-0">
            <Headphones className="w-7 h-7 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-lg font-bold">Final Mix Export Hub</h3>
              <Badge variant="outline" className="border-primary/40 text-primary">Sendefertig</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Voiceover + Music + Stems + SFX → ein finales 48kHz WAV mit Loudness-Normalisierung
              für Spotify, YouTube oder Broadcast.
            </p>
          </div>
        </div>
      </Card>

      {/* Sources */}
      <Card className="backdrop-blur-xl bg-card/60 border-border/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AudioLines className="w-5 h-5 text-primary" />
            <h4 className="font-semibold">Quellen ({mixer.sources.length})</h4>
            {mixer.decoding && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleAddFromUrl}>
              <Plus className="w-4 h-4 mr-1.5" /> URL
            </Button>
            <label>
              <input type="file" accept="audio/*,video/*" className="hidden" onChange={handleUpload} />
              <Button size="sm" variant="outline" asChild>
                <span><Upload className="w-4 h-4 mr-1.5" /> Upload</span>
              </Button>
            </label>
          </div>
        </div>

        {mixer.sources.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground border-2 border-dashed border-border/40 rounded-xl">
            <FileAudio className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Noch keine Quellen.</p>
            <p className="text-xs mt-1">Füge Voiceover, Music oder Stems aus dem Studio hinzu.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {mixer.sources.map((s) => {
                const meta = KIND_META[s.kind];
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="rounded-xl border border-border/40 bg-muted/20 p-3"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center shrink-0`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.label}</p>
                        <p className="text-[11px] text-muted-foreground">{meta.label}</p>
                      </div>
                      <Button
                        size="sm"
                        variant={s.muted ? 'default' : 'outline'}
                        onClick={() => mixer.updateSource(s.id, { muted: !s.muted })}
                        className="h-7 px-2 text-[11px]"
                      >
                        {s.muted ? 'Muted' : 'M'}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => mixer.removeSource(s.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-muted-foreground">Volume</span>
                          <span className="text-[11px] font-mono">{Math.round(s.volume * 100)}%</span>
                        </div>
                        <Slider
                          value={[s.volume * 100]}
                          onValueChange={([v]) => mixer.updateSource(s.id, { volume: v / 100 })}
                          min={0} max={150} step={1}
                          disabled={s.muted}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-muted-foreground">Pan</span>
                          <span className="text-[11px] font-mono">
                            {s.pan === 0 ? 'C' : s.pan < 0 ? `L${Math.round(-s.pan * 100)}` : `R${Math.round(s.pan * 100)}`}
                          </span>
                        </div>
                        <Slider
                          value={[s.pan * 100]}
                          onValueChange={([v]) => mixer.updateSource(s.id, { pan: v / 100 })}
                          min={-100} max={100} step={1}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-muted-foreground">Offset (s)</span>
                          <span className="text-[11px] font-mono">{s.offsetSec.toFixed(1)}s</span>
                        </div>
                        <Input
                          type="number"
                          value={s.offsetSec}
                          onChange={(e) => mixer.updateSource(s.id, { offsetSec: parseFloat(e.target.value) || 0 })}
                          step={0.1}
                          min={0}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </Card>

      {/* Transport + Master */}
      {mixer.sources.length > 0 && (
        <Card className="backdrop-blur-xl bg-card/60 border-border/50 p-5">
          <div className="flex items-center gap-4 mb-4">
            <Button
              size="icon"
              onClick={() => mixer.isPlaying ? mixer.pause() : mixer.play()}
              disabled={mixer.decoding || mixer.maxDuration === 0}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-cyan-500"
            >
              {mixer.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </Button>
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{formatTime(mixer.currentTime)}</span>
                <span>{formatTime(mixer.maxDuration)}</span>
              </div>
              <Slider
                value={[mixer.currentTime]}
                onValueChange={([v]) => mixer.seek(v)}
                min={0}
                max={mixer.maxDuration || 1}
                step={0.1}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <Slider
              value={[mixer.masterVolume * 100]}
              onValueChange={([v]) => mixer.setMasterVolume(v / 100)}
              min={0} max={150} step={1}
              className="flex-1"
            />
            <span className="text-xs font-mono w-12 text-right">{Math.round(mixer.masterVolume * 100)}%</span>
          </div>
        </Card>
      )}

      {/* Loudness Target */}
      <Card className="backdrop-blur-xl bg-card/60 border-border/50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-5 h-5 text-primary" />
          <h4 className="font-semibold">Loudness-Ziel</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Select
            value={mixer.target.id}
            onValueChange={(id) => {
              const t = LOUDNESS_TARGETS.find(x => x.id === id);
              if (t) mixer.setTarget(t);
            }}
          >
            <SelectTrigger className="bg-muted/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOUDNESS_TARGETS.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label} {t.id !== 'none' && `(${t.lufs} LUFS)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={handleMeasure}
            disabled={measuring || mixer.sources.length === 0}
          >
            {measuring ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
            Aktuelle Lautheit messen
          </Button>
        </div>

        {measuredLufs !== null && (
          <div className="rounded-lg bg-muted/30 p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">Gemessen</p>
              <p className={`text-lg font-mono font-bold ${lufsColor}`}>
                {measuredLufs.toFixed(1)} LUFS
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Ziel</p>
              <p className="text-lg font-mono font-bold text-primary">
                {mixer.target.id === 'none' ? '—' : `${mixer.target.lufs} LUFS`}
              </p>
            </div>
            {mixer.target.id !== 'none' && (
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground">Δ</p>
                <p className={`text-lg font-mono font-bold ${lufsColor}`}>
                  {(mixer.target.lufs - measuredLufs > 0 ? '+' : '')}{(mixer.target.lufs - measuredLufs).toFixed(1)} dB
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Export */}
      <Card className="backdrop-blur-xl bg-gradient-to-br from-emerald-500/10 via-card/60 to-primary/10 border-emerald-500/30 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-5 h-5 text-emerald-400" />
          <h4 className="font-semibold">Final Export</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Button
            variant={exportFormat === 'wav' ? 'default' : 'outline'}
            onClick={() => setExportFormat('wav')}
            className={exportFormat === 'wav' ? 'bg-gradient-to-r from-emerald-500 to-primary' : ''}
          >
            <Save className="w-4 h-4 mr-2" />
            In Bibliothek speichern
          </Button>
          <Button
            variant={exportFormat === 'download' ? 'default' : 'outline'}
            onClick={() => setExportFormat('download')}
            className={exportFormat === 'download' ? 'bg-gradient-to-r from-emerald-500 to-primary' : ''}
          >
            <Download className="w-4 h-4 mr-2" />
            WAV herunterladen
          </Button>
        </div>

        {mixer.exportProgress && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">{mixer.exportProgress.phase}</span>
              <span className="font-mono">{mixer.exportProgress.pct}%</span>
            </div>
            <Progress value={mixer.exportProgress.pct} className="h-1.5" />
          </div>
        )}

        <Button
          size="lg"
          onClick={handleExport}
          disabled={saving || mixer.sources.length === 0 || mixer.decoding}
          className="w-full bg-gradient-to-r from-emerald-500 via-primary to-cyan-500 hover:opacity-90"
        >
          {saving ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Exportiere...</>
          ) : (
            <><Sparkles className="w-5 h-5 mr-2" /> Mix exportieren · 48kHz Stereo WAV</>
          )}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center mt-2">
          Kostenlos · Loudness-Normalisierung mit Soft-Limiter (Clip-Schutz)
        </p>
      </Card>
    </div>
  );
}
