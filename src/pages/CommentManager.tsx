import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Upload, Loader2, Copy, Check, Download, AlertTriangle, Search, TrendingUp, TrendingDown, Filter as FilterIcon, Users, Target } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CommentInsightCard } from "@/components/comments/CommentInsightCard";
import { CommentCharts } from "@/components/comments/CommentCharts";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Activity, Zap, Flag, Lightbulb } from "lucide-react";

interface AnalyzedComment {
  idx: number;
  username: string;
  comment: string;
  language: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  toxicity: 'none' | 'mild' | 'severe';
  intent: string;
  topics: string[];
  urgency: 'low' | 'medium' | 'high';
  priorityScore: number;
  action: string;
  replySuggestions: string[];
  riskNotes?: string;
}

interface Diagnostics {
  status: {
    mood: 'Gut' | 'Gemischt' | 'Kritisch';
    risk: 'Niedrig' | 'Mittel' | 'Hoch';
    momentum: 'steigend' | 'stabil' | 'fallend';
  };
  keyFindings: string[];
  quickWins: string[];
  actions: Array<{ title: string; impact: string; eta: string }>;
  risks: string[];
  experiments: string[];
}

interface AnalysisResult {
  requestId: string;
  summary: {
    total: number;
    deltaVsPrev: number;
    bySentiment: Record<string, number>;
    byIntent: Record<string, number>;
    toxicity: Record<string, number>;
    topTopics: Array<{ topic: string; count: number }>;
    unansweredQuestions: number;
    salesLeads: number;
  };
  timeseries: {
    byDay: Array<{ date: string; pos: number; neu: number; neg: number }>;
  };
  heatmap: Array<{ topic: string; positive: number; neutral: number; negative: number }>;
  insights: Array<{
    title: string;
    evidence: string;
    interpretation: string;
    action: string;
    impact: 'hoch' | 'mittel' | 'niedrig';
  }>;
  diagnostics?: Diagnostics;
  items: AnalyzedComment[];
  isFallback?: boolean;
}

export default function CommentManager() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [replyStyle, setReplyStyle] = useState("neutral");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [userPlan, setUserPlan] = useState("free");
  
  // Filters
  const [filterSentiment, setFilterSentiment] = useState<string>("all");
  const [filterIntent, setFilterIntent] = useState<string>("all");
  const [filterToxicity, setFilterToxicity] = useState<string>("all");
  const [filterUrgency, setFilterUrgency] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedComments, setSelectedComments] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<'priority' | 'time' | 'urgency'>('priority');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUserPlan(profile.plan || 'free');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const parseManualInput = () => {
    const lines = manualInput.trim().split('\n').filter(l => l.trim());
    const items = lines.map((line) => {
      const parts = line.split('|').map(p => p.trim());
      return {
        username: parts[0] || null,
        comment: parts[1] || line,
      };
    });
    // Remove duplicates
    const unique = items.filter((item, index, self) => 
      index === self.findIndex((t) => t.comment === item.comment)
    );
    return unique;
  };

  const handleAnalyze = async () => {
    if (!manualInput.trim()) {
      toast({
        title: "Eingabe erforderlich",
        description: "Bitte geben Sie Kommentare ein",
        variant: "destructive",
      });
      return;
    }

    setAnalyzing(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentifizierung erforderlich",
          description: "Bitte melden Sie sich an",
          variant: "destructive",
        });
        navigate('/auth');
        return;
      }

      const items = parseManualInput();

      if (items.length > 2000) {
        toast({
          title: "Zu viele Kommentare",
          description: "Maximal 2.000 Kommentare pro Analyse",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Analysiere Kommentare...",
        description: `${items.length} Kommentare werden verarbeitet`,
      });

      const { data, error } = await supabase.functions.invoke('analyze-comments', {
        body: {
          platform,
          replyStyle,
          items,
          lang: 'auto',
        }
      });

      if (error) {
        throw error;
      }

      setAnalysisResult(data);
      
      toast({
        title: "Analyse abgeschlossen",
        description: `${data.summary.total} Kommentare analysiert`,
      });

      setManualInput("");
    } catch (error) {
      console.error('Error analyzing comments:', error);
      toast({
        title: "Analyse fehlgeschlagen",
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const copyReply = (reply: string, idx: number) => {
    navigator.clipboard.writeText(reply);
    setCopiedIndex(idx);
    toast({ title: "Antwort kopiert" });
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const exportCSV = () => {
    if (!analysisResult) return;
    
    const csv = [
      ['Username', 'Comment', 'Sentiment', 'Intent', 'Topics', 'Urgency', 'Priority', 'Action', 'Reply'].join(','),
      ...filteredAndSortedComments.map(c => [
        c.username || '',
        `"${c.comment.replace(/"/g, '""')}"`,
        c.sentiment,
        c.intent,
        c.topics.join(';'),
        c.urgency,
        c.priorityScore,
        c.action,
        `"${c.replySuggestions[0]?.replace(/"/g, '""') || ''}"`,
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comments-analysis-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return 'bg-green-500';
      case 'negative': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      default: return 'bg-blue-500';
    }
  };

  const getToxicityIcon = (toxicity: string) => {
    if (toxicity === 'severe') return <AlertTriangle className="h-4 w-4 text-red-500" />;
    if (toxicity === 'mild') return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return null;
  };

  const filteredAndSortedComments = (() => {
    let filtered = analysisResult?.items.filter(comment => {
      if (filterSentiment !== 'all' && comment.sentiment !== filterSentiment) return false;
      if (filterIntent !== 'all' && comment.intent !== filterIntent) return false;
      if (filterToxicity !== 'all' && comment.toxicity !== filterToxicity) return false;
      if (filterUrgency !== 'all' && comment.urgency !== filterUrgency) return false;
      if (searchQuery && !comment.comment.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    }) || [];

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'priority') {
        comparison = b.priorityScore - a.priorityScore;
      } else if (sortBy === 'urgency') {
        const urgencyOrder = { high: 3, medium: 2, low: 1 };
        comparison = urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
      }
      return sortOrder === 'asc' ? -comparison : comparison;
    });

    return filtered;
  })();

  const toggleCommentSelection = (idx: number) => {
    const newSet = new Set(selectedComments);
    if (newSet.has(idx)) {
      newSet.delete(idx);
    } else {
      newSet.add(idx);
    }
    setSelectedComments(newSet);
  };

  const exportSelected = () => {
    if (selectedComments.size === 0) return;
    
    const selected = filteredAndSortedComments.filter(c => selectedComments.has(c.idx));
    const csv = [
      ['Username', 'Comment', 'Sentiment', 'Intent', 'Topics', 'Urgency', 'Priority', 'Action', 'Reply'].join(','),
      ...selected.map(c => [
        c.username || '',
        `"${c.comment.replace(/"/g, '""')}"`,
        c.sentiment,
        c.intent,
        c.topics.join(';'),
        c.urgency,
        c.priorityScore,
        c.action,
        `"${c.replySuggestions[0]?.replace(/"/g, '""') || ''}"`,
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selected-comments-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    toast({ title: `${selectedComments.size} Kommentare exportiert` });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-[1600px]">
        <div className="flex items-center gap-2 mb-2">
          <MessageCircle className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold">KI-Kommentar-Analysator</h1>
        </div>
        <p className="text-muted-foreground mb-8">Automatische Sentiment-Analyse, Insights und Handlungsempfehlungen</p>

        {/* Eingabe-Karte */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Kommentare eingeben</CardTitle>
            <CardDescription>Fügen Sie Kommentare zur Analyse ein (ein Kommentar pro Zeile)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Plattform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Antwortstil (nur für Vorschläge)</Label>
                <Select value={replyStyle} onValueChange={setReplyStyle}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="friendly">Freundlich</SelectItem>
                    <SelectItem value="humorous">Humorvoll</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Bestimmt den Ton der automatisch generierten Antwortvorschläge
                </p>
              </div>
            </div>

            <div>
              <Label>Kommentare (username | comment)</Label>
              <Textarea
                placeholder=""
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                rows={6}
                className="mt-2 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Format: username | kommentar (Username optional, ein Kommentar pro Zeile)
              </p>
            </div>

            <Button 
              onClick={handleAnalyze} 
              disabled={analyzing || !manualInput.trim()}
              className="w-full"
              size="lg"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analysiere Kommentare...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Kommentare analysieren
                </>
              )}
            </Button>

            {userPlan === 'free' && (
              <p className="text-xs text-muted-foreground text-center">
                Free Plan: Begrenzt auf 20 Kommentare pro Tag
              </p>
            )}
          </CardContent>
        </Card>

        {/* Fallback-Banner */}
        {analysisResult?.isFallback && (
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Fallback-Analyse aktiv: Ergebnisse können ungenauer sein. Die vollständige KI-Analyse ist vorübergehend nicht verfügbar.
            </AlertDescription>
          </Alert>
        )}

        {/* Ergebnis-Bereich */}
        {analysisResult && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Sidebar - Diagnostics */}
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Diagnose & Empfehlungen
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Status Check */}
                  {analysisResult.diagnostics && (
                    <>
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Status-Check</h4>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Stimmung</span>
                            <Badge variant={
                              analysisResult.diagnostics.status.mood === 'Gut' ? 'default' :
                              analysisResult.diagnostics.status.mood === 'Kritisch' ? 'destructive' : 'secondary'
                            }>
                              {analysisResult.diagnostics.status.mood}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Risiko</span>
                            <Badge variant={
                              analysisResult.diagnostics.status.risk === 'Hoch' ? 'destructive' :
                              analysisResult.diagnostics.status.risk === 'Mittel' ? 'secondary' : 'outline'
                            }>
                              {analysisResult.diagnostics.status.risk}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Momentum</span>
                            <Badge variant="outline" className="gap-1">
                              {analysisResult.diagnostics.status.momentum === 'steigend' && <TrendingUp className="h-3 w-3" />}
                              {analysisResult.diagnostics.status.momentum === 'fallend' && <TrendingDown className="h-3 w-3" />}
                              {analysisResult.diagnostics.status.momentum}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Key Findings */}
                      {analysisResult.diagnostics.keyFindings.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-1">
                            <Target className="h-4 w-4" />
                            Kernaussagen
                          </h4>
                          <ul className="space-y-1">
                            {analysisResult.diagnostics.keyFindings.map((finding, idx) => (
                              <li key={idx} className="text-xs text-muted-foreground flex gap-2">
                                <span className="text-primary">•</span>
                                <span>{finding}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Quick Wins */}
                      {analysisResult.diagnostics.quickWins.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-1">
                            <Zap className="h-4 w-4 text-yellow-500" />
                            Quick Wins
                          </h4>
                          <ul className="space-y-1">
                            {analysisResult.diagnostics.quickWins.map((win, idx) => (
                              <li key={idx} className="text-xs text-muted-foreground flex gap-2">
                                <span className="text-yellow-500">⚡</span>
                                <span>{win}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Recommended Actions */}
                      {analysisResult.diagnostics.actions.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-1">
                            <Lightbulb className="h-4 w-4" />
                            Empfohlene Maßnahmen
                          </h4>
                          <div className="space-y-2">
                            {analysisResult.diagnostics.actions.map((action, idx) => (
                              <div key={idx} className="text-xs p-2 rounded-lg bg-muted/50">
                                <div className="font-medium">{action.title}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant={
                                    action.impact === 'hoch' ? 'default' :
                                    action.impact === 'mittel' ? 'secondary' : 'outline'
                                  } className="text-[10px] px-1 py-0">
                                    {action.impact}
                                  </Badge>
                                  <span className="text-muted-foreground">ETA: {action.eta}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Risks */}
                      {analysisResult.diagnostics.risks.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm flex items-center gap-1">
                            <Flag className="h-4 w-4 text-red-500" />
                            Risiken & Wachsamkeit
                          </h4>
                          <ul className="space-y-1">
                            {analysisResult.diagnostics.risks.map((risk, idx) => (
                              <li key={idx} className="text-xs text-muted-foreground flex gap-2">
                                <span className="text-red-500">⚠</span>
                                <span>{risk}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Experiments */}
                      {analysisResult.diagnostics.experiments.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm">Geplante Experimente</h4>
                          <ul className="space-y-1">
                            {analysisResult.diagnostics.experiments.map((exp, idx) => (
                              <li key={idx} className="text-xs text-muted-foreground flex gap-2">
                                <span className="text-blue-500">🔬</span>
                                <span>{exp}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}

                  {!analysisResult.diagnostics && (
                    <div className="text-sm text-muted-foreground">
                      Diagnose-Daten werden geladen...
                    </div>
                  )}

                  {/* Filter Button */}
                  <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full mt-4" size="sm">
                        <FilterIcon className="h-4 w-4 mr-2" />
                        Filter öffnen
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Filter & Sortierung</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label className="text-sm">Sentiment</Label>
                          <Select value={filterSentiment} onValueChange={setFilterSentiment}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Alle</SelectItem>
                              <SelectItem value="positive">Positiv</SelectItem>
                              <SelectItem value="neutral">Neutral</SelectItem>
                              <SelectItem value="negative">Negativ</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm">Intent</Label>
                          <Select value={filterIntent} onValueChange={setFilterIntent}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Alle</SelectItem>
                              <SelectItem value="praise">Lob</SelectItem>
                              <SelectItem value="complaint">Beschwerde</SelectItem>
                              <SelectItem value="question">Frage</SelectItem>
                              <SelectItem value="feature_request">Feature Request</SelectItem>
                              <SelectItem value="sales_lead">Sales Lead</SelectItem>
                              <SelectItem value="spam">Spam</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm">Toxizität</Label>
                          <Select value={filterToxicity} onValueChange={setFilterToxicity}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Alle</SelectItem>
                              <SelectItem value="none">Keine</SelectItem>
                              <SelectItem value="mild">Mild</SelectItem>
                              <SelectItem value="severe">Schwer</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm">Dringlichkeit</Label>
                          <Select value={filterUrgency} onValueChange={setFilterUrgency}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Alle</SelectItem>
                              <SelectItem value="high">Hoch</SelectItem>
                              <SelectItem value="medium">Mittel</SelectItem>
                              <SelectItem value="low">Niedrig</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm">Sortierung</Label>
                          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="priority">Priorität</SelectItem>
                              <SelectItem value="urgency">Dringlichkeit</SelectItem>
                              <SelectItem value="time">Zeit</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full"
                          onClick={() => {
                            setFilterSentiment('all');
                            setFilterIntent('all');
                            setFilterToxicity('all');
                            setFilterUrgency('all');
                            setSearchQuery('');
                          }}
                        >
                          Filter zurücksetzen
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-3 space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Gesamt-Kommentare</CardDescription>
                    <CardTitle className="text-3xl">{analysisResult.summary.total}</CardTitle>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Sentiment-Verteilung</CardDescription>
                    <div className="flex gap-2 mt-2">
                      <Badge className="bg-green-500 text-white border-0">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {analysisResult.summary.bySentiment.positive || 0}
                      </Badge>
                      <Badge variant="secondary">
                        {analysisResult.summary.bySentiment.neutral || 0}
                      </Badge>
                      <Badge className="bg-red-500 text-white border-0">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        {analysisResult.summary.bySentiment.negative || 0}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Toxizität</CardDescription>
                    <div className="flex gap-2 mt-2">
                      {analysisResult.summary.toxicity.severe ? (
                        <Badge variant="destructive">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {analysisResult.summary.toxicity.severe} Schwer
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Keine schwere</Badge>
                      )}
                      {analysisResult.summary.toxicity.mild && (
                        <Badge variant="outline" className="text-yellow-600">
                          {analysisResult.summary.toxicity.mild} Mild
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      Offene Fragen
                    </CardDescription>
                    <CardTitle className="text-3xl">{analysisResult.summary.unansweredQuestions}</CardTitle>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription className="flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      Lead-Potenzial
                    </CardDescription>
                    <CardTitle className="text-3xl">{analysisResult.summary.salesLeads}</CardTitle>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Top-Themen</CardDescription>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {analysisResult.summary.topTopics.slice(0, 3).map((topic) => (
                        <Badge key={topic.topic} variant="outline" className="text-xs">
                          {topic.topic} ({topic.count})
                        </Badge>
                      ))}
                    </div>
                  </CardHeader>
                </Card>
              </div>

              {/* Charts Section */}
              <CommentCharts
                timeseries={analysisResult.timeseries}
                intentDistribution={analysisResult.summary.byIntent}
                heatmap={analysisResult.heatmap}
                topTopics={analysisResult.summary.topTopics}
              />

              {/* Insights Section */}
              {analysisResult.insights.length > 0 && (
                <div>
                  <h2 className="text-2xl font-bold mb-4">🔍 Erkenntnisse & Schlussfolgerungen</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysisResult.insights.map((insight, idx) => (
                      <CommentInsightCard key={idx} {...insight} />
                    ))}
                  </div>
                </div>
              )}

              {/* Comments Table */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <CardTitle>Kommentare & Antworten ({filteredAndSortedComments.length})</CardTitle>
                    <div className="flex gap-2">
                      {selectedComments.size > 0 && (
                        <Button variant="outline" size="sm" onClick={exportSelected}>
                          <Download className="h-4 w-4 mr-2" />
                          Ausgewählte exportieren ({selectedComments.size})
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={exportCSV}>
                        <Download className="h-4 w-4 mr-2" />
                        Alle exportieren (CSV)
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative mb-4">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Kommentare durchsuchen..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>

                  {filteredAndSortedComments.length === 0 ? (
                    <div className="text-center py-12">
                      <FilterIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">
                        Keine Treffer – ändere Filter oder lade neue Kommentare.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredAndSortedComments.map((comment) => (
                        <Card key={comment.idx} className="relative">
                          <div className="absolute top-4 left-4">
                            <Checkbox
                              checked={selectedComments.has(comment.idx)}
                              onCheckedChange={() => toggleCommentSelection(comment.idx)}
                            />
                          </div>
                          {comment.toxicity !== 'none' && (
                            <div className="absolute top-4 right-4">
                              {getToxicityIcon(comment.toxicity)}
                            </div>
                          )}
                          <CardHeader className="pl-12">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="font-semibold">
                              {comment.username || `Anonym`}
                            </span>
                            <Badge className={`${getSentimentColor(comment.sentiment)} text-white border-0`}>
                              {comment.sentiment}
                            </Badge>
                            <Badge variant="outline">{comment.intent}</Badge>
                            <Badge className={`${getUrgencyColor(comment.urgency)} text-white border-0`}>
                              {comment.urgency} Dringlichkeit
                            </Badge>
                            <Badge variant="secondary">Score: {comment.priorityScore}</Badge>
                            <Badge variant="outline">{comment.action}</Badge>
                            {comment.topics.map(topic => (
                              <Badge key={topic} variant="secondary" className="text-xs">
                                {topic}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {comment.comment}
                          </p>
                          {comment.riskNotes && (
                            <Alert className="mt-2">
                              <AlertTriangle className="h-4 w-4" />
                              <AlertDescription className="text-xs">
                                {comment.riskNotes}
                              </AlertDescription>
                            </Alert>
                          )}
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Antwortvorschläge:</Label>
                            {comment.replySuggestions.map((reply, idx) => (
                              <div key={idx} className="flex items-start gap-2 p-3 border rounded-lg">
                                <p className="text-sm flex-1">{reply}</p>
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => copyReply(reply, comment.idx * 10 + idx)}
                                >
                                  {copiedIndex === comment.idx * 10 + idx ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
