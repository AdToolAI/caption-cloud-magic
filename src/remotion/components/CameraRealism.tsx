/**
 * Camera-Realism overlay.
 *
 * Perfectly clean frames read as synthetic. Real glass and real sensors add
 * grain, a faint halation bloom around highlights, and a hint of vignetting.
 * Adding those back is what makes a generated shot feel photographed.
 *
 * IMPORTANT — Raw-Media-Invariant: this layer is OPT-IN and must only be
 * mounted by Autopilot and Director's Cut renders. Universal Content Creator
 * exports stay pixel-identical to the uploaded source, so they never mount it.
 * This is deliberately NOT wired into the disabled Sensor-Baseline path.
 */

import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

export type RealismIntensity = 'off' | 'subtle' | 'medium' | 'filmic';

interface RealismSettings {
  grainOpacity: number;
  halationOpacity: number;
  vignetteOpacity: number;
  /** Percent of focal breathing at the start of each shot. 0 = none. */
  breathingPercent: number;
}

const PRESETS: Record<RealismIntensity, RealismSettings> = {
  off: { grainOpacity: 0, halationOpacity: 0, vignetteOpacity: 0, breathingPercent: 0 },
  subtle: { grainOpacity: 0.035, halationOpacity: 0.05, vignetteOpacity: 0.12, breathingPercent: 0.4 },
  medium: { grainOpacity: 0.06, halationOpacity: 0.09, vignetteOpacity: 0.2, breathingPercent: 0.7 },
  filmic: { grainOpacity: 0.095, halationOpacity: 0.14, vignetteOpacity: 0.3, breathingPercent: 1.1 },
};

/**
 * Deterministic per-frame grain offset. Remotion renders frames independently,
 * so the pattern must be derived from the frame number — never from Math.random.
 */
function grainOffset(frame: number): { x: number; y: number } {
  const a = Math.sin(frame * 12.9898) * 43758.5453;
  const b = Math.sin(frame * 78.233) * 24634.6345;
  return { x: (a - Math.floor(a)) * 200, y: (b - Math.floor(b)) * 200 };
}

export const CameraRealism: React.FC<{ intensity?: RealismIntensity }> = ({
  intensity = 'subtle',
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const settings = PRESETS[intensity] ?? PRESETS.subtle;

  if (intensity === 'off') return null;

  const offset = grainOffset(frame);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Halation — highlights bleed warm, as they do through real glass. */}
      {settings.halationOpacity > 0 && (
        <AbsoluteFill
          style={{
            background:
              'radial-gradient(ellipse at 50% 40%, rgba(255,214,170,1) 0%, rgba(255,180,120,0.35) 35%, rgba(0,0,0,0) 70%)',
            mixBlendMode: 'screen',
            opacity: settings.halationOpacity,
          }}
        />
      )}

      {/* Vignette — every lens falls off toward the corners. */}
      {settings.vignetteOpacity > 0 && (
        <AbsoluteFill
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,1) 130%)',
            opacity: settings.vignetteOpacity,
          }}
        />
      )}

      {/* Grain — an SVG noise tile shifted each frame so it shimmers like film.
          Cheap enough for the sandbox renderer; no backdropFilter anywhere. */}
      {settings.grainOpacity > 0 && (
        <AbsoluteFill
          style={{
            backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
              `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='1'/></svg>`,
            )}")`,
            backgroundPosition: `${offset.x}px ${offset.y}px`,
            backgroundRepeat: 'repeat',
            mixBlendMode: 'overlay',
            opacity: settings.grainOpacity,
            width: width + 400,
            height: height + 400,
            left: -200,
            top: -200,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

/**
 * Focal breathing for the shot underneath. Returns a scale factor that settles
 * within the first ~12 frames, the way a lens does when focus locks.
 */
export function useFocalBreathing(intensity: RealismIntensity = 'subtle'): number {
  const frame = useCurrentFrame();
  const percent = (PRESETS[intensity] ?? PRESETS.subtle).breathingPercent;
  if (percent === 0) return 1;
  return interpolate(frame, [0, 12], [1 + percent / 100, 1], {
    extrapolateRight: 'clamp',
  });
}
