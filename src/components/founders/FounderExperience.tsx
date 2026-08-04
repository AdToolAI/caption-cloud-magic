/**
 * FounderExperience — activates the "Founders Circle" visual layer.
 *
 * Sets data-founder="true" on <html> for active founders so the gold layer in
 * index.css ([data-founder="true"]) applies app-wide.
 *
 * ANONYMITY CONTRACT: never render a slot number, position, rank or the exact
 * claim date anywhere in founder UI. Only the remaining benefit duration.
 */
import { useEffect } from "react";
import { useFounderStatus } from "@/hooks/useFounderStatus";

export function FounderExperience() {
  const { isActive, loading } = useFounderStatus();

  useEffect(() => {
    const root = document.documentElement;
    if (!loading && isActive) {
      root.setAttribute("data-founder", "true");
    } else {
      root.removeAttribute("data-founder");
    }
    return () => root.removeAttribute("data-founder");
  }, [isActive, loading]);

  return null;
}

export default FounderExperience;
