/**
 * cameraPathRuntime.ts (V452) — frontend/Remotion mirror of the PURE camera
 * path sampler in `supabase/functions/_shared/dynamic-camera-path.ts`.
 *
 * The Remotion bundle cannot import Deno edge modules, so the sampler is
 * mirrored here. `src/lib/composer/__tests__/v452CameraPathParity.test.ts`
 * proves both implementations return identical geometry for identical paths —
 * that parity is the guarantee that preclip and reprojection (T13) walk the
 * exact same path.
 */

export interface CameraPathKeyframeRuntime {
  t: number;
  x: number;
  y: number;
  size: number;
  mx?: number | null;
  my?: number | null;
  src?: string;
}

export interface CameraPathRuntime {
  keyframes: CameraPathKeyframeRuntime[];
  srcWidth?: number;
  srcHeight?: number;
  startSec?: number;
  endSec?: number;
  outputSize?: number;
  moving?: boolean;
  signature?: string;
}

/** PURE — crop rect at a preclip-relative time. Linear between keyframes. */
export function sampleCameraPathRuntime(
  path: { keyframes?: CameraPathKeyframeRuntime[] } | null | undefined,
  tSec: number,
): { x: number; y: number; size: number } | null {
  const kf = path?.keyframes;
  if (!Array.isArray(kf) || kf.length === 0) return null;
  if (kf.length === 1 || tSec <= kf[0].t) return { x: kf[0].x, y: kf[0].y, size: kf[0].size };
  const last = kf[kf.length - 1];
  if (tSec >= last.t) return { x: last.x, y: last.y, size: last.size };
  for (let i = 1; i < kf.length; i++) {
    if (tSec <= kf[i].t) {
      const a = kf[i - 1];
      const b = kf[i];
      const span = b.t - a.t;
      const f = span > 0 ? (tSec - a.t) / span : 0;
      return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        size: a.size + (b.size - a.size) * f,
      };
    }
  }
  return { x: last.x, y: last.y, size: last.size };
}

/**
 * True when the path is used at all — the runtime mirror of
 * `shouldUseCameraPath` in `dynamic-camera-path.ts`. Preclip render and T13
 * reprojection MUST evaluate this identically (V452 A.2 parity contract).
 */
export function isDynamicPathRuntime(
  path:
    | { keyframes?: CameraPathKeyframeRuntime[]; moving?: boolean; signature?: string }
    | null
    | undefined,
): boolean {
  return (
    !!path &&
    path.moving === true &&
    Array.isArray(path.keyframes) &&
    path.keyframes.length > 1 &&
    typeof path.signature === "string" &&
    path.signature.length > 0
  );
}
