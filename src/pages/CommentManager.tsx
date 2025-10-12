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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Upload, Loader2, Copy, Check, Flag, Download, AlertTriangle, Filter, Search, TrendingUp, TrendingDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

interface AnalysisResult {
  requestId: string;
  summary: {
    total: number;
    bySentiment: Record<string, number>;
    byIntent: Record<string, number>;
    toxicity: Record<string, number>;
    topTopics: Array<{ topic: string; count: number }>;
  };
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
  const [searchQuery, setSearchQuery] = useState("");

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
      ...filteredComments.map(c => [
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
    if (toxicity === 'mild') return <Flag className="h-4 w-4 text-yellow-500" />;
    return null;
  };

  const filteredComments = analysisResult?.items.filter(comment => {
    if (filterSentiment !== 'all' && comment.sentiment !== filterSentiment) return false;
    if (filterIntent !== 'all' && comment.intent !== filterIntent) return false;
    if (filterToxicity !== 'all' && comment.toxicity !== filterToxicity) return false;
    if (searchQuery && !comment.comment.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }) || [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-2 mb-2">
          <MessageCircle className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold">Kommentar-Manager</h1>
        </div>
        <p className="text-muted-foreground mb-8">Analysiere Kommentare und erhalte KI-gestützte Antwortvorschläge</p>

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
                <Label>Antwortstil (für Vorschläge)</Label>
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
              </div>
            </div>

            <div>
              <Label>Kommentare (username | comment)</Label>
              <Textarea
                placeholder="@max | Er ist nicht wirklich professionell. Seine Seite sieht aus wie schwachsinn&#10;Mega Content! Weiter so 💪"
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
          <>
            {/* Summary-Kacheln */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Gesamt</CardDescription>
                  <CardTitle className="text-3xl">{analysisResult.summary.total}</CardTitle>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Sentiment</CardDescription>
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
                    {analysisResult.summary.toxicity.severe && (
                      <Badge variant="destructive">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {analysisResult.summary.toxicity.severe} Schwer
                      </Badge>
                    )}
                    {analysisResult.summary.toxicity.mild && (
                      <Badge variant="outline" className="text-yellow-600">
                        {analysisResult.summary.toxicity.mild} Mild
                      </Badge>
                    )}
                    {!analysisResult.summary.toxicity.severe && !analysisResult.summary.toxicity.mild && (
                      <Badge variant="secondary">Keine</Badge>
                    )}
                  </div>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Top-Topics</CardDescription>
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

            {/* Filter & Export */}
            <Card className="mb-6">
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <CardTitle>Kommentare & Antworten ({filteredComments.length})</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={exportCSV}>
                      <Download className="h-4 w-4 mr-2" />
                      CSV Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Suche..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  
                  <Select value={filterSentiment} onValueChange={setFilterSentiment}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sentiment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Sentiments</SelectItem>
                      <SelectItem value="positive">Positiv</SelectItem>
                      <SelectItem value="neutral">Neutral</SelectItem>
                      <SelectItem value="negative">Negativ</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterIntent} onValueChange={setFilterIntent}>
                    <SelectTrigger>
                      <SelectValue placeholder="Intent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Intents</SelectItem>
                      <SelectItem value="praise">Lob</SelectItem>
                      <SelectItem value="complaint">Beschwerde</SelectItem>
                      <SelectItem value="question">Frage</SelectItem>
                      <SelectItem value="feature_request">Feature Request</SelectItem>
                      <SelectItem value="spam">Spam</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filterToxicity} onValueChange={setFilterToxicity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Toxizität" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle</SelectItem>
                      <SelectItem value="none">Keine</SelectItem>
                      <SelectItem value="mild">Mild</SelectItem>
                      <SelectItem value="severe">Schwer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Tabelle */}
                {filteredComments.length === 0 ? (
                  <div className="text-center py-12">
                    <Filter className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Keine Treffer – ändere Filter oder lade neue Kommentare.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredComments.map((comment) => (
                      <Card key={comment.idx} className="relative">
                        {comment.toxicity !== 'none' && (
                          <div className="absolute top-4 right-4">
                            {getToxicityIcon(comment.toxicity)}
                          </div>
                        )}
                        <CardHeader>
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
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
