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
import { Loader2, Calendar, ExternalLink, Trash2, FileDown } from "lucide-react";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { CampaignMediaUploader } from "@/components/campaigns/CampaignMediaUploader";
import { useNavigate } from "react-router-dom";

interface CampaignPost {
  day: string;
  post_type: string;
  title: string;
  caption_outline: string;
  hashtags: string[];
  cta: string;
  best_time: string;
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
  const [campaignMedia, setCampaignMedia] = useState<any[]>([]);
  const [postTypes, setPostTypes] = useState<Array<{
    type: 'Reel' | 'Carousel' | 'Story' | 'Static Post' | 'Link Post';
    count: number;
  }>>([
    { type: 'Static Post', count: 3 },
    { type: 'Reel', count: 2 }
  ]);
  const [autoSchedule, setAutoSchedule] = useState(false);

  useEffect(() => {
    if (session?.user) {
      loadUserPlan();
      loadCampaigns();
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
      
      // Auto-schedule if checkbox is enabled
      if (autoSchedule && data?.campaign) {
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

                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="auto-schedule"
                      checked={autoSchedule}
                      onCheckedChange={(checked) => setAutoSchedule(checked as boolean)}
                    />
                    <Label htmlFor="auto-schedule" className="text-sm cursor-pointer">
                      Automatisch in Kalender übertragen nach Generierung
                    </Label>
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
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>{selectedCampaign.title}</CardTitle>
                      <div className="flex gap-2">
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

                      <Accordion type="single" collapsible className="w-full">
                        {selectedCampaign.ai_json.weeks.map((week) => (
                          <AccordionItem key={week.week_number} value={`week-${week.week_number}`}>
                            <AccordionTrigger>
                              {t("campaign_week")} {week.week_number} — {week.theme}
                            </AccordionTrigger>
                            <AccordionContent>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>{t("campaign_day")}</TableHead>
                                    <TableHead>{t("campaign_type")}</TableHead>
                                    <TableHead>{t("campaign_title_col")}</TableHead>
                                    <TableHead>{t("campaign_hashtags")}</TableHead>
                                    <TableHead>{t("campaign_best_time")}</TableHead>
                                    <TableHead>Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {week.posts.map((post, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium">{post.day}</TableCell>
                                      <TableCell className="text-xs">{post.post_type}</TableCell>
                                      <TableCell className="max-w-[200px] truncate" title={post.title}>
                                        {post.title}
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        {post.hashtags.slice(0, 2).join(" ")}
                                      </TableCell>
                                      <TableCell className="text-xs">{post.best_time}</TableCell>
                                      <TableCell>
                                        <div className="flex gap-1">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleAddToCalendar(post)}
                                            title={t("campaign_send_to_calendar")}
                                          >
                                            <Calendar className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleOpenGenerator(post)}
                                            title={t("campaign_open_generator")}
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
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
