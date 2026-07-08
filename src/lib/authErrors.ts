/**
 * Maps raw Supabase auth error messages to user-friendly, localized strings.
 *
 * Also emits a `auth_error_shown` analytics event so we can track which
 * failure modes users hit during the Beta.
 */
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";

export type AuthErrorContext = "signin" | "signup" | "reset" | "update" | "verify" | "token";

interface FriendlyAuthError {
  /** Short toast title */
  title: string;
  /** Longer description shown beneath the title */
  description?: string;
  /** Stable code used for analytics + tests */
  code: string;
}

/**
 * Convert a raw Supabase auth error (or generic Error) into a friendly,
 * user-facing message. Always returns a value — never throws.
 */
export function mapAuthError(
  err: unknown,
  context: AuthErrorContext
): FriendlyAuthError {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : (err as { message?: string })?.message ?? "";

  const msg = raw.toLowerCase();

  // ── Credentials ──────────────────────────────────────────────
  if (msg.includes("invalid login credentials") || msg.includes("invalid_grant")) {
    return {
      code: "invalid_credentials",
      title: "E-Mail oder Passwort falsch",
      description: "Bitte prüfe deine Zugangsdaten und versuche es erneut.",
    };
  }

  // ── Email not confirmed ──────────────────────────────────────
  if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
    return {
      code: "email_not_confirmed",
      title: "E-Mail noch nicht bestätigt",
      description: "Bitte klicke den Bestätigungslink in deiner Mailbox.",
    };
  }

  // ── User already registered ──────────────────────────────────
  if (
    msg.includes("user already registered") ||
    msg.includes("already been registered") ||
    msg.includes("email address is already")
  ) {
    return {
      code: "user_exists",
      title: "Konto existiert bereits",
      description: "Melde dich stattdessen an oder setze dein Passwort zurück.",
    };
  }

  // ── Rate limits / brute-force protection ─────────────────────
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return {
      code: "rate_limited",
      title: "Zu viele Versuche",
      description: "Warte kurz und versuche es dann erneut.",
    };
  }

  // ── Password weakness ────────────────────────────────────────
  if (msg.includes("password") && (msg.includes("weak") || msg.includes("pwned") || msg.includes("compromised"))) {
    return {
      code: "weak_password",
      title: "Passwort zu schwach",
      description: "Bitte wähle ein längeres, einzigartiges Passwort.",
    };
  }
  if (msg.includes("password") && msg.includes("6 characters")) {
    return {
      code: "password_too_short",
      title: "Passwort zu kurz",
      description: "Mindestens 6 Zeichen erforderlich.",
    };
  }

  // ── Recovery / reset links ───────────────────────────────────
  if (msg.includes("token") || msg.includes("expired") || msg.includes("invalid_token")) {
    return {
      code: "token_invalid",
      title: "Link ungültig oder abgelaufen",
      description: "Bitte fordere einen neuen Link an.",
    };
  }

  // ── Provider disabled ────────────────────────────────────────
  if (msg.includes("provider") && msg.includes("not enabled")) {
    return {
      code: "provider_disabled",
      title: "Anmeldeart nicht verfügbar",
      description: "Bitte wähle eine andere Anmeldeart.",
    };
  }

  // ── Network / unknown ────────────────────────────────────────
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return {
      code: "network_error",
      title: "Netzwerkfehler",
      description: "Prüfe deine Internetverbindung und versuche es erneut.",
    };
  }

  const fallbackTitle =
    context === "signup"
      ? "Registrierung fehlgeschlagen"
      : context === "signin"
        ? "Anmeldung fehlgeschlagen"
        : context === "reset"
          ? "Passwort-Reset fehlgeschlagen"
          : context === "update"
            ? "Aktualisierung fehlgeschlagen"
            : "Ein Fehler ist aufgetreten";

  return {
    code: "unknown",
    title: fallbackTitle,
    description: raw || "Bitte versuche es erneut.",
  };
}

/**
 * Track that a user was shown an auth error. Emits a single analytics event
 * per call — safe to call from anywhere.
 */
export function trackAuthError(
  friendly: FriendlyAuthError,
  context: AuthErrorContext
): void {
  try {
    trackEvent(ANALYTICS_EVENTS.AUTH_ERROR_SHOWN, {
      code: friendly.code,
      context,
      title: friendly.title,
    });
  } catch {
    // never let analytics break auth UX
  }
}
