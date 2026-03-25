import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Check, Plus, Calendar as CalendarIcon, FileText, TrendingUp, Lightbulb, Clock, Eye, Send, RefreshCw, ImageIcon } from "lucide-react";

import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { Section } from "@/components/ui/Section";
import { MetricCard } from "@/components/ui/MetricCard";
import { BestTimeHeatmap } from "@/components/dashboard/BestTimeHeatmap";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { CreditBalance } from "@/components/credits/CreditBalance";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { toast } from "sonner";
import { FeatureGrid } from "@/components/home/FeatureGrid";
import { DashboardVideoCarousel } from "@/components/dashboard/DashboardVideoCarousel";
import { RecoCard } from "@/features/recommendations/RecoCard";
import { PRICING_V21 } from "@/config/pricing";
import { usePostingTimes } from "@/hooks/usePostingTimes";
import { transformPostingSlotsToHeatmap } from "@/lib/postingTimesTransform";
import { NicheTutorialModal } from "@/components/onboarding/NicheTutorialModal";
import { type WeekPost } from "@/components/dashboard/WeekDayCard";
import { WeekTimelineDay } from "@/components/dashboard/WeekTimelineDay";
import { WeekPostEditor } from "@/components/dashboard/WeekPostEditor";

interface Post {
  id: string;
  caption: string;
  platform: 'instagram' | 'tiktok' | 'linkedin' | 'facebook' | 'x';
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduledTime: string;
  mediaUrl?: string;
}

const Home = () => {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [todayPosts, setTodayPosts] = useState<Post[]>([]);
  const [weekDays, setWeekDays] = useState<{ date: string; name: string; day: number; isToday: boolean; posts: WeekPost[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNicheTutorial, setShowNicheTutorial] = useState(false);
  const [nicheCheckDone, setNicheCheckDone] = useState(false);
  const [editingPost, setEditingPost] = useState<WeekPost | null>(null);
  const [editingDate, setEditingDate] = useState<string>("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string>("");

  // Performance KPI state
  const [performanceKPIs, setPerformanceKPIs] = useState({
    reach: 0,
    reachTrend: 0,
    engagementRate: 0,
    engagementTrend: 0,
    publishedPosts: 0,
    postsTrend: 0,
  });

  // Fetch performance KPIs from post_metrics
  useEffect(() => {
    if (!user) return;

    const fetchPerformanceKPIs = async () => {
      try {
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const twoWeeksAgo = new Date(now);
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

        // Parallel queries
        const [
          reachThisWeek,
          reachLastWeek,
          engagementAll,
          postsThisMonth,
          postsLastMonth,
        ] = await Promise.all([
          // Reach last 7 days
          supabase
            .from("post_metrics")
            .select("reach")
            .eq("user_id", user.id)
            .gte("posted_at", weekAgo.toISOString()),
          // Reach 7-14 days ago
          supabase
            .from("post_metrics")
            .select("reach")
            .eq("user_id", user.id)
            .gte("posted_at", twoWeeksAgo.toISOString())
            .lt("posted_at", weekAgo.toISOString()),
          // Engagement rate all posts
          supabase
            .from("post_metrics")
            .select("engagement_rate")
            .eq("user_id", user.id)
            .not("engagement_rate", "is", null),
          // Posts this month
          supabase
            .from("post_metrics")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("posted_at", monthStart.toISOString()),
          // Posts last month
          supabase
            .from("post_metrics")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("posted_at", lastMonthStart.toISOString())
            .lt("posted_at", monthStart.toISOString()),
        ]);

        const sumReach = (data: any[] | null) =>
          (data || []).reduce((s, r) => s + (r.reach || 0), 0);

        const thisWeekReach = sumReach(reachThisWeek.data);
        const lastWeekReach = sumReach(reachLastWeek.data);
        const reachTrend = lastWeekReach > 0
          ? Math.round(((thisWeekReach - lastWeekReach) / lastWeekReach) * 100)
          : 0;

        const engData = engagementAll.data || [];
        const avgEngagement = engData.length > 0
          ? engData.reduce((s, r) => s + (r.engagement_rate || 0), 0) / engData.length
          : 0;

        const thisMonthPosts = postsThisMonth.count || 0;
        const lastMonthPosts = postsLastMonth.count || 0;
        const postsTrend = lastMonthPosts > 0
          ? Math.round(((thisMonthPosts - lastMonthPosts) / lastMonthPosts) * 100)
          : 0;

        setPerformanceKPIs({
          reach: thisWeekReach,
          reachTrend,
          engagementRate: Math.round(avgEngagement * 10) / 10,
          engagementTrend: 0,
          publishedPosts: thisMonthPosts,
          postsTrend,
        });
      } catch (err) {
        console.error("Error fetching performance KPIs:", err);
      }
    };

    fetchPerformanceKPIs();
  }, [user]);

  // Fetch posting times for all platforms
  const { data: postingTimesData, isLoading: postingTimesLoading } = usePostingTimes({
    platform: "all",
    days: 7,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    enabled: !!user
  });

  // Transform API data to heatmap format
  const heatmapData = transformPostingSlotsToHeatmap(postingTimesData, 7);

  // Check if user has onboarding profile
  useEffect(() => {
    if (!user) return;
    const checkOnboardingProfile = async () => {
      const { data } = await supabase
        .from("onboarding_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) {
        setShowNicheTutorial(true);
      }
      setNicheCheckDone(true);
    };
    checkOnboardingProfile();
  }, [user]);

  useEffect(() => {
    if (user && nicheCheckDone && !showNicheTutorial) {
      loadDashboardData();
    }
  }, [user, nicheCheckDone, showNicheTutorial]);

  const handleTutorialComplete = () => {
    setShowNicheTutorial(false);
    loadDashboardData();
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Get workspace ID
      const { data: wsMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      
      if (wsMember?.workspace_id) setWorkspaceId(wsMember.workspace_id);

      // Build Mon–Sun of the current week
      const days: { date: string; name: string; day: number; isToday: boolean; posts: WeekPost[] }[] = [];
      const today = new Date();
      const todayDateStr = today.toISOString().split("T")[0];
      // Find Monday of this week
      const monday = new Date(today);
      const dow = monday.getDay(); // 0=Sun
      const diffToMon = dow === 0 ? -6 : 1 - dow;
      monday.setDate(monday.getDate() + diffToMon);

      const startDate = new Date(monday);
      const endDate = new Date(monday);
      endDate.setDate(endDate.getDate() + 7);

      for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const dateStr = date.toISOString().split("T")[0];
        days.push({
          date: date.toISOString(),
          name: date.toLocaleDateString(language, { weekday: "short" }),
          day: date.getDate(),
          isToday: dateStr === todayDateStr,
          posts: [],
        });
      }

      // Fetch real calendar events for the week
      const { data: realEvents } = await supabase
        .from("calendar_events")
        .select("id, title, channels, start_at, caption, status, hashtags, assets_json")
        .gte("start_at", startDate.toISOString().split("T")[0])
        .lte("start_at", endDate.toISOString())
        .order("start_at", { ascending: true });

      // Fetch starter week plans
      const { data: starterPlans } = await supabase
        .from("starter_week_plans")
        .select("*")
        .order("suggested_date", { ascending: true });

      // Map real events to days
      if (realEvents) {
        for (const ev of realEvents) {
          const evDate = ev.start_at?.split("T")[0];
          const dayIdx = days.findIndex(d => d.date.split("T")[0] === evDate);
          if (dayIdx >= 0) {
            const evTime = ev.start_at ? new Date(ev.start_at).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" }) : "12:00";
            const mapStatus = (s: string): 'suggested' | 'scheduled' | 'published' => {
              if (s === 'published') return 'published';
              if (s === 'scheduled' || s === 'rendering' || s === 'publishing') return 'scheduled';
              return 'suggested';
            };
            days[dayIdx].posts.push({
              id: ev.id,
              platform: (ev.channels?.[0] || "instagram") as WeekPost["platform"],
              contentIdea: ev.title || ev.caption || "Post",
              caption: ev.caption || undefined,
              suggestedTime: evTime,
              status: mapStatus(ev.status),
              mediaUrl: Array.isArray(ev.assets_json) && ev.assets_json.length > 0 ? (ev.assets_json[0] as any)?.url : undefined,
              hashtags: ev.hashtags || undefined,
              sourceType: 'calendar_event',
              sourceId: ev.id,
            });
          }
        }
      }

      // Map starter plans to days (only where no calendar event exists)
      if (starterPlans) {
        for (const sp of starterPlans) {
          const dayIdx = days.findIndex(d => d.date.split("T")[0] === sp.suggested_date);
          if (dayIdx >= 0) {
            // Don't duplicate if already a calendar event for same content
            const alreadyHas = days[dayIdx].posts.some(p => p.sourceType === 'calendar_event');
            if (!alreadyHas || sp.status === 'suggested') {
              days[dayIdx].posts.push({
                id: sp.id,
                platform: (sp.platform || "instagram") as WeekPost["platform"],
                contentIdea: sp.content_idea || "Post-Idee",
                caption: undefined,
                suggestedTime: sp.suggested_time?.slice(0, 5) || "12:00",
                status: sp.status === 'scheduled' ? 'scheduled' : sp.status === 'published' ? 'published' : 'suggested',
                hashtags: undefined,
                sourceType: 'starter_plan',
                sourceId: sp.id,
              });
            }
          }
        }
      }

      // Auto-reschedule missed posts: +6h minimum after original time
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      for (const day of days) {
        if (!day.isToday) continue;
        for (const post of day.posts) {
          if (post.status === 'published') continue;
          const [h, m] = post.suggestedTime.split(":").map(Number);
          const postMinutes = h * 60 + m;
          if (currentMinutes > postMinutes) {
            post.originalTime = post.suggestedTime;
            // At least +6 hours from original post time
            let newMinutes = Math.max(postMinutes + 360, Math.ceil((currentMinutes + 60) / 30) * 30);
            if (newMinutes >= 22 * 60) {
              // Too late today — suggest 09:00 next morning (keep on card as missed)
              post.suggestedTime = "09:00";
              post.status = 'missed';
            } else {
              const newH = Math.floor(newMinutes / 60);
              const newM = newMinutes % 60;
              post.suggestedTime = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
              post.status = 'missed';
            }
          }
        }
      }

      setWeekDays(days);

      // Set today posts
      const todayDate = new Date().toISOString().split("T")[0];
      const todayWeekPosts = days.find(d => d.isToday)?.posts || [];
      setTodayPosts(todayWeekPosts.map(p => ({
        id: p.id,
        caption: p.caption || `💡 ${p.contentIdea}`,
        platform: p.platform,
        status: p.status === 'published' ? 'published' as const : p.status === 'scheduled' ? 'scheduled' as const : 'draft' as const,
        scheduledTime: p.suggestedTime,
        mediaUrl: p.mediaUrl,
      })));
    } catch (err) {
      console.error("Dashboard data error:", err);
      setTodayPosts([]);
    }
    setLoading(false);
  };

  const publishNow = async (postId: string) => {
    toast.success("Post wird veröffentlicht...");
  };

  const retry = async (postId: string) => {
    toast.success("Post wird erneut versucht...");
  };

  const handleEditPost = (post: WeekPost) => {
    setEditingPost(post);
    setEditingDate(post.id); // will be overridden below
    setEditorOpen(true);
  };

  const handleUploadPost = (post: WeekPost) => {
    setEditingPost(post);
    setEditorOpen(true);
  };

  const handleAddPost = (date: string) => {
    setEditingPost(null);
    setEditingDate(date);
    setEditorOpen(true);
  };

  const handleDeletePost = async (post: WeekPost) => {
    try {
      if (post.sourceType === 'starter_plan') {
        await supabase.from("starter_week_plans").delete().eq("id", post.sourceId);
      } else if (post.sourceType === 'calendar_event') {
        await supabase.from("calendar_events").delete().eq("id", post.sourceId);
      }
      // Remove from local state immediately
      setWeekDays(prev => prev.map(day => ({
        ...day,
        posts: day.posts.filter(p => p.id !== post.id),
      })));
      toast.success("Post gelöscht");
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Post konnte nicht gelöscht werden");
    }
  };

  const handleEditorSaved = () => {
    loadDashboardData();
  };

  // Find the date string for an editing post
  const getEditDate = () => {
    if (editingPost) {
      const day = weekDays.find(d => d.posts.some(p => p.id === editingPost.id));
      return day?.date || editingDate;
    }
    return editingDate;
  };

  // Find the next upcoming post across all weekDays
  const getNextPost = (): { post: WeekPost; date: string } | null => {
    const now = new Date();
    let best: { post: WeekPost; date: string; dt: number } | null = null;

    for (const day of weekDays) {
      for (const post of day.posts) {
        if (post.status === 'published') continue;
        const [h, m] = (post.suggestedTime || '12:00').split(':').map(Number);
        const postDate = new Date(day.date);
        postDate.setHours(h, m, 0, 0);
        const dt = postDate.getTime();
        if (dt >= now.getTime() && (!best || dt < best.dt)) {
          best = { post, date: day.date, dt };
        }
      }
    }
    // If no future post, pick the first non-published post
    if (!best) {
      for (const day of weekDays) {
        for (const post of day.posts) {
          if (post.status !== 'published') {
            return { post, date: day.date };
          }
        }
      }
    }
    return best ? { post: best.post, date: best.date } : null;
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      instagram: 'bg-pink-500',
      tiktok: 'bg-black dark:bg-white',
      linkedin: 'bg-blue-700',
      facebook: 'bg-blue-600',
      x: 'bg-black dark:bg-white'
    };
    return colors[platform] || 'bg-gray-400';
  };

  const quickActions = [
    { label: t("dashboard.quickActions.quickSchedule"), icon: Plus, to: "/calendar?quickAdd=true", variant: 'default' as const },
    { label: t("dashboard.quickActions.openCalendar"), icon: CalendarIcon, to: "/calendar" },
    { label: t("dashboard.quickActions.postFromTemplate"), icon: FileText, to: "/ai-post-generator" },
    { label: t("dashboard.quickActions.openPerformance"), icon: TrendingUp, to: "/analytics" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {showNicheTutorial && <NicheTutorialModal onComplete={handleTutorialComplete} />}
      <SEO
        title={language === "de" ? "KI Social Media Manager" : language === "es" ? "Gestor de Redes Sociales con IA" : "AI Social Media Manager"}
        description={language === "de" 
          ? "Erstelle & analysiere Social Media Content mit KI. Über 10.000 Creator vertrauen AdTool AI."
          : language === "es"
          ? "Crea y analiza contenido de redes sociales con IA. Más de 10,000 creadores confían en AdTool AI."
          : "Create & analyze social media content with AI. Over 10,000 creators trust AdTool AI."}
        canonical="https://useadtool.ai/home"
        ogImage="og-home.jpg"
        lang={language}
      />
      
      {/* Hero Status Bar */}
      {user && (
        <div className="bg-card border-b border-border py-3 px-4">
          <div className="container max-w-7xl mx-auto flex items-center justify-between gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Lightbulb className="h-4 w-4 text-primary" />
              <span className="font-medium">{t("dashboard.statusBar.tipOfTheDay")}:</span>
              <span>{t("dashboard.statusBar.tipContent")}</span>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-xs"><CreditBalance /></div>
              
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                <span>{t("dashboard.statusBar.nextPost")}: {(() => {
                  const next = getNextPost();
                  if (!next) return language === "de" ? "Kein Post geplant" : "No post scheduled";
                  const d = new Date(next.date);
                  const dd = String(d.getDate()).padStart(2, '0');
                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                  return `${dd}.${mm}. ${next.post.suggestedTime || "12:00"}`;
                })()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Hero */}
      {!user && (
        <section className="text-center bg-card pt-20 pb-16 border-b border-border">
          <div className="container mx-auto px-4 max-w-5xl">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
              {t("heroBanner.title")}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mt-4 max-w-2xl mx-auto leading-relaxed">
              {language === "de" ? "Starte kostenlos. Upgrade jederzeit." : "Start free. Upgrade anytime."}
            </p>
            <div className="flex justify-center gap-4 mt-8">
              <Link to="/auth">
                <Button size="lg" className="gradient-primary text-white font-medium rounded-xl px-8 py-6 shadow-soft hover:shadow-glow hover:scale-[1.03] transition-all">
                  {language === "de" ? "Jetzt planen" : "Start Planning"}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="rounded-xl px-8 py-6">
                {language === "de" ? "Demo ansehen" : "Watch Demo"}
              </Button>
            </div>
          </div>
        </section>
      )}

      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
        {/* Hero Banner */}
        {user && (
          <DashboardVideoCarousel />
        )}

        {/* Quick Actions - Sticky */}
        {user && (
          <div className="sticky top-14 z-30 bg-gradient-to-b from-background via-background/95 to-transparent backdrop-blur-md py-3 -mx-4 px-4 md:mx-0 md:px-0">
            <QuickActions actions={quickActions} />
          </div>
        )}

        {/* Nächster Post Section */}
        {user && (() => {
          const next = getNextPost();
          return (
            <Section title={language === "de" ? "Nächster Post" : "Next Post"} description={language === "de" ? "Dein nächster geplanter Beitrag" : "Your next scheduled post"} bg="muted">
              <Card className="rounded-2xl shadow-soft">
                <CardContent className="p-6">
                  {!next ? (
                    <div className="text-center py-12">
                      <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">{t("dashboard.emptyState.noPosts")}</h3>
                      <p className="text-sm text-muted-foreground mb-4">{t("dashboard.emptyState.createNow")}</p>
                      <Button asChild>
                        <Link to="/calendar">
                          <Plus className="h-4 w-4 mr-2" />
                          {language === "de" ? "Neuen Post planen" : "Schedule New Post"}
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4 p-4 bg-background rounded-xl border border-border">
                      <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {next.post.mediaUrl ? (
                          <img src={next.post.mediaUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <StatusPill status={(next.post.status as any) || "draft"} />
                          {next.post.platform && (
                            <PlatformBadge platform={next.post.platform as any} />
                          )}
                        </div>
                        <p className="text-sm font-medium line-clamp-3">{next.post.contentIdea || next.post.caption || (language === "de" ? "Keine Beschreibung" : "No description")}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {(() => {
                            const d = new Date(next.date);
                            const dd = String(d.getDate()).padStart(2, '0');
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const yyyy = d.getFullYear();
                            return `${dd}.${mm}.${yyyy} ${next.post.suggestedTime || "12:00"}`;
                          })()}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Section>
          );
        })()}

        {/* Week Calendar */}
        {user && (
          <Section 
            title={t("dashboard.sections.thisWeek")}
            description={t("dashboard.sections.thisWeekDescription")}
            action={
              <Button asChild variant="link">
                <Link to="/calendar">
                  {language === "de" ? "Im Kalender planen" : "Plan in Calendar"} →
                </Link>
              </Button>
            }
          >
            <div className="flex items-start gap-2 overflow-x-auto pb-4 justify-between">
              {weekDays.map(day => (
                <WeekTimelineDay
                  key={day.date}
                  date={day.date}
                  dayName={day.name}
                  dayNumber={day.day}
                  isToday={day.isToday}
                  posts={day.posts}
                  onRingClick={handleEditPost}
                  onAddPost={handleAddPost}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Week Post Editor */}
        <WeekPostEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          post={editingPost}
          date={getEditDate()}
          workspaceId={workspaceId}
          onSaved={handleEditorSaved}
        />

        {/* Feature Cards Grid */}
        {user && (
          <FeatureGrid />
        )}

        {/* Performance KPIs */}
        {user && (
          <Section title={t("dashboard.sections.performance")} description={t("dashboard.sections.performanceDescription")} bg="muted">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <MetricCard
                label={t("dashboard.metrics.reach7d")}
                value={performanceKPIs.reach >= 1000 ? `${(performanceKPIs.reach / 1000).toFixed(1)}K` : String(performanceKPIs.reach)}
                subtitle={t("dashboard.metrics.vsLastWeek")}
                icon={<TrendingUp className="h-5 w-5" />}
                trend={{ value: Math.abs(performanceKPIs.reachTrend), isPositive: performanceKPIs.reachTrend >= 0 }}
              />
              <MetricCard
                label={t("dashboard.metrics.engagementRate")}
                value={`${performanceKPIs.engagementRate}%`}
                subtitle={t("dashboard.metrics.avgAllPosts")}
                icon={<TrendingUp className="h-5 w-5" />}
                trend={{ value: Math.abs(performanceKPIs.engagementTrend), isPositive: performanceKPIs.engagementTrend >= 0 }}
              />
              <MetricCard
                label={t("dashboard.metrics.publishedPosts")}
                value={String(performanceKPIs.publishedPosts)}
                subtitle={t("dashboard.metrics.thisMonth")}
                icon={<Send className="h-5 w-5" />}
                trend={{ value: Math.abs(performanceKPIs.postsTrend), isPositive: performanceKPIs.postsTrend >= 0 }}
              />
            </div>
          </Section>
        )}

        {/* KI-Empfehlungen */}
        {user && (
          <Section 
            title={t("reco.title")}
            action={
              <Button asChild variant="link">
                <Link to="/personalized-dashboard">
                  Personalisiertes Dashboard →
                </Link>
              </Button>
            }
          >
            <RecoCard />
          </Section>
        )}

        {/* Heatmap */}
        {user && (
          <Section 
            title={t("dashboard.sections.bestTimes")}
            description={t("dashboard.sections.bestTimesDescription")}
          >
            <BestTimeHeatmap 
              heatmap={heatmapData} 
              loading={postingTimesLoading}
              onViewDetails={() => navigate('/posting-times')}
            />
          </Section>
        )}

        {/* Recent Activity */}
        {user && (
          <Section title={t("dashboard.sections.recentActivity")} description={t("dashboard.sections.recentActivityDescription")} bg="muted">
            <RecentActivityFeed />
          </Section>
        )}

        {/* Pricing Section */}
        <section className="bg-gradient-to-br from-muted/30 to-muted/60 rounded-3xl p-8 md:p-12 mt-16 shadow-xl">
          <div className="text-center mb-12">
            <div className="inline-block px-4 py-1.5 bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 text-primary rounded-full text-xs font-bold mb-4 shadow-lg shadow-primary/10">
              ✨ {language === "de" ? "Einfache & Transparente Preise" : language === "es" ? "Precios Simples y Transparentes" : "Simple & Transparent Pricing"}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3 tracking-tight">
              {language === "de" ? "Wachse mit AdTool AI" : language === "es" ? "Crece con AdTool AI" : "Grow with AdTool AI"}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {language === "de" 
                ? "Wähle den Plan, der zu deinem Workflow passt. Kostenlos starten, jederzeit upgraden." 
                : language === "es"
                ? "Elige el plan que se adapte a tu flujo de trabajo. Comienza gratis, actualiza en cualquier momento."
                : "Choose the plan that fits your workflow. Start free, upgrade anytime."}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* Basic Plan */}
            <div className="relative flex flex-col bg-card rounded-2xl border-2 border-border/50 shadow-xl hover:shadow-2xl hover:scale-105 hover:border-primary/40 transition-all duration-500 p-6">
              <div className="text-center mb-6 pb-6 border-b border-border/50">
                <h3 className="text-2xl font-bold text-foreground mb-2 tracking-tight">Basic</h3>
                <p className="text-xs text-muted-foreground mb-6 font-medium">
                  {language === "de" 
                    ? "Am besten für Content-Creator & kleine Unternehmen" 
                    : language === "es"
                    ? "Mejor para creadores de contenido y pequeñas empresas"
                    : "Best for content creators & small businesses"}
                </p>
                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="text-4xl font-bold text-foreground tracking-tighter">€{PRICING_V21.basic.price.EUR}</span>
                  <span className="text-sm text-muted-foreground font-medium">
                    / {language === "de" ? "Monat" : language === "es" ? "mes" : "month"}
                  </span>
                </div>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "200 KI-Captions pro Monat" : "200 AI captions per month"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Alle Premium-Templates" : "All premium templates"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Hashtag-Generator" : "Hashtag Generator"}
                  </span>
                </li>
              </ul>
              <Button size="lg" asChild className="w-full">
                <Link to={user ? "/pricing" : "/auth"}>
                  {language === "de" ? "Zu Basic upgraden" : "Upgrade to Basic"}
                </Link>
              </Button>
            </div>

            {/* Pro Plan */}
            <div className="relative flex flex-col bg-card rounded-2xl border-2 border-primary shadow-2xl shadow-primary/30 lg:scale-105 lg:z-10 hover:scale-105 lg:hover:scale-110 transition-all duration-500 p-6">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
                <div className="bg-gradient-to-r from-primary to-accent text-white px-6 py-1.5 rounded-full text-xs font-extrabold shadow-2xl tracking-wider">
                  ⭐ {language === "de" ? "BELIEBT" : "POPULAR"}
                </div>
              </div>
              <div className="text-center mb-6 pb-6 border-b border-border/50">
                <h3 className="text-2xl font-bold text-foreground mb-2 tracking-tight">Pro</h3>
                <p className="text-xs text-muted-foreground mb-6 font-medium">
                  {language === "de" ? "Perfekt für Agenturen & Teams" : "Perfect for agencies & teams"}
                </p>
                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="text-4xl font-bold text-foreground tracking-tighter">€34.95</span>
                  <span className="text-sm text-muted-foreground font-medium">
                    / {language === "de" ? "Monat" : "month"}
                  </span>
                </div>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Unbegrenzte KI-Captions" : "Unlimited AI captions"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Team-Zusammenarbeit" : "Team collaboration"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Prioritäts-Support" : "Priority support"}
                  </span>
                </li>
              </ul>
              <Button size="lg" asChild className="w-full">
                <Link to={user ? "/pricing" : "/auth"}>
                  {language === "de" ? "Pro werden" : "Go Pro"}
                </Link>
              </Button>
            </div>

            {/* Enterprise Plan */}
            <div className="relative flex flex-col bg-card rounded-2xl border-2 border-border/50 shadow-xl hover:shadow-2xl hover:scale-105 hover:border-primary/40 transition-all duration-500 p-6">
              <div className="text-center mb-6 pb-6 border-b border-border/50">
                <h3 className="text-2xl font-bold text-foreground mb-2 tracking-tight">Enterprise</h3>
                <p className="text-xs text-muted-foreground mb-6 font-medium">
                  {language === "de" ? "Für große Teams und Agenturen" : "For large teams and agencies"}
                </p>
                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="text-4xl font-bold text-foreground tracking-tighter">€{PRICING_V21.enterprise.price.EUR}</span>
                  <span className="text-sm text-muted-foreground font-medium">
                    / {language === "de" ? "Monat" : "month"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  + Seats zu €49,99
                </p>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Alles aus Pro" : "Everything in Pro"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "API- und Integrationszugang" : "API and integration access"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm font-medium leading-relaxed text-foreground">
                    {language === "de" ? "Dedizierter Account-Manager" : "Dedicated account manager"}
                  </span>
                </li>
              </ul>
              <Button size="lg" asChild className="w-full">
                <Link to={user ? "/pricing" : "/auth"}>
                  {language === "de" ? "Auf Enterprise upgraden" : "Upgrade to Enterprise"}
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Home;
