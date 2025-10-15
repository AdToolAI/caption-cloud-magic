import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Footer } from "@/components/Footer";
import { CreditBalance } from "@/components/credits/CreditBalance";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { useAICall } from "@/hooks/useAICall";
import { supabase } from "@/integrations/supabase/client";
import { getNextSuggestedTime, getSuggestedDate } from "@/lib/suggestedTimes";
import { Copy, Sparkles, RefreshCw, Loader2, Calendar, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { AddPostModal } from "@/components/calendar/AddPostModal";
import { AICallStatus } from "@/components/ai/AICallStatus";
import { EventCreateDialog } from "@/components/calendar/EventCreateDialog";

const Generator = () => {
  const { t, language } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { emit } = useEventEmitter();
  const { executeAICall, loading: aiCallLoading, status } = useAICall();
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("friendly");
  const [platform, setPlatform] = useState("instagram");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [suggestedTime, setSuggestedTime] = useState<string>("");
  const [suggestedDate, setSuggestedDate] = useState<Date>(new Date());
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [clients, setClients] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);

  useEffect(() => {
    // Check if there's a prompt from the Wizard
    const wizardPrompt = localStorage.getItem("wizardPrompt");
    if (wizardPrompt) {
      setTopic(wizardPrompt);
      localStorage.removeItem("wizardPrompt");
      toast.success("Prompt loaded from Wizard!");
    }

    // Check if there's a prompt from the Wizard
    const urlParams = new URLSearchParams(window.location.search);
    const prefill = urlParams.get('prefill');
    const urlPlatform = urlParams.get('platform');
    
    if (prefill) {
      setTopic(decodeURIComponent(prefill));
      toast.success("Content loaded!");
    }
    
    if (urlPlatform) {
      setPlatform(urlPlatform);
    }
    
    // Clear the query params
    if (prefill || urlPlatform) {
      window.history.replaceState({}, '', '/generator');
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchWorkspaceData();
    }
  }, [user]);

  const fetchWorkspaceData = async () => {
    try {
      const { data: workspaces } = await supabase
        .from("workspaces")
        .select("id")
        .eq("owner_id", user?.id)
        .limit(1);

      if (workspaces && workspaces.length > 0) {
        const wsId = workspaces[0].id;
        setWorkspaceId(wsId);

        const [clientsData, brandsData, membersData] = await Promise.all([
          supabase.from("workspace_members").select("*").eq("workspace_id", wsId),
          supabase.from("brand_kits").select("id, brand_name").eq("user_id", user?.id),
          supabase
            .from("workspace_members")
            .select("user_id, profiles(email)")
            .eq("workspace_id", wsId),
        ]);

        setClients(clientsData.data || []);
        setBrands(brandsData.data || []);
        setWorkspaceMembers(membersData.data || []);
      }
    } catch (error) {
      console.error("Error fetching workspace data:", error);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error(t('generator_error_empty_topic'));
      return;
    }

    setIsGenerating(true);
    
    try {
      const data = await executeAICall({
        featureCode: 'caption_generate',
        estimatedCost: 1,
        apiCall: async () => {
          const { data, error } = await supabase.functions.invoke('generate-caption', {
            body: {
              topic: topic.trim(),
              tone,
              platform,
              language,
            }
          });

          if (error) {
            const enhancedError: any = new Error(error.message);
            enhancedError.status = error.context?.status;
            enhancedError.code = error.context?.code;
            throw enhancedError;
          }

          return data;
        }
      });

      setCaption(data.caption);
      setHashtags(data.hashtags);
      
      // Get suggested posting time for this platform
      const suggested = getNextSuggestedTime(platform);
      setSuggestedTime(suggested.time);
      setSuggestedDate(getSuggestedDate(suggested.time));
      
      // Emit event for caption creation
      await emit({
        event_type: 'caption.created',
        source: 'generator',
        payload: {
          platform,
          tone,
          topic: topic.substring(0, 50),
          has_hashtags: data.hashtags?.length > 0,
        },
      }, { silent: true });
      
      toast.success("Caption generated!");
    } catch (error: any) {
      console.error('Caption generation error:', error);
      
      if (error.code !== 'INSUFFICIENT_CREDITS') {
        let errorMessage = t('generator_error_unexpected');
        
        switch (error.status) {
          case 401:
          case 403:
            errorMessage = t('generator_error_auth_required');
            break;
          case 400:
          case 422:
            errorMessage = t('generator_error_invalid_input');
            break;
          case 503:
            errorMessage = t('generator_error_service_unavailable');
            break;
        }
        
        if (errorMessage !== t('generator_error_unexpected')) {
          toast.error(errorMessage);
        }
      }
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

  const handleQuickAddToCalendar = async () => {
    if (!caption) {
      toast.error("Generate a caption first");
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("calendar-quick-add", {
        body: {
          caption,
          platform,
          hashtags,
          suggestedTime: suggestedDate.toISOString(),
          language,
        },
      });

      if (error) throw error;

      toast.success("✅ Quick event created in calendar!");
    } catch (error: any) {
      console.error("Quick add error:", error);
      toast.error(error.message || "Failed to create event");
    }
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

  return (
    <div className="min-h-screen flex flex-col">
      <div className="container mx-auto px-6 py-4">
        <Breadcrumbs category="create" feature={t("nav.generator")} />
      </div>
      
      <main className="flex-1 py-12 px-4">
        <div className="container max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">{t('generator_title')}</h1>
            <div className="flex flex-col items-center gap-3">
              <CreditBalance />
              <AICallStatus stage={status.stage} message={status.message} retryAttempt={status.retryAttempt} />
            </div>
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

                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button onClick={handleCopy} variant="outline" className="flex-1">
                        <Copy className="mr-2 h-4 w-4" />
                        {t('btn_copy')}
                      </Button>
                      <Button onClick={handleNew} variant="outline" className="flex-1">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t('btn_new')}
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleQuickAddToCalendar} variant="default" className="flex-1">
                        <CalendarPlus className="mr-2 h-4 w-4" />
                        Quick Add to Calendar
                      </Button>
                      <Button onClick={() => setShowEventDialog(true)} variant="outline" className="flex-1">
                        <Calendar className="mr-2 h-4 w-4" />
                        Add with Details
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />

      <AddPostModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSave={() => {
          setShowScheduleModal(false);
          toast.success("Post scheduled successfully");
        }}
        prefillCaption={caption}
        prefillPlatform={platform}
        prefillDate={suggestedDate}
        suggestedTime={suggestedTime}
      />

      {workspaceId && (
        <EventCreateDialog
          open={showEventDialog}
          onClose={() => setShowEventDialog(false)}
          workspaceId={workspaceId}
          clients={clients}
          brands={brands}
          workspaceMembers={workspaceMembers}
          prefillCaption={caption}
          prefillHashtags={hashtags}
          prefillChannels={[platform.charAt(0).toUpperCase() + platform.slice(1)]}
          prefillStartDate={suggestedDate}
          onSuccess={() => {
            setShowEventDialog(false);
            toast.success("Event created successfully!");
          }}
        />
      )}
    </div>
  );
};

export default Generator;