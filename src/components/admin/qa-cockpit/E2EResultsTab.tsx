import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, SkipForward, Clock, GitBranch } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMemo } from "react";

interface E2ERow {
  id: string;
  test_name: string;
  test_type: string;
  status: "pass" | "fail" | "skip" | "timeout";
  latency_ms: number | null;
  error_message: string | null;
  metadata: any;
  run_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  pass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  fail: "bg-red-500/15 text-red-300 border-red-500/40",
  timeout: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  skip: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-red-400" />;
  if (status === "timeout") return <Clock className="h-4 w-4 text-orange-400" />;
  return <SkipForward className="h-4 w-4 text-slate-400" />;
}

export function E2EResultsTab() {
  const { data: rows = [], isLoading } = useQuery<E2ERow[]>({
    queryKey: ["e2e-results"],
    queryFn: async () => {
      const { data } = await supabase
        .from("smoke_test_runs")
        .select("*")
        .eq("test_type", "e2e_playwright")
        .order("run_at", { ascending: false })
        .limit(200);
      return (data ?? []) as E2ERow[];
    },
    refetchInterval: 30_000,
  });

  // Group by run_id (latest first)
  const runs = useMemo(() => {
    const map = new Map<string, E2ERow[]>();
    for (const r of rows) {
      const key = r.metadata?.run_id ?? r.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .map(([runId, items]) => {
        const sorted = items.sort((a, b) => a.test_name.localeCompare(b.test_name));
        const meta = items[0]?.metadata ?? {};
        const pass = items.filter((i) => i.status === "pass").length;
        const fail = items.filter((i) => i.status === "fail" || i.status === "timeout").length;
        const skip = items.filter((i) => i.status === "skip").length;
        const ranAt = items
          .map((i) => new Date(i.run_at).getTime())
          .reduce((a, b) => Math.max(a, b), 0);
        return {
          runId,
          items: sorted,
          meta,
          pass,
          fail,
          skip,
          total: items.length,
          ranAt: new Date(ranAt),
          allGreen: fail === 0,
        };
      })
      .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime())
      .slice(0, 20);
  }, [rows]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Lade E2E-Resultate…</p>;
  }

  if (runs.length === 0) {
    return (
      <Card className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Noch keine Playwright-Resultate. Der CI-Workflow{" "}
          <code className="font-mono text-[#F5C76A]">e2e-critical.yml</code> postet automatisch nach jedem Run.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <Card key={run.runId} className="bg-[#0A0F1F]/80 border-[#F5C76A]/10">
          <CardContent className="pt-4 space-y-3">
            {/* Run header */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={run.allGreen ? STATUS_STYLES.pass : STATUS_STYLES.fail}>
                {run.allGreen ? "✓ ALL GREEN" : `✗ ${run.fail} FAILING`}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {run.pass}/{run.total} pass{run.skip > 0 ? ` · ${run.skip} skip` : ""}
              </span>
              {run.meta?.branch && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  {run.meta.branch}
                </span>
              )}
              {run.meta?.commit_sha && (
                <code className="text-[10px] text-muted-foreground font-mono">
                  {String(run.meta.commit_sha).slice(0, 7)}
                </code>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {formatDistanceToNow(run.ranAt, { addSuffix: true })}
              </span>
            </div>

            {/* Test list */}
            <div className="space-y-1.5">
              {run.items.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start gap-2 text-sm py-1 border-t border-[#F5C76A]/5 first:border-0"
                >
                  <StatusIcon status={t.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs truncate">{t.test_name}</span>
                      {t.latency_ms !== null && (
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {(t.latency_ms / 1000).toFixed(2)}s
                        </span>
                      )}
                    </div>
                    {t.error_message && (
                      <p className="text-[11px] text-red-400/90 font-mono mt-1 whitespace-pre-wrap break-words">
                        {t.error_message.slice(0, 400)}
                        {t.error_message.length > 400 && "…"}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {run.meta?.base_url && (
              <p className="text-[10px] text-muted-foreground/70 font-mono pt-1 border-t border-[#F5C76A]/5">
                Ziel: {run.meta.base_url}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
