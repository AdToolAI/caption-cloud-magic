import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music2, Sparkles, Loader2, Play, Pause, Download, Library as LibraryIcon, Wand2, Zap, Crown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useMusicGeneration, MUSIC_TIER_PRICING, type MusicTier, type GeneratedMusicTrack } from '@/hooks/useMusicGeneration';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { cn } from '@/lib/utils';

const GENRES = [
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'hip-hop', label: 'Hip-Hop' },
  { id: 'lo-fi', label: 'Lo-Fi' },
  { id: 'corporate', label: 'Corporate' },
  { id: 'ambient', label: 'Ambient' },
  { id: 'rock', label: 'Rock' },
  { id: 'pop', label: 'Pop' },
  { id: 'classical', label: 'Classical' },
  { id: 'jazz', label: 'Jazz' },
];

const PROMPT_EXAMPLES = [
  'Cinematic orchestral build-up with epic drums',
  'Lo-fi chill beats with rain and vinyl crackle',
  'Upbeat corporate background with positive energy',
  'Dark synthwave with retro 80s atmosphere',
  'Ambient meditation with soft pads and nature sounds',
];

const MOOD_LABELS = ['Calm', 'Mellow', 'Steady', 'Energetic', 'Hype'];

interface MusicGeneratorPanelProps {
  onTrackGenerated?: (track: GeneratedMusicTrack) => void;
  onOpenLibrary?: () => void;
}

export function MusicGeneratorPanel({ onTrackGenerated, onOpenLibrary }: MusicGeneratorPanelProps) {
  const { generateMusic, loading } = useMusicGeneration();
  const { wallet } = useAIVideoWallet();

  const [prompt, setPrompt] = useState('');
  const [tier, setTier] = useState<MusicTier>('standard');
  const [duration, setDuration] = useState(30);
  const [genre, setGenre] = useState<string>('cinematic');
  const [moodIdx, setMoodIdx] = useState(2);
  const [instrumental, setInstrumental] = useState(true);
  const [generatedTrack, setGeneratedTrack] = useState<GeneratedMusicTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const tierInfo = MUSIC_TIER_PRICING[tier];
  const maxDur = tierInfo.maxDuration;
  const effectiveDuration = Math.min(duration, maxDur);
  const currencySymbol = wallet?.currency === 'USD' ? '$' : '€';
  const balance = wallet?.balance_euros ?? 0;
  const insufficient = balance < tierInfo.eur;

  const handleTierChange = (newTier: MusicTier) => {
    setTier(newTier);
    if (duration > MUSIC_TIER_PRICING[newTier].maxDuration) {
      setDuration(MUSIC_TIER_PRICING[newTier].maxDuration);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const track = await generateMusic({
      prompt,
      tier,
      durationSeconds: effectiveDuration,
      genre,
      mood: MOOD_LABELS[moodIdx].toLowerCase(),
      instrumental,
    });
    if (track) {
      setGeneratedTrack(track);
      onTrackGenerated?.(track);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !generatedTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleDownload = () => {
    if (!generatedTrack) return;
    const a = document.createElement('a');
    a.href = generatedTrack.url;
    a.download = `${generatedTrack.title.replace(/[^\w]/g, '_')}.mp3`;
    a.target = '_blank';
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="relative overflow-hidden backdrop-blur-xl bg-gradient-to-br from-card/80 via-card/60 to-primary/5 border-border/50 p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-[60px] pointer-events-none" />

        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-primary/20 to-cyan-500/20 border border-primary/30 mb-3">
              <Music2 className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent">
                AI MUSIC STUDIO
              </span>
              <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-1">
              Generiere Studio-Qualität Musik
            </h2>
            <p className="text-sm text-muted-foreground">
              Beschreibe deinen Sound. KI komponiert kommerziell nutzbare Tracks in Sekunden.
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline" className="border-primary/40 bg-primary/5">
              <span className="text-xs text-muted-foreground mr-1">Balance:</span>
              <span className="font-bold text-primary">{currencySymbol}{balance.toFixed(2)}</span>
            </Badge>
            {onOpenLibrary && (
              <Button variant="ghost" size="sm" onClick={onOpenLibrary} className="text-xs h-7">
                <LibraryIcon className="w-3.5 h-3.5 mr-1" /> Bibliothek
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Tier Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(Object.keys(MUSIC_TIER_PRICING) as MusicTier[]).map((t) => {
          const info = MUSIC_TIER_PRICING[t];
          const isActive = tier === t;
          const Icon = t === 'quick' ? Zap : t === 'standard' ? Wand2 : Crown;
          return (
            <motion.button
              key={t}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTierChange(t)}
              className={cn(
                'relative overflow-hidden text-left p-4 rounded-xl border transition-all backdrop-blur-sm',
                isActive
                  ? 'border-primary bg-gradient-to-br from-primary/15 to-cyan-500/10 shadow-[0_0_30px_rgba(var(--primary),0.2)]'
                  : 'border-border/50 bg-card/40 hover:border-primary/40'
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <Icon className={cn('w-5 h-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                <Badge variant={isActive ? 'default' : 'secondary'} className="text-xs">
                  {currencySymbol}{info.eur.toFixed(2)}
                </Badge>
              </div>
              <div className="font-semibold capitalize mb-0.5">{t}</div>
              <div className="text-xs text-muted-foreground">
                bis {info.maxDuration}s • {info.engine}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Prompt + Options */}
      <Card className="backdrop-blur-xl bg-card/60 border-border/50 p-5 space-y-5">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Beschreibe deinen Track</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
            placeholder="z.B. Cinematic orchestral build-up with epic drums..."
            rows={3}
            className="resize-none"
            disabled={loading}
          />
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_EXAMPLES.slice(0, 3).map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  disabled={loading}
                  className="text-xs px-2 py-1 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  {ex.slice(0, 35)}...
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{prompt.length}/500</span>
          </div>
        </div>

        {/* Genre */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Genre</Label>
          <div className="flex flex-wrap gap-1.5">
            {GENRES.map((g) => (
              <button
                key={g.id}
                onClick={() => setGenre(g.id)}
                disabled={loading}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-full border transition-all',
                  genre === g.id
                    ? 'border-primary bg-primary/15 text-primary font-medium'
                    : 'border-border/50 bg-muted/30 text-muted-foreground hover:border-primary/40'
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mood + Duration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Energie</Label>
              <span className="text-xs text-muted-foreground">{MOOD_LABELS[moodIdx]}</span>
            </div>
            <Slider
              value={[moodIdx]}
              min={0}
              max={4}
              step={1}
              onValueChange={(v) => setMoodIdx(v[0])}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Dauer</Label>
              <span className="text-xs text-muted-foreground">{effectiveDuration}s</span>
            </div>
            <Slider
              value={[effectiveDuration]}
              min={5}
              max={maxDur}
              step={5}
              onValueChange={(v) => setDuration(v[0])}
              disabled={loading}
            />
          </div>
        </div>

        {/* Instrumental */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
          <div>
            <Label className="text-sm font-medium">Instrumental</Label>
            <p className="text-xs text-muted-foreground">Ohne Vocals generieren</p>
          </div>
          <Switch checked={instrumental} onCheckedChange={setInstrumental} disabled={loading} />
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim() || insufficient}
          size="lg"
          className="w-full bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 relative overflow-hidden"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Komponiere... (~{tier === 'pro' ? '60s' : '20s'})
            </>
          ) : insufficient ? (
            <>Nicht genügend Credits — bitte aufladen</>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Track generieren · {currencySymbol}{tierInfo.eur.toFixed(2)}
            </>
          )}
        </Button>
      </Card>

      {/* Generated Track Preview */}
      <AnimatePresence>
        {generatedTrack && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="backdrop-blur-xl bg-gradient-to-br from-primary/10 via-card/60 to-cyan-500/5 border-primary/30 p-5">
              <div className="flex items-center gap-4">
                <Button
                  size="icon"
                  onClick={togglePlay}
                  className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-cyan-500 shrink-0"
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                </Button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{generatedTrack.title}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{generatedTrack.duration_sec}s</span>
                    <span>•</span>
                    <span>{generatedTrack.engine}</span>
                    <Badge variant="outline" className="text-[10px] h-4 border-primary/40 text-primary">
                      In Bibliothek gespeichert
                    </Badge>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-1.5" /> MP3
                </Button>
              </div>
              <audio
                ref={audioRef}
                src={generatedTrack.url}
                onEnded={() => setIsPlaying(false)}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                className="hidden"
              />
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
