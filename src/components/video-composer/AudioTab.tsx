import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight, Info, Loader2, Mic, Music, Pause, Play, Search, Volume2, Zap } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { sortVoicesPremiumFirst, type VoiceMeta } from '@/lib/elevenlabs-voices';
import { VoicePreviewButton } from '@/components/voices/VoicePreviewButton';
import type { AssemblyConfig, ComposerScene, VoiceoverConfig, MusicConfig } from '@/types/video-composer';

interface AudioTabProps {
  assemblyConfig: AssemblyConfig;
  onUpdateAssembly: (config: Partial<AssemblyConfig>) => void;
  scenes: ComposerScene[];
  onGoToExport: () => void;
}

interface MusicTrack {
  id: string;
  name: string;
  artist: string;
  duration: number;
  audioUrl: string;
  genre: string;
  mood: string;
}

export default function AudioTab({ assemblyConfig, onUpdateAssembly, scenes, onGoToExport }: AudioTabProps) {
  const voiceover = assemblyConfig.voiceover;
  const music = assemblyConfig.music;

  // Voiceover state
  const [generatingVo, setGeneratingVo] = useState(false);
  const [voPreviewPlaying, setVoPreviewPlaying] = useState(false);
  const voAudioRef = useRef<HTMLAudioElement | null>(null);

  // Music state
  const [searchingMusic, setSearchingMusic] = useState(false);
  const [musicResults, setMusicResults] = useState<MusicTrack[]>([]);
  const [musicPlaying, setMusicPlaying] = useState<string | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  // Beat sync state
  const [analyzingBeats, setAnalyzingBeats] = useState(false);

  // Premium voices state
  const [voices, setVoices] = useState<VoiceMeta[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [voiceLangTab, setVoiceLangTab] = useState<'de' | 'en' | 'es'>('de');

  useEffect(() => {
    (async () => {
      setLoadingVoices(true);
      try {
        const { data, error } = await supabase.functions.invoke('list-voices', { body: { language: 'all' } });
        if (error) throw error;
        setVoices(sortVoicesPremiumFirst<VoiceMeta>(data?.voices || []));
      } catch (err) {
        console.error('Failed to load voices:', err);
      } finally {
        setLoadingVoices(false);
      }
    })();
  }, []);

  const voicesForTab = voices.filter((v) =>
    v.language === voiceLangTab || (v.supportedLanguages || []).includes(voiceLangTab)
  );
  const fallbackVoice = { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' };

  // Auto-generate script from scene text overlays
  const generateScriptFromScenes = () => {
    const script = scenes
      .filter(s => s.textOverlay?.text)
      .map(s => s.textOverlay.text)
      .join('. ');
    if (voiceover && script) {
      onUpdateAssembly({ voiceover: { ...voiceover, script } });
      toast({ title: 'Script generiert', description: `${script.split(/\s+/).length} Wörter aus Szenen-Texten übernommen.` });
    }
  };

  // Generate voiceover via ElevenLabs
  const handleGenerateVoiceover = async () => {
    if (!voiceover?.script?.trim()) {
      toast({ title: 'Script fehlt', description: 'Bitte gib einen Voiceover-Text ein.', variant: 'destructive' });
      return;
    }
    setGeneratingVo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht eingeloggt');

      const { data, error } = await supabase.functions.invoke('generate-voiceover', {
        body: {
          text: voiceover.script,
          voiceId: voiceover.voiceId,
          projectId: `composer-${Date.now()}`,
          stability: 0.5,
          similarityBoost: 0.75,
          speed: 1.0,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Voiceover fehlgeschlagen');

      onUpdateAssembly({
        voiceover: { ...voiceover, audioUrl: data.audioUrl },
      });
      toast({ title: 'Voiceover generiert!', description: `Dauer: ~${data.duration}s` });
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    } finally {
      setGeneratingVo(false);
    }
  };

  // Voiceover preview playback
  const toggleVoPreview = () => {
    if (!voiceover?.audioUrl) return;
    if (voPreviewPlaying) {
      voAudioRef.current?.pause();
      setVoPreviewPlaying(false);
    } else {
      if (!voAudioRef.current) {
        voAudioRef.current = new Audio(voiceover.audioUrl);
        voAudioRef.current.onended = () => setVoPreviewPlaying(false);
      } else {
        voAudioRef.current.src = voiceover.audioUrl;
      }
      voAudioRef.current.play();
      setVoPreviewPlaying(true);
    }
  };

  // Search background music
  const handleSearchMusic = async () => {
    if (!music) return;
    setSearchingMusic(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-stock-music', {
        body: { query: `${music.genre} ${music.mood}`, mood: music.mood, genre: music.genre },
      });
      if (error) throw error;
      const tracks: MusicTrack[] = (data?.results || []).map((t: any) => ({
        id: t.id || t.source_id,
        name: t.name || t.title,
        artist: t.artist_name || t.artist || 'Unknown',
        duration: t.duration || 0,
        audioUrl: t.audio || t.audiodownload || t.preview_url || '',
        genre: music.genre,
        mood: music.mood,
      }));
      setMusicResults(tracks);
      if (tracks.length === 0) {
        toast({ title: 'Keine Ergebnisse', description: 'Versuche andere Genre/Stimmung Kombination.' });
      }
    } catch (err: any) {
      toast({ title: 'Fehler bei Musiksuche', description: err.message, variant: 'destructive' });
    } finally {
      setSearchingMusic(false);
    }
  };

  // Music preview playback
  const toggleMusicPreview = (track: MusicTrack) => {
    if (musicPlaying === track.id) {
      musicAudioRef.current?.pause();
      setMusicPlaying(null);
    } else {
      if (musicAudioRef.current) musicAudioRef.current.pause();
      musicAudioRef.current = new Audio(track.audioUrl);
      musicAudioRef.current.onended = () => setMusicPlaying(null);
      musicAudioRef.current.play();
      setMusicPlaying(track.id);
    }
  };

  // Select music track
  const selectTrack = (track: MusicTrack) => {
    if (!music) return;
    musicAudioRef.current?.pause();
    setMusicPlaying(null);
    onUpdateAssembly({
      music: { ...music, trackUrl: track.audioUrl, trackName: `${track.name} — ${track.artist}`, isUpload: false },
    });
    toast({ title: 'Track ausgewählt', description: track.name });
  };

  // Beat sync analysis
  const handleBeatSync = async () => {
    if (!music?.trackUrl) {
      toast({ title: 'Keine Musik', description: 'Bitte wähle zuerst einen Musik-Track.', variant: 'destructive' });
      return;
    }
    setAnalyzingBeats(true);
    try {
      const totalDuration = scenes.reduce((s, sc) => s + sc.durationSeconds, 0);
      const { data, error } = await supabase.functions.invoke('analyze-music-beats', {
        body: { musicUrl: music.trackUrl, duration: totalDuration },
      });
      if (error) throw error;
      onUpdateAssembly({ beatSync: true });
      toast({
        title: `Beat-Sync aktiviert (${data?.bpm || 120} BPM)`,
        description: `${data?.transitionPoints?.length || 0} Transition-Punkte erkannt.`,
      });
    } catch (err: any) {
      toast({ title: 'Beat-Analyse fehlgeschlagen', description: err.message, variant: 'destructive' });
    } finally {
      setAnalyzingBeats(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Voiceover */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" /> Voiceover
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
              <span>💡 Premium-Stimmen klingen am natürlichsten. Tipp: Nutze Satzzeichen für realistische Pausen.</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Sprache</Label>
              <Tabs value={voiceLangTab} onValueChange={(v) => setVoiceLangTab(v as 'de' | 'en' | 'es')}>
                <TabsList className="grid w-full grid-cols-3 h-8">
                  <TabsTrigger value="de" className="text-xs">🇩🇪 DE</TabsTrigger>
                  <TabsTrigger value="en" className="text-xs">🇬🇧 EN</TabsTrigger>
                  <TabsTrigger value="es" className="text-xs">🇪🇸 ES</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Stimme</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={voiceover.voiceId}
                  onValueChange={(v) => {
                    const voice = voices.find((vo) => vo.id === v);
                    onUpdateAssembly({
                      voiceover: { ...voiceover, voiceId: v, voiceName: voice?.name || '' },
                    });
                  }}
                  disabled={loadingVoices}
                >
                  <SelectTrigger className="bg-background/50 flex-1">
                    <SelectValue placeholder={loadingVoices ? 'Lade Stimmen…' : 'Stimme wählen'} />
                  </SelectTrigger>
                  <SelectContent>
                    {voicesForTab.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        <span className="flex items-center gap-2">
                          {v.tier === 'premium' && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-primary/15 text-primary border-primary/20">Premium</Badge>
                          )}
                          <span>{v.name}</span>
                          {v.gender && <span className="text-xs text-muted-foreground">({v.gender})</span>}
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

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Script</Label>
                <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={generateScriptFromScenes}>
                  Aus Szenen generieren
                </Button>
              </div>
              <Textarea
                value={voiceover.script}
                onChange={(e) =>
                  onUpdateAssembly({ voiceover: { ...voiceover, script: e.target.value } })
                }
                placeholder="Der Voiceover-Text für dein Video..."
                rows={4}
                className="bg-background/50 resize-none text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                {voiceover.script.split(/\s+/).filter(Boolean).length} Wörter · ~{Math.ceil(voiceover.script.split(/\s+/).filter(Boolean).length / 150 * 60)}s Dauer
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleGenerateVoiceover} disabled={generatingVo || !voiceover.script.trim()} className="gap-2 flex-1">
                {generatingVo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                {generatingVo ? 'Generiere...' : 'Voiceover generieren'}
              </Button>
              {voiceover.audioUrl && (
                <Button variant="outline" size="icon" onClick={toggleVoPreview}>
                  {voPreviewPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
              )}
            </div>
            {voiceover.audioUrl && (
              <p className="text-[10px] text-emerald-400">✓ Voiceover bereit</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* Background Music */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Music className="h-4 w-4 text-primary" /> Hintergrundmusik
            </CardTitle>
            <Switch
              checked={!!music?.enabled}
              onCheckedChange={(checked) =>
                onUpdateAssembly({
                  music: checked
                    ? { enabled: true, trackUrl: '', trackName: '', genre: 'electronic', mood: 'energetic', volume: 30, isUpload: false }
                    : null,
                })
              }
            />
          </div>
        </CardHeader>
        {music?.enabled && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Genre</Label>
                <Select
                  value={music.genre}
                  onValueChange={(v) => onUpdateAssembly({ music: { ...music, genre: v } })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['electronic', 'cinematic', 'corporate', 'pop', 'ambient', 'hip-hop'].map((g) => (
                      <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Stimmung</Label>
                <Select
                  value={music.mood}
                  onValueChange={(v) => onUpdateAssembly({ music: { ...music, mood: v } })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['energetic', 'calm', 'dramatic', 'happy', 'dark', 'inspiring'].map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Search button */}
            <Button onClick={handleSearchMusic} disabled={searchingMusic} variant="outline" className="w-full gap-2">
              {searchingMusic ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searchingMusic ? 'Suche...' : 'Musik suchen'}
            </Button>

            {/* Music results */}
            {musicResults.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {musicResults.map((track) => (
                  <div
                    key={track.id}
                    className={`flex items-center gap-3 p-2 rounded-md border text-sm cursor-pointer transition-colors ${
                      music.trackUrl === track.audioUrl
                        ? 'border-primary bg-primary/10'
                        : 'border-border/40 hover:bg-muted/30'
                    }`}
                    onClick={() => selectTrack(track)}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMusicPreview(track);
                      }}
                    >
                      {musicPlaying === track.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-xs">{track.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{track.artist} · {Math.round(track.duration)}s</p>
                    </div>
                    {music.trackUrl === track.audioUrl && (
                      <span className="text-[10px] text-primary shrink-0">✓</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Selected track info */}
            {music.trackName && (
              <p className="text-[10px] text-emerald-400">♫ {music.trackName}</p>
            )}

            {/* Volume */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-xs flex items-center gap-1">
                  <Volume2 className="h-3 w-3" /> Lautstärke
                </Label>
                <span className="text-xs text-muted-foreground">{music.volume}%</span>
              </div>
              <Slider
                value={[music.volume]}
                onValueChange={([v]) => onUpdateAssembly({ music: { ...music, volume: v } })}
                min={0}
                max={100}
                step={5}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Beat Sync */}
      <Card className="border-border/40 bg-card/80">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Beat-Sync</p>
                <p className="text-[10px] text-muted-foreground">Schnitte automatisch auf Beats ausrichten</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {music?.trackUrl && !assemblyConfig.beatSync && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleBeatSync} disabled={analyzingBeats}>
                  {analyzingBeats ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  Analysieren
                </Button>
              )}
              <Switch
                checked={assemblyConfig.beatSync}
                onCheckedChange={(v) => onUpdateAssembly({ beatSync: v })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onGoToExport} className="gap-2">
          Weiter zum Export <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
