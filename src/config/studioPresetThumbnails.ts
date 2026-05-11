/**
 * Studio Preset Thumbnails — central asset map.
 *
 * Each Shot Director option + Cinematic Style preset has a corresponding
 * AI-generated reference image under `src/assets/studio-presets/`.
 * Looked up by `getPresetThumbnail(category, id)`.
 *
 * Keeps shotDirector.ts / cinematicStylePresets.ts free of import noise.
 */

import type { ShotCategory } from './shotDirector';

// Lighting (10)
import lightingGoldenHour from '@/assets/studio-presets/lighting/golden-hour.jpg';
import lightingBlueHour from '@/assets/studio-presets/lighting/blue-hour.jpg';
import lightingHardNoir from '@/assets/studio-presets/lighting/hard-noir.jpg';
import lightingSoftStudio from '@/assets/studio-presets/lighting/soft-studio.jpg';
import lightingNeonCyberpunk from '@/assets/studio-presets/lighting/neon-cyberpunk.jpg';
import lightingCandlelight from '@/assets/studio-presets/lighting/candlelight.jpg';
import lightingOvercast from '@/assets/studio-presets/lighting/overcast-natural.jpg';
import lightingBacklit from '@/assets/studio-presets/lighting/backlit.jpg';
import lightingVolumetric from '@/assets/studio-presets/lighting/volumetric.jpg';
import lightingMoonlit from '@/assets/studio-presets/lighting/moonlit.jpg';

// Framing (8)
import framingExtremeWide from '@/assets/studio-presets/framing/extreme-wide.jpg';
import framingWide from '@/assets/studio-presets/framing/wide.jpg';
import framingMedium from '@/assets/studio-presets/framing/medium.jpg';
import framingMediumClose from '@/assets/studio-presets/framing/medium-close.jpg';
import framingCloseUp from '@/assets/studio-presets/framing/close-up.jpg';
import framingExtremeClose from '@/assets/studio-presets/framing/extreme-close.jpg';
import framingTwoShot from '@/assets/studio-presets/framing/two-shot.jpg';
import framingEstablishing from '@/assets/studio-presets/framing/establishing.jpg';

// Angle (8)
import angleEyeLevel from '@/assets/studio-presets/angle/eye-level.jpg';
import angleLow from '@/assets/studio-presets/angle/low-angle.jpg';
import angleHigh from '@/assets/studio-presets/angle/high-angle.jpg';
import angleDutch from '@/assets/studio-presets/angle/dutch-tilt.jpg';
import angleBirds from '@/assets/studio-presets/angle/birds-eye.jpg';
import angleWorms from '@/assets/studio-presets/angle/worms-eye.jpg';
import angleOverShoulder from '@/assets/studio-presets/angle/over-shoulder.jpg';
import anglePov from '@/assets/studio-presets/angle/pov.jpg';

// Movement (10)
import movementStatic from '@/assets/studio-presets/movement/static.jpg';
import movementPushIn from '@/assets/studio-presets/movement/push-in.jpg';
import movementPullOut from '@/assets/studio-presets/movement/pull-out.jpg';
import movementDollyLeft from '@/assets/studio-presets/movement/dolly-left.jpg';
import movementDollyRight from '@/assets/studio-presets/movement/dolly-right.jpg';
import movementCraneUp from '@/assets/studio-presets/movement/crane-up.jpg';
import movementCraneDown from '@/assets/studio-presets/movement/crane-down.jpg';
import movementOrbitLeft from '@/assets/studio-presets/movement/orbit-left.jpg';
import movementOrbitRight from '@/assets/studio-presets/movement/orbit-right.jpg';
import movementHandheld from '@/assets/studio-presets/movement/handheld.jpg';

// Camera Bodies (6)
import cameraArri from '@/assets/studio-presets/camera/arri-alexa-35.jpg';
import cameraRed from '@/assets/studio-presets/camera/red-v-raptor.jpg';
import cameraSony from '@/assets/studio-presets/camera/sony-venice-2.jpg';
import cameraPanavision from '@/assets/studio-presets/camera/panavision-xl2.jpg';
import cameraIphone from '@/assets/studio-presets/camera/iphone-17-pro-max.jpg';
import cameraVhs from '@/assets/studio-presets/camera/vhs-camcorder.jpg';

// Lenses (7)
import lensArri from '@/assets/studio-presets/lens/arri-signature-prime.jpg';
import lensLeica from '@/assets/studio-presets/lens/leica-summilux-c.jpg';
import lensCooke from '@/assets/studio-presets/lens/cooke-s4i.jpg';
import lensHelios from '@/assets/studio-presets/lens/helios-44-2.jpg';
import lensLomo from '@/assets/studio-presets/lens/lomo-anamorphic.jpg';
import lensAngenieux from '@/assets/studio-presets/lens/angenieux-optimo.jpg';
import lensSigma from '@/assets/studio-presets/lens/sigma-cine-art.jpg';

// Cinematic Style Presets (12)
import cinematicSymmetric from '@/assets/studio-presets/cinematic/symmetric-storybook.jpg';
import cinematicAction from '@/assets/studio-presets/cinematic/high-octane-action.jpg';
import cinematicArthouse from '@/assets/studio-presets/cinematic/slow-burn-arthouse.jpg';
import cinematicNoir from '@/assets/studio-presets/cinematic/noir-detective.jpg';
import cinematicCyberpunk from '@/assets/studio-presets/cinematic/cyberpunk-neon.jpg';
import cinematicFantasy from '@/assets/studio-presets/cinematic/epic-fantasy.jpg';
import cinematicDoc from '@/assets/studio-presets/cinematic/documentary-realism.jpg';
import cinematicRomantic from '@/assets/studio-presets/cinematic/romantic-dreamy.jpg';
import cinematicThriller from '@/assets/studio-presets/cinematic/thriller-suspense.jpg';
import cinematicSciFi from '@/assets/studio-presets/cinematic/sci-fi-mystery.jpg';
import cinematicHorror from '@/assets/studio-presets/cinematic/horror-dread.jpg';
import cinematicMidnight from '@/assets/studio-presets/cinematic/midnight-mood.jpg';

// Cinematic Style Presets — Comparable variants (Stage 12).
// Same locked base scene (`_bases/style.jpg`) re-styled into each look,
// so users can compare all 12 director looks on the same subject.
import cinematicSymmetricCmp from '@/assets/studio-presets/cinematic/symmetric-storybook--compare.jpg';
import cinematicActionCmp from '@/assets/studio-presets/cinematic/high-octane-action--compare.jpg';
import cinematicArthouseCmp from '@/assets/studio-presets/cinematic/slow-burn-arthouse--compare.jpg';
import cinematicNoirCmp from '@/assets/studio-presets/cinematic/noir-detective--compare.jpg';
import cinematicCyberpunkCmp from '@/assets/studio-presets/cinematic/cyberpunk-neon--compare.jpg';
import cinematicFantasyCmp from '@/assets/studio-presets/cinematic/epic-fantasy--compare.jpg';
import cinematicDocCmp from '@/assets/studio-presets/cinematic/documentary-realism--compare.jpg';
import cinematicRomanticCmp from '@/assets/studio-presets/cinematic/romantic-dreamy--compare.jpg';
import cinematicThrillerCmp from '@/assets/studio-presets/cinematic/thriller-suspense--compare.jpg';
import cinematicSciFiCmp from '@/assets/studio-presets/cinematic/sci-fi-mystery--compare.jpg';
import cinematicHorrorCmp from '@/assets/studio-presets/cinematic/horror-dread--compare.jpg';
import cinematicMidnightCmp from '@/assets/studio-presets/cinematic/midnight-mood--compare.jpg';

const SHOT_THUMBS: Record<ShotCategory, Record<string, string>> = {
  lighting: {
    'golden-hour': lightingGoldenHour,
    'blue-hour': lightingBlueHour,
    'hard-noir': lightingHardNoir,
    'soft-studio': lightingSoftStudio,
    'neon-cyberpunk': lightingNeonCyberpunk,
    candlelight: lightingCandlelight,
    'overcast-natural': lightingOvercast,
    backlit: lightingBacklit,
    volumetric: lightingVolumetric,
    moonlit: lightingMoonlit,
  },
  framing: {
    'extreme-wide': framingExtremeWide,
    wide: framingWide,
    medium: framingMedium,
    'medium-close': framingMediumClose,
    'close-up': framingCloseUp,
    'extreme-close': framingExtremeClose,
    'two-shot': framingTwoShot,
    establishing: framingEstablishing,
  },
  angle: {
    'eye-level': angleEyeLevel,
    'low-angle': angleLow,
    'high-angle': angleHigh,
    'dutch-tilt': angleDutch,
    'birds-eye': angleBirds,
    'worms-eye': angleWorms,
    'over-shoulder': angleOverShoulder,
    pov: anglePov,
  },
  movement: {
    static: movementStatic,
    'push-in': movementPushIn,
    'pull-out': movementPullOut,
    'dolly-left': movementDollyLeft,
    'dolly-right': movementDollyRight,
    'crane-up': movementCraneUp,
    'crane-down': movementCraneDown,
    'orbit-left': movementOrbitLeft,
    'orbit-right': movementOrbitRight,
    handheld: movementHandheld,
  },
  camera: {
    'arri-alexa-35': cameraArri,
    'red-v-raptor': cameraRed,
    'sony-venice-2': cameraSony,
    'panavision-xl2': cameraPanavision,
    'iphone-17-pro-max': cameraIphone,
    'vhs-camcorder': cameraVhs,
  },
  lens: {
    'arri-signature-prime': lensArri,
    'leica-summilux-c': lensLeica,
    'cooke-s4i': lensCooke,
    'helios-44-2': lensHelios,
    'lomo-anamorphic': lensLomo,
    'angenieux-optimo': lensAngenieux,
    'sigma-cine-art': lensSigma,
  },
};

const CINEMATIC_THUMBS: Record<string, string> = {
  'symmetric-storybook': cinematicSymmetric,
  'high-octane-action': cinematicAction,
  'slow-burn-arthouse': cinematicArthouse,
  'noir-detective': cinematicNoir,
  'cyberpunk-neon': cinematicCyberpunk,
  'epic-fantasy': cinematicFantasy,
  'documentary-realism': cinematicDoc,
  'romantic-dreamy': cinematicRomantic,
  'thriller-suspense': cinematicThriller,
  'sci-fi-mystery': cinematicSciFi,
  'horror-dread': cinematicHorror,
  'midnight-mood': cinematicMidnight,
};

const CINEMATIC_COMPARE_THUMBS: Record<string, string> = {
  'symmetric-storybook': cinematicSymmetricCmp,
  'high-octane-action': cinematicActionCmp,
  'slow-burn-arthouse': cinematicArthouseCmp,
  'noir-detective': cinematicNoirCmp,
  'cyberpunk-neon': cinematicCyberpunkCmp,
  'epic-fantasy': cinematicFantasyCmp,
  'documentary-realism': cinematicDocCmp,
  'romantic-dreamy': cinematicRomanticCmp,
  'thriller-suspense': cinematicThrillerCmp,
  'sci-fi-mystery': cinematicSciFiCmp,
  'horror-dread': cinematicHorrorCmp,
  'midnight-mood': cinematicMidnightCmp,
};

export function getPresetThumbnail(category: ShotCategory, id: string | undefined): string | undefined {
  if (!id) return undefined;
  return SHOT_THUMBS[category]?.[id];
}

export function getCinematicPresetThumbnail(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return CINEMATIC_THUMBS[id];
}

/**
 * Stage 12 — Comparable variant of each Cinematic Style Preset.
 * Same locked base scene with the preset applied, so users can compare
 * all 12 looks on the same subject.
 */
export function getCinematicPresetCompareThumbnail(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return CINEMATIC_COMPARE_THUMBS[id];
}
