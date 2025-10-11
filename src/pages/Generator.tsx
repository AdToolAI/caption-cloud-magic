import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Footer } from "@/components/Footer";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { Copy, Sparkles, RefreshCw, Loader2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { AddPostModal } from "@/components/calendar/AddPostModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const Generator = () => {
  const { t, language } = useTranslation();
  const { user, session, loading: authLoading } = useAuth();
  const { emit } = useEventEmitter();
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("friendly");
  const [platform, setPlatform] = useState("instagram");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const maxFreeUsage = 3;

  useEffect(() => {
    if (user) {
      fetchUsageAndProfile();
    }
  }, [user]);

  useEffect(() => {
    // Check if there's a prompt from the Wizard
    const wizardPrompt = localStorage.getItem("wizardPrompt");
    if (wizardPrompt) {
      setTopic(wizardPrompt);
      localStorage.removeItem("wizardPrompt");
      toast.success("Prompt loaded from Wizard!");
    }

    // Check for prefill from URL query params (from Hook Generator)
    const urlParams = new URLSearchParams(window.location.search);
    const prefill = urlParams.get('prefill');
    if (prefill) {
      setTopic(decodeURIComponent(prefill));
      // Clear the query param
      window.history.replaceState({}, '', '/generator');
      toast.success("Hook loaded!");
    }
  }, []);

  const fetchUsageAndProfile = async () => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user?.id)
        .single();
      
      setProfile(profileData);

      // Fetch today's usage
      const today = new Date().toISOString().split('T')[0];
      const { data: usageData } = await supabase
        .from('usage')
        .select('count')
        .eq('user_id', user?.id)
        .eq('date', today)
        .single();

      setUsageCount(usageData?.count || 0);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const handleGenerate = async () => {
    if (!user || !session) {
      toast.error("Please login to generate captions");
      return;
    }

    if (!topic.trim()) {
      toast.error("Please enter a topic");
      return;
    }

    // Check limits for free users
    if (profile?.plan === 'free' && usageCount >= maxFreeUsage) {
      setShowLimitModal(true);
      return;
    }

    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-caption', {
        body: {
          topic,
          tone,
          platform,
          language
        }
      });

      if (error) {
        if (error.message.includes('limit_reached')) {
          setShowLimitModal(true);
          return;
        }
        throw error;
      }

      setCaption(data.caption);
      setHashtags(data.hashtags);
      setUsageCount(prev => prev + 1);
      
      // Emit event for caption creation
      await emit({
        event_type: 'caption.created',
        source: 'generator',
        payload: {
          platform,
          tone,
          topic: topic.substring(0, 50), // truncate for storage
          has_hashtags: data.hashtags?.length > 0,
        },
      }, { silent: true });
      
      toast.success("Caption generated!");
    } catch (error: any) {
      console.error('Generation error:', error);
      toast.error(error.message || "Failed to generate caption");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    const fullText = `${caption}\n\n${hashtags.join(' ')}`;
    navigator.clipboard.writeText(fullText);
    toast.success("Copied to clipboard!");
  };

  const handleNew = () => {
    setTopic("");
    setCaption("");
    setHashtags([]);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const isPro = profile?.plan === 'pro';
  const usageText = isPro 
    ? "Unlimited" 
    : t('usage_counter', { used: usageCount, total: maxFreeUsage });

  return (
    <div className="min-h-screen flex flex-col">
      <div className="container mx-auto px-6 py-4">
        <Breadcrumbs category="create" feature={t("nav.generator")} />
      </div>
      
      <main className="flex-1 py-12 px-4">
        <div className="container max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">{t('generator_title')}</h1>
            <p className="text-muted-foreground flex items-center justify-center gap-2">
              {isPro && <Sparkles className="h-4 w-4 text-warning" />}
              {usageText}
            </p>
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>{t('generator_card_title')}</CardTitle>
              <CardDescription>{t('generator_card_description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="topic">{t('input_topic')}</Label>
                <Input
                  id="topic"
                  placeholder={t('input_topic_placeholder')}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tone">{t('input_tone')}</Label>
                  <Select value={tone} onValueChange={setTone} disabled={isGenerating}>
                    <SelectTrigger id="tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="friendly">{t('tone_friendly')}</SelectItem>
                      <SelectItem value="professional">{t('tone_professional')}</SelectItem>
                      <SelectItem value="funny">{t('tone_funny')}</SelectItem>
                      <SelectItem value="emotional">{t('tone_emotional')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform">{t('input_platform')}</Label>
                  <Select value={platform} onValueChange={setPlatform} disabled={isGenerating}>
                    <SelectTrigger id="platform">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="twitter">X (Twitter)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button 
                onClick={handleGenerate} 
                disabled={isGenerating}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {t('btn_generate')}
                  </>
                )}
              </Button>

              {caption && (
                <div className="space-y-4 pt-4 border-t animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="space-y-2">
                    <Label>Caption</Label>
                    <div className="p-4 bg-muted rounded-lg">
                      <p>{caption}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Hashtags</Label>
                    <div className="flex flex-wrap gap-2">
                      {hashtags.map((tag, index) => (
                        <span key={index} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleCopy} variant="outline" className="flex-1">
                      <Copy className="mr-2 h-4 w-4" />
                      {t('btn_copy')}
                    </Button>
                    <Button onClick={() => setShowScheduleModal(true)} variant="outline" className="flex-1">
                      <Calendar className="mr-2 h-4 w-4" />
                      {t('calendar_schedule_post')}
                    </Button>
                    <Button onClick={handleNew} variant="outline" className="flex-1">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {t('btn_new')}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />

      <Dialog open={showLimitModal} onOpenChange={setShowLimitModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('limit_reached_title')}</DialogTitle>
            <DialogDescription>
              {t('limit_reached_message')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLimitModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => window.location.href = '/account'}>
              {t('btn_upgrade')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddPostModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSave={() => {
          setShowScheduleModal(false);
          toast.success("Post scheduled successfully");
        }}
        prefillCaption={caption}
      />
    </div>
  );
};

export default Generator;