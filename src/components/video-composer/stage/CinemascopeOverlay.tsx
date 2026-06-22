import { useEffect } from "react";
import { useStudioPreferences } from "@/hooks/useStudioPreferences";

/**
 * Cinemascope letterbox overlay — adds 2.39:1 black bars + gold vignette glow
 * when active. Toggled via DirectorBar or keyboard "F".
 */
export default function CinemascopeOverlay() {
  const { prefs, toggleCinemascope } = useStudioPreferences();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleCinemascope();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCinemascope]);

  if (!prefs.cinemascope) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {/* Top letterbox */}
      <div className="absolute inset-x-0 top-0 h-[11vh] bg-black/95 backdrop-blur-sm" />
      {/* Bottom letterbox */}
      <div className="absolute inset-x-0 bottom-0 h-[11vh] bg-black/95 backdrop-blur-sm" />
      {/* Gold vignette glow */}
      <div
        className="absolute inset-0"
        style={{
          boxShadow: "inset 0 0 120px 20px hsla(43, 90%, 68%, 0.18)",
        }}
      />
      {/* Take indicator (subtle) */}
      <div className="absolute top-[calc(11vh+8px)] right-6 text-[10px] uppercase tracking-[0.4em] text-[hsl(43_90%_68%)]/70 font-mono">
        ● Cinemascope · 2.39:1
      </div>
    </div>
  );
}
