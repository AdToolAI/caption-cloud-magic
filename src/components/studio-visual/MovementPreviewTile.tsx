/**
 * MovementPreviewTile — animated mini-loop for Shot Director "movement" axis.
 *
 * Renders the locked base scene with a CSS-keyframe transform per option
 * (push-in, orbit-left, handheld, …). Loop is gated by `play` (hover or
 * active), matching the Animated Studio Preset Tiles rule.
 *
 * Defined keyframes live in `motionTiles.css`.
 */

import './motionTiles.css';

const ID_TO_CLASS: Record<string, string> = {
  'static': 'mv-static',
  'push-in': 'mv-pushIn',
  'pull-out': 'mv-pullOut',
  'dolly-left': 'mv-dollyLeft',
  'dolly-right': 'mv-dollyRight',
  'crane-up': 'mv-craneUp',
  'crane-down': 'mv-craneDown',
  'orbit-left': 'mv-orbitLeft',
  'orbit-right': 'mv-orbitRight',
  'handheld': 'mv-handheld',
};

interface Props {
  imageSrc: string;
  optionId: string;
  alt: string;
  play: boolean;
}

export function MovementPreviewTile({ imageSrc, optionId, alt, play }: Props) {
  const cls = ID_TO_CLASS[optionId] ?? 'mv-static';
  return (
    <div
      className={`mv-stage absolute inset-0 overflow-hidden ${cls}`}
      data-play={play ? 'true' : 'false'}
    >
      <img
        src={imageSrc}
        alt={alt}
        loading="lazy"
        width={512}
        height={512}
        className="absolute inset-0 w-full h-full object-cover"
      />
    </div>
  );
}
