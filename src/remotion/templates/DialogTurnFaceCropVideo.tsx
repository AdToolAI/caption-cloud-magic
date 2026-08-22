/**
 * DialogTurnFaceCropVideo — Per-Turn Single-Face Preclip (v21, dynamic V452).
 *
 * Materialises a tight square crop around ONE speaker's face from the
 * master plate, so Sync.so receives an unambiguous single-face frame.
 * This eliminates the "first speaker mouths everything" bug on 3+
 * speaker scenes, where Sync.so's coords were advisory and it locked
 * onto the leftmost face for every turn.
 *
 * V452: the crop may now FOLLOW the assigned face over time. When
 * `cropPath` is present the window position is sampled per frame from the
 * shared camera path (same path the mux uses for the inverse reprojection).
 * Without a path the legacy fixed `cropX/cropY/cropSize` is used unchanged.
 *
 * The lipsynced output is composited back at the same (moving) region by
 * DialogStitchVideo with a soft circular mask so the crop blends into the
 * master plate underneath.
 */
import React from 'react';
import { AbsoluteFill, Video, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { sampleCameraPathRuntime } from '@/lib/composer/cameraPathRuntime';

export const CameraPathKeyframeSchema = z.object({
  t: z.number().min(0),
  x: z.number(),
  y: z.number(),
  size: z.number().positive(),
  mx: z.number().nullable().optional(),
  my: z.number().nullable().optional(),
  src: z.string().optional(),
});

export const CameraPathSchema = z.object({
  keyframes: z.array(CameraPathKeyframeSchema).min(1),
  moving: z.boolean().optional(),
  signature: z.string().optional(),
  srcWidth: z.number().positive().optional(),
  srcHeight: z.number().positive().optional(),
  outputSize: z.number().positive().optional(),
  startSec: z.number().optional(),
  endSec: z.number().optional(),
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
  /** V452 — dynamic camera path; overrides the static crop when present. */
  cropPath: CameraPathSchema.nullable().optional(),
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

  // V452 — sample the shared camera path at this frame's preclip-relative
  // time. Falls back to the frozen static crop when no path was persisted.
  const sampled =
    cropPath && Array.isArray(cropPath.keyframes) && cropPath.keyframes.length > 0
      ? sampleCameraPathRuntime(cropPath, frame / fps)
      : null;
  const cx = sampled ? sampled.x : cropX;
  const cy = sampled ? sampled.y : cropY;
  const cSize = sampled && sampled.size > 0 ? sampled.size : cropSize;

  // Scale so `cSize` (source px) fills `outW`/`outH` (square output).
  const scaleX = outW / cSize;
  const scaleY = outH / cSize;
  // Use the larger scale to ensure the crop fully covers the output square
  // (object-fit: cover semantics).
  const scale = Math.max(scaleX, scaleY);
  const videoW = srcWidth * scale;
  const videoH = srcHeight * scale;
  // Crop center in scaled-video space; we want crop center at output center.
  const cropCenterX = (cx + cSize / 2) * scale;
  const cropCenterY = (cy + cSize / 2) * scale;
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
