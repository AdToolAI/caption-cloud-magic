import { useState, useEffect } from 'react';
import {
  ENGINE_CATALOG,
  getEngine,
  isLanguageSupported,
  getLanguageMeta,
  engineHasVocals,
  computeMusicPrice,
  type MusicEngineId,
} from '@/lib/music/engineCatalog';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Music2, Sparkles, Loader2, Wallet, Library, Lock, Search, Activity, RotateCcw, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { useMusicGeneration, type GeneratedMusicTrack } from '@/hooks/useMusicGeneration';
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

  const [engineId, setEngineId] = useState<MusicEngineId>('stable-audio-25');
  const [prompt, setPrompt] = useState('');
  const [genre, setGenre] = useState<string>('any');
  const [mood, setMood] = useState<string>('uplifting');

  const [bpm, setBpm] = useState<number | undefined>();
  const [musicalKey, setMusicalKey] = useState('');
  const [instrumental, setInstrumental] = useState(true);
  const [loop, setLoop] = useState(false);
  const [lyrics, setLyrics] = useState('');
  const [styleTags, setStyleTags] = useState('');
  const [lastTrack, setLastTrack] = useState<GeneratedMusicTrack | null>(null);

  const engine = getEngine(engineId);
  const currencySymbol = wallet?.currency === 'USD' ? '$' : '€';
  const balance = wallet?.balance_euros ?? 0;
  const maxDur = engine.maxDuration;
  const cost = computeMusicPrice(engineId, maxDur);
  const insufficient = balance < cost;
  const [language, setLanguage] = useState<string>(() => {
    if (typeof navigator === 'undefined') return 'en';
    const lang = navigator.language?.slice(0, 2) || 'en';
    return isLanguageSupported('minimax-15', lang) ? lang : 'en';
  });

  // When engine changes, ensure selected language is still supported
  useEffect(() => {
    const supported = engine.languages;
    if (supported.length === 0) return;
    if (!supported.some((l) => l.code === language)) {
      setLanguage(supported[0].code);
    }
  }, [engineId]); // eslint-disable-line react-hooks/exhaustive-deps

  const showLanguagePicker = engineHasVocals(engineId, instrumental);
  const needsLyrics = engine.requiresLyrics;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (needsLyrics && !lyrics.trim()) return;
    const langMeta = showLanguagePicker ? getLanguageMeta(engineId, language) : undefined;
    const finalPrompt = langMeta
      ? `${prompt.trim()}\n\n[LANGUAGE: ${langMeta.name}] — Sing exclusively in ${langMeta.name}. Do not mix languages.`
      : prompt.trim();
    const track = await generateMusic({
      prompt: finalPrompt,
      tier: engineId,
      durationSeconds: maxDur,
      genre: genre !== 'any' ? genre : undefined,
      mood,
      instrumental: engine.supportsInstrumentalToggle ? instrumental : !engine.vocals,
      bpm,
      key: musicalKey || undefined,
      lyrics: engine.vocals ? (lyrics.trim() || undefined) : undefined,
      loop: engine.supportsLoop ? loop : undefined,
      language: langMeta?.code,
      languageName: langMeta?.name,
      styleTags: engine.supportsStyleField ? (styleTags.trim() || undefined) : undefined,
    });
    if (track) setLastTrack(track);
  };


  const handleAutoLyrics = async () => {
    if (!prompt.trim()) return;
    const generated = await generateLyrics({
      prompt: prompt.trim(),
      genre: genre !== 'any' ? genre : undefined,
      mood,
      language: (['en', 'de', 'es'] as const).includes(language as any) ? (language as 'en' | 'de' | 'es') : 'en',
    });
    if (generated) setLyrics(generated);
  };

  const handleResetProject = () => {
    const hasContent = prompt.trim() || lyrics.trim() || lastTrack;
    if (hasContent && !window.confirm('Neues Projekt starten? Alle aktuellen Eingaben (Prompt, Lyrics, Track-Preview) werden zurückgesetzt.')) {
      return;
    }
    setPrompt('');
    setLyrics('');
    setGenre('any');
    setMood('uplifting');
    setBpm(undefined);
    setMusicalKey('');
    setInstrumental(true);
    setLoop(false);
    setStyleTags('');
    setLastTrack(null);
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
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Engine wählen</Label>
                    <ProviderSelector value={engineId} onChange={setEngineId} currencySymbol={currencySymbol} disabled={loading} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetProject}
                    disabled={loading}
                    className="border-primary/30 text-primary hover:bg-primary/10 gap-1.5 shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Neues Projekt
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 mt-1">
                  <Info className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/70" />
                  <span>
                    <strong>Suno</strong> und <strong>Udio</strong> bieten aktuell keinen offiziellen API-Zugang. Für Full-Song-Qualität setzen wir auf <strong>ElevenLabs Music v2</strong> (beste Gesamtlösung) und <strong>Google Lyria 3 Pro</strong> (Preview) — <strong>Stable Audio 3.0 Large</strong> deckt den Instrumental-Bereich ab.
                  </span>
                </p>

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
                      placeholder={engine.vocals
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

                  <div className="p-3 rounded-lg bg-background/40 border border-primary/10">
                    <p className="text-[11px] text-muted-foreground">
                      <span className="text-primary font-medium">Songlänge</span> wird automatisch durch die Lyrics & den Provider bestimmt (typisch 1–3 min bei Vocal-Tracks, {maxDur}s Cap bei Instrumentals).
                    </p>
                  </div>

                  {/* Engine-specific controls */}
                  {engine.supportsLoop && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <div>
                        <Label htmlFor="loop" className="text-sm text-foreground">Seamless Loop</Label>
                        <p className="text-[11px] text-muted-foreground">Track auf nahtloses Looping optimieren (kein Fade)</p>
                      </div>
                      <Switch id="loop" checked={loop} onCheckedChange={setLoop} />
                    </div>
                  )}

                  {engine.supportsInstrumentalToggle && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-primary/10">
                      <div>
                        <Label htmlFor="instr" className="text-sm text-foreground">Instrumental</Label>
                        <p className="text-[11px] text-muted-foreground">Ohne Gesang generieren</p>
                      </div>
                      <Switch id="instr" checked={instrumental} onCheckedChange={setInstrumental} />
                    </div>
                  )}

                  {engine.supportsStyleField && (
                    <div>
                      <Label htmlFor="style-tags" className="text-sm text-foreground mb-1.5 block">
                        Style-Tags <span className="text-muted-foreground text-[11px]">(Suno-Style, kommagetrennt)</span>
                      </Label>
                      <Input
                        id="style-tags"
                        value={styleTags}
                        onChange={(e) => setStyleTags(e.target.value)}
                        placeholder="z.B. pop, upbeat, female vocals, 120 bpm"
                        className="bg-background/40 border-primary/20"
                        maxLength={200}
                      />
                    </div>
                  )}

                  {showLanguagePicker && engine.languages.length > 0 && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <Label htmlFor="vocal-lang" className="text-sm text-foreground">Gesangssprache</Label>
                          <p className="text-[11px] text-muted-foreground">Nur Sprachen, die dieser Provider sauber singt</p>
                        </div>
                        <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
                          {engine.provider}
                        </Badge>
                      </div>
                      <select
                        id="vocal-lang"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        disabled={loading}
                        className="w-full h-9 px-3 rounded-md bg-background/40 border border-primary/20 text-sm focus:border-primary/60 focus:outline-none"
                      >
                        {engine.languages.map((l) => (
                          <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {!showLanguagePicker && engine.supportsInstrumentalToggle && instrumental && (
                    <p className="text-[11px] text-muted-foreground italic">
                      Instrumental aktiv — keine Sprachauswahl nötig. Deaktiviere „Instrumental" für Gesang.
                    </p>
                  )}

                  {engine.vocals && (
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
                    <div className="font-display font-semibold text-foreground">{engine.provider}</div>
                    <div className="text-[11px] text-muted-foreground">{engine.description}</div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-br from-primary/10 to-transparent border border-primary/20">
                    <span className="text-xs text-muted-foreground">Kosten</span>
                    <span className="font-mono text-lg font-bold text-primary">{currencySymbol}{cost.toFixed(2)}</span>
                  </div>

                  <Button
                    onClick={handleGenerate}
                    disabled={loading || !prompt.trim() || insufficient || (needsLyrics && !lyrics.trim())}
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
