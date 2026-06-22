import { useStudioPreferences, type EditorMode } from "@/hooks/useStudioPreferences";

/**
 * FilmStripModeSelector — the visible Quick / Direct / Studio strip at the
 * top of the Briefing. Three perforated film tiles (sprocket holes on top
 * and bottom). The active tile is lit gold; inactive tiles read as dim
 * raw celluloid. Acts as the "you-are-here" indicator AND a working switch
 * (mirrors the DirectorBar's mode toggle).
 */
const MODES: { id: EditorMode; label: string; sub: string; panels: string }[] = [
  { id: "quick", label: "Quick", sub: "One-Take", panels: "2 panels" },
  { id: "direct", label: "Direct", sub: "Crew + Style", panels: "5 panels" },
  { id: "studio", label: "Studio", sub: "Full Console", panels: "All panels" },
];

const SPROCKETS = Array.from({ length: 7 }, (_, i) => i);

export default function FilmStripModeSelector() {
  const { prefs, setEditorMode } = useStudioPreferences();

  return (
    <div
      className="relative rounded-2xl p-3 overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, hsla(228,38%,5%,0.85) 0%, hsla(225,32%,9%,0.7) 100%)",
        boxShadow:
          "inset 0 1px 0 hsla(43,90%,82%,0.18), 0 0 0 1px hsla(43,90%,68%,0.18), 0 18px 50px -28px hsla(43,90%,68%,0.28)",
      }}
    >
      {/* Eyebrow */}
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300"
            style={{
              boxShadow: "0 0 8px hsla(43,90%,68%,0.9)",
              animation: "stageRecPulse 1.6s ease-in-out infinite",
            }}
          />
          <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-amber-200/70">
            Director's Mode · select your reel
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-amber-200/40">
          {prefs.editorMode}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => {
          const active = prefs.editorMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setEditorMode(m.id)}
              aria-pressed={active}
              className="film-tile group relative rounded-md text-left transition-all"
              style={{
                background: active
                  ? "linear-gradient(180deg, hsla(43,90%,18%,0.85), hsla(43,70%,8%,0.95))"
                  : "linear-gradient(180deg, hsla(228,30%,8%,0.85), hsla(228,30%,5%,0.95))",
                boxShadow: active
                  ? "inset 0 1px 0 hsla(43,90%,82%,0.4), inset 0 0 0 1px hsla(43,90%,68%,0.7), 0 0 28px -6px hsla(43,90%,68%,0.55)"
                  : "inset 0 1px 0 hsla(0,0%,100%,0.04), inset 0 0 0 1px hsla(0,0%,100%,0.06)",
              }}
            >
              {/* Sprocket holes top */}
              <div className="flex justify-between px-2 pt-1.5">
                {SPROCKETS.map((s) => (
                  <span
                    key={`t-${s}`}
                    className="block h-1.5 w-2 rounded-[2px]"
                    style={{ background: active ? "hsla(0,0%,0%,0.55)" : "hsla(0,0%,0%,0.7)" }}
                  />
                ))}
              </div>

              {/* Body */}
              <div className="px-4 py-3">
                <div
                  className="font-mono text-[9px] uppercase tracking-[0.4em] mb-1"
                  style={{ color: active ? "hsl(43,90%,68%)" : "hsla(0,0%,100%,0.35)" }}
                >
                  Reel · {m.panels}
                </div>
                <div
                  className="text-2xl leading-none font-semibold"
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    color: active ? "hsl(43,95%,82%)" : "hsla(0,0%,100%,0.55)",
                    textShadow: active ? "0 0 18px hsla(43,90%,68%,0.6)" : "none",
                  }}
                >
                  {m.label}
                </div>
                <div
                  className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em]"
                  style={{ color: active ? "hsla(43,90%,82%,0.75)" : "hsla(0,0%,100%,0.4)" }}
                >
                  {m.sub}
                </div>
              </div>

              {/* Sprocket holes bottom */}
              <div className="flex justify-between px-2 pb-1.5">
                {SPROCKETS.map((s) => (
                  <span
                    key={`b-${s}`}
                    className="block h-1.5 w-2 rounded-[2px]"
                    style={{ background: active ? "hsla(0,0%,0%,0.55)" : "hsla(0,0%,0%,0.7)" }}
                  />
                ))}
              </div>

              {/* Active glow rail */}
              {active && (
                <div
                  aria-hidden
                  className="absolute inset-x-3 -bottom-px h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, hsl(43,90%,68%), transparent)",
                    boxShadow: "0 0 12px hsla(43,90%,68%,0.9)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
