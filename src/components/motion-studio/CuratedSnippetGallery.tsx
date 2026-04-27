import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles, Clock, Tag, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import {
  SCENE_SNIPPET_CATEGORIES,
  type SceneSnippet,
  type SceneSnippetCategory,
} from '@/types/motion-studio';

interface CuratedSnippetGalleryProps {
  onUse: (snippet: SceneSnippet) => void;
  /** Limit number of items rendered (e.g. embedded preview). */
  maxItems?: number;
}

/**
 * Bento-grid of curated, ready-to-use scene snippets (Artlist-style).
 * Hover plays preview-video muted, click "Use" inserts into storyboard.
 */
export default function CuratedSnippetGallery({
  onUse,
  maxItems,
}: CuratedSnippetGalleryProps) {
  const { listSceneSnippets } = useMotionStudioLibrary();
  const [snippets, setSnippets] = useState<SceneSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<SceneSnippetCategory | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listSceneSnippets({ onlySystem: true })
      .then((list) => {
        if (!cancelled) setSnippets(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listSceneSnippets]);

  const filtered = useMemo(() => {
    const list =
      activeCat === 'all'
        ? snippets
        : snippets.filter((s) => s.category === activeCat);
    return maxItems ? list.slice(0, maxItems) : list;
  }, [snippets, activeCat, maxItems]);

  return (
    <div className="space-y-4">
      {/* Category chips */}
      <ScrollArea className="w-full">
        <div className="flex items-center gap-2 pb-2">
          <button
            onClick={() => setActiveCat('all')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap',
              activeCat === 'all'
                ? 'bg-primary text-primary-foreground border-primary shadow shadow-primary/30'
                : 'bg-muted/40 text-muted-foreground border-border/40 hover:border-primary/40',
            )}
          >
            <Sparkles className="h-3 w-3" /> Alle ({snippets.length})
          </button>
          {SCENE_SNIPPET_CATEGORIES.map((c) => {
            const count = snippets.filter((s) => s.category === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                disabled={count === 0}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap',
                  activeCat === c.id
                    ? 'bg-primary text-primary-foreground border-primary shadow shadow-primary/30'
                    : 'bg-muted/40 text-muted-foreground border-border/40 hover:border-primary/40',
                  count === 0 && 'opacity-40 cursor-not-allowed',
                )}
              >
                <span>{c.emoji}</span>
                <span>{c.label}</span>
                <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Lade kuratierte Szenen...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-8 text-center text-xs text-muted-foreground">
          Keine Szenen in dieser Kategorie.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <SnippetCard key={s.id} snippet={s} onUse={onUse} />
          ))}
        </div>
      )}
    </div>
  );
}

function SnippetCard({
  snippet,
  onUse,
}: {
  snippet: SceneSnippet;
  onUse: (s: SceneSnippet) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (hovering) {
      v.currentTime = 0;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [hovering]);

  const cat = SCENE_SNIPPET_CATEGORIES.find((c) => c.id === snippet.category);

  return (
    <div
      className="group relative rounded-xl overflow-hidden border border-border/40 bg-card/60 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Media */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {snippet.thumbnail_url && (
          <img
            src={snippet.thumbnail_url}
            alt={snippet.name}
            className={cn(
              'absolute inset-0 w-full h-full object-cover transition-opacity',
              hovering ? 'opacity-0' : 'opacity-100',
            )}
            loading="lazy"
          />
        )}
        {snippet.preview_video_url && (
          <video
            ref={videoRef}
            src={snippet.preview_video_url}
            muted
            playsInline
            loop
            preload="none"
            className={cn(
              'absolute inset-0 w-full h-full object-cover transition-opacity',
              hovering ? 'opacity-100' : 'opacity-0',
            )}
          />
        )}
        {!hovering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-10 w-10 rounded-full bg-background/70 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Play className="h-4 w-4 text-foreground" />
            </div>
          </div>
        )}
        {cat && (
          <Badge
            variant="secondary"
            className="absolute top-2 left-2 text-[10px] gap-1 bg-background/80 backdrop-blur"
          >
            <span>{cat.emoji}</span>
            {cat.label}
          </Badge>
        )}
        {snippet.duration_seconds && (
          <Badge
            variant="outline"
            className="absolute top-2 right-2 text-[10px] gap-1 bg-background/80 backdrop-blur border-border/60"
          >
            <Clock className="h-2.5 w-2.5" /> {snippet.duration_seconds}s
          </Badge>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        <div>
          <h4 className="text-sm font-semibold leading-tight">{snippet.name}</h4>
          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
            {snippet.description}
          </p>
        </div>

        {snippet.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {snippet.tags.slice(0, 3).map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="text-[9px] py-0 px-1.5 gap-0.5"
              >
                <Tag className="h-2 w-2" />
                {t}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {snippet.attribution_name && (
            <a
              href={snippet.attribution_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] text-muted-foreground hover:text-foreground"
            >
              via {snippet.attribution_name}
            </a>
          )}
          <Button
            size="sm"
            className="h-7 px-3 text-[11px] gap-1 ml-auto"
            onClick={() => onUse(snippet)}
          >
            <Sparkles className="h-3 w-3" />
            Verwenden
          </Button>
        </div>
      </div>
    </div>
  );
}
