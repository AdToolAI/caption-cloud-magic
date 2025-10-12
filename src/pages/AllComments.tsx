import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  Filter,
  Upload,
  Download,
  Check,
  Flag,
  Copy,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface Comment {
  id: string;
  text: string;
  username: string;
  language: string;
  status: string;
  created_at_platform: string;
  labels: string[];
  comment_analysis?: {
    sentiment: string;
    intent: string;
    topics: string[];
    toxicity: string;
    urgency: string;
    priority_score: number;
    reply_suggestions: any[];
  };
  comment_sources?: {
    platform: string;
    account_handle: string;
  };
}

const AllComments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("alle");
  const [selectedComments, setSelectedComments] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterSentiment, setFilterSentiment] = useState("");
  const [filterIntent, setFilterIntent] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Fetch or create default project
  useEffect(() => {
    const initProject = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Check for existing project
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (projects && projects.length > 0) {
        setProjectId(projects[0].id);
      } else {
        // Create default project
        const { data: newProject, error } = await supabase
          .from("projects")
          .insert({ name: "Standard Projekt", user_id: user.id })
          .select("id")
          .single();

        if (error) {
          console.error("Error creating project:", error);
          toast({
            title: "Fehler",
            description: "Projekt konnte nicht erstellt werden",
            variant: "destructive",
          });
        } else {
          setProjectId(newProject.id);
        }
      }
    };

    initProject();
  }, [navigate, toast]);

  // Fetch comments
  useEffect(() => {
    if (!projectId) return;

    const fetchComments = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ projectId });
        if (searchQuery) params.append("q", searchQuery);
        if (filterPlatform) params.append("platform", filterPlatform);
        if (filterSentiment) params.append("sentiment", filterSentiment);
        if (filterIntent) params.append("intent", filterIntent);
        if (filterStatus) params.append("status", filterStatus);

        // Apply tab filter
        if (selectedTab === "inbox") params.append("status", "open");
        else if (selectedTab === "leads") params.append("intent", "sales_lead");
        else if (selectedTab === "fragen") params.append("intent", "question");
        else if (selectedTab === "beschwerden") params.append("intent", "complaint");
        else if (selectedTab === "toxisch") params.append("toxicity", "severe");
        else if (selectedTab === "erledigt") params.append("status", "replied");

        const { data, error } = await supabase.functions.invoke("get-comments", {
          body: null,
          method: "GET",
        });

        if (error) throw error;

        setComments(data?.items || []);
      } catch (error) {
        console.error("Error fetching comments:", error);
        toast({
          title: "Fehler",
          description: "Kommentare konnten nicht geladen werden",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [projectId, searchQuery, selectedTab, filterPlatform, filterSentiment, filterIntent, filterStatus, toast]);

  const handleImport = async () => {
    if (!projectId || !importText.trim()) return;

    const lines = importText.split("\n").filter(l => l.trim());
    const items = lines.map(line => ({
      text: line.trim(),
      username: "Manuell importiert",
    }));

    try {
      const { data, error } = await supabase.functions.invoke("import-comments", {
        body: {
          projectId,
          source: {
            platform: "manual",
            accountHandle: "manual_import",
          },
          items,
        },
      });

      if (error) throw error;

      toast({
        title: "Import erfolgreich",
        description: data.message,
      });

      setImportDialogOpen(false);
      setImportText("");
      // Refresh comments
      window.location.reload();
    } catch (error: any) {
      console.error("Import error:", error);
      toast({
        title: "Import fehlgeschlagen",
        description: error.message || "Unbekannter Fehler",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (commentId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("comments")
        .update({ status: newStatus })
        .eq("id", commentId);

      if (error) throw error;

      setComments(prev =>
        prev.map(c => (c.id === commentId ? { ...c, status: newStatus } : c))
      );

      toast({ title: "Status aktualisiert" });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Fehler",
        description: "Status konnte nicht aktualisiert werden",
        variant: "destructive",
      });
    }
  };

  const getSentimentBadge = (sentiment?: string) => {
    if (!sentiment) return null;
    const variants: Record<string, "default" | "destructive" | "secondary"> = {
      positive: "default",
      negative: "destructive",
      neutral: "secondary",
    };
    return <Badge variant={variants[sentiment] || "secondary"}>{sentiment}</Badge>;
  };

  const getIntentIcon = (intent?: string) => {
    if (!intent) return null;
    if (intent === "sales_lead") return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (intent === "question") return <MessageSquare className="h-4 w-4 text-blue-600" />;
    if (intent === "complaint") return <AlertTriangle className="h-4 w-4 text-red-600" />;
    return null;
  };

  const kpiData = {
    total: comments.length,
    new24h: comments.filter(c => {
      const created = new Date(c.created_at_platform);
      const now = new Date();
      return (now.getTime() - created.getTime()) < 24 * 60 * 60 * 1000;
    }).length,
    openQuestions: comments.filter(c => c.comment_analysis?.intent === "question" && c.status === "open").length,
    leads: comments.filter(c => c.comment_analysis?.intent === "sales_lead").length,
    toxicCount: comments.filter(c => c.comment_analysis?.toxicity === "severe" || c.comment_analysis?.toxicity === "mild").length,
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Alle Kommentare</h1>
          <p className="text-muted-foreground">Persistente Kommentarverwaltung über alle Plattformen</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Importieren
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Kommentare importieren</DialogTitle>
              </DialogHeader>
              <Textarea
                placeholder="Ein Kommentar pro Zeile..."
                rows={10}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <Button onClick={handleImport}>Import starten</Button>
            </DialogContent>
          </Dialog>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportieren
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Gesamt</div>
          <div className="text-2xl font-bold">{kpiData.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Neu (24h)</div>
          <div className="text-2xl font-bold">{kpiData.new24h}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Offene Fragen</div>
          <div className="text-2xl font-bold">{kpiData.openQuestions}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Leads</div>
          <div className="text-2xl font-bold">{kpiData.leads}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Toxisch</div>
          <div className="text-2xl font-bold">{kpiData.toxicCount}</div>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche nach Text, Username, Labels..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Plattform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Alle</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSentiment} onValueChange={setFilterSentiment}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sentiment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Alle</SelectItem>
            <SelectItem value="positive">Positiv</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="negative">Negativ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="alle">Alle</TabsTrigger>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="fragen">Fragen</TabsTrigger>
          <TabsTrigger value="beschwerden">Beschwerden</TabsTrigger>
          <TabsTrigger value="toxisch">Toxisch</TabsTrigger>
          <TabsTrigger value="erledigt">Erledigt</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="mt-6">
          {loading ? (
            <div className="text-center py-12">Lädt...</div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Noch keine gespeicherten Kommentare – importiere Daten oder verbinde eine Quelle.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox />
                  </TableHead>
                  <TableHead>Zeit</TableHead>
                  <TableHead>Plattform</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Kommentar</TableHead>
                  <TableHead>Sentiment</TableHead>
                  <TableHead>Intent</TableHead>
                  <TableHead>Priorität</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comments.map((comment) => (
                  <TableRow key={comment.id}>
                    <TableCell>
                      <Checkbox />
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(comment.created_at_platform).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{comment.comment_sources?.platform || "—"}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{comment.username}</TableCell>
                    <TableCell className="max-w-md truncate">{comment.text}</TableCell>
                    <TableCell>{getSentimentBadge(comment.comment_analysis?.sentiment)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getIntentIcon(comment.comment_analysis?.intent)}
                        <span className="text-sm">{comment.comment_analysis?.intent || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>{comment.comment_analysis?.priority_score || "—"}</TableCell>
                    <TableCell>
                      <Select
                        value={comment.status}
                        onValueChange={(val) => handleStatusChange(comment.id, val)}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Offen</SelectItem>
                          <SelectItem value="replied">Beantwortet</SelectItem>
                          <SelectItem value="ignored">Ignoriert</SelectItem>
                          <SelectItem value="flagged">Markiert</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" title="Antwort kopieren">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Als erledigt markieren">
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Flaggen">
                          <Flag className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AllComments;