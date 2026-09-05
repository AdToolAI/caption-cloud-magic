import { tx } from '@/lib/i18nText';

/**
 * Provider failures for AI video generation arrive as free-form text (the
 * providers have no stable error-code column). We classify the raw message
 * once, so the customer sees a plain explanation in their own language
 * instead of "Video generation failed".
 */
export type VideoErrorKind =
  | 'overloaded'
  | 'timeout'
  | 'moderation'
  | 'invalid_input'
  | 'rate_limit'
  | 'provider_error'
  | 'network'
  | 'unknown';

export function classifyVideoError(errorMessage: string | null | undefined): VideoErrorKind {
  if (!errorMessage) return 'unknown';
  const raw = errorMessage.toLowerCase();

  if (
    raw.includes('high load') ||
    raw.includes('high demand') ||
    raw.includes('(e003)') ||
    raw.includes('resource_exhausted') ||
    raw.includes('overloaded') ||
    raw.includes('capacity') ||
    /"?code"?\s*[:=]\s*8\b/.test(raw)
  ) {
    return 'overloaded';
  }
  if (raw.includes('rate limit') || raw.includes('too many requests') || raw.includes('429')) {
    return 'rate_limit';
  }
  if (raw.includes('timed out') || raw.includes('timeout') || raw.includes('deadline exceeded')) {
    return 'timeout';
  }
  if (
    raw.includes('moderation') ||
    raw.includes('safety') ||
    raw.includes('content policy') ||
    raw.includes('flagged') ||
    raw.includes('nsfw') ||
    raw.includes('rejected by')
  ) {
    return 'moderation';
  }
  if (
    raw.includes('invalid input') ||
    raw.includes('invalid_request') ||
    raw.includes('validation') ||
    raw.includes('unsupported') ||
    raw.includes('bad request')
  ) {
    return 'invalid_input';
  }
  if (
    raw.includes('network') ||
    raw.includes('econnreset') ||
    raw.includes('fetch failed') ||
    raw.includes('socket') ||
    raw.includes('connection')
  ) {
    return 'network';
  }
  if (
    raw.includes('service is temporarily unavailable') ||
    raw.includes('(e004)') ||
    raw.includes('internal error') ||
    raw.includes('internal server error') ||
    raw.includes('500')
  ) {
    return 'provider_error';
  }
  return 'unknown';
}

const REFUND = {
  de: 'Dein Guthaben wurde zurückerstattet.',
  en: 'Your balance has been refunded.',
  es: 'Se te ha reembolsado el saldo.',
};

export function friendlyVideoErrorMessage(errorMessage: string | null | undefined): string {
  const kind = classifyVideoError(errorMessage);

  switch (kind) {
    case 'overloaded':
      return tx({
        de: `Der Video-Anbieter ist aktuell überlastet. ${REFUND.de} Bitte starte die Generierung in ein paar Minuten erneut.`,
        en: `The video provider is currently overloaded. ${REFUND.en} Please start the generation again in a few minutes.`,
        es: `El proveedor de vídeo está sobrecargado. ${REFUND.es} Vuelve a iniciar la generación en unos minutos.`,
      });
    case 'rate_limit':
      return tx({
        de: `Zu viele Anfragen an den Anbieter in kurzer Zeit. ${REFUND.de} Bitte versuche es in wenigen Minuten erneut.`,
        en: `Too many requests to the provider in a short time. ${REFUND.en} Please try again in a few minutes.`,
        es: `Demasiadas solicitudes al proveedor en poco tiempo. ${REFUND.es} Inténtalo de nuevo en unos minutos.`,
      });
    case 'timeout':
      return tx({
        de: `Der Anbieter hat zu lange gebraucht und den Auftrag abgebrochen. ${REFUND.de} Ein kürzeres Video oder ein erneuter Versuch hilft meistens.`,
        en: `The provider took too long and cancelled the job. ${REFUND.en} A shorter video or a new attempt usually works.`,
        es: `El proveedor tardó demasiado y canceló el trabajo. ${REFUND.es} Un vídeo más corto o un nuevo intento suele funcionar.`,
      });
    case 'moderation':
      return tx({
        de: `Der Anbieter hat diesen Inhalt abgelehnt (Inhaltsprüfung). ${REFUND.de} Bitte formuliere die Beschreibung um oder nutze ein anderes Bild.`,
        en: `The provider rejected this content (content review). ${REFUND.en} Please rephrase the description or use a different image.`,
        es: `El proveedor rechazó este contenido (revisión de contenido). ${REFUND.es} Reformula la descripción o usa otra imagen.`,
      });
    case 'invalid_input':
      return tx({
        de: `Die Angaben passen nicht zu diesem Modell (z. B. Länge, Format oder Bild). ${REFUND.de} Bitte passe die Einstellungen an.`,
        en: `The settings don't fit this model (e.g. length, format or image). ${REFUND.en} Please adjust the settings.`,
        es: `Los ajustes no encajan con este modelo (p. ej. duración, formato o imagen). ${REFUND.es} Ajusta la configuración.`,
      });
    case 'network':
      return tx({
        de: `Die Verbindung zum Anbieter ist abgebrochen. ${REFUND.de} Bitte versuche es gleich noch einmal.`,
        en: `The connection to the provider was interrupted. ${REFUND.en} Please try again shortly.`,
        es: `Se interrumpió la conexión con el proveedor. ${REFUND.es} Inténtalo de nuevo en breve.`,
      });
    case 'provider_error':
      return tx({
        de: `Beim Anbieter ist ein interner Fehler aufgetreten. ${REFUND.de} Bitte versuche es in ein paar Minuten erneut.`,
        en: `The provider ran into an internal error. ${REFUND.en} Please try again in a few minutes.`,
        es: `El proveedor tuvo un error interno. ${REFUND.es} Inténtalo de nuevo en unos minutos.`,
      });
    default:
      if (!errorMessage) {
        return tx({
          de: `Die Generierung ist fehlgeschlagen. ${REFUND.de} Bitte versuche es erneut.`,
          en: `The generation failed. ${REFUND.en} Please try again.`,
          es: `La generación falló. ${REFUND.es} Inténtalo de nuevo.`,
        });
      }
      return errorMessage.length > 150 ? `${errorMessage.slice(0, 147)}...` : errorMessage;
  }
}
