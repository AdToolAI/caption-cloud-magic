import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Image, Video, Sparkles, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaItem {
  id: string;
  title: string;
  caption: string | null;
  thumb_url: string | null;
  type: string | null;
  source: string | null;
}

interface MediaLibraryPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: MediaItem) => void;
}

export function MediaLibraryPickerDialog({
  open,
  onClose,
  onSelect,
}: MediaLibraryPickerDialogProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "image" | "video" | "ai">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;

    const fetchItems = async () => {
      setLoading(true);
      try {
        // Get user's workspace first
        const { data: workspaces } = await supabase
          .from("workspaces")
          .select("id")
          .eq("owner_id", user.id)
          .limit(1)
          .single();

        if (!workspaces) {
          setItems([]);
          setLoading(false);
          return;
        }

        let query = supabase
          .from("content_items")
          .select("id, title, caption, thumb_url, type, source")
          .eq("workspace_id", workspaces.id)
          .order("created_at", { ascending: false })
          .limit(100);

        if (filter === "image") {
          query = query.eq("type", "image");
        } else if (filter === "video") {
          query = query.eq("type", "video");
        } else if (filter === "ai") {
          query = query.eq("source", "ai-post-generator");
        }

        if (search) {
          query = query.ilike("title", `%${search}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        setItems(data || []);
      } catch (error) {
        console.error("Error fetching media items:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [open, user, filter, search]);

  const handleSelect = () => {
    const item = items.find((i) => i.id === selectedId);
    if (item) {
      onSelect(item);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Aus Media Library wählen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList>
                <TabsTrigger value="all">Alle</TabsTrigger>
                <TabsTrigger value="image" className="gap-1">
                  <Image className="h-3 w-3" />
                  Bilder
                </TabsTrigger>
                <TabsTrigger value="video" className="gap-1">
                  <Video className="h-3 w-3" />
                  Videos
                </TabsTrigger>
                <TabsTrigger value="ai" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  KI-Posts
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Media Grid */}
          <ScrollArea className="h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Image className="h-12 w-12 mb-2 opacity-50" />
                <p>Keine Medien gefunden</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 p-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all group",
                      selectedId === item.id
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-white/10 hover:border-white/30"
                    )}
                  >
                    {item.thumb_url ? (
                      item.type === "video" ? (
                        <video
                          src={item.thumb_url}
                          className="w-full h-28 object-cover"
                        />
                      ) : (
                        <img
                          src={item.thumb_url}
                          alt={item.title}
                          className="w-full h-28 object-cover"
                        />
                      )
                    ) : (
                      <div className="w-full h-28 bg-white/5 flex items-center justify-center">
                        <Image className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                    )}

                    {/* Selection Check */}
                    {selectedId === item.id && (
                      <div className="absolute top-2 right-2 bg-primary rounded-full p-1">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}

                    {/* Type Badge */}
                    <div className="absolute top-2 left-2">
                      {item.source === "ai-post-generator" ? (
                        <div className="bg-gold/90 text-black px-1.5 py-0.5 rounded text-xs flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" />
                          KI
                        </div>
                      ) : item.type === "video" ? (
                        <div className="bg-primary/90 text-primary-foreground px-1.5 py-0.5 rounded text-xs">
                          <Video className="h-2.5 w-2.5" />
                        </div>
                      ) : null}
                    </div>

                    {/* Title Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-xs text-white truncate">{item.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <Button variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={handleSelect} disabled={!selectedId}>
              Auswählen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
