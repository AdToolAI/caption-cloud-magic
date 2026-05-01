import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Music2, Sparkles, Loader2, Wallet, Library, Lock, Search, Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { useMusicGeneration, MUSIC_TIER_PRICING, type MusicTier, type GeneratedMusicTrack } from '@/hooks/useMusicGeneration';
import { ProviderSelector } from '@/components/music-studio/ProviderSelector';
import { LyricsEditor } from '@/components/music-studio/LyricsEditor';
import { MyTracksGrid } from '@/components/music-studio/MyTracksGrid';
import { useNavigate } from 'react-router-dom';

const GENRES = ['any', 'pop', 'rock', 'electronic', 'hip-hop', 'jazz', 'classical', 'lo-fi', 'cinematic', 'ambient', 'folk', 'r&b'];
const MOODS = ['energetic', 'calm', 'epic', 'sad', 'happy', 'mysterious', 'romantic', 'dark', 'uplifting', 'dreamy'];

import { useTrackPageFeature } from "@/hooks/useTrackPageFeature";

export default function MusicStudio() {
  useTrackPageFeature("music_studio");
  const navigate = useNavigate();
  const { wallet } = useAIVideoWallet();
  const { generateMusic, generateLyrics, loading, generatingLyrics } = useMusicGeneration();

  const [tier, setTier] = useState<MusicTier>('adaptive');
  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState<string>('any');
  const [mood, setMood] = useState<string>('uplifting');
  const [duration, setDuration] = useState(30);
  const [bpm, setBpm] = useState<number | undefined>();
  const [musicalKey, setMusicalKey] = useState('');
  const [instrumental, setInstrumental] = useState(true);
  const [loop, setLoop] = useState(false);
  const [lyrics, setLyrics] = useState('');
  const [lastTrack, setLastTrack] = useState<GeneratedMusicTrack | null>(null);

  const currencySymbol = wallet?.currency === 'USD' ? '$' : '€';
  const balance = wallet?.balance_euros ?? 0;
  const tierPricing = MUSIC_TIER_PRICING[tier];
  const cost = tierPricing.eur;
  const insufficient = balance < cost;
  const maxDur = tierPricing.maxDuration;
  const language = useMemo(() => {
    if (typeof navigator === 'undefined') return 'en' as const;
    const lang = navigator.language?.slice(0, 2);
    return (lang === 'de' || lang === 'es') ? (lang as 'de' | 'es') : 'en';
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (tier === 'vocal' && !lyrics.trim()) return;
    const safeDuration = Math.min(duration, maxDur);
    const track = await generateMusic({
      prompt: prompt.trim(),
      tier,
      durationSeconds: safeDuration,
      genre: genre !== 'any' ? genre : undefined,
      mood,
      instrumental: tier === 'vocal' ? false : instrumental,
      bpm,
      key: musicalKey || undefined,
      lyrics: tier === 'vocal' ? lyrics.trim() : undefined,
      loop: tier === 'adaptive' ? loop : undefined,
    });
    if (track) setLastTrack(track);
  };

  const handleAutoLyrics = async () => {
    if (!prompt.trim()) return;
    const generated = await generateLyrics({
      prompt: prompt.trim(),
      genre: genre !== 'any' ? genre : undefined,
      mood,
      language,
    });
    if (generated) setLyrics(generated);
  };

  return (
    <>
      <Helmet>
        <title>Music Studio — AI Music Generator | useadtool</title>
        <meta name="description" content="Generate cinematic background music, social-ready hooks, and full songs with vocals using Stable Audio 2.5, MiniMax Music, MusicGen and ElevenLabs — all in one studio." />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-[#050816] via-[#080a1f] to-[#050816] text-foreground">
        {/* Hero */}
        <div className="relative border-b border-primary/10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,hsl(var(--primary)/0.12),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,hsl(var(--primary)/0.08),transparent_60%)]" />
          <div className="relative max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/30 flex items-center justify-center backdrop-blur-sm">
                  <Music2 className="h-5 w-5 text-primary" />
                </div>
                <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
                  Native Music Library
                </Badge>
              </div>
              <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-foreground via-primary to-foreground/80 bg-clip-text text-transparent">
                Music Studio
              </h1>
              <p className="text-muted-foreground mt-2 max-w-xl">
                Fünf KI-Engines für Background-Loops, polierte Instrumentals und Songs mit Vocals — alles in einem Studio.
              </p>
            </motion.div>

            <Card className="px-5 py-3 bg-background/50 backdrop-blur-md border-primary/20 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Wallet</div>
                  <div className="font-mono text-lg font-semibold text-foreground">
                    {currencySymbol}{balance.toFixed(2)}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => navigate('/ai-video-purchase-credits')}
              >
                Aufladen
              </Button>
            </Card>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          <Tabs defaultValue="generate" className="w-full">
            <TabsList className="bg-background/40 backdrop-blur-md border border-primary/15 p-1 mb-6">
              <TabsTrigger value="generate" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Generate
              </TabsTrigger>
              <TabsTrigger value="tracks" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary gap-1.5">
                <Library className="h-3.5 w-3.5" /> Meine Tracks
              </TabsTrigger>
              <TabsTrigger value="stock" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary gap-1.5">
                <Search className="h-3.5 w-3.5" /> Stock-Suche
              </TabsTrigger>
              <TabsTrigger value="beat" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary gap-1.5">
                <Activity className="h-3.5 w-3.5" /> Beat-Sync
              </TabsTrigger>
              <TabsTrigger value="licensed" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Lizenziert
              </TabsTrigger>
            </TabsList>

            {/* GENERATE */}
            <TabsContent value="generate" className="space-y-6">
              <Card className="p-5 bg-background/40 backdrop-blur-md border-primary/15">
                <div className="mb-4">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Engine wählen</Label>
                  <ProviderSelector value={tier} onChange={setTier} currencySymbol={currencySymbol} disabled={loading} />
                </div>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* LEFT: Prompt + Settings */}
                <Card className="lg:col-span-2 p-5 bg-background/40 backdrop-blur-md border-primary/15 space-y-5">
                  <div>
                    <Label htmlFor="prompt" className="text-sm font-semibold text-foreground mb-1.5 block">
                      Beschreibe den Track
                    </Label>
                    <Textarea
                      id="prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={tier === 'vocal'
                        ? "z.B. Upbeat indie pop song about late-night freedom and city lights"
                        : "z.B. Epic cinematic build-up with deep bass and ethereal strings"}
                      className="min-h-[100px] bg-background/40 border-primary/20 focus:border-primary/60"
                      maxLength={500}
                    />
                    <div className="text-[10px] text-muted-foreground mt-1 text-right">{prompt.length}/500</div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Genre</Label>
                      <select
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        className="w-full h-9 px-3 rounded-md bg-background/40 border border-primary/20 text-sm focus:border-primary/60 focus:outline-none"
                      >
                        {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Mood</Label>
                      <select
                        value={mood}
                        onChange={(e) => setMood(e.target.value)}
                        className="w-full h-9 px-3 rounded-md bg-background/40 border border-primary/20 text-sm focus:border-primary/60 focus:outline-none"
                      >
                        {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">BPM (optional)</Label>
                      <Input
                        type="number"
                        min={40} max={220}
                        value={bpm || ''}
                        onChange={(e) => setBpm(e.target.value ? parseInt(e.target.value) : undefined)}
                        placeholder="z.B. 120"
                        className="h-9 bg-background/40 border-primary/20"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Key (optional)</Label>
                      <Input
                        value={musicalKey}
                        onChange={(e) => setMusicalKey(e.target.value)}
                        placeholder="z.B. C minor"
                        className="h-9 bg-background/40 border-primary/20"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs text-muted-foreground">Dauer</Label>
                      <span className="text-xs font-mono text-primary">{Math.min(duration, maxDur)}s / max {maxDur}s</span>
                    </div>
                    <Slider
                      value={[Math.min(duration, maxDur)]}
                      onValueChange={(v) => setDuration(v[0])}
                      min={5}
                      max={maxDur}
                      step={5}
                    />
                  </div>

                  {/* Tier-specific controls */}
                  {tier === 'adaptive' && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <div>
                        <Label htmlFor="loop" className="text-sm text-foreground">Seamless Loop</Label>
                        <p className="text-[11px] text-muted-foreground">Track auf nahtloses Looping optimieren (kein Fade)</p>
                      </div>
                      <Switch id="loop" checked={loop} onCheckedChange={setLoop} />
                    </div>
                  )}

                  {tier !== 'vocal' && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-primary/10">
                      <div>
                        <Label htmlFor="instr" className="text-sm text-foreground">Instrumental</Label>
                        <p className="text-[11px] text-muted-foreground">Keine Vocals (außer im Vocal-Tier)</p>
                      </div>
                      <Switch id="instr" checked={instrumental} onCheckedChange={setInstrumental} />
                    </div>
                  )}

                  {tier === 'vocal' && (
                    <LyricsEditor
                      value={lyrics}
                      onChange={setLyrics}
                      onAutoGenerate={handleAutoLyrics}
                      generating={generatingLyrics}
                      disabled={loading}
                    />
                  )}
                </Card>

                {/* RIGHT: Generate + Preview */}
                <Card className="p-5 bg-background/40 backdrop-blur-md border-primary/15 space-y-4 h-fit lg:sticky lg:top-6">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Engine</div>
                    <div className="font-display font-semibold text-foreground">{tierPricing.engine}</div>
                    <div className="text-[11px] text-muted-foreground">{tierPricing.description}</div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-br from-primary/10 to-transparent border border-primary/20">
                    <span className="text-xs text-muted-foreground">Kosten</span>
                    <span className="font-mono text-lg font-bold text-primary">{currencySymbol}{cost.toFixed(2)}</span>
                  </div>

                  <Button
                    onClick={handleGenerate}
                    disabled={loading || !prompt.trim() || insufficient || (tier === 'vocal' && !lyrics.trim())}
                    className="w-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:opacity-90 gap-2 h-11"
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Generiere…</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Track generieren</>
                    )}
                  </Button>

                  {insufficient && (
                    <div className="text-[11px] text-destructive">
                      Nicht genug Credits. Lade dein Wallet auf.
                    </div>
                  )}

                  {lastTrack && (
                    <div className="pt-3 border-t border-primary/10 space-y-2">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Letzter Track</div>
                      <div className="text-sm font-medium text-foreground truncate">{lastTrack.title}</div>
                      <audio
                        src={lastTrack.url}
                        controls
                        className="w-full h-9"
                        style={{ filter: 'invert(0.85) hue-rotate(180deg)' }}
                      />
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>

            {/* MY TRACKS */}
            <TabsContent value="tracks">
              <MyTracksGrid />
            </TabsContent>

            {/* STOCK SEARCH */}
            <TabsContent value="stock">
              <Card className="p-12 text-center bg-background/40 backdrop-blur-md border-primary/15">
                <Search className="h-10 w-10 text-primary/50 mx-auto mb-3" />
                <h3 className="font-display text-xl text-foreground mb-2">Stock-Music-Suche</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                  Live-Suche in Jamendo + Pixabay direkt im AI Video Composer und Director's Cut verfügbar — über die Music-Library im jeweiligen Editor.
                </p>
                <div className="flex justify-center gap-2">
                  <Button variant="outline" onClick={() => navigate('/video-composer')} className="border-primary/30">
                    Video Composer öffnen
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/universal-directors-cut')} className="border-primary/30">
                    Director's Cut öffnen
                  </Button>
                </div>
              </Card>
            </TabsContent>

            {/* BEAT SYNC */}
            <TabsContent value="beat">
              <Card className="p-12 text-center bg-background/40 backdrop-blur-md border-primary/15">
                <Activity className="h-10 w-10 text-primary/50 mx-auto mb-3" />
                <h3 className="font-display text-xl text-foreground mb-2">Beat-Sync & Auto-Match</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                  Lade ein Video hoch und lass die Engine BPM analysieren und passende Musik vorschlagen — verfügbar im Audio Studio unter dem Auto-Match-Tab.
                </p>
                <Button variant="outline" onClick={() => navigate('/audio-studio')} className="border-primary/30">
                  Audio Studio öffnen
                </Button>
              </Card>
            </TabsContent>

            {/* LICENSED LIBRARY */}
            <TabsContent value="licensed">
              <Card className="p-12 text-center bg-background/40 backdrop-blur-md border-primary/15">
                <Lock className="h-10 w-10 text-primary/50 mx-auto mb-3" />
                <h3 className="font-display text-xl text-foreground mb-2">Lizenzierte Music Library</h3>
                <Badge variant="outline" className="border-primary/40 text-primary mb-3">Coming Soon</Badge>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Kuratierte royalty-free Tracks mit Lizenz-Metadaten und PDF-Lizenzdokumenten — perfekt für kommerzielle Kampagnen.
                </p>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
