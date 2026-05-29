/**
 * DialogStitchVideo — Lambda-side stitcher for the cinematic-sync dialog
 * pipeline. Replaces the forbidden Edge-Runtime ffmpeg call in
 * poll-dialog-shots.
 *
 * Composition:
 *   - Master plate video plays continuously underneath (muted).
 *   - For each speaker turn ("shot"), the Sync.so per-turn output is
 *     overlaid as an absolutely positioned <Video> trimmed to the turn
 *     window so only the lip-synced face replaces the master frame
 *     during that window.
 *   - Master WAV is the single canonical audio track.
 *
 * One re-encode generation everywhere (Lambda renders once).
 */
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  Video,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';

const ShotSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  /** Sync.so per-turn output (already lipsynced to this window). */
  outputUrl: z.string().url(),
  /** 'absolute' = output deckt komplette Master-Timeline ab (legacy
   *  segments_secs-Pfad) → mit startFrom=startFrame ausrichten.
   *  'relative' = output ist kurzer Preclip ab t=0 (v10 Artlist-Pipeline)
   *  → ohne startFrom direkt in das Fenster legen. */
  sourceTiming: z.enum(['absolute', 'relative']).optional(),
});


export const DialogStitchVideoSchema = z.object({
  masterVideoUrl: z.string().url(),
  masterAudioUrl: z.string().url(),
  totalSec: z.number().positive(),
  targetWidth: z.number().positive().optional(),
  targetHeight: z.number().positive().optional(),
  shots: z.array(ShotSchema),
});

export type DialogStitchVideoProps = z.infer<typeof DialogStitchVideoSchema>;

/** v11 Smoothness: 3-frame opacity crossfade on overlay edges so the cut
 *  between master plate and lipsynced overlay is invisible. */
const CROSSFADE_FRAMES = 3;
const ShotOverlay: React.FC<{
  src: string;
  segDuration: number;
  startFrom?: number;
}> = ({ src, segDuration, startFrom }) => {
  const frame = useCurrentFrame();
  const fadeIn = Math.min(CROSSFADE_FRAMES, Math.max(1, Math.floor(segDuration / 2)));
  const fadeOut = fadeIn;
  const opacity = interpolate(
    frame,
    [0, fadeIn, Math.max(fadeIn, segDuration - fadeOut), segDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return (
    <AbsoluteFill style={{ opacity }}>
      <Video
        src={src}
        muted
        playbackRate={1}
        {...(startFrom !== undefined ? { startFrom } : {})}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};

export const DialogStitchVideo: React.FC<DialogStitchVideoProps> = ({
  masterVideoUrl,
  masterAudioUrl,
  totalSec,
  shots,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const sortedShots = React.useMemo(
    () => [...(shots ?? [])].sort((a, b) => a.startSec - b.startSec),
    [shots],
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Master plate underneath — muted, native audio track ignored. */}
      <AbsoluteFill>
        {masterVideoUrl && (
          <Video
            src={masterVideoUrl}
            muted
            playbackRate={1}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </AbsoluteFill>

      {/* Per-turn Sync.so outputs overlay only their own window. The
          Sync.so output covers the FULL master timeline (Sync.so returns
          a length-matched MP4 even though only the selected segment was
          processed), so we just trim each overlay to the turn window. */}
      {sortedShots.map((shot, idx) => {
        const safeStartSec = Math.max(0, Math.min(totalSec, shot.startSec));
        const safeEndSec = Math.max(safeStartSec, Math.min(totalSec, shot.endSec));
        const startFrame = Math.max(0, Math.floor(safeStartSec * fps));
        const endFrame = Math.min(
          durationInFrames,
          Math.ceil(safeEndSec * fps),
        );
        const segDuration = Math.max(1, endFrame - startFrame);
        if (segDuration <= 0) return null;
        return (
          <Sequence
            key={`shot-${idx}-${startFrame}`}
            from={startFrame}
            durationInFrames={segDuration}
            layout="none"
          >
            <ShotOverlay
              src={shot.outputUrl}
              segDuration={segDuration}
              startFrom={shot.sourceTiming === 'relative' ? undefined : startFrame}
            />
          </Sequence>
        );
      })}

      {/* Single canonical audio track (merged master WAV). */}
      {masterAudioUrl && <Audio src={masterAudioUrl} />}


      {/* Suppress unused var warning for totalSec — used in calculateMetadata. */}
      {totalSec ? null : null}
    </AbsoluteFill>
  );
};

export default DialogStitchVideo;
