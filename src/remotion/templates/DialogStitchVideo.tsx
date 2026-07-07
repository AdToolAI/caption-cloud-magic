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
  Freeze,
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

const MouthMatteSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
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
  /** v90: when sourceTiming === 'relative' the Sync.so output is a single
   *  concatenated render of ALL this speaker's turns (tight WAV). To prevent
   *  turn 2 from replaying turn 1's lip animation, each shot starts the
   *  output video at its precomputed offset inside that concat. Defaults to
   *  0 (legacy single-turn behavior). Ignored when sourceTiming==='absolute'. */
  sourceStartSec: z.number().min(0).optional(),
  /** v21: when present the output is a square face-crop in source-master
   *  pixel space; overlay positioned/scaled to (x,y,size) with soft mask. */
  crop: CropSchema.optional().nullable(),
  /** v25 fan-out: when present the output is a FULL-frame Sync.so render
   *  with only this speaker's lips moving; composite via soft circular
   *  mask around (cx,cy) with feathered radius. Spans the full scene. */
  faceMask: FaceMaskSchema.optional().nullable(),
  /** v164/v183: bounding boxes of all OTHER speakers in this scene.
   *  v164 used <Freeze frame={0}> of the master plate → ghost/morph artefacts.
   *  v183 renders a static <Img src=anchorUrl> per slot (closed-mouth anchor
   *  portrait of the non-speaking character) → no motion, no morph. When
   *  anchorUrl is missing the slot falls back to a semi-opaque dark tile
   *  (still guarantees zero mouth motion). */
  silentSlots: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        size: z.number(),
        anchorUrl: z.string().optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
  /** v193: tiny plate-native freeze patches over non-speaking mouths only.
   *  Unlike v183/global slots this never uses avatar portraits and never
   *  covers a full face, so it suppresses raw plate mouth motion without
   *  resurrecting ghost faces. */
  mouthMattes: z.array(MouthMatteSchema).optional().nullable(),
  /** Legacy compatibility only. Normal multi-speaker muxes keep overlays
   *  windowed to speaker turns and do not use hold-to-end. */
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
  /** v182: for N=1 tight-overlay scenes, hold the final post-dialog frame
   *  through scene end so the raw AI plate cannot keep idly moving lips after
   *  the Sync.so speech window has ended. */
  tailFreezeFromSec: z.number().min(0).optional().nullable(),
  /** v190 (legacy): scene-wide static closed-mouth anchor tiles using
   *  brand_characters.portrait_url. Kept for rollback via
   *  system_config.composer.silent_faces_v183=true. Ignored when v195
   *  slots are present. */
  globalSilentSlots: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        size: z.number(),
        anchorUrl: z.string().optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
  /** v197: per-speaker silent-face freeze tiles. Each entry is a
   *  `preclip_crop` bbox in source-master pixel space plus true silent
   *  windows. The freeze tile is rendered only outside that speaker's voiced
   *  turns, restoring the v169 invariant that active speech has only one
   *  face layer: the Sync.so lipsync output. */
  silentFaceFreezes: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        size: z.number(),
        speakerIdx: z.number().optional().nullable(),
        windows: z
          .array(
            z.object({
              fromSec: z.number().min(0),
              toSec: z.number().min(0),
            }),
          )
          .optional()
          .nullable(),
      }),
    )
    .optional()
    .nullable(),
  shots: z.array(ShotSchema),
});

export type DialogStitchVideoProps = z.infer<typeof DialogStitchVideoSchema>;

/** v75: short overlay edge blend. Long face crossfades can read as morphing;
 *  3 frames hides hard cuts without visibly interpolating identities. */
const CROSSFADE_FRAMES = 3;

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
  startFrom?: number;
  /** Pixel rect in composition space (already mapped from source-master). */
  left: number;
  top: number;
  size: number;
  holdToEnd?: boolean;
}
const CroppedOverlay: React.FC<CroppedOverlayProps> = ({
  src,
  segDuration,
  startFrom,
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
  // v198: enlarged hard disc — edge falls in hair/background, not on skin,
  // where Sync.so output and live plate are effectively pixel-identical.
  // Kills the residual seam-morph left after v196.
  const mask = 'radial-gradient(circle at center, #000 0%, #000 62%, rgba(0,0,0,0) 63%)';
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
          {...(startFrom !== undefined ? { startFrom } : {})}
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
  // v198: enlarged hard disc (×1.6 radius) so the mask edge lands in hair/
  // background where Sync.so output and live plate match, not on cheek/jaw
  // skin where they differ slightly (residual seam-morph fix).
  const outer = Math.max(4, Math.round(radiusPx * 1.6));
  const inner = Math.max(2, outer - 1);
  const mask = `radial-gradient(circle at ${cxPx}px ${cyPx}px, #000 0px, #000 ${inner}px, rgba(0,0,0,0) ${outer}px)`;
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

/* v165 SilentFaceFreeze component removed in v192 — superseded by
 * SilentFaceAnchor (v183/v190) which uses a static <Img> instead of
 * <Freeze><Video>. Kept as a comment marker for log/history continuity. */



/** v183: SilentFaceAnchor — renders a static closed-mouth anchor portrait
 *  cropped to the non-speaking face slot. No <Video>, no <Freeze>, so no
 *  morph/ghost artefacts and near-zero Lambda render overhead. Feathered
 *  radial mask blends the seam with the live master plate underneath.
 *  Fallback: when anchorUrl is missing, render a semi-opaque dark tile that
 *  still guarantees zero mouth motion. */
interface SilentFaceAnchorProps {
  anchorUrl?: string | null;
  /** Slot rect on the source-master pixel grid (matches preclip_crop). */
  srcX: number;
  srcY: number;
  srcSize: number;
  /** Composition-space scale factors derived from src→comp mapping. */
  scaleX: number;
  scaleY: number;
}
const SilentFaceAnchor: React.FC<SilentFaceAnchorProps> = ({
  anchorUrl,
  srcX,
  srcY,
  srcSize,
  scaleX,
  scaleY,
}) => {
  // v196: hard face-disc mask (no feather blend zone).
  const mask =
    'radial-gradient(circle at center, #000 0%, #000 47%, rgba(0,0,0,0) 48%)';
  const left = srcX * scaleX;
  const top = srcY * scaleY;
  const w = srcSize * scaleX;
  const h = srcSize * scaleY;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: w,
          height: h,
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          overflow: 'hidden',
        }}
      >
        {anchorUrl ? (
          <Img
            src={anchorUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(12,12,14,0.92)',
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};

interface MouthMatteFreezeProps {
  src: string;
  srcX: number;
  srcY: number;
  srcWidth: number;
  srcHeight: number;
  scaleX: number;
  scaleY: number;
  compW: number;
  compH: number;
}

const MouthMatteFreeze: React.FC<MouthMatteFreezeProps> = ({
  src,
  srcX,
  srcY,
  srcWidth,
  srcHeight,
  scaleX,
  scaleY,
  compW,
  compH,
}) => {
  const left = srcX * scaleX;
  const top = srcY * scaleY;
  const w = srcWidth * scaleX;
  const h = srcHeight * scaleY;
  // v196: hard ellipse mask (no feather blend zone).
  const mask = 'radial-gradient(ellipse at center, #000 0%, #000 54%, rgba(0,0,0,0) 55%)';

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: w,
          height: h,
          overflow: 'hidden',
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      >
        <Freeze frame={0}>
          <Video
            src={src}
            muted
            playbackRate={1}
            style={{
              position: 'absolute',
              left: -left,
              top: -top,
              width: compW,
              height: compH,
              objectFit: 'cover',
            }}
          />
        </Freeze>
      </div>
    </AbsoluteFill>
  );
};

/**
 * v197 — SilentFaceFreeze. Renders `<Freeze frame={0}><Video/></Freeze>` of
 * the master plate positioned at a `preclip_crop` bbox. Parent Sequences
 * mount it only during true silent windows, never underneath active speech.
 */
interface SilentFaceFreezeProps {
  src: string;
  srcX: number;
  srcY: number;
  srcSize: number;
  scaleX: number;
  scaleY: number;
  compW: number;
  compH: number;
}
const SilentFaceFreeze: React.FC<SilentFaceFreezeProps> = ({
  src,
  srcX,
  srcY,
  srcSize,
  scaleX,
  scaleY,
  compW,
  compH,
}) => {
  const left = srcX * scaleX;
  const top = srcY * scaleY;
  const w = srcSize * scaleX;
  const h = srcSize * scaleY;
  // v196: hard face-disc mask (no feather blend zone).
  const mask =
    'radial-gradient(circle at center, #000 0%, #000 47%, rgba(0,0,0,0) 48%)';
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: w,
          height: h,
          overflow: 'hidden',
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      >
        <Freeze frame={0}>
          <Video
            src={src}
            muted
            playbackRate={1}
            style={{
              position: 'absolute',
              left: -left,
              top: -top,
              width: compW,
              height: compH,
              objectFit: 'cover',
            }}
          />
        </Freeze>
      </div>
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
  tailFreezeFromSec,
  globalSilentSlots,
  silentFaceFreezes,
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
  const tailStartFrame = Number.isFinite(Number(tailFreezeFromSec))
    ? Math.max(0, Math.min(durationInFrames, Math.round(Number(tailFreezeFromSec) * fps)))
    : null;
  const tailHoldDuration = tailStartFrame !== null
    ? Math.max(0, durationInFrames - tailStartFrame)
    : 0;

  // v192 — Ghost-avatar portrait overlays disabled. Schema field kept for
  // backward-compat with existing payloads.
  void globalSilentSlots;

  // v197 — per-speaker silent-face freeze tiles from `preclip_crop`, rendered
  // only in true silent windows. This avoids the v195 layer competition where
  // a full-scene freeze tile could remain visible below an active Sync.so
  // overlay if the bboxes did not perfectly match.
  const silentFaceFreezeEls: React.ReactNode[] = React.useMemo(() => {
    if (!masterVideoUrl || masterImageUrl) return [];
    const arr = Array.isArray(silentFaceFreezes) ? silentFaceFreezes : [];
    return arr
      .flatMap((slot, i) => {
        const sx = Number(slot?.x);
        const sy = Number(slot?.y);
        const ss = Number(slot?.size);
        if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(ss) || ss <= 0) {
          return [];
        }
        const windows = Array.isArray(slot?.windows) ? slot.windows : [];
        return windows
          .map((window, wIdx) => {
            const fromSec = Math.max(0, Math.min(totalSec, Number(window?.fromSec)));
            const toSec = Math.max(fromSec, Math.min(totalSec, Number(window?.toSec)));
            const from = Math.max(0, Math.floor(fromSec * fps));
            const to = Math.min(durationInFrames, Math.ceil(toSec * fps));
            const duration = Math.max(0, to - from);
            if (!Number.isFinite(from) || !Number.isFinite(duration) || duration <= 0) return null;
            return (
              <Sequence
                key={`silent-freeze-${i}-${wIdx}-${from}`}
                from={from}
                durationInFrames={duration}
                layout="none"
              >
                <SilentFaceFreeze
                  src={masterVideoUrl}
                  srcX={sx}
                  srcY={sy}
                  srcSize={ss}
                  scaleX={scaleX}
                  scaleY={scaleY}
                  compW={compW}
                  compH={compH}
                />
              </Sequence>
            );
          })
          .filter(Boolean);
      })
      .filter(Boolean);
  }, [silentFaceFreezes, masterVideoUrl, masterImageUrl, scaleX, scaleY, compW, compH, totalSec, fps, durationInFrames]);

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

      {/* v197 — per-speaker silent-face freeze tiles. Rendered above the
          live master plate only during true silent windows. */}
      {silentFaceFreezeEls.length > 0 ? silentFaceFreezeEls : null}




      {tailStartFrame !== null && tailHoldDuration > 0 && !masterImageUrl && masterVideoUrl ? (
        <Sequence
          from={tailStartFrame}
          durationInFrames={tailHoldDuration}
          layout="none"
        >
          <Freeze frame={0}>
            <Video
              src={masterVideoUrl}
              muted
              playbackRate={1}
              startFrom={Math.max(0, tailStartFrame - 1)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </Freeze>
        </Sequence>
      ) : null}

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
        // v90: per-turn offset into the Sync.so output for relative timing.
        const relativeStartFrame =
          shot.sourceTiming === 'relative'
            ? Math.max(0, Math.round(Number(shot.sourceStartSec ?? 0) * fps))
            : undefined;
        const startFromForRelative =
          shot.sourceTiming === 'relative' ? relativeStartFrame : startFrame;

        // v183 — Silent-face anchor tiles. When the muxer supplies
        // `silentSlots` per shot (each slot pointing at the closed-mouth
        // portrait of a non-speaking character), render them behind the
        // active overlay so the pristine plate's baked-in mouth motion for
        // listeners is masked with a static anchor image. No <Video>, no
        // <Freeze> → no morph/ghost artefacts. Feature-gated by the edge
        // function: if `silentSlots` is absent or empty we behave exactly
        // like v166 (plate plays through underneath, only active overlay).
        const rawSilentSlots = Array.isArray(shot.silentSlots) ? shot.silentSlots : [];
        const silentSlotEls: React.ReactNode[] = rawSilentSlots
          .map((slot, sIdx) => {
            const sx = Number(slot?.x);
            const sy = Number(slot?.y);
            const ss = Number(slot?.size);
            if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(ss) || ss <= 0) {
              return null;
            }
            return (
              <SilentFaceAnchor
                key={`silent-${idx}-${sIdx}`}
                anchorUrl={slot?.anchorUrl ?? null}
                srcX={sx}
                srcY={sy}
                srcSize={ss}
                scaleX={scaleX}
                scaleY={scaleY}
              />
            );
          })
          .filter(Boolean);
        const rawMouthMattes = Array.isArray(shot.mouthMattes) ? shot.mouthMattes : [];
        const mouthMatteEls: React.ReactNode[] = masterVideoUrl
          ? rawMouthMattes
              .map((slot, mIdx) => {
                const sx = Number(slot?.x);
                const sy = Number(slot?.y);
                const sw = Number(slot?.width);
                const sh = Number(slot?.height);
                if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sw) || !Number.isFinite(sh) || sw <= 0 || sh <= 0) {
                  return null;
                }
                return (
                  <MouthMatteFreeze
                    key={`mouth-matte-${idx}-${mIdx}`}
                    src={masterVideoUrl}
                    srcX={sx}
                    srcY={sy}
                    srcWidth={sw}
                    srcHeight={sh}
                    scaleX={scaleX}
                    scaleY={scaleY}
                    compW={compW}
                    compH={compH}
                  />
                );
              })
              .filter(Boolean)
          : [];
        

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
              {silentSlotEls}
              {mouthMatteEls}
              <FaceMaskOverlay
                src={shot.outputUrl}
                cxPx={cxPx}
                cyPx={cyPx}
                radiusPx={radiusPx}
                startFrom={startFromForRelative}
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
              {silentSlotEls}
              {mouthMatteEls}
              <CroppedOverlay
                src={shot.outputUrl}
                segDuration={segDuration}
                startFrom={startFromForRelative}
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
            {silentSlotEls}
            {mouthMatteEls}
            <FullFrameOverlay
              src={shot.outputUrl}
              segDuration={segDuration}
              startFrom={startFromForRelative}
              holdToEnd={!!shot.holdToEnd}
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
