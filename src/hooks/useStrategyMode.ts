import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type StrategyPostStatus = "pending" | "completed" | "missed" | "dismissed" | "rescheduled";

export interface StrategyPost {
  id: string;
  user_id: string;
  week_start: string;
  scheduled_at: string;
  platform: string;
  content_idea: string;
  caption_draft: string | null;
  hashtags: string[];
  reasoning: string | null;
  status: StrategyPostStatus;
  original_scheduled_at: string | null;
  completed_event_id: string | null;
  generation_batch_id: string | null;
  created_at: string;
  updated_at: string;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type CreatorLevel = "beginner" | "intermediate" | "advanced";

const POSTS_PER_WEEK_FOR_LEVEL: Record<CreatorLevel, number> = {
  beginner: 3,
  intermediate: 5,
  advanced: 7,
};

export function useStrategyMode() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Read profile flag
  const profileQuery = useQuery({
    queryKey: ["strategy-mode-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("strategy_mode_enabled, strategy_mode_activated_at")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const enabled = !!profileQuery.data?.strategy_mode_enabled;

  // Read onboarding profile (level + frequency)
  const onboardingQuery = useQuery({
    queryKey: ["onboarding-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("onboarding_profiles")
        .select("experience_level, posts_per_week")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const rawLevel = (onboardingQuery.data?.experience_level || "beginner").toLowerCase();
  const experienceLevel: CreatorLevel = (["beginner", "intermediate", "advanced"].includes(rawLevel)
    ? rawLevel
    : "beginner") as CreatorLevel;
  const postsPerWeek = onboardingQuery.data?.posts_per_week || POSTS_PER_WEEK_FOR_LEVEL[experienceLevel];

  // Level progress: posts published + avg ER (last 28 days)
  const progressQuery = useQuery({
    queryKey: ["creator-level-progress", user?.id, experienceLevel],
    queryFn: async () => {
      if (!user) return null;
      const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: metrics }, publishedRes, stratAllRes, stratDoneRes] = await Promise.all([
        supabase.from("post_metrics").select("engagement_rate").eq("user_id", user.id).gte("posted_at", since),
        supabase.from("calendar_events").select("id", { count: "exact", head: true }).eq("created_by", user.id).eq("status", "published").gte("published_at", since),
        supabase.from("strategy_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("scheduled_at", since),
        supabase.from("strategy_posts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "completed").gte("scheduled_at", since),
      ]);
      const er = (metrics || []).map((m: any) => m.engagement_rate || 0).filter((v: number) => v > 0);
      const avgEr = er.length > 0 ? er.reduce((a, b) => a + b, 0) / er.length : 0;
      const total = stratAllRes.count ?? 0;
      const done = stratDoneRes.count ?? 0;
      return {
        postsPublished: publishedRes.count ?? 0,
        avgEngagementRate: Number(avgEr.toFixed(2)),
        strategyTotal: total,
        strategyCompleted: done,
        completionRate: total > 0 ? done / total : 0,
      };
    },
    enabled: !!user && enabled,
    staleTime: 5 * 60_000,
  });

  // Current + next week posts (load 2 weeks for auto-forward + pill lookup)
  const currentMondayDate = getMonday(new Date());
  const nextMondayDate = new Date(currentMondayDate);
  nextMondayDate.setDate(nextMondayDate.getDate() + 7);
  const currentMonday = currentMondayDate.toISOString().split("T")[0];
  const nextMonday = nextMondayDate.toISOString().split("T")[0];

  const postsQuery = useQuery({
    queryKey: ["strategy-posts", user?.id, currentMonday, nextMonday],
    queryFn: async () => {
      if (!user) return [] as StrategyPost[];
      const { data, error } = await supabase
        .from("strategy_posts")
        .select("*")
        .eq("user_id", user.id)
        .in("week_start", [currentMonday, nextMonday])
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data || []).map((d: any) => ({
        ...d,
        hashtags: Array.isArray(d.hashtags) ? d.hashtags : [],
      })) as StrategyPost[];
    },
    enabled: !!user && enabled,
    staleTime: 60_000,
  });

  // Auto-forward: if today is Sunday OR all current-week posts are in the past → show next week
  const allPosts = postsQuery.data || [];
  const nowMs = Date.now();
  const currentWeekPosts = allPosts.filter((p) => p.week_start === currentMonday);
  const nextWeekPostsExist = allPosts.some((p) => p.week_start === nextMonday);
  const allCurrentPast =
    currentWeekPosts.length > 0 &&
    currentWeekPosts.every((p) => new Date(p.scheduled_at).getTime() < nowMs);
  const todayDow = new Date().getDay(); // 0 = Sunday
  const shouldForward = (todayDow === 0 || allCurrentPast || currentWeekPosts.length === 0) && nextWeekPostsExist;
  const visibleWeekStart = shouldForward ? nextMonday : currentMonday;

  const visiblePosts = allPosts.filter((p) => p.week_start === visibleWeekStart);
  const weekStart = visibleWeekStart;

  const toggleMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (!user) throw new Error("not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update({
          strategy_mode_enabled: next,
          strategy_mode_activated_at: next ? new Date().toISOString() : null,
        })
        .eq("id", user.id);
      if (error) throw error;

      if (next) {
        // Trigger initial generation
        const { error: fnErr } = await supabase.functions.invoke("generate-week-strategy", {
          body: { week_start: weekStart },
        });
        if (fnErr) console.warn("initial generation failed:", fnErr);
      }
      return next;
    },
    onSuccess: (next) => {
      qc.invalidateQueries({ queryKey: ["strategy-mode-profile"] });
      qc.invalidateQueries({ queryKey: ["strategy-posts"] });
      toast.success(next ? "Strategie-Modus aktiviert" : "Strategie-Modus deaktiviert");
    },
    onError: (e: any) => toast.error(e?.message || "Fehler beim Umschalten"),
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("generate-week-strategy", {
        body: { week_start: weekStart, force: true },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategy-posts"] });
      toast.success("Neue Wochen-Strategie generiert");
    },
    onError: (e: any) => toast.error(e?.message || "Generierung fehlgeschlagen"),
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("strategy_posts")
        .update({ status: "dismissed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategy-posts"] });
      toast.success("Vorschlag verworfen");
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, newAt }: { id: string; newAt: string }) => {
      // Read current scheduled_at for original
      const { data: current } = await supabase
        .from("strategy_posts")
        .select("scheduled_at, original_scheduled_at")
        .eq("id", id)
        .single();
      const original = current?.original_scheduled_at || current?.scheduled_at || null;
      const { error } = await supabase
        .from("strategy_posts")
        .update({
          scheduled_at: newAt,
          original_scheduled_at: original,
          status: "rescheduled",
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategy-posts"] });
      toast.success("Neu geplant");
    },
  });

  const completeMutation = useMutation({
    mutationFn: async ({ id, eventId }: { id: string; eventId?: string }) => {
      const { error } = await supabase
        .from("strategy_posts")
        .update({ status: "completed", completed_event_id: eventId || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategy-posts"] });
      toast.success("Als erledigt markiert");
    },
  });

  // Update arbitrary fields (caption, hashtags, scheduled_at, media_urls, auto_publish)
  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase
        .from("strategy_posts")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategy-posts"] });
      toast.success("Vorschlag aktualisiert");
    },
    onError: (e: any) => toast.error(e?.message || "Update fehlgeschlagen"),
  });

  // Submit to calendar — creates a calendar_events entry and links it back
  const submitToCalendarMutation = useMutation({
    mutationFn: async ({
      post,
      overrides,
    }: {
      post: StrategyPost;
      overrides: {
        caption_draft?: string | null;
        hashtags?: string[];
        scheduled_at?: string;
        media_urls?: string[];
        auto_publish?: boolean;
      };
    }) => {
      if (!user) throw new Error("not authenticated");

      // Resolve workspace
      const { data: ws } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      const workspaceId = ws?.workspace_id;
      if (!workspaceId) throw new Error("Kein Workspace gefunden");

      const scheduled = overrides.scheduled_at || post.scheduled_at;
      const mediaUrls = overrides.media_urls ?? [];
      const assets = mediaUrls.map((url) => ({
        url,
        type: /\.(mp4|mov|webm)/i.test(url) ? "video" : "image",
      }));

      // 1. Insert calendar event
      const eventRow: any = {
        workspace_id: workspaceId,
        created_by: user.id,
        owner_id: user.id,
        title: post.content_idea,
        caption: overrides.caption_draft ?? post.caption_draft ?? "",
        hashtags: overrides.hashtags ?? post.hashtags ?? [],
        channels: [post.platform],
        start_at: scheduled,
        status: overrides.auto_publish ? "scheduled" : "draft",
        assets_json: assets,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      };
      const { data: ev, error: evErr } = await supabase
        .from("calendar_events")
        .insert(eventRow)
        .select()
        .single();
      if (evErr) throw evErr;

      // 2. Link strategy post → event + persist edits
      const { error: linkErr } = await supabase
        .from("strategy_posts")
        .update({
          completed_event_id: ev.id,
          caption_draft: overrides.caption_draft ?? post.caption_draft,
          hashtags: overrides.hashtags ?? post.hashtags,
          scheduled_at: scheduled,
          media_urls: mediaUrls,
          auto_publish: overrides.auto_publish ?? false,
        })
        .eq("id", post.id);
      if (linkErr) throw linkErr;

      return ev;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategy-posts"] });
      toast.success("In Kalender übernommen");
    },
    onError: (e: any) => toast.error(e?.message || "Übernahme fehlgeschlagen"),
  });

  // Manual level override (also pauses auto-upgrade for 14 days)
  const setLevelMutation = useMutation({
    mutationFn: async (newLevel: CreatorLevel) => {
      if (!user) throw new Error("not authenticated");
      const newPostsPerWeek = POSTS_PER_WEEK_FOR_LEVEL[newLevel];
      const pauseUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const prevLevel = experienceLevel;
      const { error: e1 } = await supabase
        .from("onboarding_profiles")
        .update({ experience_level: newLevel, posts_per_week: newPostsPerWeek })
        .eq("user_id", user.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("profiles")
        .update({ level_auto_pause_until: pauseUntil })
        .eq("id", user.id);
      if (e2) throw e2;

      await supabase.from("creator_level_history").insert({
        user_id: user.id,
        level_from: prevLevel,
        level_to: newLevel,
        trigger: "manual",
        reason: "Manual override by creator",
        metrics_snapshot: {},
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-profile"] });
      qc.invalidateQueries({ queryKey: ["creator-level-progress"] });
      toast.success("Level aktualisiert");
    },
    onError: (e: any) => toast.error(e?.message || "Fehler beim Aktualisieren"),
  });

  // Compute progress to next level
  const next = experienceLevel === "beginner" ? "intermediate" : experienceLevel === "intermediate" ? "advanced" : null;
  const thresholds = next === "intermediate"
    ? { posts: 8, er: 2.5, completion: 0.6 }
    : next === "advanced"
    ? { posts: 16, er: 4.5, completion: 0.7 }
    : null;
  const progress = progressQuery.data;
  const levelProgress = next && thresholds && progress ? {
    nextLevel: next as CreatorLevel,
    postsNeeded: Math.max(0, thresholds.posts - progress.postsPublished),
    erNeeded: Math.max(0, Number((thresholds.er - progress.avgEngagementRate).toFixed(2))),
    completionNeeded: Math.max(0, Number(((thresholds.completion - progress.completionRate) * 100).toFixed(0))),
    postsPublished: progress.postsPublished,
    avgEr: progress.avgEngagementRate,
    completionRate: progress.completionRate,
    thresholds,
  } : null;

  return {
    enabled,
    activatedAt: profileQuery.data?.strategy_mode_activated_at,
    isLoadingProfile: profileQuery.isLoading,
    posts: postsQuery.data || [],
    isLoadingPosts: postsQuery.isLoading,
    weekStart,
    experienceLevel,
    postsPerWeek,
    levelProgress,
    toggle: toggleMutation.mutate,
    isToggling: toggleMutation.isPending,
    regenerate: regenerateMutation.mutate,
    isRegenerating: regenerateMutation.isPending,
    dismiss: dismissMutation.mutate,
    reschedule: rescheduleMutation.mutate,
    complete: completeMutation.mutate,
    setLevel: setLevelMutation.mutate,
    isSettingLevel: setLevelMutation.isPending,
    update: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    submitToCalendar: submitToCalendarMutation.mutate,
    isSubmittingToCalendar: submitToCalendarMutation.isPending,
  };
}
