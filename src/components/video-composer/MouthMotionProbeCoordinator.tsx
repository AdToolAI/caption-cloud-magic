import type { ComposerScene } from '@/types/video-composer';
import { useMouthYavgProbe } from '@/hooks/useMouthYavgProbe';

function SceneMouthMotionProbe({ scene }: { scene: ComposerScene }) {
  useMouthYavgProbe(scene);
  return null;
}

/**
 * Keeps the post-provider mouth-motion quality gate alive regardless of which
 * composer tab or scene card is currently mounted.
 */
export function MouthMotionProbeCoordinator({ scenes }: { scenes: ComposerScene[] }) {
  return (
    <>
      {scenes.map((scene) => (
        <SceneMouthMotionProbe key={scene.id} scene={scene} />
      ))}
    </>
  );
}