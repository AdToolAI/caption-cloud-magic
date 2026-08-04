import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { TextOverlay } from '@/types/directors-cut';
import { OverlayGraphic } from './OverlayGraphic';

/**
 * Remotion-Adapter für die Overlay-Ebene (v407).
 * Rechnet Frames in Sekunden um und übergibt an den geteilten
 * `OverlayGraphic`, den auch die Studio-Vorschau benutzt.
 */
export const OverlayElementRenderer: React.FC<{ overlay: TextOverlay }> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const t = frame / fps;
  const duration =
    overlay.endTime != null ? Math.max(0.1, overlay.endTime - overlay.startTime) : Number.POSITIVE_INFINITY;

  return <OverlayGraphic overlay={overlay} t={t} duration={duration} canvasWidth={width} />;
};

/** Convenience-Wrapper, falls Overlays außerhalb einer Sequence gerendert werden. */
export const OverlayElementSequence: React.FC<{ overlay: TextOverlay; from: number; durationInFrames: number }> = ({
  overlay,
  from,
  durationInFrames,
}) => (
  <Sequence from={from} durationInFrames={durationInFrames} layout="none">
    <OverlayElementRenderer overlay={overlay} />
  </Sequence>
);
