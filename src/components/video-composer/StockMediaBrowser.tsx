import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, Star, Image as ImageIcon, Video as VideoIcon, Library, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';
import type { StockMediaSource } from '@/types/video-composer';

export type StockMediaType = 'video' | 'image';

export interface StockMediaItem {
  id: string;            // unique key
  externalId?: string | null;
  type: StockMediaType;
  source: StockMediaSource | 'upload';
  url: string;
  thumbnailUrl?: string | null;
  width?: number;
  height?: number;
  durationSec?: number;
  authorName?: string;
  authorUrl?: string;
  isFavorite?: boolean;
  category?: string;
}

interface StockMediaBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType?: StockMediaType;
  /** Aspect filter (from briefing) — '16:9' | '9:16' | '1:1' | '4:5' */
  preferredAspect?: '16:9' | '9:16' | '1:1' | '4:5';
  onSelect: (item: StockMediaItem) => void;
}

interface QuickCategory {
  id: string;
  labelKey: string;
  fallback: string;
  query: string;
  emoji: string;
}

const QUICK_CATEGORIES: QuickCategory[] = [
  { id: 'business', labelKey: 'videoComposer.stock.categories.business', fallback: 'Business', query: 'business meeting office', emoji: '💼' },
  { id: 'nature', labelKey: 'videoComposer.stock.categories.nature', fallback: 'Nature', query: 'nature landscape forest', emoji: '🌲' },
  { id: 'lifestyle', labelKey: 'videoComposer.stock.categories.lifestyle', fallback: 'Lifestyle', query: 'lifestyle people happy', emoji: '✨' },
  { id: 'tech', labelKey: 'videoComposer.stock.categories.tech', fallback: 'Tech', query: 'technology computer code', emoji: '💻' },
  { id: 'city', labelKey: 'videoComposer.stock.categories.city', fallback: 'City', query: 'city urban skyline', emoji: '🏙️' },
  { id: 'food', labelKey: 'videoComposer.stock.categories.food', fallback: 'Food', query: 'food cooking restaurant', emoji: '🍽️' },
  { id: 'sport', labelKey: 'videoComposer.stock.categories.sport', fallback: 'Sport', query: 'sport fitness training', emoji: '🏃' },
  { id: 'abstract', labelKey: 'videoComposer.stock.categories.abstract', fallback: 'Abstract', query: 'abstract motion gradient', emoji: '🎨' },
];

function aspectMatches(width: number | undefined, height: number | undefined, aspect?: string): boolean {
  if (!aspect || !width || !height) return true;
  const ratio = width / height;
  switch (aspect) {
    case '9:16': return ratio < 0.85;          // portrait
    case '16:9': return ratio > 1.5;           // landscape
    case '1:1':  return ratio >= 0.85 && ratio <= 1.15;
    case '4:5':  return ratio >= 0.7 && ratio <= 0.9;
    default:     return true;
  }
}

export default function StockMediaBrowser({
  open,
  onOpenChange,
  initialType = 'video',
  preferredAspect,
  onSelect,
}: StockMediaBrowserProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<StockMediaType | 'library'>(initialType);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [aspectFilter, setAspectFilter] = useState<boolean>(true);

  useEffect(() => {
    if (open) setTab(initialType);
  }, [open, initialType]);

  // Debounce search input
  useEffect(() => {
    const tm = setTimeout(() => setDebouncedQuery(query), 500);
    return () => clearTimeout(tm);
  }, [query]);

  // Search Pixabay/Pexels via existing edge functions
  const searchQuery = useQuery({
    queryKey: ['stock-media', tab, debouncedQuery],
    queryFn: async () => {
      if (tab === 'library' || !debouncedQuery) return { items: [] as StockMediaItem[] };
      const fn = tab === 'video' ? 'search-stock-videos' : 'search-stock-images';
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { query: debouncedQuery, perPage: 30 },
      });
      if (error) throw error;
      const raw = tab === 'video' ? (data?.videos || []) : (data?.images || []);
      const items: StockMediaItem[] = raw.map((it: any) => ({
        id: String(it.id),
        externalId: String(it.id).replace(/^(pixabay|pexels)-/, ''),
        type: tab,
        source: String(it.id).startsWith('pixabay') ? 'pixabay' : 'pexels',
        url: it.url,
        thumbnailUrl: it.thumbnail_url,
        width: it.width,
        height: it.height,
        durationSec: it.duration_sec,
        authorName: it.user?.name,
        authorUrl: it.user?.url,
      }));
      return { items };
    },
    enabled: open && tab !== 'library' && debouncedQuery.length > 1,
    staleTime: 5 * 60_000,
  });

  // My Library (saved favorites)
  const libraryQuery = useQuery({
    queryKey: ['user-media-library', initialType],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { items: [] as StockMediaItem[] };
      const { data, error } = await supabase
        .from('user_media_library')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const items: StockMediaItem[] = (data || []).map((row: any) => ({
        id: row.id,
        externalId: row.external_id,
        type: row.type,
        source: row.source,
        url: row.url,
        thumbnailUrl: row.thumbnail_url,
        width: row.width,
        height: row.height,
        durationSec: row.duration_sec,
        authorName: row.author_name,
        authorUrl: row.author_url,
        isFavorite: row.is_favorite,
        category: row.category,
      }));
      return { items };
    },
    enabled: open && tab === 'library',
  });

  const favoriteMutation = useMutation({
    mutationFn: async (item: StockMediaItem) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_media_library')
        .upsert({
          user_id: user.id,
          type: item.type,
          source: item.source,
          external_id: item.externalId || null,
          url: item.url,
          thumbnail_url: item.thumbnailUrl,
          width: item.width,
          height: item.height,
          duration_sec: item.durationSec,
          author_name: item.authorName,
          author_url: item.authorUrl,
          category: activeCategory,
          is_favorite: true,
        }, { onConflict: 'user_id,source,external_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-media-library'] });
      toast({ title: t('videoComposer.stock.saved') || 'Gespeichert in deiner Bibliothek' });
    },
    onError: (err) => toast({ title: 'Fehler beim Speichern', description: String(err), variant: 'destructive' }),
  });

  const items = tab === 'library'
    ? libraryQuery.data?.items || []
    : searchQuery.data?.items || [];

  const filteredItems = useMemo(() => {
    if (!aspectFilter || !preferredAspect) return items;
    return items.filter((it) => aspectMatches(it.width, it.height, preferredAspect));
  }, [items, aspectFilter, preferredAspect]);

  const isLoading = tab === 'library' ? libraryQuery.isLoading : searchQuery.isLoading;

  const handleCategoryClick = (cat: QuickCategory) => {
    setActiveCategory(cat.id);
    setQuery(cat.query);
  };

  const handleSelect = (item: StockMediaItem) => {
    onSelect(item);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col bg-card border-border">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg leading-none">🎁</span>
            <span>Free Stock Library</span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold uppercase tracking-wider border border-emerald-500/30">
              0 Credits
            </span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Pexels × Pixabay × Mixkit · 2M+ royalty-free Videos, Bilder, Musik & SFX — ohne Credit-Verbrauch
          </p>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-fit">
            <TabsTrigger value="video" className="gap-1.5">
              <VideoIcon className="h-3.5 w-3.5" />
              {t('videoComposer.stock.tabs.videos') || 'Videos'}
            </TabsTrigger>
            <TabsTrigger value="image" className="gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" />
              {t('videoComposer.stock.tabs.images') || 'Bilder'}
            </TabsTrigger>
            <TabsTrigger value="library" className="gap-1.5">
              <Library className="h-3.5 w-3.5" />
              {t('videoComposer.stock.tabs.library') || 'Meine Bibliothek'}
            </TabsTrigger>
          </TabsList>

          {tab !== 'library' && (
            <div className="space-y-3 mt-3">
              {/* Quick categories */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-all flex items-center gap-1 ${
                      activeCategory === cat.id
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border/40 bg-background/40 text-muted-foreground hover:border-border'
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    {t(cat.labelKey) || cat.fallback}
                  </button>
                ))}
              </div>

              {/* Search bar */}
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setActiveCategory(null); }}
                    placeholder={t('videoComposer.stock.searchPlaceholder') || 'Suche nach Stock-Medien…'}
                    className="pl-9 bg-background/50"
                  />
                </div>
                {preferredAspect && (
                  <Button
                    variant={aspectFilter ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAspectFilter(!aspectFilter)}
                    className="text-xs whitespace-nowrap"
                  >
                    {preferredAspect}
                  </Button>
                )}
              </div>
            </div>
          )}

          <TabsContent value={tab} className="flex-1 mt-3 overflow-hidden">
            <ScrollArea className="h-[calc(90vh-220px)]">
              {isLoading && (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  {t('common.loading') || 'Lädt…'}
                </div>
              )}

              {!isLoading && tab !== 'library' && !debouncedQuery && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm">
                  <Search className="h-8 w-8 mb-2 opacity-40" />
                  {t('videoComposer.stock.startSearchHint') || 'Wähle eine Kategorie oder suche oben…'}
                </div>
              )}

              {!isLoading && tab === 'library' && filteredItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm">
                  <Library className="h-8 w-8 mb-2 opacity-40" />
                  {t('videoComposer.stock.libraryEmpty') || 'Deine Bibliothek ist leer. Speichere Favoriten mit dem Stern.'}
                </div>
              )}

              {!isLoading && filteredItems.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pr-3">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="group relative aspect-video bg-muted/30 rounded-md overflow-hidden border border-border/40 hover:border-primary/60 transition-all cursor-pointer"
                      onClick={() => handleSelect(item)}
                    >
                      {item.type === 'video' ? (
                        <video
                          src={item.url}
                          poster={item.thumbnailUrl || undefined}
                          muted
                          loop
                          playsInline
                          onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                          onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src={item.thumbnailUrl || item.url}
                          alt={item.authorName || 'stock'}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      )}

                      {/* Favorite button */}
                      {tab !== 'library' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); favoriteMutation.mutate(item); }}
                          disabled={favoriteMutation.isPending}
                          className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-yellow-500/80 transition-all"
                          title={t('videoComposer.stock.favorite') || 'In Bibliothek speichern'}
                        >
                          <Star className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Duration badge */}
                      {item.durationSec && (
                        <Badge variant="secondary" className="absolute bottom-1.5 right-1.5 text-[10px] h-5 px-1.5 bg-black/70 text-white border-0">
                          {Math.round(item.durationSec)}s
                        </Badge>
                      )}

                      {/* Source attribution */}
                      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <Badge
                          variant="outline"
                          className={`text-[9px] h-4 px-1 border-0 capitalize text-white ${
                            item.source === 'pexels'
                              ? 'bg-teal-600/85'
                              : item.source === 'pixabay'
                                ? 'bg-emerald-600/85'
                                : 'bg-black/70'
                          }`}
                        >
                          {item.source}
                        </Badge>
                        {item.authorUrl && (
                          <a
                            href={item.authorUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[9px] text-white/80 hover:text-white flex items-center gap-0.5"
                          >
                            <ExternalLink className="h-2 w-2" />
                            {item.authorName?.slice(0, 12)}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <p className="text-[10px] text-muted-foreground/70 text-center pt-1">
          {t('videoComposer.stock.creditAttribution') || 'Stock-Medien von Pixabay & Pexels — kostenlos & royalty-free.'}
        </p>
      </DialogContent>
    </Dialog>
  );
}
