import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { tx } from '@/lib/i18nText';

export interface BrandAsset {
  id: string;
  brand_kit_id: string;
  user_id: string;
  kind: string;
  url: string;
  meta: Record<string, any> | null;
  created_at: string;
}

export function useBrandAssets(brandKitId: string | null | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);

  const list = useQuery({
    queryKey: ["brand-assets", brandKitId],
    enabled: !!brandKitId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_assets")
        .select("*")
        .eq("brand_kit_id", brandKitId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BrandAsset[];
    },
  });

  const generatePack = async () => {
    if (!brandKitId) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-brand-asset-pack", {
        body: { brandKitId },
      });
      if (error) throw error;
      const okCount = data?.ok?.length ?? 0;
      const failCount = data?.failed?.length ?? 0;
      toast({
        title: tx({ de: "Brand-Pack generiert", en: "Brand pack generated", es: "Paquete de marca generado" }),
        description: tx({ de: `${okCount} Assets erstellt${failCount ? `, ${failCount} fehlgeschlagen` : ""}.`, en: `${okCount} assets created${failCount ? `, ${failCount} failed` : ""}.`, es: `${okCount} activos creados${failCount ? `, ${failCount} fallidos` : ""}.` }),
      });
      qc.invalidateQueries({ queryKey: ["brand-assets", brandKitId] });
    } catch (e: any) {
      toast({ title: tx({ de: "Asset-Generierung fehlgeschlagen", en: "Asset generation failed", es: "La generación de activos falló" }), description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("brand_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand-assets", brandKitId] }),
  });

  return { assets: list.data ?? [], loading: list.isLoading, generating, generatePack, remove };
}
