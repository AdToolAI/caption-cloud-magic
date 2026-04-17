import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { ArrowRight, Loader2, Music, Pause, Play, Search, Upload, UploadCloud, Volume2, X, Zap } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import type { AssemblyConfig, ComposerScene } from '@/types/video-composer';

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
  const { t } = useTranslation();
  const music = assemblyConfig.music;

  // Music state
  const [searchingMusic, setSearchingMusic] = useState(false);
  const [musicResults, setMusicResults] = useState<MusicTrack[]>([]);
  const [musicPlaying, setMusicPlaying] = useState<string | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  // Beat sync state
  const [analyzingBeats, setAnalyzingBeats] = useState(false);

  // Search background music
  const handleSearchMusic = async () => {
    if (!music) return;
    setSearchingMusic(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-stock-music', {
        body: { query: `${music.genre} ${music.mood}`, mood: music.mood, genre: music.genre },
      });
      if (error) throw error;
      const tracks: MusicTrack[] = (data?.results || []).map((tr: any) => ({
        id: tr.id || tr.source_id,
        name: tr.name || tr.title,
        artist: tr.artist_name || tr.artist || 'Unknown',
        duration: tr.duration || 0,
        audioUrl: tr.audio || tr.audiodownload || tr.preview_url || '',
        genre: music.genre,
        mood: music.mood,
      }));
      setMusicResults(tracks);
      if (tracks.length === 0) {
        toast({ title: t('videoComposer.noMusicResults'), description: t('videoComposer.tryOtherCombo') });
      }
    } catch (err: any) {
      toast({ title: t('videoComposer.musicSearchError'), description: err.message, variant: 'destructive' });
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
    toast({ title: t('videoComposer.trackSelected'), description: track.name });
  };

  // Beat sync analysis
  const handleBeatSync = async () => {
    if (!music?.trackUrl) {
      toast({ title: t('videoComposer.noMusicSelected'), variant: 'destructive' });
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
        title: `${t('videoComposer.beatSyncEnabled')} (${data?.bpm || 120} BPM)`,
        description: `${data?.transitionPoints?.length || 0} ${t('videoComposer.transitionPoints')}`,
      });
    } catch (err: any) {
      toast({ title: t('videoComposer.beatAnalysisFailed'), description: err.message, variant: 'destructive' });
    } finally {
      setAnalyzingBeats(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Background Music */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Music className="h-4 w-4 text-primary" /> {t('videoComposer.backgroundMusic')}
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
                <Label className="text-xs">{t('videoComposer.genre')}</Label>
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
                <Label className="text-xs">{t('videoComposer.mood')}</Label>
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

            <Button onClick={handleSearchMusic} disabled={searchingMusic} variant="outline" className="w-full gap-2">
              {searchingMusic ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searchingMusic ? t('videoComposer.searching') : t('videoComposer.searchMusic')}
            </Button>

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
                      variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                      onClick={(e) => { e.stopPropagation(); toggleMusicPreview(track); }}
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

            {music.trackName && (
              <p className="text-[10px] text-emerald-400">♫ {music.trackName}</p>
            )}

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-xs flex items-center gap-1">
                  <Volume2 className="h-3 w-3" /> {t('videoComposer.volume')}
                </Label>
                <span className="text-xs text-muted-foreground">{music.volume}%</span>
              </div>
              <Slider
                value={[music.volume]}
                onValueChange={([v]) => onUpdateAssembly({ music: { ...music, volume: v } })}
                min={0} max={100} step={5}
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
                <p className="text-sm font-medium">{t('videoComposer.beatSync')}</p>
                <p className="text-[10px] text-muted-foreground">{t('videoComposer.beatSyncDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {music?.trackUrl && !assemblyConfig.beatSync && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleBeatSync} disabled={analyzingBeats}>
                  {analyzingBeats ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  {t('videoComposer.analyze')}
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
          {t('videoComposer.continueToExport')} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
