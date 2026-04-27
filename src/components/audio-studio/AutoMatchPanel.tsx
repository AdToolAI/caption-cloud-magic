import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Upload, Film, Sparkles, Loader2, Music2, Activity, Wand2,
  Gauge, Palette, Clock, Zap, Play, Pause, Settings2, ArrowRight, RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useMusicAutoMatch, type AutoMatchResult } from '@/hooks/useMusicAutoMatch';
import { useMusicGeneration, MUSIC_TIER_PRICING, type MusicTier, type GeneratedMusicTrack } from '@/hooks/useMusicGeneration';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { cn } from '@/lib/utils';

interface AutoMatchPanelProps {
  onTrackGenerated?: (track: GeneratedMusicTrack, videoUrl: string) => void;
  onCustomize?: (prefill: {
    prompt: string; genre: string; mood: string; bpm: number; duration: number;
  }) => void;
  onSendToBeatSync?: (track: GeneratedMusicTrack) => void;
}

const TIER_ICONS: Record<MusicTier, typeof Zap> = {
  quick: Zap, standard: Wand2, pro: Sparkles,
};

export function AutoMatchPanel({
  onTrackGenerated, onCustomize, onSendToBeatSync,
}: AutoMatchPanelProps) {
  const { phase, progress, result, analyzeVideo, reset } = useMusicAutoMatch();
  const { generateMusic, loading: generating } = useMusicGeneration();
  const { wallet } = useAIVideoWallet();

  const [tier, setTier] = useState<MusicTier>('standard');
  const [generatedTrack, setGeneratedTrack] = useState<GeneratedMusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currencySymbol = wallet?.currency === 'USD' ? '$' : '€';
  const balance = wallet?.balance_euros ?? 0;
  const tierPrice = MUSIC_TIER_PRICING[tier].eur;
  const insufficient = balance < tierPrice;

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (file) {
      setGeneratedTrack(null);
      await analyzeVideo(file);
    }
  }, [analyzeVideo]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': ['.mp4', '.mov', '.webm'] },
    maxFiles: 1,
    disabled: phase !== 'idle' && phase !== 'error' && phase !== 'done',
  });

  const handleGenerate = useCallback(async () => {
    if (!result) return;
    const r = result.recommendation;
    // Clamp duration to tier max
    const maxDur = MUSIC_TIER_PRICING[tier].maxDuration;
    const dur = Math.min(r.durationSec, maxDur);
    const track = await generateMusic({
      prompt: r.prompt,
      tier,
      durationSeconds: dur,
      genre: r.genre,
      mood: r.mood,
      instrumental: true,
      bpm: r.bpm,
    });
    if (track) {
      setGeneratedTrack(track);
      onTrackGenerated?.(track, result.videoUrl);
    }
  }, [result, tier, generateMusic, onTrackGenerated]);

  const handleCustomize = () => {
    if (!result) return;
    const r = result.recommendation;
    onCustomize?.({
      prompt: r.prompt, genre: r.genre, mood: r.mood,
      bpm: r.bpm, duration: r.durationSec,
    });
  };

  const togglePlay = () => {
    if (!audioRef.current || !generatedTrack) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  };

  const phaseLabels: Record<string, string> = {
    uploading: 'Lade Video hoch…',
    extracting: 'Extrahiere Frames & analysiere Schnitte…',
    analyzing: 'KI analysiert Mood & empfiehlt Sound…',
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="relative overflow-hidden backdrop-blur-xl bg-gradient-to-br from-card/80 via-card/60 to-cyan-500/10 border-border/50 p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/10 rounded-full blur-[60px] pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-cyan-500/20 to-primary/20 border border-cyan-500/30 mb-3">
              <Film className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold bg-gradient-to-r from-cyan-400 to-primary bg-clip-text text-transparent">
                MUSIC-TO-VIDEO AUTO-MATCH
              </span>
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-1">
              Video rein, Soundtrack raus
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl">
              KI analysiert Schnittfrequenz, Mood &amp; Länge deines Videos und komponiert
              automatisch einen perfekt passenden Track. <span className="text-primary font-medium">Analyse kostenlos.</span>
            </p>
          </div>
          <Badge variant="outline" className="border-primary/40 bg-primary/5">
            <span className="text-xs text-muted-foreground mr-1">Balance:</span>
            <span className="font-bold text-primary">{currencySymbol}{balance.toFixed(2)}</span>
          </Badge>
        </div>
      </Card>

      {/* Drop Zone — only when idle / done / error */}
      {(phase === 'idle' || phase === 'done' || phase === 'error') && !result && (
        <Card
          {...getRootProps()}
          className={cn(
            'relative overflow-hidden cursor-pointer backdrop-blur-xl bg-card/60 border-2 border-dashed transition-all',
            isDragActive ? 'border-primary/60 shadow-[0_0_40px_rgba(var(--primary),0.3)]' : 'border-border/50 hover:border-primary/40',
          )}
        >
          <input {...getInputProps()} />
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <motion.div
              animate={{ scale: isDragActive ? 1.1 : 1 }}
              className="relative mb-6"
            >
              <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl animate-pulse" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-primary/20 flex items-center justify-center border border-cyan-500/30">
                <Upload className="w-9 h-9 text-cyan-400" />
              </div>
            </motion.div>
            <h3 className="text-xl font-semibold mb-2">
              {isDragActive ? 'Video hier ablegen' : 'Video hochladen für Auto-Match'}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              MP4, MOV, WEBM • bis 200 MB • Analyse dauert 10–20 Sekunden
            </p>
            <Button size="lg" className="bg-gradient-to-r from-cyan-500 to-primary hover:opacity-90">
              <Film className="w-5 h-5 mr-2" />
              Video auswählen
            </Button>
          </div>
        </Card>
      )}

      {/* Progress */}
      <AnimatePresence>
        {(phase === 'uploading' || phase === 'extracting' || phase === 'analyzing') && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="backdrop-blur-xl bg-card/60 border-primary/30 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <div className="flex-1">
                  <div className="font-medium">{phaseLabels[phase]}</div>
                  <div className="text-xs text-muted-foreground">Bitte einen Moment Geduld…</div>
                </div>
                <Badge variant="outline" className="border-primary/40">{progress}%</Badge>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[
                  { phase: 'uploading', label: 'Upload', icon: Upload },
                  { phase: 'extracting', label: 'Frames', icon: Activity },
                  { phase: 'analyzing', label: 'KI-Mood', icon: Sparkles },
                ].map(s => {
                  const isActive = phase === s.phase;
                  const isDone =
                    (s.phase === 'uploading' && (phase === 'extracting' || phase === 'analyzing')) ||
                    (s.phase === 'extracting' && phase === 'analyzing');
                  return (
                    <div
                      key={s.phase}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-all',
                        isActive ? 'border-primary bg-primary/10 text-primary' :
                        isDone ? 'border-green-500/30 bg-green-500/5 text-green-400' :
                        'border-border/30 bg-muted/20 text-muted-foreground',
                      )}
                    >
                      <s.icon className="w-3.5 h-3.5" />
                      <span className="font-medium">{s.label}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result / Match Card */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <Card className="relative overflow-hidden backdrop-blur-xl bg-gradient-to-br from-primary/10 via-card/60 to-cyan-500/10 border-primary/40 p-6">
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary/15 rounded-full blur-[60px] pointer-events-none" />

              <div className="relative">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <Badge className="mb-2 bg-gradient-to-r from-primary to-cyan-500 border-0 text-primary-foreground">
                      <Sparkles className="w-3 h-3 mr-1" /> EMPFEHLUNG
                    </Badge>
                    <h3 className="text-xl font-bold capitalize mb-1">
                      {result.recommendation.genre} · {result.recommendation.mood}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 max-w-xl">
                      {result.recommendation.descriptors.join(' · ')}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { reset(); setGeneratedTrack(null); }}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Neues Video
                  </Button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <StatTile icon={Gauge} label="BPM" value={String(result.recommendation.bpm)} accent="primary" />
                  <StatTile icon={Clock} label="Dauer" value={`${result.recommendation.durationSec}s`} accent="cyan" />
                  <StatTile icon={Activity} label="Schnitte/s" value={result.analysis.cutsPerSecond.toFixed(2)} accent="primary" />
                  <StatTile icon={Palette} label="Energie" value={`${Math.round(result.analysis.energy * 100)}%`} accent="cyan" />
                </div>

                {/* Prompt preview */}
                <div className="rounded-lg bg-muted/30 border border-border/30 px-3 py-2 mb-5">
                  <div className="text-[10px] font-bold tracking-wider text-muted-foreground mb-1">MUSIK-PROMPT</div>
                  <p className="text-xs text-foreground/80 italic line-clamp-3">"{result.recommendation.prompt}"</p>
                </div>

                {/* Tier selector */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {(Object.keys(MUSIC_TIER_PRICING) as MusicTier[]).map(t => {
                    const info = MUSIC_TIER_PRICING[t];
                    const Icon = TIER_ICONS[t];
                    const isActive = tier === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setTier(t)}
                        className={cn(
                          'p-3 rounded-lg border text-left transition-all',
                          isActive
                            ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary),0.2)]'
                            : 'border-border/50 bg-card/40 hover:border-primary/40',
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Icon className={cn('w-4 h-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                          <span className="text-xs font-bold">{currencySymbol}{info.eur.toFixed(2)}</span>
                        </div>
                        <div className="text-xs font-semibold capitalize">{t}</div>
                        <div className="text-[10px] text-muted-foreground">bis {info.maxDuration}s</div>
                      </button>
                    );
                  })}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={handleGenerate}
                    disabled={generating || insufficient}
                    size="lg"
                    className="flex-1 bg-gradient-to-r from-primary to-cyan-500 hover:opacity-90 disabled:opacity-50"
                  >
                    {generating ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Track wird komponiert…</>
                    ) : insufficient ? (
                      <>Nicht genug Credits ({currencySymbol}{tierPrice.toFixed(2)} nötig)</>
                    ) : (
                      <><Music2 className="w-4 h-4 mr-2" /> Track generieren · {currencySymbol}{tierPrice.toFixed(2)}</>
                    )}
                  </Button>
                  {onCustomize && (
                    <Button variant="outline" size="lg" onClick={handleCustomize} disabled={generating}>
                      <Settings2 className="w-4 h-4 mr-2" /> Anpassen
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {/* Generated track player */}
            {generatedTrack && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="backdrop-blur-xl bg-card/60 border-green-500/30 p-4">
                  <div className="flex items-center gap-3">
                    <Button
                      size="icon"
                      onClick={togglePlay}
                      className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-cyan-500 hover:opacity-90 shrink-0"
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="outline" className="border-green-500/40 bg-green-500/5 text-green-400 text-[10px]">
                          ✓ FERTIG
                        </Badge>
                        <span className="text-xs text-muted-foreground">{generatedTrack.duration_sec}s</span>
                      </div>
                      <p className="font-semibold truncate text-sm">{generatedTrack.title}</p>
                    </div>
                    {onSendToBeatSync && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSendToBeatSync(generatedTrack)}
                        className="shrink-0"
                      >
                        Beat-Sync <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    )}
                  </div>
                  <audio
                    ref={audioRef}
                    src={generatedTrack.url}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />
                </Card>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatTile({
  icon: Icon, label, value, accent,
}: { icon: typeof Gauge; label: string; value: string; accent: 'primary' | 'cyan' }) {
  return (
    <div className={cn(
      'rounded-lg border p-3 backdrop-blur-sm',
      accent === 'primary' ? 'border-primary/30 bg-primary/5' : 'border-cyan-500/30 bg-cyan-500/5',
    )}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('w-3.5 h-3.5', accent === 'primary' ? 'text-primary' : 'text-cyan-400')} />
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}
