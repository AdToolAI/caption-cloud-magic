import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { 
  Calendar, 
  Clock, 
  Plus, 
  Sparkles,
  LayoutGrid,
  List,
  Filter,
  SortAsc,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  X,
  Send,
  CheckSquare
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface PlannerV2Props {
  className?: string;
}

interface ScheduledPost {
  id: string;
  title_override: string | null;
  caption_override: string | null;
  platform: string;
  start_at: string;
  end_at: string;
  status: string;
  content_id: string | null;
  content_items?: {
    title: string;
    caption?: string | null;
    thumb_url?: string | null;
  } | null;
}

type SortOption = "date-asc" | "date-desc" | "platform" | "status";
type FilterPlatform = "all" | "instagram" | "tiktok" | "linkedin" | "youtube" | "twitter";
type FilterStatus = "all" | "draft" | "scheduled" | "approved" | "queued" | "published";

export function PlannerV2({ className }: PlannerV2Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  
  // Filter & Sort states
  const [sortBy, setSortBy] = useState<SortOption>("date-asc");
  const [filterPlatform, setFilterPlatform] = useState<FilterPlatform>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  
  // Editor dialog state
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPlatform, setEditPlatform] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Selection & Calendar Transfer state
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [autoPublish, setAutoPublish] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);

  // Fetch workspace
  useEffect(() => {
    const fetchWorkspace = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      
      if (data) {
        setWorkspaceId(data.workspace_id);
      }
    };
    
    fetchWorkspace();
  }, [user]);

  // Fetch posts
  useEffect(() => {
    const fetchPosts = async () => {
      if (!workspaceId) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      
      const { data, error } = await supabase
        .from("schedule_blocks")
        .select("*, content_items(*)")
        .eq("workspace_id", workspaceId)
        .order("start_at", { ascending: true });
      
      if (error) {
        console.error("Error fetching posts:", error);
        toast.error("Fehler beim Laden der Posts");
      } else {
        setPosts(data || []);
      }
      
      setLoading(false);
    };
    
    fetchPosts();
  }, [workspaceId]);

  // Filter and sort posts
  const filteredPosts = posts
    .filter(post => {
      if (filterPlatform !== "all" && post.platform.toLowerCase() !== filterPlatform) {
        return false;
      }
      if (filterStatus !== "all" && post.status !== filterStatus) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "date-asc":
          return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
        case "date-desc":
          return new Date(b.start_at).getTime() - new Date(a.start_at).getTime();
        case "platform":
          return a.platform.localeCompare(b.platform);
        case "status":
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

  // Calculate stats
  const scheduledCount = posts.filter(p => p.status === "scheduled" || p.status === "approved" || p.status === "queued").length;
  const uniquePlatforms = new Set(posts.map(p => p.platform.toLowerCase())).size;
  const weeklyUtilization = Math.min(100, Math.round((posts.length / 21) * 100)); // 21 = 3 posts/day * 7 days

  // Handlers
  const handleNewPost = () => {
    navigate("/calendar?quickAdd=true");
  };

  const handleAiSuggestions = async () => {
    if (!workspaceId) {
      toast.error("Kein Workspace gefunden");
      return;
    }
    
    setAiLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("planner-apply-recommendations", {
        body: { 
          workspace_id: workspaceId,
          mode: "unscheduled"
        }
      });
      
      if (error) throw error;
      
      if (data?.suggestions?.length > 0) {
        toast.success(`${data.suggestions.length} AI-Vorschläge angewendet`);
        // Refresh posts
        const { data: refreshedPosts } = await supabase
          .from("schedule_blocks")
          .select("*, content_items(*)")
          .eq("workspace_id", workspaceId)
          .order("start_at", { ascending: true });
        
        if (refreshedPosts) setPosts(refreshedPosts);
      } else {
        toast.info("Keine neuen Vorschläge verfügbar");
      }
    } catch (error: any) {
      console.error("AI suggestions error:", error);
      toast.error("Fehler bei AI-Vorschlägen");
    } finally {
      setAiLoading(false);
    }
  };

  const handleCalendarView = () => {
    navigate("/calendar");
  };

  const openPostEditor = (post: ScheduledPost) => {
    setEditingPost(post);
    setEditTitle(post.title_override || post.content_items?.title || "");
    setEditPlatform(post.platform);
    setEditDate(post.start_at.slice(0, 16)); // Format for datetime-local
    setEditStatus(post.status);
  };

  const closePostEditor = () => {
    setEditingPost(null);
    setEditTitle("");
    setEditPlatform("");
    setEditDate("");
    setEditStatus("");
  };

  const handleSavePost = async () => {
    if (!editingPost) return;
    
    setSaving(true);
    
    try {
      const startAt = new Date(editDate).toISOString();
      const endAt = new Date(new Date(editDate).getTime() + 30 * 60 * 1000).toISOString(); // +30 min
      
      const { error } = await supabase
        .from("schedule_blocks")
        .update({
          title_override: editTitle,
          platform: editPlatform,
          start_at: startAt,
          end_at: endAt,
          status: editStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", editingPost.id);
      
      if (error) throw error;
      
      // Update local state
      setPosts(prev => prev.map(p => 
        p.id === editingPost.id 
          ? { ...p, title_override: editTitle, platform: editPlatform, start_at: startAt, end_at: endAt, status: editStatus }
          : p
      ));
      
      toast.success("Post aktualisiert");
      closePostEditor();
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePost = async () => {
    if (!editingPost) return;
    
    setDeleting(true);
    
    try {
      const { error } = await supabase
        .from("schedule_blocks")
        .delete()
        .eq("id", editingPost.id);
      
      if (error) throw error;
      
      setPosts(prev => prev.filter(p => p.id !== editingPost.id));
      toast.success("Post gelöscht");
      closePostEditor();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error("Fehler beim Löschen");
    } finally {
      setDeleting(false);
    }
  };

  const getPostTitle = (post: ScheduledPost) => {
    return post.title_override || post.content_items?.title || "Unbenannter Post";
  };

  const formatPostDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "dd. MMM yyyy", { locale: de });
    } catch {
      return dateStr;
    }
  };

  const formatPostTime = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "HH:mm", { locale: de });
    } catch {
      return "";
    }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case "scheduled":
      case "approved":
        return "default";
      case "queued":
        return "secondary";
      case "published":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getPlatformColor = (platform: string) => {
    switch (platform.toLowerCase()) {
      case "instagram":
        return "text-pink-500";
      case "tiktok":
        return "text-cyan-400";
      case "linkedin":
        return "text-blue-500";
      case "youtube":
        return "text-red-500";
      case "twitter":
        return "text-sky-400";
      default:
        return "text-muted-foreground";
    }
  };

  // Selection handlers
  const togglePostSelection = (postId: string) => {
    setSelectedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPosts.size === filteredPosts.length) {
      setSelectedPosts(new Set());
    } else {
      setSelectedPosts(new Set(filteredPosts.map(p => p.id)));
    }
  };

  const handleTransferToCalendar = async () => {
    if (selectedPosts.size === 0 || !workspaceId) {
      toast.error("Keine Posts ausgewählt");
      return;
    }

    setTransferring(true);
    try {
      const { data, error } = await supabase.functions.invoke("planner-to-calendar", {
        body: {
          blockIds: Array.from(selectedPosts),
          workspaceId,
          autoPublish,
        },
      });

      if (error) throw error;

      const message = autoPublish 
        ? `✅ ${data.eventsCreated} Events erstellt, ${data.jobsCreated} werden automatisch gepostet`
        : `✅ ${data.eventsCreated} Events im Kalender erstellt`;
      
      toast.success(message);
      setTransferDialogOpen(false);
      setSelectedPosts(new Set());

      // Refresh posts to show updated status
      const { data: refreshedPosts } = await supabase
        .from("schedule_blocks")
        .select("*, content_items(*)")
        .eq("workspace_id", workspaceId)
        .order("start_at", { ascending: true });
      
      if (refreshedPosts) setPosts(refreshedPosts);

      // Navigate to calendar after short delay
      setTimeout(() => navigate("/calendar"), 1500);
    } catch (error: any) {
      console.error("Transfer error:", error);
      toast.error("Fehler beim Übertragen zum Kalender");
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className={className}>
      {/* Header */}
      <Card className="p-6 mb-6 bg-gradient-to-r from-primary/10 via-purple-500/10 to-blue-500/10 border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Content Planner</h2>
              <p className="text-sm text-muted-foreground">
                Plane und verwalte deine Social Media Posts
              </p>
            </div>
          </div>
          <Badge variant="default" className="gap-1">
            <Sparkles className="h-3 w-3" />
            AI-Powered
          </Badge>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" className="gap-2" onClick={handleNewPost}>
            <Plus className="h-4 w-4" />
            Neuer Post
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="gap-2"
            onClick={handleAiSuggestions}
            disabled={aiLoading || !workspaceId}
          >
            {aiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            AI Vorschläge
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={handleCalendarView}>
            <Calendar className="h-4 w-4" />
            Kalenderansicht
          </Button>
        </div>
      </Card>

      {/* Toolbar */}
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={viewMode === "grid" ? "default" : "outline"}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === "list" ? "default" : "outline"}
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {/* Selection Actions */}
            {selectedPosts.size > 0 && (
              <Button 
                size="sm" 
                className="gap-2 bg-primary"
                onClick={() => setTransferDialogOpen(true)}
              >
                <Send className="h-4 w-4" />
                {selectedPosts.size} zum Kalender
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={toggleSelectAll}
              className="gap-2"
            >
              <CheckSquare className="h-4 w-4" />
              {selectedPosts.size === filteredPosts.length && filteredPosts.length > 0 ? "Keine" : "Alle"}
            </Button>
            {/* Filter Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filter
                  {(filterPlatform !== "all" || filterStatus !== "all") && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {(filterPlatform !== "all" ? 1 : 0) + (filterStatus !== "all" ? 1 : 0)}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Platform</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setFilterPlatform("all")}>
                  Alle Plattformen {filterPlatform === "all" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterPlatform("instagram")}>
                  Instagram {filterPlatform === "instagram" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterPlatform("tiktok")}>
                  TikTok {filterPlatform === "tiktok" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterPlatform("linkedin")}>
                  LinkedIn {filterPlatform === "linkedin" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setFilterStatus("all")}>
                  Alle Status {filterStatus === "all" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterStatus("draft")}>
                  Entwurf {filterStatus === "draft" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterStatus("scheduled")}>
                  Geplant {filterStatus === "scheduled" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterStatus("published")}>
                  Veröffentlicht {filterStatus === "published" && "✓"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <SortAsc className="h-4 w-4" />
                  Sortieren
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSortBy("date-asc")}>
                  Datum (aufsteigend) {sortBy === "date-asc" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("date-desc")}>
                  Datum (absteigend) {sortBy === "date-desc" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("platform")}>
                  Platform {sortBy === "platform" && "✓"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy("status")}>
                  Status {sortBy === "status" && "✓"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>

      {/* Content */}
      {loading ? (
        <Card className="p-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </Card>
      ) : filteredPosts.length === 0 ? (
        <Card className="p-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {posts.length === 0 ? "Noch keine Posts geplant" : "Keine Posts gefunden"}
          </h3>
          <p className="text-muted-foreground mb-4">
            {posts.length === 0 
              ? "Erstelle deinen ersten Post oder nutze AI-Vorschläge"
              : "Passe deine Filter an, um Posts zu sehen"}
          </p>
          {posts.length === 0 && (
            <div className="flex gap-2 justify-center">
              <Button onClick={handleNewPost} className="gap-2">
                <Plus className="h-4 w-4" />
                Neuer Post
              </Button>
              <Button variant="outline" onClick={handleAiSuggestions} disabled={aiLoading} className="gap-2">
                <Sparkles className="h-4 w-4" />
                AI Vorschläge
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className={viewMode === "grid" ? "grid md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
          {filteredPosts.map((post) => (
            <Card 
              key={post.id} 
              className="p-4 hover:border-primary/50 transition-colors cursor-pointer group"
              onClick={() => openPostEditor(post)}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold line-clamp-1">{getPostTitle(post)}</h3>
                    <p className={`text-sm mt-1 font-medium ${getPlatformColor(post.platform)}`}>
                      {post.platform}
                    </p>
                  </div>
                  <Badge variant={getStatusVariant(post.status)}>
                    {post.status}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatPostDate(post.start_at)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatPostTime(post.start_at)}
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="flex-1 gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPostEditor(post);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                    Bearbeiten
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/ai-posts?enhance=${post.id}`);
                    }}
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Stats Footer */}
      <Card className="p-4 mt-6 bg-muted/50">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{scheduledCount}</p>
            <p className="text-sm text-muted-foreground">Posts geplant</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{uniquePlatforms}</p>
            <p className="text-sm text-muted-foreground">Plattformen</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{weeklyUtilization}%</p>
            <p className="text-sm text-muted-foreground">Wochenauslastung</p>
          </div>
        </div>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingPost} onOpenChange={(open) => !open && closePostEditor()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Post bearbeiten</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titel</Label>
              <Input
                id="title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Post-Titel"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="platform">Platform</Label>
              <Select value={editPlatform} onValueChange={setEditPlatform}>
                <SelectTrigger>
                  <SelectValue placeholder="Platform wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Instagram">Instagram</SelectItem>
                  <SelectItem value="TikTok">TikTok</SelectItem>
                  <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                  <SelectItem value="YouTube">YouTube</SelectItem>
                  <SelectItem value="Twitter">Twitter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="datetime">Datum & Uhrzeit</Label>
              <Input
                id="datetime"
                type="datetime-local"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Entwurf</SelectItem>
                  <SelectItem value="scheduled">Geplant</SelectItem>
                  <SelectItem value="approved">Freigegeben</SelectItem>
                  <SelectItem value="queued">In Warteschlange</SelectItem>
                  <SelectItem value="published">Veröffentlicht</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="destructive" 
              onClick={handleDeletePost}
              disabled={deleting}
              className="gap-2"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Löschen
            </Button>
            <div className="flex gap-2 flex-1 justify-end">
              <Button variant="outline" onClick={closePostEditor}>
                Abbrechen
              </Button>
              <Button onClick={handleSavePost} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Speichern
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer to Calendar Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zum Kalender übertragen</DialogTitle>
            <DialogDescription>
              {selectedPosts.size} Posts werden in den Intelligenten Kalender übertragen
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div>
                <Label className="font-medium">Auto-Publish aktivieren</Label>
                <p className="text-sm text-muted-foreground">
                  Posts werden automatisch zur geplanten Zeit veröffentlicht
                </p>
              </div>
              <Switch
                checked={autoPublish}
                onCheckedChange={setAutoPublish}
              />
            </div>
            
            {autoPublish && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm">
                <p className="font-medium text-primary">⚡ Auto-Publish aktiv</p>
                <p className="text-muted-foreground mt-1">
                  Die Posts werden automatisch zur eingestellten Uhrzeit veröffentlicht.
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleTransferToCalendar} disabled={transferring}>
              {transferring ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {autoPublish ? "Übertragen & Auto-Publish" : "Zum Kalender"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
