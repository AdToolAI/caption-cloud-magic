import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import {
  Search,
  Upload,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CommentDiagnostics } from "@/components/comments/CommentDiagnostics";
import { ReplySuggestions } from "@/components/comments/ReplySuggestions";

interface Comment {
  id: string;
  text: string;
  username: string;
  status: string;
  created_at_platform: string;
  comment_analysis?: {
    sentiment: string;
    intent: string;
    toxicity: string;
    reply_suggestions?: any[];
  };
  comment_sources?: {
    platform: string;
  };
}

interface SummaryData {
  counts: {
    total: number;
    positive: number;
    neutral: number;
    negative: number;
  };
  positiveRate: number;
  unansweredQuestions: number;
  leadPotential: number;
  diagnostics: any;
}

const CommentManager = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("alle");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  // Initialize project
  useEffect(() => {
    const initProject = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (projects && projects.length > 0) {
        setProjectId(projects[0].id);
      } else {
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
  const fetchComments = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("comments")
        .select(`
          id,
          text,
          username,
          status,
          created_at_platform,
          comment_analysis (
            sentiment,
            intent,
            toxicity
          ),
          comment_sources (
            platform
          )
        `)
        .eq("project_id", projectId)
        .order("ingested_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setComments(data || []);
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

  useEffect(() => {
    fetchComments();
  }, [projectId]);

  // Import comments
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
      fetchComments();
    } catch (error: any) {
      console.error("Import error:", error);
      toast({
        title: "Import fehlgeschlagen",
        description: error.message || "Unbekannter Fehler",
        variant: "destructive",
      });
    }
  };

  // Analyze comments
  const handleAnalyze = async () => {
    if (!projectId) return;

    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-comments", {
        body: { projectId },
      });

      if (error) throw error;

      toast({
        title: "Analyse abgeschlossen",
        description: data.message,
      });

      // Fetch summary
      await fetchSummary();
      fetchComments();
    } catch (error: any) {
      console.error("Analyze error:", error);
      toast({
        title: "Analyse fehlgeschlagen",
        description: error.message || "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // Fetch summary
  const fetchSummary = async () => {
    if (!projectId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/comments-summary?projectId=${projectId}`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
        }
      );

      if (!response.ok) throw new Error("Summary fetch failed");
      const data = await response.json();
      setSummaryData(data);
    } catch (error) {
      console.error("Summary error:", error);
    }
  };

  useEffect(() => {
    if (projectId && comments.length > 0) {
      fetchSummary();
    }
  }, [projectId, comments.length]);

  const getSentimentBadge = (sentiment?: string) => {
    if (!sentiment) return null;
    const variants: Record<string, "default" | "destructive" | "secondary"> = {
      positive: "default",
      negative: "destructive",
      neutral: "secondary",
    };
    return <Badge variant={variants[sentiment] || "secondary"}>{sentiment}</Badge>;
  };

  const toggleCommentExpanded = (commentId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return new Date().toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      }
      return date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return new Date().toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
  };

  const filteredComments = comments.filter(c => {
    if (searchQuery && !c.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    
    if (selectedTab === "inbox") return c.status === "open";
    if (selectedTab === "leads") return c.comment_analysis?.intent === "sales_lead";
    if (selectedTab === "fragen") return c.comment_analysis?.intent === "question";
    if (selectedTab === "toxisch") return c.comment_analysis?.toxicity === "severe" || c.comment_analysis?.toxicity === "mild";
    if (selectedTab === "erledigt") return c.status === "replied";
    
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar: Diagnostics */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <h2 className="text-xl font-bold mb-4">Diagnose & Empfehlungen</h2>
              <CommentDiagnostics 
                data={summaryData?.diagnostics || null}
                loading={analyzing}
              />
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold">Kommentar-Manager</h1>
                <p className="text-muted-foreground">
                  Bis zu 50 Kommentare persistent speichern & analysieren
                </p>
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
                <Button onClick={handleAnalyze} disabled={analyzing || comments.length === 0}>
                  <Zap className="h-4 w-4 mr-2" />
                  {analyzing ? "Analysiere..." : "Analysieren"}
                </Button>
              </div>
            </div>

            {/* KPI Cards */}
            {summaryData && (
              <div className="grid grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">Gesamt</div>
                  <div className="text-2xl font-bold">{summaryData.counts.total}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">Positiv</div>
                  <div className="text-2xl font-bold text-green-600">{summaryData.counts.positive}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">Offene Fragen</div>
                  <div className="text-2xl font-bold">{summaryData.unansweredQuestions}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">Leads</div>
                  <div className="text-2xl font-bold text-blue-600">{summaryData.leadPotential}</div>
                </Card>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche nach Text, Username..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Tabs */}
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList>
                <TabsTrigger value="alle">Alle</TabsTrigger>
                <TabsTrigger value="inbox">Inbox</TabsTrigger>
                <TabsTrigger value="leads">Leads</TabsTrigger>
                <TabsTrigger value="fragen">Fragen</TabsTrigger>
                <TabsTrigger value="toxisch">Toxisch</TabsTrigger>
                <TabsTrigger value="erledigt">Erledigt</TabsTrigger>
              </TabsList>

              <TabsContent value={selectedTab} className="mt-6">
                {loading ? (
                  <div className="text-center py-12">Lädt...</div>
                ) : filteredComments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    Noch keine Kommentare – importiere Daten.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredComments.map((comment) => {
                      const isExpanded = expandedComments.has(comment.id);
                      return (
                        <Card key={comment.id} className="p-4 bg-card border-border">
                          <div className="space-y-3">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(comment.created_at_platform)}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {comment.comment_sources?.platform || "manual"}
                                  </Badge>
                                  <span className="font-medium text-sm">{comment.username}</span>
                                  {getSentimentBadge(comment.comment_analysis?.sentiment)}
                                  <Badge variant="secondary" className="text-xs">
                                    {comment.status}
                                  </Badge>
                                </div>
                                <p className="text-sm leading-relaxed">{comment.text}</p>
                                {comment.comment_analysis?.intent && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                      Intent:
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      {comment.comment_analysis.intent}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleCommentExpanded(comment.id)}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </div>

                            {/* Expanded content with reply suggestions */}
                            {isExpanded && (
                              <div className="pt-3 border-t">
                                <ReplySuggestions
                                  commentId={comment.id}
                                  commentText={comment.text}
                                  platform={comment.comment_sources?.platform}
                                  language="de"
                                  existingSuggestions={comment.comment_analysis?.reply_suggestions}
                                />
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommentManager;
