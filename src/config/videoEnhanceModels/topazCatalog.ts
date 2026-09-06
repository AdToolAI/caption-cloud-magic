/**
 * Client mirror of `supabase/functions/_shared/topaz-video-catalog.ts`.
 *
 * The server file is the authority — this file only adds the localized labels
 * the UI needs. `src/test/videoEnhanceTopazCatalog.test.ts` asserts both sides
 * list the same model ids, slugs, credit families and fixed upscale factors.
 */
import type { LocalizedText } from './types';

export type TopazSpecialty =
  | 'general'
  | 'natural'
  | 'detail'
  | 'faces'
  | 'cgi'
  | 'denoise'
  | 'deblur'
  | 'legacy';

export type TopazCreditFamily = 'precision' | 'restoration';

export interface TopazVideoModelView {
  id: string;
  slug: string;
  name: string;
  specialty: TopazSpecialty;
  creditFamily: TopazCreditFamily;
  manualParameters: boolean;
  fixedUpscale?: number;
  costVerified: boolean;
  label: LocalizedText;
  hint: LocalizedText;
}

export const TOPAZ_VIDEO_MODEL_VIEWS: TopazVideoModelView[] = [
  {
    id: 'proteus',
    slug: 'prob-4',
    name: 'Proteus',
    specialty: 'general',
    creditFamily: 'precision',
    manualParameters: true,
    costVerified: true,
    label: { en: 'Proteus', de: 'Proteus', es: 'Proteus' },
    hint: {
      en: 'The all-rounder for camera footage — recommended when in doubt',
      de: 'Der Allrounder für Kameramaterial – im Zweifel die richtige Wahl',
      es: 'El todoterreno para material de cámara: la opción segura',
    },
  },
  {
    id: 'proteus-natural',
    slug: 'pnat-1',
    name: 'Proteus Natural',
    specialty: 'natural',
    creditFamily: 'precision',
    manualParameters: false,
    fixedUpscale: 2,
    costVerified: false,
    label: { en: 'Proteus Natural', de: 'Proteus Natural', es: 'Proteus Natural' },
    hint: {
      en: 'Softer, film-like result. Doubles the size only',
      de: 'Weicheres, filmisches Ergebnis. Verdoppelt die Größe',
      es: 'Resultado más suave y cinematográfico. Solo duplica el tamaño',
    },
  },
  {
    id: 'rhea',
    slug: 'rhea-1',
    name: 'Rhea',
    specialty: 'detail',
    creditFamily: 'precision',
    manualParameters: true,
    fixedUpscale: 4,
    costVerified: false,
    label: { en: 'Rhea', de: 'Rhea', es: 'Rhea' },
    hint: {
      en: 'Maximum detail from small sources. Quadruples the size only',
      de: 'Maximale Details aus kleinen Quellen. Vervierfacht die Größe',
      es: 'Máximo detalle desde fuentes pequeñas. Solo cuadruplica el tamaño',
    },
  },
  {
    id: 'theia',
    slug: 'thd-3',
    name: 'Theia',
    specialty: 'clarity',
    creditFamily: 'precision',
    manualParameters: true,
    costVerified: false,
    label: { en: 'Theia', de: 'Theia', es: 'Theia' },
    hint: {
      en: 'Extra clarity and crisp edges, without adding noise',
      de: 'Mehr Klarheit und klare Kanten, ohne neues Rauschen',
      es: 'Más claridad y bordes nítidos, sin añadir ruido',
    },
  },
  {
    id: 'iris',
    slug: 'iris-3',
    name: 'Iris',
    specialty: 'faces',
    creditFamily: 'precision',
    manualParameters: false,
    costVerified: false,
    label: { en: 'Iris', de: 'Iris', es: 'Iris' },
    hint: {
      en: 'People and faces in the picture',
      de: 'Menschen und Gesichter im Bild',
      es: 'Personas y rostros en la imagen',
    },
  },
  {
    id: 'artemis',
    slug: 'ahq-12',
    name: 'Artemis',
    specialty: 'general',
    creditFamily: 'precision',
    manualParameters: false,
    costVerified: false,
    label: { en: 'Artemis', de: 'Artemis', es: 'Artemis' },
    hint: {
      en: 'Heavily compressed clips from social platforms',
      de: 'Stark komprimierte Clips von Social-Plattformen',
      es: 'Clips muy comprimidos de redes sociales',
    },
  },
  {
    id: 'gaia',
    slug: 'ghq-5',
    name: 'Gaia',
    specialty: 'cgi',
    creditFamily: 'precision',
    manualParameters: false,
    costVerified: false,
    label: { en: 'Gaia', de: 'Gaia', es: 'Gaia' },
    hint: {
      en: 'Animation, 3D and rendered graphics',
      de: 'Animation, 3D und gerenderte Grafiken',
      es: 'Animación, 3D y gráficos renderizados',
    },
  },
  {
    id: 'nyx',
    slug: 'nyx-3',
    name: 'Nyx',
    specialty: 'denoise',
    creditFamily: 'restoration',
    manualParameters: true,
    costVerified: false,
    label: { en: 'Nyx', de: 'Nyx', es: 'Nyx' },
    hint: {
      en: 'Grainy low-light footage',
      de: 'Körniges Material bei wenig Licht',
      es: 'Material granulado con poca luz',
    },
  },
  {
    id: 'themis',
    slug: 'thm-2',
    name: 'Themis 2',
    specialty: 'deblur',
    creditFamily: 'restoration',
    manualParameters: false,
    costVerified: false,
    label: { en: 'Themis', de: 'Themis', es: 'Themis' },
    hint: {
      en: 'Shaky or slightly out-of-focus shots',
      de: 'Verwackelte oder leicht unscharfe Aufnahmen',
      es: 'Tomas movidas o algo desenfocadas',
    },
  },
  {
    id: 'dione',
    slug: 'ddv-3',
    name: 'Dione',
    specialty: 'legacy',
    creditFamily: 'precision',
    manualParameters: false,
    costVerified: false,
    label: { en: 'Dione', de: 'Dione', es: 'Dione' },
    hint: {
      en: 'Old interlaced video, TV and archive tapes',
      de: 'Altes Interlaced-Video, TV- und Archivbänder',
      es: 'Vídeo entrelazado antiguo, TV y cintas de archivo',
    },
  },
];


export const TOPAZ_DEFAULT_MODEL_ID = 'proteus';

export function topazModelView(id: string | undefined): TopazVideoModelView {
  return (
    TOPAZ_VIDEO_MODEL_VIEWS.find((m) => m.id === id) ??
    TOPAZ_VIDEO_MODEL_VIEWS.find((m) => m.id === TOPAZ_DEFAULT_MODEL_ID)!
  );
}

// ---------------------------------------------------------------------------

export interface TopazInterpolationView {
  id: string;
  slug: string;
  name: string;
  fast: boolean;
  hint: LocalizedText;
}

export const TOPAZ_INTERPOLATION_VIEWS: TopazInterpolationView[] = [
  {
    id: 'apollo',
    slug: 'apo-8',
    name: 'Apollo',
    fast: false,
    hint: {
      en: 'Best for fast motion',
      de: 'Am besten bei schnellen Bewegungen',
      es: 'Mejor para movimiento rápido',
    },
  },
  {
    id: 'apollo-fast',
    slug: 'apf-2',
    name: 'Apollo Fast',
    fast: true,
    hint: {
      en: 'Quicker, slightly softer',
      de: 'Schneller, etwas weicher',
      es: 'Más rápido, algo más suave',
    },
  },
  {
    id: 'chronos',
    slug: 'chr-2',
    name: 'Chronos',
    fast: false,
    hint: {
      en: 'Best for slow motion',
      de: 'Am besten für Zeitlupe',
      es: 'Mejor para cámara lenta',
    },
  },
  {
    id: 'chronos-fast',
    slug: 'chf-3',
    name: 'Chronos Fast',
    fast: true,
    hint: {
      en: 'Quicker slow motion',
      de: 'Schnellere Zeitlupe',
      es: 'Cámara lenta más rápida',
    },
  },
  {
    id: 'aion',
    slug: 'aion-1',
    name: 'Aion',
    fast: false,
    hint: {
      en: 'Newest model, very smooth',
      de: 'Neuestes Modell, sehr flüssig',
      es: 'Modelo más nuevo, muy fluido',
    },
  },
];

export const TOPAZ_DEFAULT_INTERPOLATION_ID = 'apollo';

// ---------------------------------------------------------------------------

export type TopazOutputQuality = 'efficient' | 'high' | 'master';

export const TOPAZ_OUTPUT_QUALITY_VIEWS: {
  id: TopazOutputQuality;
  label: LocalizedText;
  hint: LocalizedText;
}[] = [
  {
    id: 'efficient',
    label: { en: 'Compact', de: 'Kompakt', es: 'Compacto' },
    hint: {
      en: 'Smallest file, for quick sharing',
      de: 'Kleinste Datei, zum schnellen Teilen',
      es: 'Archivo más pequeño, para compartir rápido',
    },
  },
  {
    id: 'high',
    label: { en: 'High quality', de: 'Hohe Qualität', es: 'Alta calidad' },
    hint: {
      en: 'The balanced default for publishing',
      de: 'Der ausgewogene Standard zum Veröffentlichen',
      es: 'El equilibrio por defecto para publicar',
    },
  },
  {
    id: 'master',
    label: { en: 'Master', de: 'Master', es: 'Máster' },
    hint: {
      en: 'Largest file, for further editing',
      de: 'Größte Datei, für die Weiterbearbeitung',
      es: 'Archivo más grande, para seguir editando',
    },
  },
];

export const TOPAZ_DEFAULT_OUTPUT_QUALITY: TopazOutputQuality = 'high';

// ---------------------------------------------------------------------------

/** Manual filter parameters, mirrored from the server whitelist. */
export const TOPAZ_MANUAL_PARAM_VIEWS: {
  key: string;
  label: LocalizedText;
  min: number;
  max: number;
}[] = [
  {
    key: 'details',
    label: { en: 'Detail', de: 'Details', es: 'Detalle' },
    min: -1,
    max: 1,
  },
  {
    key: 'sharpness',
    label: { en: 'Sharpness', de: 'Schärfe', es: 'Nitidez' },
    min: -1,
    max: 1,
  },
  {
    key: 'noise',
    label: { en: 'Grain', de: 'Korn', es: 'Grano' },
    min: -1,
    max: 1,
  },
  {
    key: 'compression',
    label: {
      en: 'Artefact removal',
      de: 'Artefakte entfernen',
      es: 'Quitar artefactos',
    },
    min: -1,
    max: 1,
  },
];

export const TOPAZ_SCALE_TOLERANCE = 0.2;

/** Mirror of the server rule: a fixed-factor model may not run off-factor. */
export function topazScaleFitsView(
  model: TopazVideoModelView,
  source: { width: number; height: number },
  target: { width: number; height: number },
): boolean {
  if (!model.fixedUpscale) return true;
  const factor = Math.min(target.width, target.height) / (Math.min(source.width, source.height) || 1);
  return (
    factor >= model.fixedUpscale * (1 - TOPAZ_SCALE_TOLERANCE) &&
    factor <= model.fixedUpscale * (1 + TOPAZ_SCALE_TOLERANCE)
  );
}
