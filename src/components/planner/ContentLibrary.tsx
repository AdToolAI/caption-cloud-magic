import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, Image, Video, FileText, Sparkles } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

interface ContentLibraryProps {
  workspaceId: string;
  onContentSelect: (content: any) => void;
}

export function ContentLibrary({ workspaceId, onContentSelect }: ContentLibraryProps) {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLibrary();
  }, [workspaceId, filter, search]);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("planner-list", {
        body: {
          workspace_id: workspaceId,
          type: filter !== "all" ? filter : undefined,
          search: search || undefined,
        },
      });

      if (!error && data) {
        setItems(data.items || []);
      }
    } catch (error) {
      console.error("Error loading library:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-80 border-r flex flex-col h-full bg-muted/30">
      <div className="p-4 border-b bg-background">
        <h2 className="text-lg font-semibold mb-3">Content Library</h2>

        <div className="relative mb-3">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suchen..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all" className="text-xs">
              Alle
            </TabsTrigger>
            <TabsTrigger value="image" className="text-xs">
              <Image className="h-3 w-3" />
            </TabsTrigger>
            <TabsTrigger value="video" className="text-xs">
              <Video className="h-3 w-3" />
            </TabsTrigger>
            <TabsTrigger value="draft" className="text-xs">
              <FileText className="h-3 w-3" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center text-sm text-muted-foreground">Lädt...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            Keine Inhalte gefunden
          </div>
        ) : (
          items.map((item) => <DraggableContentItem key={item.id} item={item} onClick={() => onContentSelect(item)} />)
        )}
      </div>
    </div>
  );
}

function DraggableContentItem({ item, onClick }: { item: any; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `content-${item.id}`,
    data: { content: item },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <Card
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className="p-3 cursor-move hover:ring-2 hover:ring-primary transition-all"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        <div className="w-16 h-16 bg-muted rounded flex-shrink-0 flex items-center justify-center overflow-hidden">
          {item.thumb_url ? (
            <img src={item.thumb_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div>
              {item.type === "video" && <Video className="h-6 w-6 text-muted-foreground" />}
              {item.type === "image" && <Image className="h-6 w-6 text-muted-foreground" />}
              {item.type === "draft" && <FileText className="h-6 w-6 text-muted-foreground" />}
              {item.type === "text" && <FileText className="h-6 w-6 text-muted-foreground" />}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{item.title}</div>
          <div className="text-xs text-muted-foreground truncate mt-1">
            {item.caption?.substring(0, 50)}
            {item.caption?.length > 50 && "..."}
          </div>

          <div className="flex flex-wrap gap-1 mt-2">
            {item.targets?.map((platform: string) => (
              <Badge key={platform} variant="secondary" className="text-xs">
                {platform}
              </Badge>
            ))}
            {item.source === "ai" && (
              <Badge variant="outline" className="text-xs">
                <Sparkles className="h-2 w-2 mr-1" />
                AI
              </Badge>
            )}
            {item.source === "campaign" && (
              <Badge variant="outline" className="text-xs">
                Campaign
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
