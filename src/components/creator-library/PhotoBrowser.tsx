/**
 * PhotoBrowser — Stock-Photos search tab inside Creator Library.
 * Uses existing `search-stock-images` edge function (Pexels + Pixabay,
 * 24h `stock_search_cache`). Saves favorites into `user_video_library`
 * with asset_type='stock_image' (we re-use the table because RLS +
 * download-quota counting are already wired there).
 */
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Heart, Download, ImagePlus } from 'lucide-react';
import { useStockImageSearch, type StockImage } from '@/hooks/useStockImageSearch';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { LicenseButton } from '@/components/licensing/LicenseButton';
import { useDownloadQuota } from '@/hooks/useDownloadQuota';

const QUICK_QUERIES = ['nature', 'business', 'lifestyle', 'food', 'technology', 'travel'];

export default function PhotoBrowser() {
  const { user } = useAuth();
  const quota = useDownloadQuota();
  const { results, loading, search } = useStockImageSearch();
  const [query, setQuery] = useState('nature');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    search('nature');
    if (user) loadFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadFavorites() {
    if (!user) return;
    const { data } = await supabase
      .from('user_video_library')
      .select('external_id, source')
      .eq('user_id', user.id)
      .eq('asset_type', 'stock_image');
    if (data) setFavorites(new Set(data.map((r: any) => `${r.source}-${r.external_id}`)));
  }

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) search(query);
    },
    [query, search],
  );

  async function toggleFavorite(img: StockImage) {
    if (!user) {
      toast({ title: 'Login nötig', description: 'Bitte einloggen, um zu speichern.' });
      return;
    }
    const key = `${img.source}-${img.id}`;
    if (favorites.has(key)) {
      await supabase
        .from('user_video_library')
        .delete()
        .eq('user_id', user.id)
        .eq('asset_type', 'stock_image')
        .eq('external_id', String(img.id))
        .eq('source', img.source);
      favorites.delete(key);
      setFavorites(new Set(favorites));
      return;
    }
    if (quota.exceeded) {
      toast({
        title: 'Monatslimit erreicht',
        description: 'Upgrade auf einen Paid-Plan für unbegrenzte Downloads.',
        variant: 'destructive',
      });
      return;
    }
    const { error } = await supabase.from('user_video_library').insert({
      user_id: user.id,
      asset_type: 'stock_image',
      external_id: String(img.id),
      source: img.source,
      title: `Photo by ${img.user.name}`,
      thumbnail_url: img.thumbnail_url,
      preview_url: img.url,
      download_url: img.url,
      width: img.width,
      height: img.height,
      tags: [],
      metadata: { photographer: img.user.name, source_url: img.user.url },
    } as any);
    if (error) {
      toast({ title: 'Speichern fehlgeschlagen', description: error.message, variant: 'destructive' });
      return;
    }
    setFavorites(new Set([...favorites, key]));
    quota.refresh();
    toast({ title: 'Zur Library hinzugefügt', description: 'Lizenz-Zertifikat kann jetzt erzeugt werden.' });
  }

  function useInPictureStudio(img: StockImage) {
    sessionStorage.setItem(
      'picture-studio:incoming-stock-image',
      JSON.stringify({ url: img.url, source: img.source, id: img.id }),
    );
    window.location.href = '/picture-studio';
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche nach Photos (z.B. mountain, coffee, office)…"
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Suchen'}
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_QUERIES.map((q) => (
          <Badge
            key={q}
            variant="outline"
            className="cursor-pointer hover:bg-primary/10"
            onClick={() => {
              setQuery(q);
              search(q);
            }}
          >
            {q}
          </Badge>
        ))}
      </div>

      {loading && results.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Lade Photos …
        </Card>
      ) : results.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Keine Treffer. Versuche einen anderen Begriff.
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {results.map((img) => {
            const key = `${img.source}-${img.id}`;
            const isFav = favorites.has(key);
            return (
              <Card key={key} className="group overflow-hidden relative">
                <div className="aspect-square bg-muted/30 overflow-hidden">
                  <img
                    src={img.thumbnail_url}
                    alt={img.user.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      onClick={() => toggleFavorite(img)}
                    >
                      <Heart className={`h-3.5 w-3.5 ${isFav ? 'fill-current text-rose-400' : ''}`} />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-white/80 truncate">{img.user.name} · {img.source}</div>
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7 text-[10px] flex-1" onClick={() => useInPictureStudio(img)}>
                        <ImagePlus className="h-3 w-3 mr-1" /> Studio
                      </Button>
                      <LicenseButton
                        asset_type="stock_image"
                        asset_id={String(img.id)}
                        asset_title={`Photo by ${img.user.name}`}
                        asset_thumbnail_url={img.thumbnail_url}
                        asset_source_url={img.user.url}
                        source_provider={img.source === 'pexels' ? 'pexels-photo' : 'pixabay-photo'}
                        variant="secondary"
                        size="sm"
                        className="h-7 text-[10px] px-2"
                        label=""
                      />
                      <Button asChild size="icon" variant="secondary" className="h-7 w-7">
                        <a href={img.url} target="_blank" rel="noreferrer">
                          <Download className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
