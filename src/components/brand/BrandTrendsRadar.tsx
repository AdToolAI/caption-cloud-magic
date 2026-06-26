import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Radar, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  brandKitId: string;
}

interface Trend {
  headline: string;
  insight?: string;
  action?: string;
  color_suggestion?: string;
  confidence?: number;
}

export function BrandTrendsRadar({ brandKitId }: Props) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["brand-trends-radar", brandKitId],
    enabled: !!brandKitId,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("brand-trends-radar", {
        body: { brandKitId },
      });
      if (error) throw error;
      return data as { trends: Trend[]; cached: boolean };
    },
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("brand-trends-radar", {
        body: { brandKitId, refresh: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand-trends-radar", brandKitId] }),
  });

  const trends: Trend[] = data?.trends ?? [];

  return (
    <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radar className="h-4 w-4 text-cyan-400" />
            Brand-Trends Radar
          </CardTitle>
          <CardDescription>
            Wöchentlicher Brand-Pulse für deine Branche.
            {data?.cached && <span className="ml-1 opacity-60">(cached)</span>}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refresh.isPending ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Radar lädt…
          </div>
        ) : trends.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Signale. Refresh anstoßen.</p>
        ) : (
          trends.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl border border-white/10 bg-background/40 p-3"
            >
              <div className="flex items-start gap-3">
                {t.color_suggestion && (
                  <div
                    className="h-10 w-10 rounded-lg border border-white/10 flex-shrink-0"
                    style={{ background: t.color_suggestion }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{t.headline}</p>
                  {t.insight && <p className="text-xs text-muted-foreground mt-1">{t.insight}</p>}
                  {t.action && (
                    <p className="text-xs mt-1.5 text-primary/90">→ {t.action}</p>
                  )}
                </div>
                {typeof t.confidence === "number" && (
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">
                    {t.confidence}%
                  </Badge>
                )}
              </div>
            </motion.div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
