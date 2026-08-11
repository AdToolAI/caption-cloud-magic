/**
 * Localised error responses for every briefing-analysis entry point.
 *
 * Previously the main path answered rate-limit / credit errors in hardcoded
 * English while the deep-parse path answered in the user's language. One
 * helper keeps DE/EN/ES consistent everywhere.
 */
import { tl } from "../i18n.ts";

export interface BriefingErrorPayload {
  error: string;
  code: string;
  retryable?: boolean;
  details?: unknown;
}

export function briefingErrorBody(status: number, details?: unknown): BriefingErrorPayload {
  if (status === 429) {
    return {
      code: "rate_limited",
      retryable: true,
      error: tl({
        de: "Zu viele Anfragen. Bitte in einem Moment erneut versuchen.",
        en: "Too many requests. Please try again in a moment.",
        es: "Demasiadas solicitudes. Inténtalo de nuevo en un momento.",
      }),
    };
  }
  if (status === 402) {
    return {
      code: "credits_exhausted",
      retryable: false,
      error: tl({
        de: "KI-Guthaben aufgebraucht. Bitte Guthaben aufladen.",
        en: "AI credits exhausted. Please top up your credits.",
        es: "Créditos de IA agotados. Recarga tu saldo.",
      }),
    };
  }
  if (status === 401) {
    return {
      code: "unauthorized",
      error: tl({
        de: "Nicht angemeldet. Bitte neu einloggen.",
        en: "Not signed in. Please log in again.",
        es: "No has iniciado sesión. Vuelve a entrar.",
      }),
    };
  }
  if (status === 400) {
    return {
      code: "invalid_input",
      details,
      error: tl({
        de: "Das Briefing konnte nicht gelesen werden. Bitte Eingabe prüfen.",
        en: "The briefing could not be read. Please check your input.",
        es: "No se pudo leer el briefing. Revisa la entrada.",
      }),
    };
  }
  if (status === 413) {
    return {
      code: "too_long",
      error: tl({
        de: "Das Briefing ist zu lang (max. ca. 120.000 Zeichen).",
        en: "The briefing is too long (max ~120,000 characters).",
        es: "El briefing es demasiado largo (máx. ~120.000 caracteres).",
      }),
    };
  }
  if (status === 422) {
    return {
      code: "invalid_manifest",
      retryable: true,
      details,
      error: tl({
        de: "Die KI-Analyse war unvollständig. Bitte erneut versuchen oder das Briefing konkreter formulieren.",
        en: "The AI analysis came back incomplete. Please retry or make the briefing more specific.",
        es: "El análisis de IA quedó incompleto. Reinténtalo o concreta más el briefing.",
      }),
    };
  }
  return {
    code: "analysis_failed",
    retryable: true,
    details,
    error: tl({
      de: "Die Briefing-Analyse ist fehlgeschlagen. Bitte erneut versuchen.",
      en: "Briefing analysis failed. Please try again.",
      es: "El análisis del briefing falló. Inténtalo de nuevo.",
    }),
  };
}

export function briefingErrorResponse(
  status: number,
  corsHeaders: Record<string, string>,
  details?: unknown,
): Response {
  return new Response(JSON.stringify(briefingErrorBody(status, details)), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Maps an unknown thrown value onto an HTTP status we can localise. */
export function statusFromError(e: unknown): number {
  const raw = (e as any)?.status;
  if (raw === 429 || raw === 402 || raw === 401 || raw === 400 || raw === 413 || raw === 422) return raw;
  return 500;
}
