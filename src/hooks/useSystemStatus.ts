import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SystemStatus = "operational" | "degraded" | "partial_outage" | "major_outage";

export interface SystemStatusSummary {
  overall: SystemStatus;
  updated_at: string;
}

/**
 * Lightweight hook for reading the public system status (overall only).
 * Used by Settings card and Auth-page indicator.
 * 5min cache to avoid hammering the endpoint from every page that uses it.
 */
export function useSystemStatus() {
  return useQuery<SystemStatusSummary>({
    queryKey: ["system-status-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("public-status");
      if (error) throw error;
      return {
        overall: (data?.overall ?? "operational") as SystemStatus,
        updated_at: data?.updated_at ?? new Date().toISOString(),
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });
}
