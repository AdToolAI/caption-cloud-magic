import { Navigate, useLocation } from "react-router-dom";

export type CommandCenterView = "calendar" | "posts" | "campaigns" | "times";

interface CommandCenterRedirectProps {
  /** Zielansicht im Command Center. */
  view?: CommandCenterView;
  /** Öffnet direkt die Composer-Ebene. */
  compose?: boolean;
}

/**
 * Leitet Alt-Routen (/calendar, /planner, /composer, /posting-times) auf das
 * Command Center um — ohne Query-Parameter oder Navigations-State zu verlieren.
 * Wichtig für Prefill-Flows (?prefill=true, ?preset_weekday, ?preset_hour, …).
 */
export function CommandCenterRedirect({ view, compose }: CommandCenterRedirectProps) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);

  if (view) params.set("view", view);
  if (compose) params.set("compose", "1");

  const query = params.toString();

  return (
    <Navigate
      to={`/command-center${query ? `?${query}` : ""}`}
      state={location.state}
      replace
    />
  );
}

export default CommandCenterRedirect;
