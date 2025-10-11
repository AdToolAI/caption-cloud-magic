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
import { MessageCircle, Upload, Loader2, Copy, Check, Flag, RotateCw } from "lucide-react";
import { Label } from "@/components/ui/label";

interface Comment {
  id: string;
  username: string;
  comment_text: string;
  sentiment: string;
  sentiment_score: number;
  intent: string;
  ai_replies: {
    friendly: string;
    professional: string;
    playful: string;
  };
  platform: string;
  is_resolved: boolean;
}

export default function CommentManager() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [brandTone, setBrandTone] = useState("friendly");
  const [copiedReply, setCopiedReply] = useState<string>("");
  const [userPlan, setUserPlan] = useState("free");

  useEffect(() => {
    fetchUserData();
    fetchComments();
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

  const fetchComments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setComments((data || []) as unknown as Comment[]);
    } catch (error) {
      console.error('Error fetching comments:', error);
      toast({
        title: "Error loading comments",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const parseManualInput = () => {
    const lines = manualInput.trim().split('\n').filter(l => l.trim());
    return lines.map((line, idx) => {
      const parts = line.split('|').map(p => p.trim());
      return {
        username: parts[0] || `user${idx + 1}`,
        comment_text: parts[1] || line,
        platform,
        post_id: parts[2] || null,
        timestamp: new Date().toISOString(),
      };
    });
  };

  const handleAnalyze = async () => {
    if (!manualInput.trim()) {
      toast({
        title: "Input required",
        description: "Please enter comments to analyze",
        variant: "destructive",
      });
      return;
    }

    setAnalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in to analyze comments",
          variant: "destructive",
        });
        navigate('/auth');
        return;
      }

      const commentsToAnalyze = parseManualInput();

      const { data, error } = await supabase.functions.invoke('analyze-comments', {
        body: {
          comments: commentsToAnalyze,
          brand_tone: brandTone,
          platform,
          language: 'en',
        }
      });

      if (error) {
        if (error.message?.includes('Daily limit')) {
          toast({
            title: t('commentManager.limit_reached'),
            description: t('commentManager.upgrade_message'),
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      toast({
        title: "Analysis complete",
        description: `Analyzed ${data.count} comments`,
      });

      setManualInput("");
      fetchComments();
    } catch (error) {
      console.error('Error analyzing comments:', error);
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const copyReply = (reply: string, commentId: string) => {
    navigator.clipboard.writeText(reply);
    setCopiedReply(commentId);
    toast({ title: "Reply copied to clipboard" });
    setTimeout(() => setCopiedReply(""), 2000);
  };

  const markResolved = async (id: string) => {
    try {
      const { error } = await supabase
        .from('comments')
        .update({ is_resolved: true })
        .eq('id', id);

      if (error) throw error;
      
      setComments(comments.map(c => c.id === id ? { ...c, is_resolved: true } : c));
      toast({ title: "Comment marked as resolved" });
    } catch (error) {
      console.error('Error resolving comment:', error);
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive': return 'bg-green-500';
      case 'negative': return 'bg-red-500';
      case 'question': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-2 mb-2">
          <MessageCircle className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold">{t('commentManager.title')}</h1>
        </div>
        <p className="text-muted-foreground mb-8">{t('commentManager.subtitle')}</p>

        {/* Import Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('commentManager.import_label')}</CardTitle>
            <CardDescription>{t('commentManager.import_description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('commentManager.platform')}</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>{t('commentManager.brand_tone')}</Label>
                <Select value={brandTone} onValueChange={setBrandTone}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">{t('campaign_tone_friendly')}</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="playful">Playful</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{t('commentManager.manual_input')}</Label>
              <Textarea
                placeholder={t('commentManager.input_placeholder')}
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                rows={6}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('commentManager.input_format')}
              </p>
            </div>

            <Button 
              onClick={handleAnalyze} 
              disabled={analyzing || !manualInput.trim()}
              className="w-full"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('commentManager.analyzing')}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {t('commentManager.analyze_button')}
                </>
              )}
            </Button>

            {userPlan === 'free' && (
              <p className="text-xs text-muted-foreground text-center">
                {t('commentManager.free_limit')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Comments Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('commentManager.comments_list')}</CardTitle>
            <CardDescription>
              {comments.length} {t('commentManager.total_comments')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-12">
                <MessageCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">{t('commentManager.no_comments')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <Card key={comment.id} className={comment.is_resolved ? 'opacity-60' : ''}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold">@{comment.username}</span>
                            <Badge className={`${getSentimentColor(comment.sentiment)} text-white border-0 capitalize`}>
                              {comment.sentiment}
                            </Badge>
                            <Badge variant="outline" className="capitalize">
                              {comment.intent}
                            </Badge>
                            {comment.is_resolved && (
                              <Badge variant="secondary">
                                <Check className="h-3 w-3 mr-1" />
                                Resolved
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-4">
                            {comment.comment_text}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        {comment.ai_replies && (
                          <>
                            <div className="border rounded-lg p-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                😊 Friendly
                              </p>
                              <p className="text-sm mb-2">{comment.ai_replies.friendly}</p>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => copyReply(comment.ai_replies.friendly, `${comment.id}-friendly`)}
                              >
                                {copiedReply === `${comment.id}-friendly` ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>

                            <div className="border rounded-lg p-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                💼 Professional
                              </p>
                              <p className="text-sm mb-2">{comment.ai_replies.professional}</p>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => copyReply(comment.ai_replies.professional, `${comment.id}-prof`)}
                              >
                                {copiedReply === `${comment.id}-prof` ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>

                            <div className="border rounded-lg p-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                🎉 Playful
                              </p>
                              <p className="text-sm mb-2">{comment.ai_replies.playful}</p>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => copyReply(comment.ai_replies.playful, `${comment.id}-play`)}
                              >
                                {copiedReply === `${comment.id}-play` ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {!comment.is_resolved && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => markResolved(comment.id)}
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Mark Resolved
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
