import { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Heart, Loader2, Search, Copy, Sparkles } from 'lucide-react';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import { SCENE_SNIPPET_CATEGORIES, type SceneSnippet } from '@/types/motion-studio';

interface Props {
  onUse: (snippet: SceneSnippet) => void;
  onCloned?: (snippet: SceneSnippet) => void;
}

export default function CommunitySnippetGallery({ onUse, onCloned }: Props) {
  const { listCommunitySnippets, toggleSnippetLike, cloneCommunitySnippet } = useMotionStudioLibrary();
  const [items, setItems] = useState<SceneSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCommunitySnippets({
        category: category === 'all' ? undefined : category,
        sort,
        search: search.trim() || undefined,
      });
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [listCommunitySnippets, category, sort, search]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, sort]);

  const handleToggleLike = useCallback(
    async (s: SceneSnippet) => {
      setBusy((p) => ({ ...p, [s.id]: true }));
      try {
        const newLiked = await toggleSnippetLike(s.id, !!s.liked_by_me);
        setItems((prev) =>
          prev.map((x) =>
            x.id === s.id
              ? {
                  ...x,
                  liked_by_me: newLiked,
                  like_count: Math.max(0, (x.like_count ?? 0) + (newLiked ? 1 : -1)),
                }
              : x,
          ),
        );
      } finally {
        setBusy((p) => ({ ...p, [s.id]: false }));
      }
    },
    [toggleSnippetLike],
  );

  const handleClone = useCallback(
    async (s: SceneSnippet) => {
      setBusy((p) => ({ ...p, [s.id]: true }));
      try {
        const cloned = await cloneCommunitySnippet(s);
        if (cloned) onCloned?.(cloned);
      } finally {
        setBusy((p) => ({ ...p, [s.id]: false }));
      }
    },
    [cloneCommunitySnippet, onCloned],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') reload();
            }}
            placeholder="Suche Community-Snippets..."
            className="pl-8 h-8 text-sm bg-background/60"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[160px] h-8 bg-background/60 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kategorien</SelectItem>
            {SCENE_SNIPPET_CATEGORIES.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.emoji} {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v: any) => setSort(v)}>
          <SelectTrigger className="w-[110px] h-8 bg-background/60 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="top">🔥 Top</SelectItem>
            <SelectItem value="new">✨ Neu</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Community lädt...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-8 text-center text-[11px] text-muted-foreground">
          <Sparkles className="h-5 w-5 mx-auto mb-2 text-primary/60" />
          Noch keine öffentlichen Snippets in dieser Auswahl. Sei der Erste, der etwas teilt!
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {items.map((s) => {
            const thumb = s.thumbnail_url || s.last_frame_url;
            return (
              <div
                key={s.id}
                className="group rounded-md border border-border/60 bg-card/60 overflow-hidden hover:border-primary/50 transition"
              >
                <div className="aspect-video bg-background/50 relative">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={s.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                      Kein Bild
                    </div>
                  )}
                  {s.category && (
                    <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[9px] h-4 px-1.5">
                      {SCENE_SNIPPET_CATEGORIES.find((c) => c.id === s.category)?.emoji}{' '}
                      {SCENE_SNIPPET_CATEGORIES.find((c) => c.id === s.category)?.label ?? s.category}
                    </Badge>
                  )}
                </div>
                <div className="p-2 space-y-1.5">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs font-semibold line-clamp-1">{s.name}</p>
                    <button
                      onClick={() => handleToggleLike(s)}
                      disabled={busy[s.id]}
                      className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-rose-500 transition shrink-0"
                      aria-label="Like"
                    >
                      <Heart
                        className={`h-3 w-3 ${s.liked_by_me ? 'fill-rose-500 text-rose-500' : ''}`}
                      />
                      <span>{s.like_count ?? 0}</span>
                    </button>
                  </div>
                  {s.description && (
                    <p className="text-[10px] text-muted-foreground line-clamp-2">{s.description}</p>
                  )}
                  <div className="flex gap-1 pt-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onUse(s)}
                      className="h-6 text-[10px] flex-1"
                    >
                      Einfügen
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleClone(s)}
                      disabled={busy[s.id]}
                      className="h-6 text-[10px] gap-1"
                      title="In meine Library kopieren"
                    >
                      <Copy className="h-3 w-3" /> Klonen
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
