import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Calendar, ExternalLink, Trash2, FileDown, Upload, Video, X } from "lucide-react";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { CampaignMediaUploader, type UploadedMedia } from "@/components/campaigns/CampaignMediaUploader";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { GripVertical, Sparkles } from "lucide-react";

interface CampaignPost {
  id?: string;
  day: string;
  post_type: string;
  title: string;
  caption_outline: string;
  hashtags: string[];
  cta: string;
  best_time: string;
  media_url?: string;
  media_type?: string;
  media_title?: string;
}

interface CampaignWeek {
  week_number: number;
  theme: string;
  posts: CampaignPost[];
}

interface Campaign {
  id: string;
  title: string;
  goal: string;
  topic: string;
  tone: string;
  audience: string;
  duration_weeks: number;
  platform: string[];
  post_frequency: number;
  summary: string;
  ai_json: {
    summary: string;
    weeks: CampaignWeek[];
    hashtag_strategy: string;
    posting_tips: string[];
  };
  created_at: string;
}

const Campaigns = () => {
  const { t, language } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPlanLimit, setShowPlanLimit] = useState(false);
  const [userPlan, setUserPlan] = useState<string>("free");

  // Form state
  const [goal, setGoal] = useState("");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("friendly");
  const [audience, setAudience] = useState("");
  const [durationWeeks, setDurationWeeks] = useState(1);
  const [postFrequency, setPostFrequency] = useState(5);
  const [platforms, setPlatforms] = useState<string[]>(["instagram"]);
  const [campaignMedia, setCampaignMedia] = useState<UploadedMedia[]>([]);
  const [mediaAssignments, setMediaAssignments] = useState<Record<string, string>>({});
  const [postTypes, setPostTypes] = useState<Array<{
    type: 'Reel' | 'Carousel' | 'Story' | 'Static Post' | 'Link Post';
    count: number;
  }>>([
    { type: 'Static Post', count: 3 },
    { type: 'Reel', count: 2 }
  ]);
  const [autoDestination, setAutoDestination] = useState<'none' | 'calendar' | 'planner'>('none');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user) {
      loadUserPlan();
      loadCampaigns();
      loadWorkspace();
    }
  }, [session]);

  const loadUserPlan = async () => {
    if (!session?.user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", session.user.id)
      .single();
    
    if (data) {
      setUserPlan(data.plan || "free");
    }
  };

  const loadWorkspace = async () => {
    if (!session?.user) return;
    
    const { data } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle();
    
    if (data) {
      setWorkspaceId(data.workspace_id);
    }
  };

  const loadCampaigns = async () => {
    if (!session?.user) return;

    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading campaigns:", error);
      return;
    }

    setCampaigns((data || []).map(c => ({
      ...c,
      platform: c.platform as unknown as string[],
      ai_json: c.ai_json as unknown as {
        summary: string;
        weeks: CampaignWeek[];
        hashtag_strategy: string;
        posting_tips: string[];
      }
    })));
    
    if (data && data.length > 0 && !selectedCampaign) {
      const first = data[0];
      setSelectedCampaign({
        ...first,
        platform: first.platform as unknown as string[],
        ai_json: first.ai_json as unknown as {
          summary: string;
          weeks: CampaignWeek[];
          hashtag_strategy: string;
          posting_tips: string[];
        }
      });
    }
  };

  const togglePlatform = (platform: string) => {
    setPlatforms(prev => 
      prev.includes(platform)
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const scheduleToCalendar = async (campaign: Campaign) => {
    if (!session?.user) return;

    try {
      setIsGenerating(true);
      toast.info('Übertrage Posts in Kalender...');

      // Update campaign_posts with assigned media BEFORE scheduling
      for (const week of campaign.ai_json.weeks) {
        for (const post of week.posts) {
          if (post.id && mediaAssignments[post.id]) {
            const media = campaignMedia.find(m => m.id === mediaAssignments[post.id]);
            if (media) {
              await supabase
                .from('campaign_posts')
                .update({
                  media_url: media.preview,
                  media_type: media.type,
                  media_title: media.title,
                })
                .eq('id', post.id);
            }
          }
        }
      }

      const { data, error } = await supabase.functions.invoke('campaign-to-calendar', {
        body: {
          campaignId: campaign.id,
          startDate: new Date().toISOString(),
        }
      });

      if (error) throw error;

      toast.success(`✅ ${data.eventsCreated} Posts im Kalender eingeplant!`);
      
      setTimeout(() => {
        navigate('/calendar');
      }, 1500);

    } catch (error: any) {
      console.error('Error scheduling to calendar:', error);
      toast.error('Fehler beim Einplanen der Posts');
    } finally {
      setIsGenerating(false);
    }
  };

  const scheduleToPlanner = async (campaign: Campaign) => {
    if (!session?.user || !workspaceId) {
      toast.error('Workspace nicht gefunden');
      return;
    }

    try {
      setIsGenerating(true);
      toast.info('📅 Übertrage Kampagne in Content-Planner mit KI-optimierten Zeiten...');
      
      // Update campaign_posts with assigned media BEFORE scheduling
      for (const week of campaign.ai_json.weeks) {
        for (const post of week.posts) {
          if (post.id && mediaAssignments[post.id]) {
            const media = campaignMedia.find(m => m.id === mediaAssignments[post.id]);
            if (media) {
              await supabase
                .from('campaign_posts')
                .update({
                  media_url: media.preview,
                  media_type: media.type,
                  media_title: media.title,
                })
                .eq('id', post.id);
            }
          }
        }
      }
      
      const { data, error } = await supabase.functions.invoke('campaign-to-planner', {
        body: {
          campaignId: campaign.id,
          startDate: new Date().toISOString(),
          workspaceId: workspaceId,
        }
      });
      
      if (error) throw error;
      
      toast.success(`✅ ${data.blocksCreated} Posts mit KI-optimierten Zeiten im Content-Planner eingeplant!`);
      
      setTimeout(() => {
        navigate('/planner');
      }, 1500);
      
    } catch (error: any) {
      console.error('Error scheduling to planner:', error);
      toast.error('Fehler beim Übertragen in Content-Planner');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (!session?.user) {
      toast.error("Please sign in to generate campaigns");
      return;
    }

    if (!goal.trim() || !topic.trim() || platforms.length === 0) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate post types
    const totalPosts = postTypes.reduce((sum, pt) => sum + pt.count, 0);
    if (totalPosts !== postFrequency) {
      toast.error(`Post-Typen ergeben ${totalPosts}, aber ${postFrequency} Posts/Woche ausgewählt`);
      return;
    }

    if (userPlan === "free" && campaigns.length >= 1) {
      setShowPlanLimit(true);
      return;
    }

    if (userPlan === "free" && durationWeeks > 1) {
      toast.error(t("campaign_limit_reached"));
      setShowPlanLimit(true);
      return;
    }

    setIsGenerating(true);

    try {
      // Upload media files first if any
      const uploadedMediaUrls = [];

      if (campaignMedia.length > 0) {
        toast.info('Lade Medien hoch...');
        
        for (const media of campaignMedia) {
          const fileExt = media.file.name.split('.').pop();
          const fileName = `${session.user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `campaigns/${fileName}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('media-assets')
            .upload(filePath, media.file);

          if (uploadError) {
            console.error('Media upload error:', uploadError);
            continue;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('media-assets')
            .getPublicUrl(uploadData.path);

          uploadedMediaUrls.push({
            storage_path: uploadData.path,
            public_url: publicUrl,
            media_type: media.type,
            file_size: media.file.size,
            mime_type: media.file.type,
          });
        }
      }

      const { data, error } = await supabase.functions.invoke("generate-campaign", {
        body: {
          goal: goal.trim(),
          topic: topic.trim(),
          tone,
          audience: audience.trim(),
          durationWeeks,
          platforms,
          postFrequency,
          language,
          media: uploadedMediaUrls,
          postTypes: postTypes,
        },
      });

      if (error) throw error;

      toast.success(t("campaign_created"));
      
      // Auto-schedule based on selected destination
      if (autoDestination === 'planner' && data?.campaign) {
        await scheduleToPlanner(data.campaign);
      } else if (autoDestination === 'calendar' && data?.campaign) {
        await scheduleToCalendar(data.campaign);
      } else {
        await loadCampaigns();
        if (data?.campaign) {
          setSelectedCampaign(data.campaign);
        }
      }

      // Reset form
      setGoal("");
      setTopic("");
      setAudience("");
      setCampaignMedia([]);
      setMediaAssignments({});
      setPostTypes([
        { type: 'Static Post', count: 3 },
        { type: 'Reel', count: 2 }
      ]);

    } catch (error: any) {
      console.error("Error generating campaign:", error);
      
      if (error.message?.includes("429")) {
        toast.error(t("campaign_limit_reached"));
        setShowPlanLimit(true);
      } else if (error.message?.includes("402")) {
        toast.error("AI credits exhausted. Please add credits to continue.");
      } else {
        toast.error("Failed to generate campaign. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (campaignId: string) => {
    if (!confirm("Delete this campaign?")) return;

    const { error } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", campaignId);

    if (error) {
      console.error("Error deleting campaign:", error);
      toast.error("Failed to delete campaign");
      return;
    }

    toast.success(t("campaign_deleted"));
    await loadCampaigns();
    
    if (selectedCampaign?.id === campaignId) {
      setSelectedCampaign(campaigns.length > 1 ? campaigns[0] : null);
    }
  };

  const handleAddToCalendar = async (post: CampaignPost) => {
    // TODO: Implement calendar integration
    toast.info(t("campaign_added_to_calendar"));
  };

  const handleOpenGenerator = (post: CampaignPost) => {
    // Navigate to generator with prefilled content
    navigate("/generator", { state: { prefillCaption: post.caption_outline } });
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, mediaId: string) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('mediaId', mediaId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent, postId: string) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData('mediaId');
    
    if (mediaId) {
      setMediaAssignments(prev => ({
        ...prev,
        [postId]: mediaId,
      }));
      
      toast.success('Media zugeordnet');
    }
  };

  // Auto-assign media to posts
  const autoAssignMedia = () => {
    if (!selectedCampaign) return;

    const newAssignments = { ...mediaAssignments };
    const usedMediaIds = new Set(Object.values(newAssignments));
    
    for (const week of selectedCampaign.ai_json.weeks) {
      for (const post of week.posts) {
        if (post.id && !newAssignments[post.id]) {
          // Find appropriate media
          let suggestedMedia;
          
          if (post.post_type === 'Reel' || post.post_type === 'Story') {
            suggestedMedia = campaignMedia.find(m => 
              m.type === 'video' && !usedMediaIds.has(m.id)
            );
          } else {
            suggestedMedia = campaignMedia.find(m => 
              m.type === 'image' && !usedMediaIds.has(m.id)
            );
          }
          
          if (suggestedMedia) {
            newAssignments[post.id] = suggestedMedia.id;
            usedMediaIds.add(suggestedMedia.id);
          }
        }
      }
    }
    
    setMediaAssignments(newAssignments);
    
    const count = Object.keys(newAssignments).length - Object.keys(mediaAssignments).length;
    toast.success(`${count} Medien automatisch zugeordnet`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">{t("campaign_title")}</h1>
            <p className="text-muted-foreground">{t("campaign_subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Sidebar - Campaign List */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>{t("campaign_my_campaigns")}</CardTitle>
              </CardHeader>
              <CardContent>
                {campaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("campaign_no_campaigns")}</p>
                ) : (
                  <div className="space-y-2">
                    {campaigns.map((campaign) => (
                      <button
                        key={campaign.id}
                        onClick={() => setSelectedCampaign(campaign)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedCampaign?.id === campaign.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "hover:bg-muted border-border"
                        }`}
                      >
                        <p className="font-medium text-sm">{campaign.title}</p>
                        <p className="text-xs opacity-70">
                          {campaign.duration_weeks} {campaign.duration_weeks === 1 ? "week" : "weeks"} • {campaign.platform.join(", ")}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Input Form */}
              <Card>
                <CardHeader>
                  <CardTitle>Create New Campaign</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="goal">{t("campaign_goal_label")} *</Label>
                    <Textarea
                      id="goal"
                      placeholder={t("campaign_goal_placeholder")}
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      disabled={isGenerating}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="topic">{t("campaign_topic_label")} *</Label>
                    <Input
                      id="topic"
                      placeholder={t("campaign_topic_placeholder")}
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      disabled={isGenerating}
                      className="mt-2"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t("campaign_duration_label")}</Label>
                      <Select value={durationWeeks.toString()} onValueChange={(v) => setDurationWeeks(parseInt(v))} disabled={isGenerating}>
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                            <SelectItem key={n} value={n.toString()} disabled={userPlan === "free" && n > 1}>
                              {n} week{n > 1 && "s"} {userPlan === "free" && n > 1 && "🔒"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>{t("campaign_frequency_label")}</Label>
                      <Select value={postFrequency.toString()} onValueChange={(v) => setPostFrequency(parseInt(v))} disabled={isGenerating}>
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[3, 4, 5, 6, 7].map((n) => (
                            <SelectItem key={n} value={n.toString()}>
                              {n} posts/week
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>{t("campaign_platform_label")} *</Label>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {["instagram", "tiktok", "linkedin", "facebook", "x"].map((platform) => (
                        <div key={platform} className="flex items-center space-x-2">
                          <Checkbox
                            id={platform}
                            checked={platforms.includes(platform)}
                            onCheckedChange={() => togglePlatform(platform)}
                            disabled={isGenerating}
                          />
                          <label htmlFor={platform} className="text-sm capitalize cursor-pointer">
                            {platform}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="tone">{t("campaign_tone_label")}</Label>
                    <Select value={tone} onValueChange={setTone} disabled={isGenerating}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly">{t("campaign_tone_friendly")}</SelectItem>
                        <SelectItem value="bold">{t("campaign_tone_bold")}</SelectItem>
                        <SelectItem value="educational">{t("campaign_tone_educational")}</SelectItem>
                        <SelectItem value="emotional">{t("campaign_tone_emotional")}</SelectItem>
                        <SelectItem value="corporate">{t("campaign_tone_corporate")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="audience">{t("campaign_audience_label")}</Label>
                    <Input
                      id="audience"
                      placeholder={t("campaign_audience_placeholder")}
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      disabled={isGenerating}
                      className="mt-2"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Post-Typen definieren</Label>
                    <p className="text-sm text-muted-foreground">
                      Bestimme, welche Art von Posts erstellt werden sollen
                    </p>
                    
                    {postTypes.map((pt, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <Select 
                          value={pt.type}
                          onValueChange={(value: any) => {
                            const updated = [...postTypes];
                            updated[index].type = value;
                            setPostTypes(updated);
                          }}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Reel">🎥 Reel</SelectItem>
                            <SelectItem value="Carousel">📸 Carousel</SelectItem>
                            <SelectItem value="Story">⚡ Story</SelectItem>
                            <SelectItem value="Static Post">🖼️ Static Post</SelectItem>
                            <SelectItem value="Link Post">🔗 Link Post</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={pt.count}
                          onChange={(e) => {
                            const updated = [...postTypes];
                            updated[index].count = parseInt(e.target.value) || 1;
                            setPostTypes(updated);
                          }}
                          className="w-20"
                        />
                        <span className="text-sm text-muted-foreground">pro Woche</span>
                        
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setPostTypes(postTypes.filter((_, i) => i !== index));
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPostTypes([...postTypes, { type: 'Static Post', count: 1 }]);
                      }}
                    >
                      + Post-Typ hinzufügen
                    </Button>
                    
                    <div className="text-sm text-muted-foreground">
                      Gesamt: {postTypes.reduce((sum, pt) => sum + pt.count, 0)} Posts/Woche
                    </div>
                  </div>

                  <div>
                    <CampaignMediaUploader 
                      onMediaChange={setCampaignMedia}
                      maxFiles={20}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      💡 Tipp: Lade Medien hoch, um sie Posts zuordnen zu können
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Nach Generierung automatisch übertragen:</Label>
                    <div className="flex flex-col gap-2 pl-1">
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          id="auto-to-calendar"
                          checked={autoDestination === 'calendar'} 
                          onCheckedChange={() => setAutoDestination(autoDestination === 'calendar' ? 'none' : 'calendar')}
                        />
                        <Label htmlFor="auto-to-calendar" className="text-sm cursor-pointer font-normal">
                          📅 In Kalender übertragen
                        </Label>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          id="auto-to-planner"
                          checked={autoDestination === 'planner'} 
                          onCheckedChange={() => setAutoDestination(autoDestination === 'planner' ? 'none' : 'planner')}
                        />
                        <Label htmlFor="auto-to-planner" className="text-sm cursor-pointer font-normal">
                          ⚡ In Content-Planner mit KI-optimierten Zeiten
                        </Label>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={handleGenerate} 
                    disabled={isGenerating || !goal.trim() || !topic.trim() || platforms.length === 0}
                    className="w-full"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("campaign_generating")}
                      </>
                    ) : (
                      t("campaign_generate")
                    )}
                  </Button>

                  {userPlan === "free" && (
                    <p className="text-xs text-muted-foreground text-center">
                      Free: 1 campaign (1 week) • Pro: Unlimited (up to 8 weeks)
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Campaign Display */}
              {selectedCampaign && (
                <>
                  {/* Media Library */}
                  {campaignMedia.length > 0 && (
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">
                          📁 Medien-Bibliothek ({campaignMedia.length})
                        </h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={autoAssignMedia}
                          className="gap-2"
                        >
                          <Sparkles className="h-4 w-4" />
                          Medien automatisch zuordnen
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                        {campaignMedia.map((media) => (
                          <Card
                            key={media.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, media.id)}
                            className="cursor-move hover:ring-2 hover:ring-primary transition-all"
                          >
                            {media.type === 'video' ? (
                              <div className="aspect-video bg-muted flex items-center justify-center">
                                <Video className="h-8 w-8 text-muted-foreground" />
                              </div>
                            ) : (
                              <img 
                                src={media.preview} 
                                alt={media.title}
                                className="aspect-video object-cover"
                              />
                            )}
                            
                            <div className="p-2">
                              <p className="text-xs font-medium truncate">{media.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {media.type === 'video' ? '🎥 Video' : '🖼️ Bild'}
                              </p>
                            </div>
                          </Card>
                        ))}
                      </div>
                      
                      <p className="text-xs text-muted-foreground mt-4">
                        💡 Ziehe Medien in die Post-Karten unten, um sie zuzuordnen
                      </p>
                    </Card>
                  )}

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>{selectedCampaign.title}</CardTitle>
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => navigate(`/planner?campaign_id=${selectedCampaign.id}`)}
                          variant="secondary"
                          className="gap-2"
                          size="sm"
                        >
                          <Calendar className="h-4 w-4" />
                          Zum 2-Wochen-Planer
                        </Button>
                        <Button 
                          onClick={() => scheduleToCalendar(selectedCampaign)}
                          disabled={isGenerating}
                          className="gap-2"
                          size="sm"
                        >
                          {isGenerating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Calendar className="h-4 w-4" />
                          )}
                          In Kalender übertragen
                        </Button>
                        {userPlan === "pro" && (
                          <Button variant="outline" size="sm">
                            <FileDown className="mr-2 h-4 w-4" />
                            {t("campaign_export_pdf")}
                          </Button>
                        )}
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => handleDelete(selectedCampaign.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h3 className="font-semibold mb-2">{t("campaign_summary")}</h3>
                        <p className="text-sm text-muted-foreground">{selectedCampaign.ai_json.summary}</p>
                      </div>

                      {/* Card-based Post View with Drag & Drop */}
                      <Accordion type="single" collapsible className="w-full">
                        {selectedCampaign.ai_json.weeks.map((week) => (
                          <AccordionItem key={week.week_number} value={`week-${week.week_number}`}>
                            <AccordionTrigger>
                              {t("campaign_week")} {week.week_number} — {week.theme}
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="grid gap-4">
                                {week.posts.map((post, postIndex) => {
                                  const postId = post.id || `${week.week_number}-${postIndex}`;
                                  const assignedMediaId = mediaAssignments[postId];
                                  const assignedMedia = campaignMedia.find(m => m.id === assignedMediaId);
                                  
                                  return (
                                    <Card
                                      key={postIndex}
                                      className="p-4 space-y-3 relative transition-all hover:shadow-md"
                                      onDragOver={handleDragOver}
                                      onDrop={(e) => handleDrop(e, postId)}
                                    >
                                      {/* Post Header */}
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-2">
                                            <Badge variant="outline">{post.day}</Badge>
                                            <Badge>{post.post_type}</Badge>
                                          </div>
                                          <h4 className="font-semibold">{post.title}</h4>
                                        </div>
                                        
                                        {/* Assigned Media Preview */}
                                        {assignedMedia ? (
                                          <div className="relative group">
                                            {assignedMedia.type === 'video' ? (
                                              <div className="w-24 h-24 bg-muted flex items-center justify-center rounded">
                                                <Video className="h-8 w-8" />
                                              </div>
                                            ) : (
                                              <img 
                                                src={assignedMedia.preview}
                                                alt={assignedMedia.title}
                                                className="w-24 h-24 object-cover rounded"
                                              />
                                            )}
                                            
                                            <Button
                                              size="icon"
                                              variant="destructive"
                                              className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                              onClick={() => {
                                                setMediaAssignments(prev => {
                                                  const updated = { ...prev };
                                                  delete updated[postId];
                                                  return updated;
                                                });
                                                toast.success('Zuweisung entfernt');
                                              }}
                                            >
                                              <X className="h-3 w-3" />
                                            </Button>
                                            
                                            <p className="text-xs text-center mt-1 truncate w-24">
                                              {assignedMedia.title}
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="w-24 h-24 border-2 border-dashed border-muted-foreground/30 rounded flex items-center justify-center text-muted-foreground/50">
                                            <Upload className="h-6 w-6" />
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* Post Content */}
                                      <p className="text-sm text-muted-foreground">
                                        {post.caption_outline}
                                      </p>
                                      
                                      {/* Hashtags & CTA */}
                                      <div className="flex flex-wrap gap-1">
                                        {post.hashtags?.slice(0, 5).map((tag: string, i: number) => (
                                          <Badge key={i} variant="secondary" className="text-xs">
                                            {tag}
                                          </Badge>
                                        ))}
                                      </div>
                                      
                                      {post.cta && (
                                        <p className="text-sm font-medium text-primary">
                                          🎯 {post.cta}
                                        </p>
                                      )}

                                      {/* Actions */}
                                      <div className="flex gap-2 pt-2 border-t">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleAddToCalendar(post)}
                                          className="gap-2"
                                        >
                                          <Calendar className="h-3 w-3" />
                                          {t("campaign_send_to_calendar")}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleOpenGenerator(post)}
                                          className="gap-2"
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                          {t("campaign_open_generator")}
                                        </Button>
                                      </div>
                                    </Card>
                                  );
                                })}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                        <div>
                          <h3 className="font-semibold mb-2">{t("campaign_hashtag_strategy")}</h3>
                          <p className="text-sm text-muted-foreground">
                            {selectedCampaign.ai_json.hashtag_strategy}
                          </p>
                        </div>
                        <div>
                          <h3 className="font-semibold mb-2">{t("campaign_posting_tips")}</h3>
                          <ul className="list-disc list-inside space-y-1">
                            {selectedCampaign.ai_json.posting_tips.map((tip, idx) => (
                              <li key={idx} className="text-sm text-muted-foreground">{tip}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <PlanLimitDialog
        open={showPlanLimit}
        onOpenChange={setShowPlanLimit}
        feature="AI Campaign Assistant (Unlimited campaigns up to 8 weeks)"
      />
    </div>
  );
};

export default Campaigns;
