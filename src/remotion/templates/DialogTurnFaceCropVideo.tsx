/**
 * DialogTurnFaceCropVideo — Per-Turn Single-Face Preclip.
 *
 * Materialises a tight square crop around ONE speaker's face from the
 * master plate, so Sync.so receives an unambiguous single-face frame.
 * This eliminates the "first speaker mouths everything" bug on 3+
 * speaker scenes, where Sync.so's coords were advisory and it locked
 * onto the leftmost face for every turn.
 *
 * The lipsynced output is composited back at the original (x, y, size)
 * region by DialogStitchVideo with a soft circular mask so the crop
 * blends into the master plate underneath.
 *
 * ── v359 — MOVING CROP ────────────────────────────────────────────────
 * Until v358 the crop rectangle was CONSTANT for the whole turn. When the
 * speaker moved while talking, their face left that fixed window: the
 * rendered preclip showed hair and shoulder instead of a mouth, and
 * Sync.so returned the input unchanged ("passthrough"). This was proven
 * for scene 89c5e01c (Kailee) — no face at all in the first half.
 *
 * A bounding box cannot bring back a face the crop cut away. So the crop
 * now follows the face: `cropPath` carries one window PER FRAME, planned
 * offline by `_shared/camera-path.ts` (dead zone, forward/backward
 * smoothing, look-ahead, capped pan/acceleration, constant zoom).
 *
 * `cropPath` is optional — without it the component falls back to the
 * static cropX/cropY/cropSize behaviour, so older render rows and the
 * AWS still-probe path (which renders full frames) keep working unchanged.
 */
import React from 'react';
import { AbsoluteFill, Video, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';

const CropWindowSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  size: z.number().positive(),
});

export const DialogTurnFaceCropVideoSchema = z.object({
  masterVideoUrl: z.string().url(),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  /** Square output size in pixels; must be forwarded so Lambda metadata does not fall back to 512. */
  outputSize: z.number().positive().optional(),
  /** Source-master dims in pixels. */
  srcWidth: z.number().positive(),
  srcHeight: z.number().positive(),
  /** Crop region in source-master pixel space (static fallback). */
  cropX: z.number().min(0),
  cropY: z.number().min(0),
  cropSize: z.number().positive(),
  /**
   * v359 — one crop window per frame, in source-master pixel space.
   * When present it takes precedence over cropX/cropY/cropSize.
   * Frames beyond the array clamp to the last entry.
   */
  cropPath: z.array(CropWindowSchema).optional(),
});

export type DialogTurnFaceCropVideoProps = z.infer<typeof DialogTurnFaceCropVideoSchema>;

export const DialogTurnFaceCropVideo: React.FC<DialogTurnFaceCropVideoProps> = ({
  masterVideoUrl,
  startSec,
  srcWidth,
  srcHeight,
  cropX,
  cropY,
  cropSize,
  cropPath,
}) => {
  const { fps, width: outW, height: outH } = useVideoConfig();
  const frame = useCurrentFrame();
  const startFrame = Math.max(0, Math.floor(Number(startSec || 0) * fps));

  // v359 — pick this frame's window. Clamp instead of wrapping so a
  // slightly short path never snaps the camera back to the start.
  const window = React.useMemo(() => {
    if (Array.isArray(cropPath) && cropPath.length > 0) {
      const idx = Math.min(Math.max(0, frame), cropPath.length - 1);
      const w = cropPath[idx];
      if (w && Number.isFinite(w.x) && Number.isFinite(w.y) && w.size > 0) return w;
    }
    return { x: cropX, y: cropY, size: cropSize };
  }, [cropPath, frame, cropX, cropY, cropSize]);

  // Scale so `size` (source px) fills `outW`/`outH` (square output).
  const scaleX = outW / window.size;
  const scaleY = outH / window.size;
  // Use the larger scale to ensure the crop fully covers the output square
  // (object-fit: cover semantics).
  const scale = Math.max(scaleX, scaleY);
  const videoW = srcWidth * scale;
  const videoH = srcHeight * scale;
  // Crop center in scaled-video space; we want crop center at output center.
  const cropCenterX = (window.x + window.size / 2) * scale;
  const cropCenterY = (window.y + window.size / 2) * scale;
  const left = outW / 2 - cropCenterX;
  const top = outH / 2 - cropCenterY;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      {masterVideoUrl && (
        <Video
          src={masterVideoUrl}
          muted
          startFrom={startFrame}
          playbackRate={1}
          style={{
            position: 'absolute',
            left,
            top,
            width: videoW,
            height: videoH,
            objectFit: 'fill',
          }}
        />
      )}
    </AbsoluteFill>
  );
};

export default DialogTurnFaceCropVideo;

