import { useEffect, useRef, useState } from "react";
import { LaptopFrame3D } from "./LaptopFrame3D";
import { CinematicVideoPlayer } from "./CinematicVideoPlayer";
import { FloatingAppHeader } from "./FloatingAppHeader";
import { HoloDataPills } from "./HoloDataPills";

/**
 * Sith Command Deck — 3D-perspective laptop hero visual.
 * Floating app header above, holo data pills below, mouse parallax tilt.
 */
export const SithCommandDeck = () => {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 4, y: -8 });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const el = sceneRef.current;
    if (!el) return;

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / rect.width;
      const dy = (e.clientY - cy) / rect.height;
      // Subtle ±3° around defaults
      const ry = -8 + dx * 4;
      const rx = 4 - dy * 3;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTilt({ x: rx, y: ry }));
    };

    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div
      ref={sceneRef}
      className="relative w-full"
      style={{ perspective: "1500px", perspectiveOrigin: "50% 40%" }}
    >
      {/* Sith atmosphere — single subtle red glow at the floor */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[60%] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 100%, hsla(355, 75%, 35%, 0.18) 0%, transparent 65%)",
        }}
      />

      <div
        className="relative flex flex-col items-center gap-5"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: "transform 250ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        }}
      >
        {/* Floating App Header — above laptop */}
        <div
          className="relative w-full"
          style={{ transform: "translateZ(50px)" }}
        >
          <FloatingAppHeader />
        </div>

        {/* Laptop with video player */}
        <div className="relative w-full" style={{ transform: "translateZ(0px)" }}>
          <LaptopFrame3D>
            <CinematicVideoPlayer src="/videos/hero-video.mp4" />
          </LaptopFrame3D>
        </div>

        {/* Holo data pills — below laptop */}
        <div
          className="relative w-full pt-2"
          style={{ transform: "translateZ(60px)" }}
        >
          <HoloDataPills />
        </div>
      </div>
    </div>
  );
};
