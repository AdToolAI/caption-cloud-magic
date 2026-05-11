import type { PresetCategory } from '@/lib/motion-studio/directorPresets';

import camStatic from '@/assets/studio-presets/modifier/camera/cam-static.jpg';
import camDollyIn from '@/assets/studio-presets/modifier/camera/cam-dolly-in.jpg';
import camTracking from '@/assets/studio-presets/modifier/camera/cam-tracking.jpg';
import camHandheld from '@/assets/studio-presets/modifier/camera/cam-handheld.jpg';
import camCrane from '@/assets/studio-presets/modifier/camera/cam-crane.jpg';
import camOrbit from '@/assets/studio-presets/modifier/camera/cam-orbit.jpg';
import camFpv from '@/assets/studio-presets/modifier/camera/cam-fpv.jpg';

import lensAnamorphic from '@/assets/studio-presets/modifier/lens/lens-anamorphic.jpg';
import lensWide24 from '@/assets/studio-presets/modifier/lens/lens-wide-24.jpg';
import lensPortrait85 from '@/assets/studio-presets/modifier/lens/lens-portrait-85.jpg';
import lensMacro from '@/assets/studio-presets/modifier/lens/lens-macro.jpg';
import lensTiltShift from '@/assets/studio-presets/modifier/lens/lens-tilt-shift.jpg';

import lightGolden from '@/assets/studio-presets/modifier/lighting/light-golden.jpg';
import lightBlueHour from '@/assets/studio-presets/modifier/lighting/light-blue-hour.jpg';
import lightNoir from '@/assets/studio-presets/modifier/lighting/light-noir.jpg';
import lightSoftbox from '@/assets/studio-presets/modifier/lighting/light-softbox.jpg';
import lightNeon from '@/assets/studio-presets/modifier/lighting/light-neon.jpg';
import lightNatural from '@/assets/studio-presets/modifier/lighting/light-natural.jpg';
import lightVolumetric from '@/assets/studio-presets/modifier/lighting/light-volumetric.jpg';

import moodBlockbuster from '@/assets/studio-presets/modifier/mood/mood-blockbuster.jpg';
import moodPastel from '@/assets/studio-presets/modifier/mood/mood-pastel.jpg';
import moodBw from '@/assets/studio-presets/modifier/mood/mood-bw.jpg';
import moodVibrant from '@/assets/studio-presets/modifier/mood/mood-vibrant.jpg';
import moodMoodyDark from '@/assets/studio-presets/modifier/mood/mood-moody-dark.jpg';

import stockKodak from '@/assets/studio-presets/modifier/film-stock/stock-kodak.jpg';
import stockSuper8 from '@/assets/studio-presets/modifier/film-stock/stock-super8.jpg';
import stockArri from '@/assets/studio-presets/modifier/film-stock/stock-arri.jpg';
import stockRed from '@/assets/studio-presets/modifier/film-stock/stock-red.jpg';
import stockVhs from '@/assets/studio-presets/modifier/film-stock/stock-vhs.jpg';

const THUMBS: Record<PresetCategory, Record<string, string>> = {
  camera: {
    'cam-static': camStatic,
    'cam-dolly-in': camDollyIn,
    'cam-tracking': camTracking,
    'cam-handheld': camHandheld,
    'cam-crane': camCrane,
    'cam-orbit': camOrbit,
    'cam-fpv': camFpv,
  },
  lens: {
    'lens-anamorphic': lensAnamorphic,
    'lens-wide-24': lensWide24,
    'lens-portrait-85': lensPortrait85,
    'lens-macro': lensMacro,
    'lens-tilt-shift': lensTiltShift,
  },
  lighting: {
    'light-golden': lightGolden,
    'light-blue-hour': lightBlueHour,
    'light-noir': lightNoir,
    'light-softbox': lightSoftbox,
    'light-neon': lightNeon,
    'light-natural': lightNatural,
    'light-volumetric': lightVolumetric,
  },
  mood: {
    'mood-blockbuster': moodBlockbuster,
    'mood-pastel': moodPastel,
    'mood-bw': moodBw,
    'mood-vibrant': moodVibrant,
    'mood-moody-dark': moodMoodyDark,
  },
  'film-stock': {
    'stock-kodak': stockKodak,
    'stock-super8': stockSuper8,
    'stock-arri': stockArri,
    'stock-red': stockRed,
    'stock-vhs': stockVhs,
  },
};

export function getModifierThumbnail(category: PresetCategory, presetId: string | undefined): string | undefined {
  if (!presetId) return undefined;
  return THUMBS[category]?.[presetId];
}
