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
import { Library, Loader2, Plus, Search, Sparkles, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import type { SceneSnippet } from '@/types/motion-studio';
import CuratedSnippetGallery from './CuratedSnippetGallery';

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
  const { listSceneSnippets, createSceneSnippet, deleteSceneSnippet } =
    useMotionStudioLibrary();
  const [snippets, setSnippets] = useState<SceneSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [snippetName, setSnippetName] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSceneSnippets();
      setSnippets(list);
    } finally {
      setLoading(false);
    }
  }, [listSceneSnippets]);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const handleSaveCurrent = useCallback(async () => {
    if (!currentScene) return;
    if (!snippetName.trim()) {
      toast.error('Snippet-Name fehlt');
      return;
    }
    if (!currentScene.prompt?.trim()) {
      toast.error('Aktive Szene hat keinen Prompt');
      return;
    }
    setSaving(true);
    try {
      const created = await createSceneSnippet({
        name: snippetName.trim(),
        description: currentScene.name ?? '',
        prompt: currentScene.prompt,
        cast_character_ids: currentScene.cast_character_ids ?? [],
        location_id: currentScene.location_id ?? null,
        clip_url: null,
        last_frame_url: currentScene.last_frame_url ?? null,
        reference_image_url: null,
        duration_seconds: currentScene.duration_seconds ?? null,
        tags: [],
        workspace_id: null,
        metadata: {},
      });
      if (created) {
        setSnippetName('');
        await reload();
      }
    } finally {
      setSaving(false);
    }
  }, [currentScene, snippetName, createSceneSnippet, reload]);

  const handleDelete = useCallback(
    async (id: string) => {
      const ok = await deleteSceneSnippet(id);
      if (ok) setSnippets((prev) => prev.filter((s) => s.id !== id));
    },
    [deleteSceneSnippet],
  );

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-card border-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5 text-primary" />
            Scene Library
          </DialogTitle>
          <DialogDescription>
            Wiederverwendbare Szenen-Bausteine — übernehme bewährte Prompts inklusive Cast & Last-Frame.
          </DialogDescription>
        </DialogHeader>

        {/* Save current scene */}
        {currentScene?.prompt && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-primary">Aktive Szene als Snippet sichern</p>
            <div className="flex gap-2">
              <Input
                value={snippetName}
                onChange={(e) => setSnippetName(e.target.value)}
                placeholder="z. B. Hero Walk-In, Establishing Shot Tokyo"
                className="bg-background/60 text-sm h-8"
              />
              <Button
                size="sm"
                onClick={handleSaveCurrent}
                disabled={saving || !snippetName.trim()}
                className="h-8 gap-1.5 text-[11px]"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Sichern
              </Button>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Snippets durchsuchen..."
            className="pl-8 h-8 text-sm bg-background/60"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Lädt Snippets...
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-[11px] text-muted-foreground">
            {snippets.length === 0
              ? 'Noch keine Snippets — sichere deine erste wiederverwendbare Szene.'
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
                    <p className="text-xs font-semibold truncate">{s.name}</p>
                    {s.description && (
                      <p className="text-[10.5px] text-muted-foreground truncate">{s.description}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-destructive hover:bg-destructive/20 opacity-0 group-hover:opacity-100 transition"
                    onClick={() => handleDelete(s.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                {s.last_frame_url && (
                  <img
                    src={s.last_frame_url}
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
      </DialogContent>
    </Dialog>
  );
}
