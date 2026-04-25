import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { ArrowRight, Library, Loader2, Music, Pause, Play, Search, Upload, UploadCloud, Volume2, X, Zap } from 'lucide-react';
import MusicLibraryBrowser, { type LibraryTrack } from './MusicLibraryBrowser';
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
  const [musicQuery, setMusicQuery] = useState('');
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  // Beat sync state
  const [analyzingBeats, setAnalyzingBeats] = useState(false);

  // Library browser
  const [libraryOpen, setLibraryOpen] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLibrarySelect = useCallback((track: LibraryTrack) => {
    if (!music) return;
    musicAudioRef.current?.pause();
    setMusicPlaying(null);
    onUpdateAssembly({
      music: {
        ...music,
        trackUrl: track.url,
        trackName: `${track.title} — ${track.artist}`,
        isUpload: false,
        ...(track.mood && { mood: track.mood }),
        ...(track.genre && { genre: track.genre }),
      },
    });
    setLibraryOpen(false);
    toast({ title: t('videoComposer.trackSelected'), description: track.title });
  }, [music, onUpdateAssembly, t]);

  // Handle music file upload
  const handleMusicUpload = useCallback(async (file: File | null) => {
    if (!file || !music) return;

    if (!file.type.startsWith('audio/')) {
      toast({ title: t('videoComposer.musicUploadError'), description: 'Audio only', variant: 'destructive' });
      return;
    }

    const MAX_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_SIZE) {
      toast({ title: t('videoComposer.musicTooLarge'), variant: 'destructive' });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    // Simulated progress
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => (prev >= 90 ? prev : prev + 10));
    }, 200);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const ext = file.name.split('.').pop() || 'mp3';
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${user.id}/${Date.now()}_${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from('background-music')
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage
        .from('background-music')
        .getPublicUrl(path);

      // Stop any preview playback
      musicAudioRef.current?.pause();
      setMusicPlaying(null);

      onUpdateAssembly({
        music: { ...music, trackUrl: publicUrl, trackName: file.name, isUpload: true },
      });

      setUploadProgress(100);
      toast({ title: t('videoComposer.musicUploaded'), description: file.name });
    } catch (err: any) {
      toast({ title: t('videoComposer.musicUploadError'), description: err.message, variant: 'destructive' });
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [music, onUpdateAssembly, t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleMusicUpload(file);
  }, [handleMusicUpload]);

  const handleRemoveUpload = useCallback(() => {
    if (!music) return;
    musicAudioRef.current?.pause();
    setMusicPlaying(null);
    onUpdateAssembly({
      music: { ...music, trackUrl: '', trackName: '', isUpload: false },
    });
  }, [music, onUpdateAssembly]);

  // Search background music
  const handleSearchMusic = async () => {
    if (!music) return;
    const trimmedQuery = musicQuery.trim();
    const hasGenre = !!music.genre;
    const hasMood = !!music.mood;

    if (!trimmedQuery && !hasGenre && !hasMood) {
      toast({
        title: t('videoComposer.musicSearchError'),
        description: t('videoComposer.musicSearchHint'),
        variant: 'destructive',
      });
      return;
    }

    setSearchingMusic(true);
    try {
      const effectiveQuery = trimmedQuery || [music.genre, music.mood].filter(Boolean).join(' ');
      const { data, error } = await supabase.functions.invoke('search-stock-music', {
        body: {
          query: effectiveQuery,
          ...(hasGenre && { genre: music.genre }),
          ...(hasMood && { mood: music.mood }),
        },
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
                    ? { enabled: true, trackUrl: '', trackName: '', genre: '', mood: '', volume: 30, isUpload: false }
                    : null,
                })
              }
            />
          </div>
        </CardHeader>
        {music?.enabled && (
          <CardContent className="space-y-4">
            {/* Free-text search */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Search className="h-3 w-3" /> {t('videoComposer.musicSearchLabel') || 'Suchen (Titel, Künstler, Stichwort)'}
              </Label>
              <Input
                value={musicQuery}
                onChange={(e) => setMusicQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearchMusic();
                  }
                }}
                placeholder={t('videoComposer.musicSearchPlaceholder') || 'z.B. Beach Sunset, Lofi Chill, Hans Zimmer...'}
                className="bg-background/50 h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                {t('videoComposer.musicSearchHint') || 'Leer lassen, um nach Genre + Stimmung zu suchen.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('videoComposer.genre')}</Label>
                <Select
                  value={music.genre || '__any__'}
                  onValueChange={(v) => onUpdateAssembly({ music: { ...music, genre: v === '__any__' ? '' : v } })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder={t('videoComposer.anyOption')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">{t('videoComposer.anyOption')}</SelectItem>
                    {['electronic', 'cinematic', 'corporate', 'pop', 'ambient', 'hip-hop'].map((g) => (
                      <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('videoComposer.mood')}</Label>
                <Select
                  value={music.mood || '__any__'}
                  onValueChange={(v) => onUpdateAssembly({ music: { ...music, mood: v === '__any__' ? '' : v } })}
                >
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder={t('videoComposer.anyOption')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">{t('videoComposer.anyOption')}</SelectItem>
                    {['energetic', 'calm', 'dramatic', 'happy', 'dark', 'inspiring'].map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleSearchMusic} disabled={searchingMusic} variant="outline" className="w-full gap-2">
              {searchingMusic ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searchingMusic ? t('videoComposer.searching') : (musicQuery.trim() ? t('videoComposer.searchByQuery', { query: musicQuery.trim() }) : t('videoComposer.searchMusic'))}
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

            {/* Divider + Upload own music */}
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t('videoComposer.orDivider')}
                </span>
              </div>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-border/40 hover:border-primary/40'
              } ${uploading ? 'pointer-events-none opacity-70' : 'cursor-pointer'}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a"
                disabled={uploading}
                onChange={(e) => handleMusicUpload(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              {uploading ? (
                <div className="space-y-2">
                  <UploadCloud className="h-6 w-6 mx-auto text-primary animate-pulse" />
                  <Progress value={uploadProgress} className="max-w-xs mx-auto h-1.5" />
                  <p className="text-[10px] text-muted-foreground">{uploadProgress}%</p>
                </div>
              ) : (
                <>
                  <Upload className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-xs font-medium">{t('videoComposer.uploadOwnMusic')}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t('videoComposer.musicFormats')}</p>
                </>
              )}
            </div>

            {music.trackName && (
              <div className={`flex items-center gap-2 p-2 rounded-md border ${
                music.isUpload ? 'border-primary/40 bg-primary/5' : 'border-border/40 bg-muted/20'
              }`}>
                {music.isUpload && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[9px] font-semibold uppercase tracking-wider">
                    <Upload className="h-2.5 w-2.5" />
                    {t('videoComposer.uploadedTrack')}
                  </span>
                )}
                <p className="flex-1 truncate text-[11px] text-foreground">
                  ♫ {music.trackName}
                </p>
                {music.isUpload && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={handleRemoveUpload}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
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
