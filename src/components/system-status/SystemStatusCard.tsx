import { Link } from "react-router-dom";
import { Activity, ExternalLink } from "lucide-react";
import { useSystemStatus, type SystemStatus } from "@/hooks/useSystemStatus";
import { cn } from "@/lib/utils";

const DOT: Record<SystemStatus, string> = {
  operational: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]",
  degraded: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]",
  partial_outage: "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]",
  major_outage: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)] animate-pulse",
};

const LABEL: Record<SystemStatus, string> = {
  operational: "All systems operational",
  degraded: "Some services degraded",
  partial_outage: "Partial service outage",
  major_outage: "Major service outage",
};

/**
 * Compact status card for the Settings/Account page.
 * Read-only summary with a link to the full /status page.
 */
export function SystemStatusCard() {
  const { data, isLoading } = useSystemStatus();
  const overall = data?.overall ?? "operational";

  return (
    <div className="rounded-xl border border-white/10 bg-card/40 backdrop-blur-sm p-4 flex items-center gap-4">
      <div className="p-2 rounded-lg bg-white/5">
        <Activity className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full flex-shrink-0", DOT[overall])} />
          <span className="text-sm font-medium truncate">
            {isLoading ? "Checking…" : LABEL[overall]}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">System Status</div>
      </div>
      <Link
        to="/status"
        className="text-xs text-muted-foreground hover:text-foreground transition inline-flex items-center gap-1 whitespace-nowrap"
      >
        View page <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}
