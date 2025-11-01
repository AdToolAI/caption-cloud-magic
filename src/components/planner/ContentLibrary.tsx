import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Image, Video, FileText, Sparkles, Calendar, FolderOpen, Upload } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useSearchParams, useNavigate } from "react-router-dom";

interface ContentLibraryProps {
  workspaceId: string;
  onContentSelect: (content: any) => void;
}

export function ContentLibrary({ workspaceId, onContentSelect }: ContentLibraryProps) {
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get("campaign_id");
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLibrary();
  }, [workspaceId, filter, search, campaignId]);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      let allData: any[] = [];

      if (campaignId) {
        // When campaign filter is active, fetch campaign content AND media library separately
        // Query 1: Campaign-specific content
        let campaignQuery = supabase
          .from("content_items")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("source", "campaign")
          .eq("source_id", campaignId);

        if (filter !== "all") {
          campaignQuery = campaignQuery.eq("type", filter);
        }

        if (search) {
          campaignQuery = campaignQuery.or(`title.ilike.%${search}%,caption.ilike.%${search}%`);
        }

        // Query 2: Media library content
        let mediaQuery = supabase
          .from("content_items")
          .select("*")
          .eq("workspace_id", workspaceId)
          .eq("source", "media_library");

        if (filter !== "all") {
          mediaQuery = mediaQuery.eq("type", filter);
        }

        if (search) {
          mediaQuery = mediaQuery.or(`title.ilike.%${search}%,caption.ilike.%${search}%`);
        }

        // Execute both queries
        const [campaignResult, mediaResult] = await Promise.all([
          campaignQuery.order("created_at", { ascending: false }),
          mediaQuery.order("created_at", { ascending: false })
        ]);

        // Merge results
        const campaignData = campaignResult.data || [];
        const mediaData = mediaResult.data || [];
        allData = [...campaignData, ...mediaData];
      } else {
        // Normal query without campaign filter
        let query = supabase
          .from("content_items")
          .select("*")
          .eq("workspace_id", workspaceId);

        if (filter !== "all") {
          query = query.eq("type", filter);
        }

        if (search) {
          query = query.or(`title.ilike.%${search}%,caption.ilike.%${search}%`);
        }

        const { data, error } = await query.order("created_at", { ascending: false });
        
        if (!error && data) {
          allData = data;
        }
      }

      setItems(allData);
    } catch (error) {
      console.error("Error loading library:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-80 border-r flex flex-col h-full bg-muted/30">
      <div className="p-4 border-b bg-background">
        <h2 className="text-lg font-semibold mb-3">
          Content Library
          {campaignId && (
            <Badge variant="secondary" className="ml-2 text-xs">
              Kampagne
            </Badge>
          )}
        </h2>

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
          <EmptyContentLibrary campaignFilter={!!campaignId} />
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
              <Badge variant="secondary" className="text-xs gap-1">
                <Calendar className="h-3 w-3" />
                Kampagne
              </Badge>
            )}
            {item.source === "media_library" && (
              <Badge variant="outline" className="text-xs gap-1">
                <FolderOpen className="h-3 w-3" />
                Media Library
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function EmptyContentLibrary({ campaignFilter }: { campaignFilter: boolean }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="p-4 rounded-full bg-muted mb-4">
        <FolderOpen className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-sm mb-2">
        {campaignFilter ? "Keine Kampagnen-Inhalte" : "Keine Inhalte gefunden"}
      </h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">
        {campaignFilter 
          ? "Erstellen Sie Inhalte für diese Kampagne oder laden Sie Medien in die Mediathek hoch."
          : "Laden Sie Medien in die Mediathek hoch oder erstellen Sie Kampagnen, um Inhalte hier zu planen."}
      </p>
      {!campaignFilter && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/media-library")}
          className="gap-2"
        >
          <Upload className="h-4 w-4" />
          Zur Mediathek
        </Button>
      )}
    </div>
  );
}
