import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Returns a Set of "YYYY-MM-DD|HH|platform" keys for every active strategy
 * post in the next 14 days. The heatmap uses this to render the gold ring
 * around AI-planned slots.
 */
export function useStrategySlotKeys() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["strategy-slot-keys", user?.id],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const now = new Date();
      const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase
        .from("strategy_posts")
        .select("scheduled_at, platform, status")
        .eq("user_id", user.id)
        .in("status", ["pending", "rescheduled"])
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", in14.toISOString());
      if (error) throw error;
      const set = new Set<string>();
      for (const row of data || []) {
        const d = new Date(row.scheduled_at as string);
        const key = `${d.toISOString().split("T")[0]}|${d.getHours()}|${(row.platform as string).toLowerCase()}`;
        set.add(key);
      }
      return set;
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
