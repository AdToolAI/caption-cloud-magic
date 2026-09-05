/**
 * Maps raw Supabase auth error messages to user-friendly, localized strings.
 *
 * Also emits a `auth_error_shown` analytics event so we can track which
 * failure modes users hit during the Beta.
 */
import { trackEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import { tx } from "@/lib/i18nText";

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
      title: tx({ de: "E-Mail oder Passwort falsch", en: "Wrong email or password", es: "Correo o contraseña incorrectos" }),
      description: tx({ de: "Bitte prüfe deine Zugangsdaten und versuche es erneut.", en: "Please check your credentials and try again.", es: "Comprueba tus credenciales e inténtalo de nuevo." }),
    };
  }

  // ── Email not confirmed ──────────────────────────────────────
  if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
    return {
      code: "email_not_confirmed",
      title: tx({ de: "E-Mail noch nicht bestätigt", en: "Email not confirmed yet", es: "Correo aún no confirmado" }),
      description: tx({ de: "Bitte klicke den Bestätigungslink in deiner Mailbox.", en: "Please click the confirmation link in your inbox.", es: "Haz clic en el enlace de confirmación de tu bandeja de entrada." }),
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
      title: tx({ de: "Konto existiert bereits", en: "Account already exists", es: "La cuenta ya existe" }),
      description: tx({ de: "Melde dich stattdessen an oder setze dein Passwort zurück.", en: "Sign in instead, or reset your password.", es: "Inicia sesión o restablece tu contraseña." }),
    };
  }

  // ── Rate limits / brute-force protection ─────────────────────
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return {
      code: "rate_limited",
      title: tx({ de: "Zu viele Versuche", en: "Too many attempts", es: "Demasiados intentos" }),
      description: tx({ de: "Warte kurz und versuche es dann erneut.", en: "Wait a moment and try again.", es: "Espera un momento e inténtalo de nuevo." }),
    };
  }

  // ── Leaked password (HIBP) ───────────────────────────────────
  if (msg.includes("pwned") || msg.includes("compromised") || msg.includes("data breach") || msg.includes("leaked")) {
    return {
      code: "password_leaked",
      title: tx({ de: "Passwort in Datenlecks bekannt", en: "Password found in data breaches", es: "Contraseña filtrada en brechas" }),
      description: tx({
        de: "Dieses Passwort taucht in bekannten Datenlecks auf. Bitte wähle ein anderes — Länge und Sonderzeichen sind nicht das Problem.",
        en: "This password appears in known data breaches. Please choose a different one — length and symbols are not the issue.",
        es: "Esta contraseña aparece en brechas de datos conocidas. Elige otra distinta; la longitud y los símbolos no son el problema.",
      }),
    };
  }

  // ── Password weakness ────────────────────────────────────────
  if (msg.includes("password") && msg.includes("weak")) {
    return {
      code: "weak_password",
      title: tx({ de: "Passwort erfüllt die Anforderungen nicht", en: "Password doesn't meet the requirements", es: "La contraseña no cumple los requisitos" }),
      description: tx({
        de: "Mindestens 8 Zeichen und eine Zahl oder ein Sonderzeichen.",
        en: "At least 8 characters plus a number or symbol.",
        es: "Al menos 8 caracteres más un número o símbolo.",
      }),
    };
  }
  if (msg.includes("password") && (msg.includes("6 characters") || msg.includes("8 characters") || msg.includes("should be at least"))) {
    return {
      code: "password_too_short",
      title: tx({ de: "Passwort zu kurz", en: "Password too short", es: "Contraseña demasiado corta" }),
      description: tx({ de: "Mindestens 8 Zeichen erforderlich.", en: "At least 8 characters required.", es: "Se requieren al menos 8 caracteres." }),
    };
  }


  // ── Recovery / reset links ───────────────────────────────────
  if (msg.includes("token") || msg.includes("expired") || msg.includes("invalid_token")) {
    return {
      code: "token_invalid",
      title: tx({ de: "Link ungültig oder abgelaufen", en: "Link invalid or expired", es: "Enlace no válido o caducado" }),
      description: tx({ de: "Bitte fordere einen neuen Link an.", en: "Please request a new link.", es: "Solicita un enlace nuevo." }),
    };
  }

  // ── Provider disabled ────────────────────────────────────────
  if (msg.includes("provider") && msg.includes("not enabled")) {
    return {
      code: "provider_disabled",
      title: tx({ de: "Anmeldeart nicht verfügbar", en: "Sign-in method unavailable", es: "Método de acceso no disponible" }),
      description: tx({ de: "Bitte wähle eine andere Anmeldeart.", en: "Please choose a different sign-in method.", es: "Elige otro método de acceso." }),
    };
  }

  // ── Network / unknown ────────────────────────────────────────
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return {
      code: "network_error",
      title: tx({ de: "Netzwerkfehler", en: "Network error", es: "Error de red" }),
      description: tx({ de: "Prüfe deine Internetverbindung und versuche es erneut.", en: "Check your internet connection and try again.", es: "Comprueba tu conexión a internet e inténtalo de nuevo." }),
    };
  }

  const fallbackTitle =
    context === "signup"
      ? tx({ de: tx({ de: "Registrierung fehlgeschlagen", en: "Sign-up failed", es: "Error al registrarse" }), en: "Sign-up failed", es: "Registro fallido" })
      : context === "signin"
        ? tx({ de: tx({ de: "Anmeldung fehlgeschlagen", en: "Sign-in failed", es: "Error al iniciar sesión" }), en: "Sign-in failed", es: "Acceso fallido" })
        : context === "reset"
          ? tx({ de: tx({ de: "Passwort-Reset fehlgeschlagen", en: "Password reset failed", es: "Error al restablecer la contraseña" }), en: "Password reset failed", es: "Restablecimiento de contraseña fallido" })
          : context === "update"
            ? tx({ de: tx({ de: "Aktualisierung fehlgeschlagen", en: "Update failed", es: "Error al actualizar" }), en: "Update failed", es: "Actualización fallida" })
            : tx({ de: "Ein Fehler ist aufgetreten", en: "Something went wrong", es: "Se ha producido un error" });

  return {
    code: "unknown",
    title: fallbackTitle,
    description: raw || tx({ de: "Bitte versuche es erneut.", en: "Please try again.", es: "Inténtalo de nuevo." }),
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
