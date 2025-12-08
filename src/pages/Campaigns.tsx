import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import type { UploadedMedia } from "@/components/campaigns/CampaignMediaUploader";

// James Bond 2028 Components
import { CampaignHeroHeader } from "@/components/campaigns/CampaignHeroHeader";
import { CampaignSidebar } from "@/components/campaigns/CampaignSidebar";
import { CampaignFormCard } from "@/components/campaigns/CampaignFormCard";
import { CampaignDisplayCard } from "@/components/campaigns/CampaignDisplayCard";

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
    type: 'Reel' | 'Video' | 'Carousel' | 'Story' | 'Static Post' | 'Link Post';
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
      
      const { data, error } = await supabase.functions.invoke('campaign-to-planner', {
        body: {
          campaignId: campaign.id,
          startDate: new Date().toISOString(),
          workspaceId: workspaceId,
        }
      });
      
      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.error || 'Unknown error from edge function');
      }
      
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

      trackEvent(ANALYTICS_EVENTS.CAMPAIGN_GENERATED, {
        duration_weeks: durationWeeks,
        platforms: platforms,
        post_frequency: postFrequency,
        tone: tone,
        has_media: uploadedMediaUrls.length > 0,
        language: language,
        destination: autoDestination,
        user_id: session.user.id,
        plan: userPlan
      });

      toast.success(t("campaign_created"));
      
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

  const autoAssignMedia = () => {
    if (!selectedCampaign) return;

    const newAssignments = { ...mediaAssignments };
    const usedMediaIds = new Set(Object.values(newAssignments));
    
    for (const week of selectedCampaign.ai_json.weeks) {
      for (const [postIndex, post] of week.posts.entries()) {
        // Generiere dynamische ID wenn keine vorhanden
        const postId = post.id || `${week.week_number}-${postIndex}`;
        
        if (!newAssignments[postId]) {
          let suggestedMedia;
          
          // Video-Typen mit Video-Medien verknüpfen
          if (post.post_type === 'Reel' || post.post_type === 'Story' || post.post_type === 'Video') {
            suggestedMedia = campaignMedia.find(m => 
              m.type === 'video' && !usedMediaIds.has(m.id)
            );
          } else {
            suggestedMedia = campaignMedia.find(m => 
              m.type === 'image' && !usedMediaIds.has(m.id)
            );
          }
          
          // Fallback: Beliebiges verfügbares Medium
          if (!suggestedMedia) {
            suggestedMedia = campaignMedia.find(m => !usedMediaIds.has(m.id));
          }
          
          if (suggestedMedia) {
            newAssignments[postId] = suggestedMedia.id;
            usedMediaIds.add(suggestedMedia.id);
          }
        }
      }
    }
    
    setMediaAssignments(newAssignments);
    
    const count = Object.keys(newAssignments).length - Object.keys(mediaAssignments).length;
    if (count > 0) {
      toast.success(`${count} Medien automatisch zugeordnet`);
    } else {
      toast.info('Keine weiteren Medien verfügbar oder alle Posts bereits zugeordnet');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* James Bond 2028 Hero Header */}
          <CampaignHeroHeader />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Sidebar - Campaign List */}
            <div className="lg:col-span-3">
              <CampaignSidebar
                campaigns={campaigns}
                selectedCampaign={selectedCampaign}
                onSelectCampaign={setSelectedCampaign}
                onDeleteCampaign={handleDelete}
              />
            </div>

            {/* Main Content */}
            <div className="lg:col-span-9 space-y-6">
              {/* Campaign Form */}
              <CampaignFormCard
                goal={goal}
                setGoal={setGoal}
                topic={topic}
                setTopic={setTopic}
                tone={tone}
                setTone={setTone}
                audience={audience}
                setAudience={setAudience}
                durationWeeks={durationWeeks}
                setDurationWeeks={setDurationWeeks}
                postFrequency={postFrequency}
                setPostFrequency={setPostFrequency}
                platforms={platforms}
                togglePlatform={togglePlatform}
                postTypes={postTypes}
                setPostTypes={setPostTypes}
                autoDestination={autoDestination}
                setAutoDestination={setAutoDestination}
                campaignMedia={campaignMedia}
                setCampaignMedia={setCampaignMedia}
                isGenerating={isGenerating}
                userPlan={userPlan}
                onGenerate={handleGenerate}
              />

              {/* Campaign Display */}
              {selectedCampaign && (
                <CampaignDisplayCard
                  campaign={selectedCampaign}
                  campaignMedia={campaignMedia}
                  mediaAssignments={mediaAssignments}
                  setMediaAssignments={setMediaAssignments}
                  isGenerating={isGenerating}
                  userPlan={userPlan}
                  onScheduleToCalendar={scheduleToCalendar}
                  onScheduleToPlanner={scheduleToPlanner}
                  onDelete={handleDelete}
                  onAutoAssignMedia={autoAssignMedia}
                  handleDragStart={handleDragStart}
                  handleDragOver={handleDragOver}
                  handleDrop={handleDrop}
                />
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
