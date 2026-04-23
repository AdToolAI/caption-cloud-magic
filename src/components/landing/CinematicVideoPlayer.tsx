import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface CinematicVideoPlayerProps {
  src: string;
  poster?: string;
}

export const CinematicVideoPlayer = ({ src, poster }: CinematicVideoPlayerProps) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const [showControls, setShowControls] = useState(false);
  const [hovered, setHovered] = useState(false);

  // IntersectionObserver: only autoplay when visible
  useEffect(() => {
    const v = videoRef.current;
    const c = containerRef.current;
    if (!v || !c) return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(c);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setProgress(v.duration ? (v.currentTime / v.duration) * 100 : 0);
      setTime({ cur: v.currentTime, dur: v.duration || 0 });
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("loadedmetadata", onTime);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("loadedmetadata", onTime);
    };
  }, []);

  const triggerControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (!hovered) setShowControls(false);
    }, 2000);
  }, [hovered]);

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play(); else v.pause();
  };

  const handleSurfaceClick = () => {
    const v = videoRef.current;
    if (!v) return;
    if (muted) {
      v.muted = false;
      setMuted(false);
      v.currentTime = 0;
      v.play().catch(() => {});
    } else {
      togglePlay();
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const fullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else v.requestFullscreen?.();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    v.currentTime = pct * v.duration;
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden cursor-pointer group"
      onMouseEnter={() => { setHovered(true); setShowControls(true); }}
      onMouseLeave={() => { setHovered(false); setShowControls(false); }}
      onMouseMove={triggerControls}
      onClick={handleSurfaceClick}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="w-full h-full object-cover"
      />

      {/* Subtle inner vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.45)_100%)]" />

      {/* Unmute hint when muted */}
      {muted && (
        <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/60 backdrop-blur-sm border border-primary/30 text-[10px] uppercase tracking-[0.18em] text-primary/90 font-semibold pointer-events-none transition-opacity duration-300">
          {t("landing.hero.deck.playHint")}
        </div>
      )}

      {/* Center play overlay when paused */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 bg-black/70 border border-primary/60 flex items-center justify-center">
            <Play className="h-7 w-7 text-primary fill-primary" />
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div
        className={`absolute inset-x-0 bottom-0 px-3 pb-2 pt-6 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div
          className="relative h-1 bg-white/10 cursor-pointer mb-2 group/bar"
          onClick={seek}
        >
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-gold-dark"
            style={{ width: `${progress}%` }}
          />
          {/* Sith-red playhead tracer */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full"
            style={{
              left: `calc(${progress}% - 3px)`,
              background: "hsl(355, 75%, 48%)",
              boxShadow: "0 0 8px hsl(355, 75%, 48%), 0 0 2px #fff",
            }}
          />
        </div>

        <div className="flex items-center gap-3 text-[11px] text-white/90">
          <button onClick={togglePlay} className="hover:text-primary transition-colors">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <button onClick={toggleMute} className="hover:text-primary transition-colors">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <span className="font-mono tabular-nums tracking-wider">
            {fmt(time.cur)} <span className="text-white/40">/</span> {fmt(time.dur)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.2em] text-primary/80 font-semibold border border-primary/30 px-1.5 py-0.5">HD</span>
            <button onClick={fullscreen} className="hover:text-primary transition-colors">
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
