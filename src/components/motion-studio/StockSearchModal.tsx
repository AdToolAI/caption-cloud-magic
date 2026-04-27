import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Search, Image as ImageIcon, Video, Film, Sparkles, ExternalLink, Wand2, Anchor } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { extractFrameFromVideoUrl } from '@/lib/stock/extractVideoFrame';

export interface StockVideoResult {
  id: string | number;
  url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  duration_sec: number;
  user: { name: string; url: string };
  source: 'pixabay' | 'pexels';
}

export interface StockImageResult {
  id: string | number;
  url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  user: { name: string; url: string };
  source: 'pixabay' | 'pexels';
}

interface StockSearchPanelProps {
  /** Use as Reference: pass back a still image URL */
  onUseAsReference?: (imageUrl: string, meta: { source: string; author: string }) => void;
  /** Use as B-Roll: pass back a video clip URL with metadata */
  onUseAsBRoll?: (clip: { url: string; thumbnail: string; duration: number; source: string; author: string }) => void;
  /** Default quick-chip suggestions (German UI) */
  suggestions?: string[];
}

const DEFAULT_SUGGESTIONS = [
  'cinematic city',
  'nature drone',
  'office team',
  'coffee morning',
  'tech closeup',
  'sunset beach',
  'product hero',
  'abstract motion',
];

/**
 * StockSearchPanel — embeddable Pexels+Pixabay live search with two
 * primary actions per asset: "Use as Reference" and "Use as B-Roll".
 */
export default function StockSearchPanel({
  onUseAsReference,
  onUseAsBRoll,
  suggestions = DEFAULT_SUGGESTIONS,
}: StockSearchPanelProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'video' | 'image'>('video');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState<StockVideoResult[]>([]);
  const [images, setImages] = useState<StockImageResult[]>([]);
  const [cached, setCached] = useState(false);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const lastQueryRef = useRef('');

  const runSearch = useCallback(async (q: string, mediaType: 'video' | 'image') => {
    if (!q.trim()) return;
    setLoading(true);
    setCached(false);
    lastQueryRef.current = q;
    try {
      const fnName = mediaType === 'video' ? 'search-stock-videos' : 'search-stock-images';
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { query: q.trim(), perPage: mediaType === 'video' ? 18 : 24 },
      });
      if (error) throw error;
      if (mediaType === 'video') setVideos((data?.videos as StockVideoResult[]) ?? []);
      else setImages((data?.images as StockImageResult[]) ?? []);
      setCached(Boolean(data?.cached));
    } catch (e) {
      console.error('Stock search failed:', e);
      toast.error('Stock-Suche fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }, []);

  // When the active tab switches and we already have a query, refresh.
  useEffect(() => {
    if (lastQueryRef.current) runSearch(lastQueryRef.current, tab);
  }, [tab, runSearch]);

  const handleUseAsReferenceVideo = useCallback(
    async (v: StockVideoResult) => {
      if (!user) {
        toast.error('Bitte zuerst anmelden');
        return;
      }
      if (!onUseAsReference) {
        toast.error('Reference-Aktion in diesem Kontext nicht verfügbar');
        return;
      }
      setBusyId(v.id);
      try {
        toast.loading('Frame wird extrahiert…', { id: `extract-${v.id}` });
        const url = await extractFrameFromVideoUrl(v.url, user.id, { atSeconds: 1 });
        toast.success('Reference gesetzt', { id: `extract-${v.id}` });
        onUseAsReference(url, { source: v.source, author: v.user.name });
      } catch (e) {
        console.error('Frame extraction failed:', e);
        toast.error('Frame-Extraktion fehlgeschlagen', { id: `extract-${v.id}` });
      } finally {
        setBusyId(null);
      }
    },
    [user, onUseAsReference]
  );

  const handleUseAsReferenceImage = useCallback(
    (img: StockImageResult) => {
      if (!onUseAsReference) {
        toast.error('Reference-Aktion in diesem Kontext nicht verfügbar');
        return;
      }
      onUseAsReference(img.url, { source: img.source, author: img.user.name });
      toast.success('Reference gesetzt');
    },
    [onUseAsReference]
  );

  const handleUseAsBRoll = useCallback(
    (v: StockVideoResult) => {
      if (!onUseAsBRoll) {
        toast.error('B-Roll-Aktion in diesem Kontext nicht verfügbar');
        return;
      }
      onUseAsBRoll({
        url: v.url,
        thumbnail: v.thumbnail_url,
        duration: Math.min(v.duration_sec || 6, 6),
        source: v.source,
        author: v.user.name,
      });
      toast.success('B-Roll-Szene eingefügt');
    },
    [onUseAsBRoll]
  );

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'video' | 'image')}>
        <TabsList className="grid grid-cols-2 w-full max-w-xs">
          <TabsTrigger value="video" className="gap-1.5 text-xs">
            <Video className="h-3.5 w-3.5" /> Videos
          </TabsTrigger>
          <TabsTrigger value="image" className="gap-1.5 text-xs">
            <ImageIcon className="h-3.5 w-3.5" /> Bilder
          </TabsTrigger>
        </TabsList>

        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch(query, tab);
              }}
              placeholder={tab === 'video' ? 'Stock-Videos suchen (z. B. "drone city")' : 'Stock-Bilder suchen (z. B. "minimal desk")'}
              className="pl-8 h-9 text-sm bg-background/60"
            />
          </div>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => runSearch(query, tab)} disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Suchen
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQuery(s);
                runSearch(s, tab);
              }}
              className="px-2 py-0.5 text-[10.5px] rounded-full border border-border/50 bg-background/40 hover:border-primary/50 hover:text-primary transition"
            >
              {s}
            </button>
          ))}
          {cached && (
            <Badge variant="outline" className="text-[9px] gap-1 border-emerald-500/40 text-emerald-400">
              <Sparkles className="h-2.5 w-2.5" /> aus Cache
            </Badge>
          )}
        </div>

        <TabsContent value="video" className="mt-3">
          {loading && videos.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-video rounded-md bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <EmptyHint mediaType="video" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {videos.map((v) => (
                <VideoCard
                  key={String(v.id)}
                  video={v}
                  busy={busyId === v.id}
                  onUseReference={onUseAsReference ? () => handleUseAsReferenceVideo(v) : undefined}
                  onUseBRoll={onUseAsBRoll ? () => handleUseAsBRoll(v) : undefined}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="image" className="mt-3">
          {loading && images.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-md bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <EmptyHint mediaType="image" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {images.map((img) => (
                <ImageCard
                  key={String(img.id)}
                  image={img}
                  onUseReference={onUseAsReference ? () => handleUseAsReferenceImage(img) : undefined}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <p className="text-[9.5px] text-muted-foreground border-t border-border/30 pt-2">
        Stock-Material via <a href="https://pexels.com" target="_blank" rel="noreferrer" className="underline">Pexels</a> &amp; <a href="https://pixabay.com" target="_blank" rel="noreferrer" className="underline">Pixabay</a>. Royalty-free für kommerzielle Nutzung. Attribution wird im Asset gespeichert.
      </p>
    </div>
  );
}

function EmptyHint({ mediaType }: { mediaType: 'video' | 'image' }) {
  return (
    <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-[11px] text-muted-foreground">
      <Film className="h-5 w-5 mx-auto mb-1 opacity-60" />
      Suche {mediaType === 'video' ? 'Stock-Videos' : 'Stock-Bilder'} oder wähle einen Quick-Chip oben.
    </div>
  );
}

function VideoCard({
  video,
  busy,
  onUseReference,
  onUseBRoll,
}: {
  video: StockVideoResult;
  busy: boolean;
  onUseReference?: () => void;
  onUseBRoll?: () => void;
}) {
  return (
    <div className="group relative rounded-md overflow-hidden border border-border/40 bg-background/40">
      <div className="relative aspect-video bg-muted">
        <img src={video.thumbnail_url} alt="" loading="lazy" className="w-full h-full object-cover" />
        <Badge className="absolute top-1 left-1 h-4 px-1 text-[8.5px] capitalize bg-black/70 text-white border-none">
          {video.source}
        </Badge>
        <Badge className="absolute top-1 right-1 h-4 px-1 text-[8.5px] bg-black/70 text-white border-none">
          {Math.round(video.duration_sec)}s
        </Badge>
      </div>
      <div className="p-1.5 space-y-1">
        <div className="flex items-center gap-1 text-[9px] text-muted-foreground truncate">
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{video.user.name}</span>
        </div>
        <div className="flex gap-1">
          {onUseReference && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 flex-1 px-1.5 text-[9.5px] gap-1"
              onClick={onUseReference}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Anchor className="h-2.5 w-2.5" />}
              Reference
            </Button>
          )}
          {onUseBRoll && (
            <Button
              size="sm"
              className="h-6 flex-1 px-1.5 text-[9.5px] gap-1"
              onClick={onUseBRoll}
              disabled={busy}
            >
              <Wand2 className="h-2.5 w-2.5" />
              B-Roll
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageCard({
  image,
  onUseReference,
}: {
  image: StockImageResult;
  onUseReference?: () => void;
}) {
  return (
    <div className="group relative rounded-md overflow-hidden border border-border/40 bg-background/40">
      <div className="relative aspect-square bg-muted">
        <img src={image.thumbnail_url} alt="" loading="lazy" className="w-full h-full object-cover" />
        <Badge className="absolute top-1 left-1 h-4 px-1 text-[8.5px] capitalize bg-black/70 text-white border-none">
          {image.source}
        </Badge>
      </div>
      <div className="p-1.5 space-y-1">
        <div className="flex items-center gap-1 text-[9px] text-muted-foreground truncate">
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{image.user.name}</span>
        </div>
        {onUseReference && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 w-full px-1.5 text-[9.5px] gap-1"
            onClick={onUseReference}
          >
            <Anchor className="h-2.5 w-2.5" />
            Use as Reference
          </Button>
        )}
      </div>
    </div>
  );
}
