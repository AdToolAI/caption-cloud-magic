import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type ComponentStatus = "operational" | "degraded" | "partial_outage" | "major_outage";

interface ComponentResult {
  key: string;
  name: string;
  status: ComponentStatus;
  uptime_90d: number;
  sparkline: number[];
}

interface StatusResponse {
  overall: ComponentStatus;
  updated_at: string;
  components: ComponentResult[];
  active_incidents: Array<{
    id: string;
    title: string;
    description: string | null;
    severity: string;
    status: string;
    affected_components: string[];
    started_at: string;
  }>;
  past_incidents: Array<{
    id: string;
    title: string;
    severity: string;
    started_at: string;
    resolved_at: string;
  }>;
}

const STATUS_LABEL: Record<ComponentStatus, string> = {
  operational: "Operational",
  degraded: "Degraded performance",
  partial_outage: "Partial outage",
  major_outage: "Major outage",
};

const STATUS_DOT: Record<ComponentStatus, string> = {
  operational: "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]",
  degraded: "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]",
  partial_outage: "bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.6)]",
  major_outage: "bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.7)] animate-pulse",
};

const OVERALL_HEADLINE: Record<ComponentStatus, string> = {
  operational: "All systems operational",
  degraded: "Some systems experiencing issues",
  partial_outage: "Partial outage in progress",
  major_outage: "Major outage in progress",
};

function Sparkline({ values }: { values: number[] }) {
  // Render last 30 days as tiny bars (SVG)
  if (!values?.length) return null;
  const w = 90;
  const h = 22;
  const barW = w / values.length;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="opacity-80">
      {values.map((v, i) => {
        const pct = Math.max(0, Math.min(100, v));
        const barH = Math.max(1.5, (pct / 100) * h);
        const color =
          pct >= 99.5 ? "hsl(160 70% 50%)" : pct >= 95 ? "hsl(45 90% 60%)" : "hsl(0 75% 60%)";
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={h - barH}
            width={Math.max(1, barW - 1)}
            height={barH}
            fill={color}
            rx={0.5}
          />
        );
      })}
    </svg>
  );
}

function fetchStatus(): Promise<StatusResponse> {
  return supabase.functions.invoke<StatusResponse>("public-status").then((r) => {
    if (r.error) throw r.error;
    return r.data!;
  });
}

export default function Status() {
  const [showPast, setShowPast] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["public-status"],
    queryFn: fetchStatus,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const overall = data?.overall ?? "operational";

  return (
    <>
      <Helmet>
        <title>System Status — useadtool.ai</title>
        <meta
          name="description"
          content="Live status of useadtool.ai services: video rendering, AI generation, database, authentication, and social publishing."
        />
        <meta name="robots" content="index, follow" />
      </Helmet>

      <div className="min-h-screen bg-[#050816] text-foreground">
        {/* Subtle ambient glow */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-[#F5C76A]/5 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 py-12 sm:py-16">
          {/* Back link */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition mb-10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to app
          </Link>

          {/* Header */}
          <div className="mb-10">
            <div className="text-xs uppercase tracking-[0.25em] text-[#F5C76A]/70 mb-3 font-medium">
              System Status
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className={cn("h-3 w-3 rounded-full", STATUS_DOT[overall])} />
              <h1 className="text-2xl sm:text-3xl font-serif text-white">
                {isLoading ? "Checking systems…" : OVERALL_HEADLINE[overall]}
              </h1>
            </div>
            {data?.updated_at && (
              <div className="text-xs text-white/40 ml-6">
                Last checked {new Date(data.updated_at).toLocaleString()}
              </div>
            )}
          </div>

          {/* Active incidents */}
          {data?.active_incidents && data.active_incidents.length > 0 && (
            <div className="mb-8 space-y-3">
              {data.active_incidents.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-xl border border-amber-400/30 bg-amber-400/5 backdrop-blur-sm p-5"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="font-medium text-amber-200">{inc.title}</div>
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 whitespace-nowrap">
                      {inc.status}
                    </span>
                  </div>
                  {inc.description && (
                    <div className="text-sm text-white/70 mb-2">{inc.description}</div>
                  )}
                  <div className="text-xs text-white/40">
                    Started {new Date(inc.started_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Components */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5 text-[11px] uppercase tracking-wider text-white/40 grid grid-cols-[1fr_auto_auto] gap-4 items-center">
              <span>Component</span>
              <span className="text-right">90d uptime</span>
              <span className="w-[90px] text-right">Last 30d</span>
            </div>
            {(data?.components ?? Array.from({ length: 6 })).map((c, i) => {
              const comp = c as ComponentResult | undefined;
              return (
                <div
                  key={comp?.key ?? i}
                  className="px-5 py-4 border-b border-white/5 last:border-b-0 grid grid-cols-[1fr_auto_auto] gap-4 items-center"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full flex-shrink-0",
                        comp ? STATUS_DOT[comp.status] : "bg-white/10"
                      )}
                    />
                    <div className="min-w-0">
                      <div className="text-sm text-white/90 truncate">
                        {comp?.name ?? <span className="text-white/30">Loading…</span>}
                      </div>
                      {comp && comp.status !== "operational" && (
                        <div className="text-xs text-amber-300/80 mt-0.5">
                          {STATUS_LABEL[comp.status]}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-sm tabular-nums text-white/60 text-right">
                    {comp ? `${comp.uptime_90d.toFixed(2)}%` : "—"}
                  </div>
                  <div>{comp && <Sparkline values={comp.sparkline} />}</div>
                </div>
              );
            })}
          </div>

          {/* Past incidents */}
          {data?.past_incidents && data.past_incidents.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setShowPast((s) => !s)}
                className="flex items-center gap-2 text-sm text-white/60 hover:text-white/90 transition"
              >
                {showPast ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Past incidents ({data.past_incidents.length})
              </button>
              {showPast && (
                <ul className="mt-4 space-y-2">
                  {data.past_incidents.map((inc) => (
                    <li
                      key={inc.id}
                      className="flex items-start gap-3 text-sm py-2 border-b border-white/5"
                    >
                      <span className="text-white/40 tabular-nums whitespace-nowrap">
                        {new Date(inc.started_at).toLocaleDateString()}
                      </span>
                      <span className="text-white/80 flex-1">{inc.title}</span>
                      <span className="text-xs text-emerald-400/70 whitespace-nowrap">
                        Resolved
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="mt-16 pt-8 border-t border-white/5 text-xs text-white/35 flex flex-wrap items-center justify-between gap-3">
            <span>Auto-refreshing every 60 seconds.</span>
            <Link to="/support" className="hover:text-white/70 transition">
              Contact support →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
