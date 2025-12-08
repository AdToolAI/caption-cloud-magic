import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Upload,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CommentDiagnostics } from "@/components/comments/CommentDiagnostics";
import { ReplySuggestions } from "@/components/comments/ReplySuggestions";
import { CommentManagerHeroHeader } from "@/components/comments/CommentManagerHeroHeader";

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

  const getSentimentBadgeClass = (sentiment?: string) => {
    if (sentiment === "positive") return "bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_8px_hsla(120,60%,50%,0.15)]";
    if (sentiment === "negative") return "bg-red-500/20 text-red-400 border-red-500/30 shadow-[0_0_8px_hsla(0,60%,50%,0.15)]";
    return "bg-muted/30 text-muted-foreground border-white/20";
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
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 mb-4"
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20
                             flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.2)]"
                >
                  <MessageSquare className="h-5 w-5 text-primary" />
                </motion.div>
                <h2 className="text-xl font-bold">Diagnose & Empfehlungen</h2>
              </motion.div>
              <CommentDiagnostics 
                data={summaryData?.diagnostics || null}
                loading={analyzing}
              />
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Hero Header */}
            <CommentManagerHeroHeader
              onImport={() => setImportDialogOpen(true)}
              onAnalyze={handleAnalyze}
              analyzing={analyzing}
              commentsCount={comments.length}
            />

            {/* Import Dialog */}
            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
              <DialogContent className="backdrop-blur-xl bg-card/90 border border-white/10">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20
                                    flex items-center justify-center shadow-[0_0_20px_hsla(43,90%,68%,0.2)]">
                      <Upload className="h-5 w-5 text-primary" />
                    </div>
                    Kommentare importieren
                  </DialogTitle>
                </DialogHeader>
                <Textarea
                  placeholder="Ein Kommentar pro Zeile..."
                  rows={10}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                />
                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <Button 
                    onClick={handleImport}
                    className="w-full bg-gradient-to-r from-primary to-primary/80
                               hover:shadow-[0_0_30px_hsla(43,90%,68%,0.4)]
                               transition-all duration-300"
                  >
                    Import starten
                  </Button>
                </motion.div>
              </DialogContent>
            </Dialog>

            {/* KPI Cards */}
            {summaryData && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4"
              >
                {[
                  { label: "Gesamt", value: summaryData.counts.total, color: "primary" },
                  { label: "Positiv", value: summaryData.counts.positive, color: "green" },
                  { label: "Offene Fragen", value: summaryData.unansweredQuestions, color: "yellow" },
                  { label: "Leads", value: summaryData.leadPotential, color: "cyan" },
                ].map((kpi, idx) => (
                  <motion.div
                    key={kpi.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ scale: 1.02, y: -4 }}
                    className="p-4 rounded-xl backdrop-blur-xl bg-card/60 border border-white/10
                               hover:border-primary/30 hover:shadow-[0_0_25px_hsla(43,90%,68%,0.12)]
                               transition-all duration-300"
                  >
                    <div className="text-sm text-muted-foreground">{kpi.label}</div>
                    <div className={`text-2xl font-bold ${
                      kpi.color === "green" ? "text-green-400" :
                      kpi.color === "yellow" ? "text-yellow-400" :
                      kpi.color === "cyan" ? "text-cyan-400" :
                      "text-foreground"
                    }`}>
                      {kpi.value}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {/* Search */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative group"
            >
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground
                                 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Suche nach Text, Username..."
                className="pl-10 h-12 bg-muted/20 border-white/10 focus:border-primary/60 
                           focus:ring-2 focus:ring-primary/20 rounded-xl"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </motion.div>

            {/* Tabs */}
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="bg-muted/20 border border-white/10 rounded-xl p-1.5">
                {["alle", "inbox", "leads", "fragen", "toxisch", "erledigt"].map((tab) => (
                  <TabsTrigger 
                    key={tab}
                    value={tab}
                    className="data-[state=active]:bg-primary/20 
                               data-[state=active]:text-primary
                               data-[state=active]:shadow-[0_0_10px_hsla(43,90%,68%,0.2)]
                               rounded-lg px-4 py-2 capitalize transition-all"
                  >
                    {tab === "alle" ? "Alle" :
                     tab === "inbox" ? "Inbox" :
                     tab === "leads" ? "Leads" :
                     tab === "fragen" ? "Fragen" :
                     tab === "toxisch" ? "Toxisch" :
                     "Erledigt"}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value={selectedTab} className="mt-6">
                {loading ? (
                  <div className="text-center py-12">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="w-8 h-8 mx-auto mb-4 border-2 border-primary border-t-transparent rounded-full"
                    />
                    <p className="text-muted-foreground">Lädt...</p>
                  </div>
                ) : filteredComments.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-16"
                  >
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ repeat: Infinity, duration: 3 }}
                      className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20
                                 flex items-center justify-center shadow-[0_0_30px_hsla(43,90%,68%,0.15)]"
                    >
                      <MessageSquare className="h-10 w-10 text-primary/60" />
                    </motion.div>
                    <p className="text-muted-foreground">Noch keine Kommentare – importiere Daten.</p>
                  </motion.div>
                ) : (
                  <div className="space-y-4">
                    {filteredComments.map((comment, idx) => {
                      const isExpanded = expandedComments.has(comment.id);
                      return (
                        <motion.div
                          key={comment.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          whileHover={{ y: -2 }}
                          className="p-4 rounded-xl backdrop-blur-xl bg-card/60 border border-white/10
                                     hover:border-primary/30 hover:shadow-[0_0_25px_hsla(43,90%,68%,0.12)]
                                     transition-all duration-300"
                        >
                          <div className="space-y-3">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(comment.created_at_platform)}
                                  </span>
                                  <Badge variant="outline" className="text-xs border-white/20 bg-muted/20">
                                    {comment.comment_sources?.platform || "manual"}
                                  </Badge>
                                  <span className="font-medium text-sm">{comment.username}</span>
                                  {comment.comment_analysis?.sentiment && (
                                    <Badge className={`text-xs border ${getSentimentBadgeClass(comment.comment_analysis.sentiment)}`}>
                                      {comment.comment_analysis.sentiment}
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-xs border-white/20 bg-muted/20">
                                    {comment.status}
                                  </Badge>
                                </div>
                                <p className="text-sm leading-relaxed">{comment.text}</p>
                                {comment.comment_analysis?.intent && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                      Intent:
                                    </span>
                                    <Badge variant="outline" className="text-xs border-primary/30 bg-primary/10 text-primary">
                                      {comment.comment_analysis.intent}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleCommentExpanded(comment.id)}
                                  className="hover:bg-primary/10 hover:text-primary transition-all"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              </motion.div>
                            </div>

                            {/* Expanded content with reply suggestions */}
                            {isExpanded && (
                              <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                className="pt-3 border-t border-white/10"
                              >
                                <ReplySuggestions
                                  commentId={comment.id}
                                  commentText={comment.text}
                                  platform={comment.comment_sources?.platform}
                                  language="de"
                                  existingSuggestions={comment.comment_analysis?.reply_suggestions}
                                />
                              </motion.div>
                            )}
                          </div>
                        </motion.div>
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
