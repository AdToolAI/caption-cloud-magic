import { Navigate, useLocation } from "react-router-dom";
import type { StudioStep } from "@/contexts/ContentStudioContext";

interface ContentStudioRedirectProps {
  /** Zielschritt im Content Studio. */
  step?: StudioStep;
  /** Öffnet direkt das Coach-Panel. */
  coach?: boolean;
  /** Öffnet direkt die Vorlagen-Schublade. */
  templates?: boolean;
  /** Startet im Serien-Modus (ehemals Kampagnen-Assistent). */
  series?: boolean;
}

/**
 * Leitet Alt-Routen (/ai-post-generator, /image-caption-pairing, /template-manager,
 * /campaigns, /coach, /post-designer) auf das Content Studio um — ohne
 * Query-Parameter oder Navigations-State zu verlieren.
 */
export function ContentStudioRedirect({ step, coach, templates, series }: ContentStudioRedirectProps) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  if (step) params.set("step", step);
  if (coach) params.set("coach", "1");
  if (templates) params.set("templates", "1");
  if (series) params.set("mode", "series");

  const query = params.toString();

  return <Navigate to={`/content-studio${query ? `?${query}` : ""}`} state={location.state} replace />;
}

export default ContentStudioRedirect;
