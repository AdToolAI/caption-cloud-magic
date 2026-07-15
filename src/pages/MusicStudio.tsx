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
import { Music2, Sparkles, Loader2, Wallet, Library, Lock, Search, Activity, RotateCcw, Info, Radio } from 'lucide-react';
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
import { StudioWaveform } from '@/components/music-studio/StudioWaveform';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

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

      <div className="relative min-h-screen bg-gradient-to-br from-[#050816] via-[#080a1f] to-[#050816] text-foreground overflow-hidden">
        {/* Film-grain overlay */}
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.035] mix-blend-overlay z-0"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          }}
        />

        {/* Hero */}
        <div className="relative border-b border-primary/10 overflow-hidden z-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,hsl(var(--primary)/0.14),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,hsl(var(--primary)/0.09),transparent_60%)]" />
          <div className="relative max-w-7xl mx-auto px-6 pt-10 pb-6">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="flex-1 min-w-0"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/30 flex items-center justify-center backdrop-blur-sm">
                    <Music2 className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant="outline" className="border-primary/40 text-primary text-[10px] tracking-widest">
                    MASTERING SUITE
                  </Badge>
                  <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-emerald-400/80">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                    </span>
                    On Air
                  </span>
                </div>
                <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-foreground via-primary to-foreground/80 bg-clip-text text-transparent">
                  Music Studio
                </h1>
                <p className="text-muted-foreground mt-2 max-w-xl">
                  Fünf KI-Engines für Background-Loops, polierte Instrumentals und Songs mit Vocals — alles in einem Studio.
                </p>
              </motion.div>

              <Card className="px-5 py-3 bg-background/50 backdrop-blur-md border-primary/25 flex items-center gap-4 shrink-0 shadow-[0_10px_40px_-20px_hsl(var(--primary)/0.4)]">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Wallet</div>
                    <div className="font-mono text-lg font-semibold text-foreground tabular-nums">
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

            {/* Now-playing waveform strip */}
            <div className="mt-6 relative rounded-xl border border-primary/15 bg-background/40 backdrop-blur-md px-5 py-3 overflow-hidden">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.06),transparent)]" />
              <div className="relative flex items-center gap-4">
                <div className="flex items-center gap-2 shrink-0">
                  <Radio className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {loading ? 'Rendering' : lastTrack ? 'Last Master' : 'Idle Bus'}
                  </span>
                </div>
                <div className="flex-1">
                  <StudioWaveform bars={72} active={loading} height={40} />
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground shrink-0 hidden md:block">
                  {engine.provider} · {maxDur}s cap
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
          <Tabs defaultValue="generate" className="w-full">
            <TabsList className="relative bg-background/40 backdrop-blur-md border border-primary/15 p-1 mb-6 rounded-lg shadow-[inset_0_1px_0_hsl(var(--primary)/0.08)]">
              <TabsTrigger value="generate" className="relative data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_-2px_0_hsl(var(--primary))] gap-1.5 uppercase tracking-widest text-[11px]">
                <Sparkles className="h-3.5 w-3.5" /> Generate
              </TabsTrigger>
              <TabsTrigger value="tracks" className="relative data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_-2px_0_hsl(var(--primary))] gap-1.5 uppercase tracking-widest text-[11px]">
                <Library className="h-3.5 w-3.5" /> Meine Tracks
              </TabsTrigger>
              <TabsTrigger value="stock" className="relative data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_-2px_0_hsl(var(--primary))] gap-1.5 uppercase tracking-widest text-[11px]">
                <Search className="h-3.5 w-3.5" /> Stock-Suche
              </TabsTrigger>
              <TabsTrigger value="beat" className="relative data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_-2px_0_hsl(var(--primary))] gap-1.5 uppercase tracking-widest text-[11px]">
                <Activity className="h-3.5 w-3.5" /> Beat-Sync
              </TabsTrigger>
              <TabsTrigger value="licensed" className="relative data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-[inset_0_-2px_0_hsl(var(--primary))] gap-1.5 uppercase tracking-widest text-[11px]">
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
                    <Label htmlFor="prompt" className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2 block">
                      Beschreibe den Track
                    </Label>
                    <div className="relative group">
                      {/* Viewfinder corners */}
                      <span className="pointer-events-none absolute -top-px -left-px h-3 w-3 border-t border-l border-primary/60 group-focus-within:border-primary transition-colors" />
                      <span className="pointer-events-none absolute -top-px -right-px h-3 w-3 border-t border-r border-primary/60 group-focus-within:border-primary transition-colors" />
                      <span className="pointer-events-none absolute -bottom-px -left-px h-3 w-3 border-b border-l border-primary/60 group-focus-within:border-primary transition-colors" />
                      <span className="pointer-events-none absolute -bottom-px -right-px h-3 w-3 border-b border-r border-primary/60 group-focus-within:border-primary transition-colors" />
                      <Textarea
                        id="prompt"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={engine.vocals
                          ? "z.B. Upbeat indie pop song about late-night freedom and city lights"
                          : "z.B. Epic cinematic build-up with deep bass and ethereal strings"}
                        className="min-h-[110px] bg-background/50 border-primary/20 focus:border-primary/60 rounded-md"
                        maxLength={500}
                      />
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-1 text-right tabular-nums">{prompt.length.toString().padStart(3, '0')}/500</div>
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

                {/* RIGHT: Master-Bus */}
                <Card className="relative p-0 overflow-hidden bg-[linear-gradient(180deg,hsl(var(--card)/0.8),hsl(var(--background)/0.7))] backdrop-blur-md border-primary/25 h-fit lg:sticky lg:top-6 shadow-[0_20px_60px_-30px_hsl(var(--primary)/0.5)]">
                  {/* Rack header */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-primary/15 bg-[linear-gradient(180deg,hsl(var(--primary)/0.1),transparent)]">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_hsl(var(--primary))]" />
                      <span className="text-[9.5px] uppercase tracking-widest text-muted-foreground">Master Bus</span>
                    </div>
                    <span className="font-mono text-[9.5px] uppercase tracking-widest text-primary/80">
                      CH · 01
                    </span>
                  </div>

                  <div className="p-5 space-y-4">
                    <div>
                      <div className="text-[9.5px] text-muted-foreground uppercase tracking-widest mb-1">Engine</div>
                      <div className="font-display text-lg font-semibold text-foreground leading-tight">{engine.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{engine.provider}</div>
                      <div className="text-[11px] text-muted-foreground/80 mt-2 leading-snug">{engine.description}</div>
                    </div>

                    {/* LCD cost display */}
                    <div className="relative rounded-lg border border-primary/30 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.15),hsl(var(--background)/0.9))] p-3 overflow-hidden">
                      <div className="pointer-events-none absolute inset-0 opacity-30 bg-[repeating-linear-gradient(0deg,transparent_0,transparent_2px,hsl(var(--primary)/0.05)_2px,hsl(var(--primary)/0.05)_3px)]" />
                      <div className="relative flex items-end justify-between">
                        <div>
                          <div className="text-[9.5px] uppercase tracking-widest text-muted-foreground">Kosten · max</div>
                          {engine.pricingModel === 'per-second' && engine.priceEurPerSecond && (
                            <div className="text-[10px] font-mono text-muted-foreground/80 mt-0.5">
                              {currencySymbol}{engine.priceEurPerSecond.toFixed(3)}/s · pro Sek.
                            </div>
                          )}
                        </div>
                        <div className="flex items-baseline gap-0.5">
                          <span className="font-mono text-xs font-light text-primary/60">{currencySymbol}</span>
                          <span className="font-mono text-3xl font-bold text-primary tabular-nums leading-none drop-shadow-[0_0_12px_hsl(var(--primary)/0.5)]">
                            {cost.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Session meta */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md border border-primary/10 bg-background/40 py-2">
                        <div className="text-[9px] uppercase tracking-widest text-muted-foreground">BPM</div>
                        <div className="font-mono text-sm text-foreground/90 tabular-nums">{bpm ?? '—'}</div>
                      </div>
                      <div className="rounded-md border border-primary/10 bg-background/40 py-2">
                        <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Key</div>
                        <div className="font-mono text-sm text-foreground/90 truncate px-1">{musicalKey || '—'}</div>
                      </div>
                      <div className="rounded-md border border-primary/10 bg-background/40 py-2">
                        <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Cap</div>
                        <div className="font-mono text-sm text-foreground/90 tabular-nums">{maxDur}s</div>
                      </div>
                    </div>

                    {/* Physical button */}
                    <Button
                      onClick={handleGenerate}
                      disabled={loading || !prompt.trim() || insufficient || (needsLyrics && !lyrics.trim())}
                      className={cn(
                        'w-full h-12 gap-2 rounded-lg relative overflow-hidden',
                        'bg-[linear-gradient(180deg,hsl(var(--primary)),hsl(var(--primary)/0.75))]',
                        'text-primary-foreground font-semibold uppercase tracking-widest text-[12px]',
                        'shadow-[0_6px_0_hsl(var(--primary)/0.35),0_10px_30px_-5px_hsl(var(--primary)/0.6),inset_0_1px_0_hsl(0_0%_100%/0.3)]',
                        'active:translate-y-[3px] active:shadow-[0_3px_0_hsl(var(--primary)/0.35),0_6px_20px_-8px_hsl(var(--primary)/0.5),inset_0_1px_0_hsl(0_0%_100%/0.3)]',
                        'transition-all',
                        'disabled:opacity-60 disabled:cursor-not-allowed',
                      )}
                    >
                      {loading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Rendering…</>
                      ) : (
                        <><Sparkles className="h-4 w-4" /> Track generieren</>
                      )}
                    </Button>

                    {insufficient && (
                      <div className="text-[11px] text-destructive text-center">
                        Nicht genug Credits. Lade dein Wallet auf.
                      </div>
                    )}

                    {lastTrack && (
                      <div className="pt-3 border-t border-primary/10 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <div className="text-[9.5px] text-muted-foreground uppercase tracking-widest">Last Master</div>
                        </div>
                        <div className="text-sm font-medium text-foreground truncate">{lastTrack.title}</div>
                        <audio
                          src={lastTrack.url}
                          controls
                          className="w-full h-9"
                          style={{ filter: 'invert(0.85) hue-rotate(180deg)' }}
                        />
                      </div>
                    )}
                  </div>
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
