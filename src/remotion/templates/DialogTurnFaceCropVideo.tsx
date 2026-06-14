/**
 * DialogTurnFaceCropVideo — Per-Turn Single-Face Preclip (v21).
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
 */
import React from 'react';
import { AbsoluteFill, Video, useVideoConfig } from 'remotion';
import { z } from 'zod';

export const DialogTurnFaceCropVideoSchema = z.object({
  masterVideoUrl: z.string().url(),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  /** Square output size in pixels; must be forwarded so Lambda metadata does not fall back to 512. */
  outputSize: z.number().positive().optional(),
  /** Source-master dims in pixels. */
  srcWidth: z.number().positive(),
  srcHeight: z.number().positive(),
  /** Crop region in source-master pixel space. */
  cropX: z.number().min(0),
  cropY: z.number().min(0),
  cropSize: z.number().positive(),
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
}) => {
  const { fps, width: outW, height: outH } = useVideoConfig();
  const startFrame = Math.max(0, Math.floor(Number(startSec || 0) * fps));

  // Scale so `cropSize` (source px) fills `outW`/`outH` (square output).
  const scaleX = outW / cropSize;
  const scaleY = outH / cropSize;
  // Use the larger scale to ensure the crop fully covers the output square
  // (object-fit: cover semantics).
  const scale = Math.max(scaleX, scaleY);
  const videoW = srcWidth * scale;
  const videoH = srcHeight * scale;
  // Crop center in scaled-video space; we want crop center at output center.
  const cropCenterX = (cropX + cropSize / 2) * scale;
  const cropCenterY = (cropY + cropSize / 2) * scale;
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
