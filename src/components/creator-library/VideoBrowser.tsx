/**
 * VideoBrowser — Stock-Videos tab. Re-uses `useStockVideoSearch`
 * (Pexels + Pixabay HD/4K) and the LicenseButton for auto-cert.
 * Lean grid with thumbnail-preview and "Use in Composer/DC" handoff
 * via sessionStorage.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, ArrowUpRightFromSquare, Film } from 'lucide-react';
import { useStockVideoSearch, type StockVideo } from '@/hooks/useStockVideoSearch';
import { LicenseButton } from '@/components/licensing/LicenseButton';

const QUICK = ['nature', 'city', 'people', 'abstract', 'sports', 'food'];

export default function VideoBrowser() {
  const { results, loading, search } = useStockVideoSearch();
  const [query, setQuery] = useState('nature');

  useEffect(() => {
    search('nature', {}, 24);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) search(query, {}, 24);
  }

  function useIn(target: 'composer' | 'directors-cut', v: StockVideo) {
    const key = target === 'composer' ? 'composer:incoming-stock-video' : 'directors-cut:incoming-stock-video';
    sessionStorage.setItem(
      key,
      JSON.stringify({
        url: v.download_url,
        title: v.title,
        provider: v.provider,
        external_id: v.external_id,
        width: v.width,
        height: v.height,
        duration: v.duration,
      }),
    );
    window.location.href = target === 'composer' ? '/video-composer' : '/universal-directors-cut';
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche nach Stock-Videos (z.B. ocean, coffee, drone)…"
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Suchen'}
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <Badge
            key={q}
            variant="outline"
            className="cursor-pointer hover:bg-primary/10"
            onClick={() => {
              setQuery(q);
              search(q, {}, 24);
            }}
          >
            {q}
          </Badge>
        ))}
        <Button asChild variant="ghost" size="sm" className="h-6 text-[11px] ml-auto">
          <Link to="/stock-videos">
            Erweiterte Stock-Videos <ArrowUpRightFromSquare className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </div>

      {loading && results.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Lade Videos …
        </Card>
      ) : results.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">Keine Treffer.</Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {results.map((v) => (
            <Card key={v.id} className="group overflow-hidden relative">
              <div className="aspect-video bg-muted/30 overflow-hidden relative">
                <img
                  src={v.thumbnail}
                  alt={v.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                {v.is_4k && (
                  <Badge className="absolute top-1.5 left-1.5 text-[9px] bg-amber-500/90 text-black">
                    4K
                  </Badge>
                )}
                {v.is_hd && !v.is_4k && (
                  <Badge className="absolute top-1.5 left-1.5 text-[9px] bg-emerald-500/90 text-black">
                    HD
                  </Badge>
                )}
                <div className="absolute bottom-1 right-1 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded">
                  {v.duration}s
                </div>
              </div>
              <div className="p-2 space-y-1.5">
                <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                  <Film className="h-3 w-3" /> {v.photographer || v.provider}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" className="h-7 text-[10px] flex-1" onClick={() => useIn('composer', v)}>
                    Composer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] flex-1"
                    onClick={() => useIn('directors-cut', v)}
                  >
                    DC
                  </Button>
                  <LicenseButton
                    asset_type="stock_video"
                    asset_id={v.external_id}
                    asset_title={v.title || `Video by ${v.photographer}`}
                    asset_thumbnail_url={v.thumbnail}
                    asset_source_url={v.source_url}
                    source_provider={v.provider === 'pexels' ? 'pexels-video' : 'pixabay-video'}
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    label=""
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
