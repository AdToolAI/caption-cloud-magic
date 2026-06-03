/**
 * DialogStitchVideo — Lambda-side stitcher for the cinematic-sync dialog
 * pipeline.
 *
 * v9: Master plate plays underneath muted; per-turn Sync.so outputs
 *     overlay only their window. Full-frame overlays (`absolute` timing
 *     for legacy `segments_secs` outputs, full crossfade).
 *
 * v21 (June 2026): Per-turn outputs can now be **face-region crops**
 *     when the upstream `DialogTurnFaceCropVideo` produced a single-face
 *     preclip (3+ speaker scenes). In that case the lipsynced output is
 *     a square crop in `cropSize × cropSize` pixels of the source-master
 *     space — we composite it back at its original `(cropX, cropY,
 *     cropSize)` region with a soft circular mask so the cropped edges
 *     blend into the master plate.
 *
 *     When `crop` is absent the v9 full-frame overlay path is preserved
 *     unchanged (1/2 speaker scenes & legacy entries).
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

const CropSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  size: z.number().positive(),
});

/** v25 (Fan-Out): masked full-frame overlay. The Sync.so output covers the
 *  whole plate (only THIS speaker's lips moving on the original scene); we
 *  composite it on top of the master plate but ONLY through a feathered
 *  circular hole around the speaker's face. All N speaker passes are
 *  layered this way → every face animates correctly without the chained
 *  Sync.so-on-Sync.so artifact. cx/cy/radius are in source-master pixels. */
const FaceMaskSchema = z.object({
  cx: z.number(),
  cy: z.number(),
  radius: z.number().positive(),
});

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
  /** v21: when present the output is a square face-crop in source-master
   *  pixel space; overlay positioned/scaled to (x,y,size) with soft mask. */
  crop: CropSchema.optional().nullable(),
  /** v25 fan-out: when present the output is a FULL-frame Sync.so render
   *  with only this speaker's lips moving; composite via soft circular
   *  mask around (cx,cy) with feathered radius. Spans the full scene. */
  faceMask: FaceMaskSchema.optional().nullable(),
});


export const DialogStitchVideoSchema = z.object({
  masterVideoUrl: z.string().url(),
  masterAudioUrl: z.string().url(),
  totalSec: z.number().positive(),
  targetWidth: z.number().positive().optional(),
  targetHeight: z.number().positive().optional(),
  /** v21: source-master dims used to map per-shot crop into composition
   *  pixels. Defaults to targetWidth/Height when omitted. */
  srcWidth: z.number().positive().optional(),
  srcHeight: z.number().positive().optional(),
  shots: z.array(ShotSchema),
});

export type DialogStitchVideoProps = z.infer<typeof DialogStitchVideoSchema>;

/** v20 Smoothness: 6-frame opacity crossfade on overlay edges so the cut
 *  between master plate and lipsynced overlay (and between consecutive
 *  speaker overlays) is invisible. Previously 3 frames produced a hard
 *  visible pop at the Samuel→Matthew boundary. */
const CROSSFADE_FRAMES = 6;

interface FullFrameOverlayProps {
  src: string;
  segDuration: number;
  startFrom?: number;
}
const FullFrameOverlay: React.FC<FullFrameOverlayProps> = ({ src, segDuration, startFrom }) => {
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

interface CroppedOverlayProps {
  src: string;
  segDuration: number;
  /** Pixel rect in composition space (already mapped from source-master). */
  left: number;
  top: number;
  size: number;
}
const CroppedOverlay: React.FC<CroppedOverlayProps> = ({
  src,
  segDuration,
  left,
  top,
  size,
}) => {
  const frame = useCurrentFrame();
  const fadeIn = Math.min(CROSSFADE_FRAMES, Math.max(1, Math.floor(segDuration / 2)));
  const fadeOut = fadeIn;
  const opacity = interpolate(
    frame,
    [0, fadeIn, Math.max(fadeIn, segDuration - fadeOut), segDuration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  // Soft circular mask — fully opaque in the center, feathered to fully
  // transparent at the edge so the cropped face blends into the master
  // plate underneath without a visible square seam.
  const mask = 'radial-gradient(circle at center, #000 0%, #000 55%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,0) 95%)';
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: size,
          height: size,
          opacity,
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          overflow: 'hidden',
        }}
      >
        <Video
          src={src}
          muted
          playbackRate={1}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    </AbsoluteFill>
  );
};

interface FaceMaskOverlayProps {
  src: string;
  /** Source-master pixel coords / radius mapped into composition space. */
  cxPx: number;
  cyPx: number;
  radiusPx: number;
}
/** v25: full-frame Sync.so output, shown only inside a soft circular mask
 *  around the target face. Plays for the entire scene (no time window). */
const FaceMaskOverlay: React.FC<FaceMaskOverlayProps> = ({ src, cxPx, cyPx, radiusPx }) => {
  // Feathered radial mask: solid in the inner 70% of radius, fading to 0
  // at radius edge so the lipsynced face blends seamlessly into the base.
  const inner = Math.max(2, Math.round(radiusPx * 0.68));
  const outer = Math.max(inner + 8, Math.round(radiusPx));
  const mask = `radial-gradient(circle at ${cxPx}px ${cyPx}px, #000 0px, #000 ${inner}px, rgba(0,0,0,0.85) ${Math.round((inner + outer) / 2)}px, rgba(0,0,0,0) ${outer}px)`;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
      }}
    >
      <Video
        src={src}
        muted
        playbackRate={1}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};

export const DialogStitchVideo: React.FC<DialogStitchVideoProps> = ({
  masterVideoUrl,
  masterAudioUrl,
  totalSec,
  targetWidth,
  targetHeight,
  srcWidth,
  srcHeight,
  shots,
}) => {
  const { fps, durationInFrames, width: compW, height: compH } = useVideoConfig();
  const sortedShots = React.useMemo(
    () => [...(shots ?? [])].sort((a, b) => a.startSec - b.startSec),
    [shots],
  );
  // Source-master pixel space — fall back to comp dims if not provided.
  const sW = Number(srcWidth) > 0 ? Number(srcWidth) : (Number(targetWidth) > 0 ? Number(targetWidth) : compW);
  const sH = Number(srcHeight) > 0 ? Number(srcHeight) : (Number(targetHeight) > 0 ? Number(targetHeight) : compH);
  const scaleX = compW / sW;
  const scaleY = compH / sH;

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

      {/* Per-turn Sync.so outputs overlay only their own window. */}
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

        const useCrop = !!shot.crop && Number(shot.crop?.size) > 0;
        if (useCrop) {
          const crop = shot.crop!;
          // Map source-master pixel rect → composition pixel rect.
          const left = crop.x * scaleX;
          const top = crop.y * scaleY;
          // Use uniform scale (avoids stretching the face); pick max scale
          // so output covers original face region without gaps. Visual mask
          // edge feathers the slight excess on the off-axis.
          const overlayScale = Math.max(scaleX, scaleY);
          const size = crop.size * overlayScale;
          return (
            <Sequence
              key={`shot-${idx}-${startFrame}`}
              from={startFrame}
              durationInFrames={segDuration}
              layout="none"
            >
              <CroppedOverlay
                src={shot.outputUrl}
                segDuration={segDuration}
                left={left}
                top={top}
                size={size}
              />
            </Sequence>
          );
        }

        return (
          <Sequence
            key={`shot-${idx}-${startFrame}`}
            from={startFrame}
            durationInFrames={segDuration}
            layout="none"
          >
            <FullFrameOverlay
              src={shot.outputUrl}
              segDuration={segDuration}
              startFrom={shot.sourceTiming === 'relative' ? undefined : startFrame}
            />
          </Sequence>
        );
      })}

      {/* Single canonical audio track (merged master WAV). */}
      {masterAudioUrl && <Audio src={masterAudioUrl} />}

      {totalSec ? null : null}
    </AbsoluteFill>
  );
};

export default DialogStitchVideo;
