import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Library, Loader2, Plus, Search, Sparkles, Trash2, Users, Globe, Pencil, Heart, Globe2 } from 'lucide-react';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import type { SceneSnippet } from '@/types/motion-studio';
import CuratedSnippetGallery from './CuratedSnippetGallery';
import StockSearchPanel from './StockSearchModal';
import SnippetBuilderDialog from './SnippetBuilderDialog';
import CommunitySnippetGallery from './CommunitySnippetGallery';


interface SceneSnippetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user inserts a snippet into the storyboard. */
  onInsert: (snippet: SceneSnippet) => void;
  /** Optional source-context to enable "Save current scene as snippet" UI. */
  currentScene?: {
    name?: string;
    prompt?: string;
    cast_character_ids?: string[];
    location_id?: string | null;
    last_frame_url?: string | null;
    duration_seconds?: number | null;
  };
}

/**
 * Scene Snippet Library picker — lets the user pick or save reusable
 * storyboard building blocks (prompts + cast + last-frame anchor).
 */
export default function SceneSnippetPicker({
  open,
  onOpenChange,
  onInsert,
  currentScene,
}: SceneSnippetPickerProps) {
  const { listSceneSnippets, deleteSceneSnippet } = useMotionStudioLibrary();
  const [snippets, setSnippets] = useState<SceneSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<SceneSnippet | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSceneSnippets({ includeSystem: false });
      setSnippets(list);
    } finally {
      setLoading(false);
    }
  }, [listSceneSnippets]);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const handleDelete = useCallback(
    async (id: string) => {
      const ok = await deleteSceneSnippet(id);
      if (ok) setSnippets((prev) => prev.filter((s) => s.id !== id));
    },
    [deleteSceneSnippet],
  );

  const openBuilder = useCallback((snippet: SceneSnippet | null) => {
    setEditing(snippet);
    setBuilderOpen(true);
  }, []);

  const visible = snippets.filter((s) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto bg-card border-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="h-5 w-5 text-primary" />
              Scene Library
            </DialogTitle>
            <DialogDescription>
              Wiederverwendbare Szenen-Bausteine — Kuratiert, Eigene, Community oder Stock Live.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="curated" className="w-full">
            <TabsList className="grid grid-cols-4 w-full max-w-xl">
              <TabsTrigger value="curated" className="gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5" /> Kuratiert
              </TabsTrigger>
              <TabsTrigger value="mine" className="gap-1.5 text-xs">
                <Library className="h-3.5 w-3.5" /> Meine
              </TabsTrigger>
              <TabsTrigger value="community" className="gap-1.5 text-xs">
                <Globe2 className="h-3.5 w-3.5" /> Community
              </TabsTrigger>
              <TabsTrigger value="stock" className="gap-1.5 text-xs">
                <Globe className="h-3.5 w-3.5" /> Stock
              </TabsTrigger>
            </TabsList>

            <TabsContent value="curated" className="mt-4">
              <CuratedSnippetGallery
                onUse={(s) => {
                  onInsert(s);
                  onOpenChange(false);
                }}
              />
            </TabsContent>

            <TabsContent value="community" className="mt-4">
              <CommunitySnippetGallery
                onUse={(s) => {
                  onInsert(s);
                  onOpenChange(false);
                }}
                onCloned={() => reload()}
              />
            </TabsContent>

            <TabsContent value="stock" className="mt-4">
              <StockSearchPanel
                onUseAsBRoll={(clip) => {
                  const now = new Date().toISOString();
                  const snippet: SceneSnippet = {
                    id: `stock_${Date.now()}`,
                    user_id: null,
                    workspace_id: null,
                    name: `B-Roll · ${clip.source}`,
                    description: `Stock-Clip von ${clip.author} (${clip.source})`,
                    prompt: `B-Roll cutaway shot, cinematic, ${clip.source} stock footage`,
                    cast_character_ids: [],
                    location_id: null,
                    clip_url: clip.url,
                    last_frame_url: clip.thumbnail,
                    reference_image_url: null,
                    duration_seconds: clip.duration,
                    tags: ['b-roll', 'stock', clip.source],
                    usage_count: 0,
                    metadata: { stock_source: clip.source, stock_author: clip.author },
                    created_at: now,
                    updated_at: now,
                    attribution_name: clip.author,
                    source: clip.source,
                  };
                  onInsert(snippet);
                  onOpenChange(false);
                }}
                onUseAsReference={(imageUrl, meta) => {
                  const now = new Date().toISOString();
                  const snippet: SceneSnippet = {
                    id: `stock_ref_${Date.now()}`,
                    user_id: null,
                    workspace_id: null,
                    name: `Reference · ${meta.source}`,
                    description: `Reference-Anker von ${meta.author} (${meta.source})`,
                    prompt: '',
                    cast_character_ids: [],
                    location_id: null,
                    clip_url: null,
                    last_frame_url: imageUrl,
                    reference_image_url: imageUrl,
                    duration_seconds: null,
                    tags: ['reference', 'stock', meta.source],
                    usage_count: 0,
                    metadata: { stock_source: meta.source, stock_author: meta.author, kind: 'reference' },
                    created_at: now,
                    updated_at: now,
                    attribution_name: meta.author,
                    source: meta.source,
                  };
                  onInsert(snippet);
                  onOpenChange(false);
                }}
              />
            </TabsContent>

            <TabsContent value="mine" className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Snippets durchsuchen..."
                    className="pl-8 h-8 text-sm bg-background/60"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => openBuilder(null)}
                  className="h-8 gap-1.5 text-[11px]"
                >
                  <Plus className="h-3.5 w-3.5" /> Neues Snippet
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Lädt Snippets...
                </div>
              ) : visible.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-[11px] text-muted-foreground">
                  {snippets.length === 0
                    ? 'Noch keine eigenen Snippets — lege dein erstes wiederverwendbares Snippet an.'
                    : 'Kein Treffer für deinen Filter.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {visible.map((s) => (
                    <div
                      key={s.id}
                      className="group relative rounded-md border border-border/40 bg-background/40 p-3 hover:border-primary/40 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold truncate">{s.name}</p>
                            {s.is_public && (
                              <Badge variant="outline" className="text-[9px] py-0 px-1 gap-0.5 border-primary/40 text-primary">
                                <Globe2 className="h-2.5 w-2.5" /> Public
                              </Badge>
                            )}
                          </div>
                          {s.description && (
                            <p className="text-[10.5px] text-muted-foreground truncate">{s.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 hover:bg-primary/20"
                            onClick={() => openBuilder(s)}
                            aria-label="Bearbeiten"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-destructive hover:bg-destructive/20"
                            onClick={() => handleDelete(s.id)}
                            aria-label="Löschen"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {(s.thumbnail_url || s.last_frame_url) && (
                        <img
                          src={s.thumbnail_url || s.last_frame_url || ''}
                          alt={s.name}
                          className="mt-2 w-full aspect-video object-cover rounded"
                          loading="lazy"
                        />
                      )}

                      <p className="mt-2 text-[10.5px] text-muted-foreground line-clamp-2">{s.prompt}</p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {s.cast_character_ids.length > 0 && (
                            <Badge variant="secondary" className="text-[9px] gap-1 py-0 px-1.5">
                              <Users className="h-2.5 w-2.5" />
                              {s.cast_character_ids.length}
                            </Badge>
                          )}
                          {s.is_public && (s.like_count ?? 0) > 0 && (
                            <Badge variant="secondary" className="text-[9px] gap-1 py-0 px-1.5">
                              <Heart className="h-2.5 w-2.5 fill-rose-500 text-rose-500" />
                              {s.like_count}
                            </Badge>
                          )}
                          {s.tags.slice(0, 3).map((t) => (
                            <Badge key={t} variant="outline" className="text-[9px] py-0 px-1.5">
                              #{t}
                            </Badge>
                          ))}
                        </div>
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1"
                          onClick={() => {
                            onInsert(s);
                            onOpenChange(false);
                          }}
                        >
                          Einfügen
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <SnippetBuilderDialog
        open={builderOpen}
        onOpenChange={(o) => {
          setBuilderOpen(o);
          if (!o) setEditing(null);
        }}
        snippet={editing}
        presetFromScene={editing ? undefined : currentScene}
        onSaved={() => reload()}
      />
    </>
  );
}

