import { tx } from "@/lib/i18nText";
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
            title: tx({ de: "Fehler", en: "Mistake", es: "Error" }),
            description: tx({ de: "Projekt konnte nicht erstellt werden", en: "Project could not be created", es: "No se pudo crear el proyecto" }),
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
          title: tx({ de: "Fehler", en: "Mistake", es: "Error" }),
          description: tx({ de: "Kommentare konnten nicht geladen werden", en: "Could not load comments", es: "No se pudieron cargar los comentarios" }),
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
        title: tx({ de: "Import erfolgreich", en: "Import successful", es: "Importación exitosa" }),
        description: data.message,
      });

      setImportDialogOpen(false);
      setImportText("");
      // Refresh comments
      window.location.reload();
    } catch (error: any) {
      console.error("Import error:", error);
      toast({
        title: tx({ de: "Import fehlgeschlagen", en: "Import failed", es: "Importación fallida" }),
        description: error.message || tx({ de: "Unbekannter Fehler", en: "Unknown error", es: "Error desconocido" }),
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

      toast({ title: tx({ de: "Status aktualisiert", en: "Status updated", es: "Estado actualizado" }) });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: tx({ de: "Fehler", en: "Mistake", es: "Error" }),
        description: tx({ de: "Status konnte nicht aktualisiert werden", en: "Could not update status", es: "No se pudo actualizar el estado" }),
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
          <h1 className="text-3xl font-bold">{tx({ de: "Alle Kommentare", en: "All comments", es: "Todos los comentarios" })}</h1>
          <p className="text-muted-foreground">{tx({ de: "Persistente Kommentarverwaltung über alle Plattformen", en: "Persistent comment management across all platforms", es: "Gestión persistente de comentarios en todas las plataformas" })}</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                tx({ de: 'Importieren', en: 'Import', es: 'Importar' })
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>tx({ de: 'Kommentare importieren', en: 'Import comments', es: 'Importar comentarios' }) + "</DialogTitle>"
              </DialogHeader>
              <Textarea
                placeholder="Ein Kommentar pro Zeile..."
                rows={10}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <Button onClick={handleImport}>tx({ de: 'Import starten', en: 'Start import', es: 'Iniciar importación' }) + "</Button>"
            </DialogContent>
          </Dialog>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            tx({ de: 'Exportieren', en: 'Export', es: 'Exportar' })
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">" + tx({ de: 'Gesamt', en: 'Total', es: 'Total' }) + "</div>
          <div className="text-2xl font-bold">{kpiData.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">" + tx({ de: 'Neu (24h)', en: 'New (24h)', es: 'Nuevo (24h)' }) + "</div>
          <div className="text-2xl font-bold">{kpiData.new24h}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">" + tx({ de: 'Offene Fragen', en: 'Open questions', es: 'Preguntas abiertas' }) + "</div>
          <div className="text-2xl font-bold">{kpiData.openQuestions}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">" + tx({ de: 'Leads', en: 'Leads', es: 'Leads' }) + "</div>
          <div className="text-2xl font-bold">{kpiData.leads}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">" + tx({ de: 'Toxisch', en: 'Toxic', es: 'Tóxico' }) + "</div>
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
            <SelectValue placeholder={tx({ de: "Plattform", en: "Platform", es: "Plataforma" })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{tx({ de: "Alle", en: "All", es: "Todos" })}</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSentiment} onValueChange={setFilterSentiment}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={tx({ de: "Sentiment", en: "Sentiment", es: "Sentimiento" })} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{tx({ de: "Alle", en: "All", es: "Todos" })}</SelectItem>
            <SelectItem value="positive">{tx({ de: "Positiv", en: "Positive", es: "Positivo" })}</SelectItem>
            <SelectItem value="neutral">{tx({ de: "Neutral", en: "Neutral", es: "Neutral" })}</SelectItem>
            <SelectItem value="negative">{tx({ de: "Negativ", en: "Negative", es: "Negativo" })}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="alle">Alle</TabsTrigger>
          <TabsTrigger value="inbox">{tx({ de: "Inbox", en: "Inbox", es: "Bandeja de entrada" })}</TabsTrigger>
          <TabsTrigger value="leads">{tx({ de: "Leads", en: "Leads", es: "Leads" })}</TabsTrigger>
          <TabsTrigger value="fragen">{tx({ de: "Fragen", en: "Questions", es: "Preguntas" })}</TabsTrigger>
          <TabsTrigger value="beschwerden">{tx({ de: "Beschwerden", en: "Complaints", es: "Quejas" })}</TabsTrigger>
          <TabsTrigger value="toxisch">{tx({ de: "Toxisch", en: "Toxic", es: "Tóxico" })}</TabsTrigger>
          <TabsTrigger value="erledigt">{tx({ de: "Erledigt", en: "Done", es: "Hecho" })}</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="mt-6">
          {loading ? (
            <div className="text-center py-12">{tx({ de: "Lädt...", en: "Loading...", es: "Cargando..." })}</div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              tx({ de: "Noch keine gespeicherten Kommentare – importiere Daten oder verbinde eine Quelle.", en: "No saved comments yet – import data or connect a source.", es: "Aún no hay comentarios guardados: importa datos o conecta una fuente." })
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox />
                  </TableHead>
                  <TableHead>{tx({ de: "Zeit", en: "Time", es: "Tiempo" })}</TableHead>
                  <TableHead>{tx({ de: "Plattform", en: "Platform", es: "Plataforma" })}</TableHead>
                  <TableHead>{tx({ de: "User", en: "User", es: "Usuario" })}</TableHead>
                  <TableHead>{tx({ de: "Kommentar", en: "Comment", es: "Comentario" })}</TableHead>
                  <TableHead>{tx({ de: "Sentiment", en: "Sentiment", es: "Sentimiento" })}</TableHead>
                  <TableHead>{tx({ de: "Intent", en: "Intent", es: "Intento" })}</TableHead>
                  <TableHead>{tx({ de: "Priorität", en: "Priority", es: "Prioridad" })}</TableHead>
                  <TableHead>{tx({ de: "Status", en: "Status", es: "Estado" })}</TableHead>
                  <TableHead>{tx({ de: "Aktionen", en: "Actions", es: "Acciones" })}</TableHead>
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
                          <SelectItem value="open">{tx({ de: "Offen", en: "Open", es: "Abierto" })}</SelectItem>
                          <SelectItem value="replied">{tx({ de: "Beantwortet", en: "Answered", es: "Respondido" })}</SelectItem>
                          <SelectItem value="ignored">{tx({ de: "Ignoriert", en: "Ignored", es: "Ignorado" })}</SelectItem>
                          <SelectItem value="flagged">{tx({ de: "Markiert", en: "Flagged", es: "Marcado" })}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" title={tx({ de: "Antwort kopieren", en: "Copy answer", es: "Copiar respuesta" })}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" title={tx({ de: "Als erledigt markieren", en: "Mark as done", es: "Marcar como hecho" })}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" title={tx({ de: "Flaggen", en: "Flag", es: "Marcar" })}>
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