/**
 * DialogTurnClipVideo — Per-Turn Preclip-Renderer (Artlist-Style Pipeline).
 *
 * Rendert exakt das `render_window` eines Dialog-Turns als eigenständigen,
 * kurzen MP4-Clip ab Frame 0. Damit kann Sync.so anschließend mit einem
 * sauberen Video ohne `segments_secs` arbeiten — das ist provider-stabiler
 * als die alte Variante, in der Sync.so intern ein langes Master-Video
 * via `segments_secs` ausschnitt.
 *
 * Props:
 *   masterVideoUrl — Original Master-Plate
 *   startSec, endSec — Turn-Fenster im Master
 *   targetWidth/Height — Master-Dims (auf gerade Zahlen normalisiert)
 *
 * Output: kurzer, stiller MP4 in Master-Auflösung, Dauer = endSec-startSec.
 */
import React from 'react';
import { AbsoluteFill, Video, useVideoConfig } from 'remotion';
import { z } from 'zod';

export const DialogTurnClipVideoSchema = z.object({
  masterVideoUrl: z.string().url(),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  targetWidth: z.number().positive().optional(),
  targetHeight: z.number().positive().optional(),
});

export type DialogTurnClipVideoProps = z.infer<typeof DialogTurnClipVideoSchema>;

export const DialogTurnClipVideo: React.FC<DialogTurnClipVideoProps> = ({
  masterVideoUrl,
  startSec,
}) => {
  const { fps } = useVideoConfig();
  const startFrame = Math.max(0, Math.floor(Number(startSec || 0) * fps));
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {masterVideoUrl && (
        <Video
          src={masterVideoUrl}
          muted
          startFrom={startFrame}
          playbackRate={1}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </AbsoluteFill>
  );
};

export default DialogTurnClipVideo;
