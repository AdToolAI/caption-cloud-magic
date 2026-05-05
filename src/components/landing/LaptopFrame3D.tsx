import { ReactNode } from "react";

interface LaptopFrame3DProps {
  children: ReactNode;
}

/**
 * Sith Command Deck — carbon-black laptop with razor-sharp edges,
 * 1px gold hairline contours, and a red→gold "lightsaber" glow strip
 * emerging from the keyboard slit.
 */
export const LaptopFrame3D = ({ children }: LaptopFrame3DProps) => {
  return (
    <div className="relative w-full" style={{ transformStyle: "preserve-3d" }}>
      {/* SCREEN HOUSING */}
      <div
        className="relative mx-auto"
        style={{
          width: "100%",
          maxWidth: "640px",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Outer carbon shell */}
        <div
          className="relative bg-[#070708] p-[10px]"
          style={{
            borderRadius: "10px 10px 4px 4px",
            boxShadow: `
              0 0 0 1px hsla(43, 90%, 68%, 0.6),
              0 0 0 2px rgba(0, 0, 0, 0.95),
              0 0 0 3px hsla(43, 90%, 68%, 0.18),
              0 30px 60px -20px rgba(0, 0, 0, 0.95),
              0 50px 100px -30px hsla(355, 75%, 35%, 0.28),
              inset 0 1px 0 hsla(43, 90%, 68%, 0.22)
            `,
          }}
        >
          {/* Top gold hairline — sharper, fuller bleed */}
          <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-90" />

          {/* Screen bezel (inner) */}
          <div
            className="relative bg-black overflow-hidden"
            style={{
              borderRadius: "4px",
              boxShadow: `
                inset 0 0 0 1px hsla(43, 90%, 68%, 0.65),
                inset 0 0 0 2px rgba(0, 0, 0, 0.95),
                inset 0 0 30px rgba(0, 0, 0, 0.95)
              `,
            }}
          >
            {/* Camera notch */}
            <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-10 w-1 h-1 rounded-full bg-neutral-900 ring-1 ring-primary/40" />

            {/* 16:9 video slot */}
            <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
              {children}
            </div>
          </div>
        </div>

        {/* KEYBOARD BASE — trapezoid, perspective tilt */}
        <div
          className="relative mx-auto"
          style={{
            width: "112%",
            marginLeft: "-6%",
            height: "18px",
            background: "linear-gradient(180deg, #0b0b0d 0%, #050506 60%, #000 100%)",
            clipPath: "polygon(3% 0, 97% 0, 100% 100%, 0% 100%)",
            boxShadow: `
              0 1px 0 hsla(43, 90%, 68%, 0.2) inset,
              0 20px 40px -10px rgba(0, 0, 0, 0.9)
            `,
          }}
        >
          {/* Lightsaber slit — red→gold pulsing glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[55%] h-[2px] overflow-hidden">
            <div
              className="absolute inset-0 animate-pulse"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, hsla(355, 75%, 48%, 0.9) 25%, hsla(43, 90%, 68%, 1) 50%, hsla(355, 75%, 48%, 0.9) 75%, transparent 100%)",
                boxShadow:
                  "0 0 12px hsla(43, 90%, 68%, 0.6), 0 0 24px hsla(355, 75%, 48%, 0.4)",
                animationDuration: "3s",
              }}
            />
          </div>

          {/* Subtle bottom hairline */}
          <div className="absolute inset-x-12 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" />
        </div>

        {/* Floor reflection / grounding shadow */}
        <div
          className="mx-auto mt-1"
          style={{
            width: "70%",
            height: "30px",
            background:
              "radial-gradient(ellipse at center top, hsla(355, 75%, 30%, 0.35) 0%, transparent 70%)",
            filter: "blur(8px)",
          }}
        />
      </div>
    </div>
  );
};
