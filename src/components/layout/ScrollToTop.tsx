import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * ScrollToTop — resets window scroll on route change so the sticky
 * AppHeader never lands on a stale scroll offset (e.g. after clicking
 * a header icon that navigates to a shorter page).
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}
