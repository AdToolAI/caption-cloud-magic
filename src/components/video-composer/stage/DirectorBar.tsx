import { useCallback } from "react";
import { Volume2, VolumeX, Music2, Film, Maximize2, Minimize2, Gauge } from "lucide-react";
import { useStudioPreferences, type EditorMode, type StageAudioMode } from "@/hooks/useStudioPreferences";

/**
 * Director's Bar — the sticky cinematic control strip at the top of the
 * Motion Studio Stage. Surfaces the three things that define the immersive
 * feel: Editor Mode (Quick/Direct/Studio), Audio Mode (Off/Ambient/Full),
 * and Cinemascope toggle. Everything else stays inside the existing
 * dashboard.
 */
export default function DirectorBar() {
  const { prefs, setEditorMode, setAudioMode, toggleCinemascope } = useStudioPreferences();

  const audioIcon =
    prefs.audioMode === "off" ? VolumeX : prefs.audioMode === "ambient" ? Volume2 : Music2;
  const AudioIcon = audioIcon;

  const cycleAudio = useCallback(() => {
    const order: StageAudioMode[] = ["off", "ambient", "full"];
    const next = order[(order.indexOf(prefs.audioMode) + 1) % order.length];
    setAudioMode(next);
  }, [prefs.audioMode, setAudioMode]);

  return (
    <div className="sticky top-0 z-[40] -mx-4 mb-3 px-4 py-2 border-b border-[hsl(43_90%_68%/0.12)] bg-gradient-to-b from-[hsl(230_30%_4%/0.95)] via-[hsl(230_30%_4%/0.85)] to-[hsl(230_30%_4%/0.6)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        {/* Left: studio identity */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[hsl(43_90%_68%)] animate-pulse" />
            <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-[hsl(43_90%_68%)]/80">
              Sound Stage · Live
            </span>
          </div>
        </div>

        {/* Right: cinematic controls */}
        <div className="flex items-center gap-2">
          <ModeSwitch value={prefs.editorMode} onChange={setEditorMode} />

          <button
            type="button"
            onClick={cycleAudio}
            title={`Audio: ${prefs.audioMode}`}
            className="group flex h-8 items-center gap-1.5 rounded-full border border-[hsl(43_90%_68%/0.18)] bg-[hsl(220_35%_6%/0.6)] px-3 text-xs text-[hsl(210_40%_98%)]/80 hover:border-[hsl(43_90%_68%/0.5)] hover:text-[hsl(43_90%_68%)] transition-colors"
          >
            <AudioIcon className="h-3.5 w-3.5" />
            <span className="font-mono uppercase tracking-wider text-[10px]">
              {prefs.audioMode === "off" ? "Mute" : prefs.audioMode === "ambient" ? "Ambient" : "Score"}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleCinemascope}
            title="Cinemascope (F)"
            className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors ${
              prefs.cinemascope
                ? "border-[hsl(43_90%_68%)] bg-[hsl(43_90%_68%/0.15)] text-[hsl(43_90%_68%)]"
                : "border-[hsl(43_90%_68%/0.18)] bg-[hsl(220_35%_6%/0.6)] text-[hsl(210_40%_98%)]/80 hover:border-[hsl(43_90%_68%/0.5)] hover:text-[hsl(43_90%_68%)]"
            }`}
          >
            {prefs.cinemascope ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="font-mono uppercase tracking-wider text-[10px]">Cinemascope</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeSwitch({
  value,
  onChange,
}: {
  value: EditorMode;
  onChange: (m: EditorMode) => void;
}) {
  const modes: { id: EditorMode; label: string; hint: string }[] = [
    { id: "quick", label: "Quick", hint: "Ein Prompt, fertig" },
    { id: "direct", label: "Direct", hint: "Cast + Style + Dauer" },
    { id: "studio", label: "Studio", hint: "Volle Regie" },
  ];

  return (
    <div className="flex items-center gap-1 rounded-full border border-[hsl(43_90%_68%/0.18)] bg-[hsl(220_35%_6%/0.6)] p-0.5">
      <Gauge className="ml-2 h-3.5 w-3.5 text-[hsl(43_90%_68%)]/70" />
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          title={m.hint}
          className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition-all ${
            value === m.id
              ? "bg-[hsl(43_90%_68%)] text-[hsl(230_30%_4%)] shadow-[0_0_18px_hsla(43,90%,68%,0.35)]"
              : "text-[hsl(210_40%_98%)]/60 hover:text-[hsl(43_90%_68%)]"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
