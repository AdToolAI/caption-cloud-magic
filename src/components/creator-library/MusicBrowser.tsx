/**
 * MusicBrowser — curated royalty-free music search (Jamendo via
 * `search-stock-music`). This is the library counterpart to AI-Music-
 * Generation (which stays in /music-studio). Inline-Play, Save to
 * `user_audio_library`, "Use in Composer/DC" via sessionStorage.
 */
import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Play, Pause, Heart, Search, Music2, ArrowUpRightFromSquare } from 'lucide-react';
import { useStockMusicSearch, type StockMusicTrack } from '@/hooks/useStockMusicSearch';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { LicenseButton } from '@/components/licensing/LicenseButton';
import { useDownloadQuota } from '@/hooks/useDownloadQuota';

const MOODS = ['all', 'energetisch', 'entspannt', 'fröhlich', 'dramatisch', 'romantisch', 'traurig'];
const GENRES = ['all', 'pop', 'rock', 'elektronisch', 'klassisch', 'jazz', 'hip hop', 'ambient'];

function formatDuration(sec: number): string {
  if (!sec) return '–';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function MusicBrowser() {
  const { user } = useAuth();
  const quota = useDownloadQuota();
  const { results, loading, search } = useStockMusicSearch();
  const [query, setQuery] = useState('');
  const [mood, setMood] = useState('all');
  const [genre, setGenre] = useState('all');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    search({ query: '', mood: 'entspannt', genre: 'all' });
    if (user) loadFavorites();
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadFavorites() {
    if (!user) return;
    const { data } = await supabase
      .from('user_audio_library')
      .select('external_id')
      .eq('user_id', user.id)
      .eq('asset_type', 'stock_music');
    if (data) setFavorites(new Set(data.map((r: any) => r.external_id)));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    search({ query, mood, genre });
  }

  function togglePlay(track: StockMusicTrack) {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(track.preview_url);
    audio.volume = 0.7;
    audio.onended = () => setPlayingId(null);
    audio.play().catch(() => toast({ title: 'Preview nicht abspielbar', variant: 'destructive' }));
    audioRef.current = audio;
    setPlayingId(track.id);
  }

  async function toggleFavorite(track: StockMusicTrack) {
    if (!user) {
      toast({ title: 'Login nötig' });
      return;
    }
    if (favorites.has(track.id)) {
      await supabase
        .from('user_audio_library')
        .delete()
        .eq('user_id', user.id)
        .eq('asset_type', 'stock_music')
        .eq('external_id', track.id);
      favorites.delete(track.id);
      setFavorites(new Set(favorites));
      return;
    }
    if (quota.exceeded) {
      toast({
        title: 'Monatslimit erreicht',
        description: 'Upgrade für unbegrenzte Downloads.',
        variant: 'destructive',
      });
      return;
    }
    const { error } = await supabase.from('user_audio_library').insert({
      user_id: user.id,
      asset_type: 'stock_music',
      external_id: track.id,
      source: 'jamendo',
      title: track.title,
      artist: track.artist,
      duration_sec: track.duration,
      thumbnail_url: track.thumbnail,
      preview_url: track.preview_url,
      download_url: track.url,
      tags: track.tags,
      metadata: { genre: track.genre, mood: track.mood, bpm: track.bpm },
    } as any);
    if (error) {
      toast({ title: 'Speichern fehlgeschlagen', description: error.message, variant: 'destructive' });
      return;
    }
    setFavorites(new Set([...favorites, track.id]));
    quota.refresh();
    toast({ title: 'Zur Library hinzugefügt' });
  }

  function useIn(target: 'composer' | 'directors-cut', track: StockMusicTrack) {
    const key = target === 'composer' ? 'composer:incoming-music' : 'directors-cut:incoming-music';
    sessionStorage.setItem(
      key,
      JSON.stringify({
        url: track.url,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        source: 'jamendo',
      }),
    );
    window.location.href = target === 'composer' ? '/video-composer' : '/universal-directors-cut';
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche nach Music (z.B. beach, epic, lofi)…"
            className="pl-9"
          />
        </div>
        <Select value={mood} onValueChange={setMood}>
          <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Mood" /></SelectTrigger>
          <SelectContent>
            {MOODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={genre} onValueChange={setGenre}>
          <SelectTrigger className="w-full sm:w-[140px]"><SelectValue placeholder="Genre" /></SelectTrigger>
          <SelectContent>
            {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Suchen'}
        </Button>
      </form>

      {loading && results.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Lade Tracks …
        </Card>
      ) : results.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Keine Tracks gefunden. Tipp: andere Mood + Genre Kombination probieren.
        </Card>
      ) : (
        <div className="space-y-2">
          {results.map((t) => {
            const isPlaying = playingId === t.id;
            const isFav = favorites.has(t.id);
            return (
              <Card key={t.id} className="p-3 flex items-center gap-3 hover:border-primary/40 transition-colors">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-9 w-9 shrink-0"
                  onClick={() => togglePlay(t)}
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
                </Button>
                {t.thumbnail ? (
                  <img src={t.thumbnail} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded bg-muted/40 flex items-center justify-center shrink-0">
                    <Music2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {t.artist} · {formatDuration(t.duration)} · {t.genre} · {t.mood}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleFavorite(t)}>
                    <Heart className={`h-3.5 w-3.5 ${isFav ? 'fill-current text-rose-400' : ''}`} />
                  </Button>
                  <LicenseButton
                    asset_type="stock_music"
                    asset_id={t.id}
                    asset_title={t.title}
                    asset_thumbnail_url={t.thumbnail}
                    asset_source_url={t.url}
                    source_provider="jamendo-music"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    label=""
                  />
                  <Button size="sm" variant="outline" className="h-8" onClick={() => useIn('composer', t)}>
                    Composer
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => useIn('directors-cut', t)}>
                    DC
                  </Button>
                  <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                    <a href={t.url} target="_blank" rel="noreferrer" title="Download">
                      <ArrowUpRightFromSquare className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
                {(t.tags ?? []).slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[9px] hidden lg:inline-flex">
                    {tag}
                  </Badge>
                ))}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
