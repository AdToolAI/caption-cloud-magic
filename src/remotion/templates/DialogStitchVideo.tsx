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
  Img,
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
  /** v74: when true the overlay only fades IN at the start and then stays
   *  fully opaque until the Sequence ends — NO fade-out. Used together
   *  with shots that run all the way to totalSec on top of a static
   *  anchor master, so the lipsync face never visibly morphs back into
   *  the still anchor face at the segment boundary. */
  holdToEnd: z.boolean().optional(),
});


export const DialogStitchVideoSchema = z.object({
  masterVideoUrl: z.string().url(),
  /** v72: optional static anchor image used INSTEAD of masterVideoUrl
   *  when present. For multi-speaker dialog scenes the i2v plate can
   *  drift / cut away mid-scene; using the static anchor composition
   *  as background guarantees every speaker remains visible while the
   *  per-pass single-face preclips animate the lips on top. */
  masterImageUrl: z.string().url().optional().nullable(),
  masterAudioUrl: z.string().url(),
  totalSec: z.number().positive(),
  targetWidth: z.number().positive().optional(),
  targetHeight: z.number().positive().optional(),
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
  holdToEnd?: boolean;
}
const FullFrameOverlay: React.FC<FullFrameOverlayProps> = ({ src, segDuration, startFrom, holdToEnd }) => {
  const frame = useCurrentFrame();
  const fadeIn = Math.min(CROSSFADE_FRAMES, Math.max(1, Math.floor(segDuration / 2)));
  const fadeOut = holdToEnd ? 0 : fadeIn;
  const opacity = holdToEnd
    ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : interpolate(
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
  holdToEnd?: boolean;
}
const CroppedOverlay: React.FC<CroppedOverlayProps> = ({
  src,
  segDuration,
  left,
  top,
  size,
  holdToEnd,
}) => {
  const frame = useCurrentFrame();
  const fadeIn = Math.min(CROSSFADE_FRAMES, Math.max(1, Math.floor(segDuration / 2)));
  const fadeOut = holdToEnd ? 0 : fadeIn;
  const opacity = holdToEnd
    ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : interpolate(
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
  /** v38: when the Sync.so output is a full-length silence-padded render,
   *  we play it from its absolute frame (matching the window start) so the
   *  mouth animation lines up with the master plate timeline. */
  startFrom?: number;
  segDuration: number;
  holdToEnd?: boolean;
}
/** v25/v38: full-length Sync.so output shown only inside a soft circular
 *  mask around the target face — and only inside this speaker's voiced turn
 *  window(s) via the parent <Sequence>. */
const FaceMaskOverlay: React.FC<FaceMaskOverlayProps> = ({ src, cxPx, cyPx, radiusPx, startFrom, segDuration, holdToEnd }) => {
  const frame = useCurrentFrame();
  const fadeIn = Math.min(CROSSFADE_FRAMES, Math.max(1, Math.floor(segDuration / 2)));
  const fadeOut = holdToEnd ? 0 : fadeIn;
  const opacity = holdToEnd
    ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : interpolate(
        frame,
        [0, fadeIn, Math.max(fadeIn, segDuration - fadeOut), segDuration],
        [0, 1, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      );
  // Feathered radial mask: solid in the inner 70% of radius, fading to 0
  // at radius edge so the lipsynced face blends seamlessly into the base.
  const inner = Math.max(2, Math.round(radiusPx * 0.68));
  const outer = Math.max(inner + 8, Math.round(radiusPx));
  const mask = `radial-gradient(circle at ${cxPx}px ${cyPx}px, #000 0px, #000 ${inner}px, rgba(0,0,0,0.85) ${Math.round((inner + outer) / 2)}px, rgba(0,0,0,0) ${outer}px)`;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity,
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
        {...(startFrom !== undefined ? { startFrom } : {})}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};

export const DialogStitchVideo: React.FC<DialogStitchVideoProps> = ({
  masterVideoUrl,
  masterImageUrl,
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
  const sW = Number(srcWidth) > 0 ? Number(srcWidth) : (Number(targetWidth) > 0 ? Number(targetWidth) : compW);
  const sH = Number(srcHeight) > 0 ? Number(srcHeight) : (Number(targetHeight) > 0 ? Number(targetHeight) : compH);
  const scaleX = compW / sW;
  const scaleY = compH / sH;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Master plate underneath — static anchor image when provided
          (v72 multi-speaker mode), else original i2v video muted. */}
      <AbsoluteFill>
        {masterImageUrl ? (
          <Img
            src={masterImageUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : masterVideoUrl ? (
          <Video
            src={masterVideoUrl}
            muted
            playbackRate={1}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : null}
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

        // v25 fan-out face-mask path (highest priority): full Sync.so output
        // for this speaker, masked to a soft circle around their face. Spans
        // the full scene; multiple speakers stack as additive masked layers.
        const useFaceMask =
          !!shot.faceMask &&
          Number(shot.faceMask?.radius) > 0 &&
          Number.isFinite(Number(shot.faceMask?.cx)) &&
          Number.isFinite(Number(shot.faceMask?.cy));
        if (useFaceMask) {
          const fm = shot.faceMask!;
          const cxPx = Number(fm.cx) * scaleX;
          const cyPx = Number(fm.cy) * scaleY;
          // Radius uses the smaller axis scale so the mask never exceeds the
          // intended face region on either dimension.
          const radiusPx = Number(fm.radius) * Math.min(scaleX, scaleY);
          return (
            <Sequence
              key={`facemask-${idx}-${startFrame}`}
              from={startFrame}
              durationInFrames={segDuration}
              layout="none"
            >
              <FaceMaskOverlay
                src={shot.outputUrl}
                cxPx={cxPx}
                cyPx={cyPx}
                radiusPx={radiusPx}
                startFrom={shot.sourceTiming === 'relative' ? undefined : startFrame}
                segDuration={segDuration}
                holdToEnd={!!shot.holdToEnd}
              />
            </Sequence>
          );
        }

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
                holdToEnd={!!shot.holdToEnd}
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
