/**
 * Localized sentences for the machine-readable codes the `video-enhance`
 * engine answers with. Every surface (AI Video Studio panel, Director's Cut,
 * media library) maps codes through here, so a rejection never surfaces as
 * raw server text or raw JSON — and never in the wrong language.
 *
 * Unknown codes fall back to the server text: nothing is ever swallowed.
 */

export type EnhanceLang = 'en' | 'de' | 'es';

type Tri = Record<EnhanceLang, string>;

const COPY = {
  notAnUpscale: {
    en: 'This setting would not enlarge your video. Pick a higher resolution.',
    de: 'Diese Einstellung vergrößert dein Video nicht. Wähle eine höhere Auflösung.',
    es: 'Esta opción no ampliaría tu vídeo. Elige una resolución mayor.',
  },
  downscale: {
    en: 'This setting would make your video smaller than it already is.',
    de: 'Diese Einstellung würde dein Video kleiner machen, als es schon ist.',
    es: 'Esta opción haría tu vídeo más pequeño de lo que ya es.',
  },
  unreachable: {
    en: 'No engine can deliver this frame for your video right now.',
    de: 'Keine Engine kann dieses Format für dein Video derzeit liefern.',
    es: 'Ningún motor puede entregar este formato para tu vídeo ahora mismo.',
  },
  modelLocked: {
    en: 'This engine is not available for your account yet.',
    de: 'Diese Engine ist für dein Konto noch nicht freigeschaltet.',
    es: 'Este motor aún no está disponible para tu cuenta.',
  },
  source: {
    en: 'We could not read this video. Please pick another file or upload it again.',
    de: 'Dieses Video konnte nicht gelesen werden. Wähle eine andere Datei oder lade es erneut hoch.',
    es: 'No hemos podido leer este vídeo. Elige otro archivo o vuelve a subirlo.',
  },
  credits: {
    en: 'Not enough credits for this run. Top up and try again.',
    de: 'Nicht genug Guthaben für diesen Lauf. Lade auf und versuche es erneut.',
    es: 'No hay créditos suficientes para esta ejecución. Recarga e inténtalo de nuevo.',
  },
  provider: {
    en: 'The engine could not accept this job. Nothing was charged — please try again in a moment.',
    de: 'Die Engine konnte den Auftrag nicht annehmen. Es wurde nichts berechnet – versuche es gleich noch einmal.',
    es: 'El motor no pudo aceptar este trabajo. No se ha cobrado nada; inténtalo de nuevo en un momento.',
  },
  conflict: {
    en: 'This video is already being enhanced. Wait for that run to finish.',
    de: 'Dieses Video wird bereits verbessert. Warte, bis dieser Lauf fertig ist.',
    es: 'Este vídeo ya se está mejorando. Espera a que termine esa ejecución.',
  },
  unpriceable: {
    en: 'This combination has no verified price yet and cannot be started.',
    de: 'Für diese Kombination gibt es noch keinen verifizierten Preis; sie kann nicht gestartet werden.',
    es: 'Esta combinación aún no tiene un precio verificado y no se puede iniciar.',
  },
} satisfies Record<string, Tri>;

export type EnhanceErrorKey = keyof typeof COPY;

/** Codes that describe a rejected ORDER — the start button stays disabled. */
export const ORDER_REJECTION_CODES = new Set([
  'VIDEO_ENHANCE_NOT_AN_UPSCALE',
  'TARGET_FRAME_UNREACHABLE',
  'UNPRICEABLE',
  'MODEL_LOCKED',
  'UNKNOWN_MODEL',
]);

export function enhanceErrorKeyForCode(
  code: string | null | undefined,
  reason?: string | null,
): EnhanceErrorKey | null {
  switch (code) {
    case 'VIDEO_ENHANCE_NOT_AN_UPSCALE':
      return reason === 'downscale' ? 'downscale' : 'notAnUpscale';
    case 'TARGET_FRAME_UNREACHABLE':
      return 'unreachable';
    case 'MODEL_LOCKED':
    case 'UNKNOWN_MODEL':
      return 'modelLocked';
    case 'NO_SOURCE':
    case 'SOURCE_NOT_FOUND':
    case 'SOURCE_NOT_DURABLE':
    case 'SOURCE_UNREADABLE':
      return 'source';
    case 'INSUFFICIENT_CREDITS':
    case 'NO_WALLET':
      return 'credits';
    case 'PROVIDER_REJECTED':
    case 'SUBMIT_UNCERTAIN':
    case 'RESERVATION_FAILED':
    case 'RUN_CREATE_FAILED':
      return 'provider';
    case 'RUN_CONFLICT':
      return 'conflict';
    case 'UNPRICEABLE':
      return 'unpriceable';
    default:
      return null;
  }
}

export function enhanceCopy(key: EnhanceErrorKey, lang: EnhanceLang): string {
  return COPY[key][lang] ?? COPY[key].en;
}

/**
 * Sentence for an engine rejection. `fallback` is the server text and is only
 * shown for codes this module does not know.
 */
export function engineErrorText(
  code: string | null | undefined,
  fallback: string,
  lang: EnhanceLang,
  reason?: string | null,
): string {
  const key = enhanceErrorKeyForCode(code, reason);
  return key ? enhanceCopy(key, lang) : fallback;
}

export function toEnhanceLang(language: string | null | undefined): EnhanceLang {
  return language === 'de' || language === 'es' ? language : 'en';
}
