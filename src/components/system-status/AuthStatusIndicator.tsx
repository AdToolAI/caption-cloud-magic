import { Link } from "react-router-dom";
import { useSystemStatus } from "@/hooks/useSystemStatus";

/**
 * Tiny status indicator for the Auth page.
 * INVISIBLE when systems are operational — only shows up during incidents.
 * Reduces "I can't log in!" support tickets during real outages.
 */
export function AuthStatusIndicator() {
  const { data } = useSystemStatus();
  const overall = data?.overall;

  if (!overall || overall === "operational") return null;

  const dotClass =
    overall === "major_outage"
      ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse"
      : overall === "partial_outage"
      ? "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]"
      : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]";

  const message =
    overall === "major_outage"
      ? "Major service outage in progress"
      : overall === "partial_outage"
      ? "Some services are unavailable"
      : "Some services are degraded";

  return (
    <Link
      to="/status"
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-black/60 backdrop-blur-md px-3 py-1.5 text-xs text-amber-200 hover:bg-black/80 transition"
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {message}
      <span className="text-amber-300/70">→</span>
    </Link>
  );
}
