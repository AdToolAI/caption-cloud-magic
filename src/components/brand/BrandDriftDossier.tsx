import { motion } from "framer-motion";
import { ShieldAlert, ShieldCheck, RefreshCw, Check, FileWarning } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBrandDriftReports } from "@/hooks/useBrandDriftReports";

interface Props {
  brandKitId: string;
}

const severityStyle: Record<string, string> = {
  high: "border-red-500/40 bg-red-500/5 text-red-300",
  medium: "border-yellow-500/40 bg-yellow-500/5 text-yellow-300",
  low: "border-emerald-500/40 bg-emerald-500/5 text-emerald-300",
};

export function BrandDriftDossier({ brandKitId }: Props) {
  const { drifts, loading, scan, resolve } = useBrandDriftReports(brandKitId);

  return (
    <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            Drift Dossier
          </CardTitle>
          <CardDescription>Aktive Verstöße gegen dein Marken-Set.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => scan.mutate()} disabled={scan.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${scan.isPending ? "animate-spin" : ""}`} />
          Scan starten
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Lade Dossier…</p>
        ) : drifts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            Keine offenen Drifts. Deine Marke ist konsistent.
          </div>
        ) : (
          drifts.map((d, i) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`rounded-xl border p-4 ${severityStyle[d.severity] ?? severityStyle.medium}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FileWarning className="h-3.5 w-3.5" />
                    <span className="text-xs font-mono opacity-80">CASE FILE #{d.id.slice(0, 6).toUpperCase()}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">{d.severity}</Badge>
                  </div>
                  <p className="text-sm font-medium">
                    {d.source_table === "posts" ? "Voice-Drift" : "Color-Drift"} · Score {Math.round(d.score)}
                  </p>
                  <p className="text-xs opacity-70 mt-1 truncate">
                    Suggested: {d.suggested_fix?.kind ?? "review"} {d.suggested_fix?.hex ? `→ ${d.suggested_fix.hex}` : ""}
                  </p>
                </div>
                {d.preview_url && (
                  <img src={d.preview_url} alt="" className="h-14 w-14 rounded-lg object-cover border border-white/10" />
                )}
                <Button size="sm" variant="ghost" onClick={() => resolve.mutate(d.id)} disabled={resolve.isPending}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
