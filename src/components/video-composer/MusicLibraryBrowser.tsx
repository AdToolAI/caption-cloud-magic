import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Pause, Play, Search, Star, Music as MusicIcon, Wand2, Library, Volume2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';

export type LibraryAssetType = 'music' | 'sfx' | 'voice';

export interface LibraryTrack {
  id: string;            // unique key for UI
  externalId?: string | null;
  title: string;
  artist: string;
  duration: number;
  url: string;
  source: string;        // jamendo | pixabay_sfx | upload | fallback
  type: LibraryAssetType;
  mood?: string;
  genre?: string;
  tags?: string[];
  isFavorite?: boolean;
  thumbnailUrl?: string | null;
}

interface MusicLibraryBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Filter the library to a specific asset type. Defaults to 'music'. */
  initialType?: LibraryAssetType;
  /** Hide tabs the user shouldn't see (e.g. only 'sfx' when adding SFX to a scene). */
  allowedTypes?: LibraryAssetType[];
  /** Called when the user selects (clicks) a track. */
  onSelect: (track: LibraryTrack) => void;
}

interface QuickMood {
  id: string;
  labelKey: string;
  fallback: string;
  query: string;
  emoji: string;
}

const QUICK_MOODS: QuickMood[] = [
  { id: 'cinematic', labelKey: 'videoComposer.audio.moods.cinematic', fallback: 'Cinematic', query: 'cinematic epic', emoji: '🎬' },
  { id: 'corporate', labelKey: 'videoComposer.audio.moods.corporate', fallback: 'Corporate', query: 'corporate inspiring', emoji: '💼' },
  { id: 'upbeat', labelKey: 'videoComposer.audio.moods.upbeat', fallback: 'Upbeat', query: 'upbeat happy energetic', emoji: '⚡' },
  { id: 'dramatic', labelKey: 'videoComposer.audio.moods.dramatic', fallback: 'Dramatic', query: 'dramatic tension', emoji: '🎭' },
  { id: 'calm', labelKey: 'videoComposer.audio.moods.calm', fallback: 'Calm', query: 'calm ambient relaxing', emoji: '🌊' },
  { id: 'trailer', labelKey: 'videoComposer.audio.moods.trailer', fallback: 'Trailer', query: 'trailer epic powerful', emoji: '🍿' },
  { id: 'vlog', labelKey: 'videoComposer.audio.moods.vlog', fallback: 'Vlog', query: 'vlog lofi chill', emoji: '📹' },
  { id: 'beach', labelKey: 'videoComposer.audio.moods.beach', fallback: 'Beach', query: 'tropical summer beach', emoji: '🏖️' },
];

const SFX_CATEGORIES = [
  { id: 'whoosh', label: 'Whoosh', emoji: '💨' },
  { id: 'impact', label: 'Impact', emoji: '💥' },
  { id: 'click', label: 'Click', emoji: '🔘' },
  { id: 'transition', label: 'Transition', emoji: '➡️' },
  { id: 'ui', label: 'UI', emoji: '🖱️' },
  { id: 'cinematic', label: 'Cinematic', emoji: '🎬' },
];

export default function MusicLibraryBrowser({
  open,
  onOpenChange,
  initialType = 'music',
  allowedTypes = ['music', 'sfx', 'voice'],
  onSelect,
}: MusicLibraryBrowserProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<LibraryAssetType | 'library'>(initialType);
  const [query, setQuery] = useState('');
  const [activeMood, setActiveMood] = useState<string | null>(null);
  const [activeSfxCat, setActiveSfxCat] = useState<string | null>(null);
  const [results, setResults] = useState<LibraryTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop audio on close
  useEffect(() => {
    if (!open) {
      audioRef.current?.pause();
      setPlaying(null);
    }
  }, [open]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // ─── Library (favorites) ────────────────────────────────────────────────
  const libraryQuery = useQuery({
    queryKey: ['user-audio-library'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as LibraryTrack[];
      const { data, error } = await supabase
        .from('user_audio_library')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((row: any): LibraryTrack => ({
        id: `lib-${row.id}`,
        externalId: row.external_id,
        title: row.title,
        artist: row.artist || row.source,
        duration: row.duration_sec || 0,
        url: row.url,
        source: row.source,
        type: row.type,
        mood: row.mood,
        genre: row.genre,
        tags: row.tags || [],
        isFavorite: !!row.is_favorite,
        thumbnailUrl: row.thumbnail_url,
      }));
    },
    enabled: open,
    staleTime: 30_000,
  });

  // ─── Search Stock Music (Jamendo) ───────────────────────────────────────
  const searchMusic = async (q: string, mood?: string) => {
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-stock-music', {
        body: {
          query: q || mood || 'background music',
          ...(mood && { mood }),
        },
      });
      if (error) throw error;
      const tracks: LibraryTrack[] = (data?.results || []).map((tr: any) => ({
        id: `stock-${tr.id || tr.source_id}`,
        externalId: String(tr.id || tr.source_id || ''),
        title: tr.name || tr.title || 'Untitled',
        artist: tr.artist_name || tr.artist || 'Unknown',
        duration: tr.duration || 0,
        url: tr.audio || tr.audiodownload || tr.preview_url || '',
        source: 'jamendo',
        type: 'music' as const,
        mood,
        thumbnailUrl: tr.image || null,
      })).filter((tr: LibraryTrack) => !!tr.url);
      setResults(tracks);
      if (tracks.length === 0) {
        toast({ title: t('videoComposer.noMusicResults'), description: t('videoComposer.tryOtherCombo') });
      }
    } catch (err: any) {
      toast({ title: t('videoComposer.musicSearchError'), description: err.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  // ─── Search SFX ─────────────────────────────────────────────────────────
  const searchSfx = async (q: string, category?: string) => {
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-stock-sfx', {
        body: { query: q, category, limit: 24 },
      });
      if (error) throw error;
      const tracks: LibraryTrack[] = (data?.results || []).map((tr: any) => ({
        id: `sfx-${tr.id}`,
        externalId: String(tr.id),
        title: tr.title,
        artist: tr.artist,
        duration: tr.duration || 0,
        url: tr.preview_url || tr.download_url,
        source: tr.source === 'pixabay' ? 'pixabay_sfx' : 'fallback',
        type: 'sfx' as const,
        tags: tr.tags || [],
      })).filter((tr: LibraryTrack) => !!tr.url);
      setResults(tracks);
      if (tracks.length === 0) {
        toast({ title: 'No SFX found', description: 'Try a different keyword or category' });
      }
    } catch (err: any) {
      toast({ title: 'SFX search failed', description: err.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  // Auto-search defaults when tab opens
  useEffect(() => {
    if (!open) return;
    setResults([]);
    if (tab === 'music' && !query && !activeMood) {
      // intentionally empty — user picks mood
    } else if (tab === 'sfx' && !query && !activeSfxCat) {
      searchSfx('', 'whoosh');
      setActiveSfxCat('whoosh');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  const handleSearch = () => {
    if (tab === 'music') searchMusic(query, activeMood || undefined);
    else if (tab === 'sfx') searchSfx(query, activeSfxCat || undefined);
  };

  const handleMoodClick = (mood: QuickMood) => {
    setActiveMood(mood.id);
    setQuery(mood.query);
    searchMusic(mood.query, mood.id);
  };

  const handleSfxCatClick = (cat: typeof SFX_CATEGORIES[number]) => {
    setActiveSfxCat(cat.id);
    setQuery('');
    searchSfx('', cat.id);
  };

  // ─── Preview playback ───────────────────────────────────────────────────
  const togglePreview = (track: LibraryTrack) => {
    if (playing === track.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    audioRef.current = new Audio(track.url);
    audioRef.current.volume = 0.7;
    audioRef.current.onended = () => setPlaying(null);
    audioRef.current.play().catch(() => setPlaying(null));
    setPlaying(track.id);
  };

  // ─── Favorites ─────────────────────────────────────────────────────────
  const favoriteMutation = useMutation({
    mutationFn: async (track: LibraryTrack) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      // Check existing
      const { data: existing } = await supabase
        .from('user_audio_library')
        .select('id, is_favorite')
        .eq('user_id', user.id)
        .eq('external_id', track.externalId || track.id)
        .eq('source', track.source)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('user_audio_library')
          .update({ is_favorite: !existing.is_favorite })
          .eq('id', existing.id);
        if (error) throw error;
        return !existing.is_favorite;
      }
      const { error } = await supabase.from('user_audio_library').insert({
        user_id: user.id,
        type: track.type,
        title: track.title,
        artist: track.artist,
        source: track.source,
        external_id: track.externalId || track.id,
        url: track.url,
        duration_sec: Math.round(track.duration),
        mood: track.mood,
        genre: track.genre,
        tags: track.tags || [],
        thumbnail_url: track.thumbnailUrl,
        is_favorite: true,
      });
      if (error) throw error;
      return true;
    },
    onSuccess: (isFav) => {
      queryClient.invalidateQueries({ queryKey: ['user-audio-library'] });
      toast({ title: isFav ? t('videoComposer.audio.saved') || 'Saved to library' : 'Removed' });
    },
    onError: (err: any) => {
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
    },
  });

  const isFavorite = (track: LibraryTrack) => {
    const lib = libraryQuery.data || [];
    return lib.some((l) => (l.externalId || l.id) === (track.externalId || track.id) && l.source === track.source);
  };

  const visibleTabs = useMemo(() => allowedTypes, [allowedTypes]);

  const renderTrackCard = (track: LibraryTrack) => {
    const fav = isFavorite(track);
    return (
      <div
        key={track.id}
        className="group flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/60 hover:bg-card hover:border-primary/40 transition-colors cursor-pointer"
        onClick={() => onSelect(track)}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full bg-primary/10 hover:bg-primary/20"
          onClick={(e) => { e.stopPropagation(); togglePreview(track); }}
        >
          {playing === track.id ? <Pause className="h-4 w-4 text-primary" /> : <Play className="h-4 w-4 text-primary" />}
        </Button>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{track.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {track.artist}
            {track.duration > 0 && <span className="ml-2">· {Math.round(track.duration)}s</span>}
            {track.mood && <span className="ml-2">· {track.mood}</span>}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); favoriteMutation.mutate(track); }}
          disabled={favoriteMutation.isPending}
          title={fav ? 'Remove from library' : 'Save to library'}
        >
          <Star className={`h-4 w-4 ${fav ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MusicIcon className="h-5 w-5 text-primary" />
            {t('videoComposer.audio.libraryTitle') || 'Music & SFX Library'}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setResults([]); setQuery(''); setActiveMood(null); setActiveSfxCat(null); }} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start">
            {visibleTabs.includes('music') && (
              <TabsTrigger value="music" className="gap-2">
                <MusicIcon className="h-4 w-4" /> {t('videoComposer.audio.tabs.stock') || 'Stock Music'}
              </TabsTrigger>
            )}
            {visibleTabs.includes('sfx') && (
              <TabsTrigger value="sfx" className="gap-2">
                <Volume2 className="h-4 w-4" /> {t('videoComposer.audio.tabs.sfx') || 'SFX'}
              </TabsTrigger>
            )}
            <TabsTrigger value="library" className="gap-2">
              <Library className="h-4 w-4" /> {t('videoComposer.audio.tabs.library') || 'My Library'}
              {libraryQuery.data?.length ? <Badge variant="secondary" className="ml-1 h-5">{libraryQuery.data.length}</Badge> : null}
            </TabsTrigger>
          </TabsList>

          {/* ── Stock Music ── */}
          <TabsContent value="music" className="flex-1 overflow-hidden flex flex-col mt-3 space-y-3">
            {/* Mood quick picks */}
            <div className="grid grid-cols-4 gap-2">
              {QUICK_MOODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleMoodClick(m)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-all ${
                    activeMood === m.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/40 hover:border-primary/40 hover:bg-card'
                  }`}
                >
                  <span className="text-lg leading-none">{m.emoji}</span>
                  <span className="font-medium">{t(m.labelKey) || m.fallback}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="z.B. Lofi Chill, Hans Zimmer, Beach..."
                className="bg-background/50"
              />
              <Button onClick={handleSearch} disabled={searching} className="gap-2 shrink-0">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            <ScrollArea className="flex-1 -mr-2 pr-2">
              <div className="space-y-2">
                {results.length === 0 && !searching && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {t('videoComposer.audio.pickMoodHint') || 'Pick a mood or search to discover tracks'}
                  </div>
                )}
                {results.map(renderTrackCard)}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── SFX ── */}
          <TabsContent value="sfx" className="flex-1 overflow-hidden flex flex-col mt-3 space-y-3">
            <div className="grid grid-cols-6 gap-2">
              {SFX_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSfxCatClick(c)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-all ${
                    activeSfxCat === c.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/40 hover:border-primary/40 hover:bg-card'
                  }`}
                >
                  <span className="text-base leading-none">{c.emoji}</span>
                  <span className="font-medium">{c.label}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="whoosh, ding, applause..."
                className="bg-background/50"
              />
              <Button onClick={handleSearch} disabled={searching} className="gap-2 shrink-0">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            <ScrollArea className="flex-1 -mr-2 pr-2">
              <div className="space-y-2">
                {searching && (
                  <div className="text-center py-8"><Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" /></div>
                )}
                {results.map(renderTrackCard)}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── My Library ── */}
          <TabsContent value="library" className="flex-1 overflow-hidden flex flex-col mt-3">
            <ScrollArea className="flex-1 -mr-2 pr-2">
              <div className="space-y-2">
                {libraryQuery.isLoading && <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />}
                {libraryQuery.data?.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    <Star className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {t('videoComposer.audio.emptyLibrary') || 'Save tracks via the star icon to build your library'}
                  </div>
                )}
                {(libraryQuery.data || []).map(renderTrackCard)}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
