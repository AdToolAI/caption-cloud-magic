import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface BrandDriftReport {
  id: string;
  brand_kit_id: string;
  source_table: string;
  source_id: string;
  severity: "low" | "medium" | "high" | string;
  score: number;
  preview_url: string | null;
  suggested_fix: any;
  resolved_at: string | null;
  created_at: string;
}

export function useBrandDriftReports(brandKitId: string | null | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = useQuery({
    queryKey: ["brand-drift-reports", brandKitId],
    enabled: !!brandKitId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_drift_reports")
        .select("*")
        .eq("brand_kit_id", brandKitId!)
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as BrandDriftReport[];
    },
  });

  const scan = useMutation({
    mutationFn: async () => {
      if (!brandKitId) throw new Error("no_brand_kit");
      const { data, error } = await supabase.functions.invoke("brand-consistency-scan", {
        body: { brandKitId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Konsistenz-Scan abgeschlossen",
        description: `${data?.drifts ?? 0} Drifts gefunden`,
      });
      qc.invalidateQueries({ queryKey: ["brand-drift-reports", brandKitId] });
      qc.invalidateQueries({ queryKey: ["brand-kits"] });
    },
    onError: (e: any) => toast({ title: "Scan fehlgeschlagen", description: e.message, variant: "destructive" }),
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("brand_drift_reports")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand-drift-reports", brandKitId] }),
  });

  return { drifts: list.data ?? [], loading: list.isLoading, scan, resolve };
}
