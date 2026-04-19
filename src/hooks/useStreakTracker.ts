import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface UserStreak {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  freeze_tokens: number;
  freeze_used_at: string | null;
  total_active_days: number;
}

export interface StreakMilestone {
  id: string;
  milestone_days: number;
  reached_at: string;
  reward_credits: number;
  reward_dollars: number;
}

export const MILESTONE_REWARDS_USD: Record<number, number> = {
  3: 0.5,
  7: 1.5,
  14: 3,
  30: 7,
  60: 15,
  100: 25,
};

const MILESTONES = [3, 7, 14, 30, 60, 100];

export function nextMilestone(currentStreak: number): number | null {
  return MILESTONES.find((m) => m > currentStreak) ?? null;
}

/**
 * Tracks a productive activity for the current user and updates their streak.
 * Fire-and-forget — no toast spam. Real-time subscription handles milestone celebrations.
 */
export function useStreakTracker() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const trackActivity = useCallback(async () => {
    if (!user) return;
    try {
      const { error } = await supabase.rpc("record_streak_activity" as any, {
        p_user_id: user.id,
      });
      if (error) {
        console.debug("[streak] record_streak_activity failed:", error.message);
        return;
      }
      // Invalidate so badge/card refresh
      queryClient.invalidateQueries({ queryKey: ["user-streak", user.id] });
      queryClient.invalidateQueries({ queryKey: ["streak-milestones", user.id] });
    } catch (err) {
      console.debug("[streak] trackActivity exception:", err);
    }
  }, [user, queryClient]);

  return { trackActivity };
}

export function useUserStreak() {
  const { user } = useAuth();

  return useQuery<UserStreak | null>({
    queryKey: ["user-streak", user?.id],
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_streaks" as any)
        .select("current_streak, longest_streak, last_activity_date, freeze_tokens, freeze_used_at, total_active_days")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        console.debug("[streak] fetch failed:", error.message);
        return null;
      }
      return (data as unknown as UserStreak) ?? {
        current_streak: 0,
        longest_streak: 0,
        last_activity_date: null,
        freeze_tokens: 1,
        freeze_used_at: null,
        total_active_days: 0,
      };
    },
  });
}

export function useStreakMilestones() {
  const { user } = useAuth();

  return useQuery<StreakMilestone[]>({
    queryKey: ["streak-milestones", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("streak_milestones" as any)
        .select("id, milestone_days, reached_at, reward_credits, reward_dollars")
        .eq("user_id", user.id)
        .order("reached_at", { ascending: false });
      if (error) return [];
      return (data as unknown as StreakMilestone[]) ?? [];
    },
  });
}
