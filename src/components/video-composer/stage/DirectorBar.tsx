import { useCallback } from "react";
import { Volume2, VolumeX, Music2, Maximize2, Minimize2 } from "lucide-react";
import { useStudioPreferences, type StageAudioMode } from "@/hooks/useStudioPreferences";
import { tx } from '@/lib/i18nText';

/**
 * Director's Bar — the sticky cinematic control strip at the top of the
 * Motion Studio Stage. Surfaces Audio Mode (Off/Ambient/Full) and the
 * Cinemascope toggle. The Quick/Direct/Studio switch was removed: the
 * briefing always shows the full studio feature set.
 */
export default function DirectorBar() {
  const { prefs, setAudioMode, toggleCinemascope } = useStudioPreferences();

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
              {tx({ de: "Sound Stage · Live", en: "Sound Stage · Live", es: "Plató de sonido · En vivo" })}
            </span>
          </div>
        </div>

        {/* Right: cinematic controls */}
        <div className="flex items-center gap-2">
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
