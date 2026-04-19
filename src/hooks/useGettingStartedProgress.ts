import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

let lastStreakHeartbeat: string | null = null;

export interface ChecklistStep {
  key: "onboarding" | "first_video" | "social_connected" | "post_planned" | "brand_kit";
  done: boolean;
  route: string;
}

export interface GettingStartedProgress {
  steps: ChecklistStep[];
  completedCount: number;
  totalCount: number;
  percent: number;
  isComplete: boolean;
}

export const useGettingStartedProgress = () => {
  const { user } = useAuth();

  return useQuery<GettingStartedProgress>({
    queryKey: ["getting-started-progress", user?.id],
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user) {
        return {
          steps: [],
          completedCount: 0,
          totalCount: 5,
          percent: 0,
          isComplete: false,
        };
      }

      const userId = user.id;

      // Run all 5 checks in parallel
      const [
        onboardingRes,
        videoRes,
        socialRes,
        calendarRes,
        brandRes,
      ] = await Promise.all([
        supabase
          .from("onboarding_profiles" as any)
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("video_creations" as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("social_connections" as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("calendar_events" as any)
          .select("id", { count: "exact", head: true })
          .eq("created_by", userId),
        supabase
          .from("brand_kits" as any)
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);

      const steps: ChecklistStep[] = [
        {
          key: "onboarding",
          done: !!onboardingRes.data,
          route: "/onboarding",
        },
        {
          key: "first_video",
          done: (videoRes.count ?? 0) > 0,
          route: "/hailuo-video-studio",
        },
        {
          key: "social_connected",
          done: (socialRes.count ?? 0) > 0,
          route: "/hub/social-management",
        },
        {
          key: "post_planned",
          done: (calendarRes.count ?? 0) > 0,
          route: "/calendar",
        },
        {
          key: "brand_kit",
          done: (brandRes.count ?? 0) > 0,
          route: "/brand-kit",
        },
      ];

      const completedCount = steps.filter((s) => s.done).length;
      const totalCount = steps.length;
      const percent = Math.round((completedCount / totalCount) * 100);

      // Fire-and-forget streak heartbeat (idempotent server-side, throttled client-side)
      if (completedCount > 0) {
        const today = new Date().toISOString().slice(0, 10);
        if (lastStreakHeartbeat !== today) {
          lastStreakHeartbeat = today;
          supabase.rpc("record_streak_activity" as any, { p_user_id: userId }).then(({ error }) => {
            if (error) console.debug("[streak] heartbeat error:", error.message);
          });
        }
      }

      return {
        steps,
        completedCount,
        totalCount,
        percent,
        isComplete: completedCount === totalCount,
      };
    },
  });
};
