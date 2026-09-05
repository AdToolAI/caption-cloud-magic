/**
 * Regression: Signup-Passwortregeln + Fehlerzuordnung.
 *
 * Kundenfall (05.09.2026): 12 Zeichen mit Groß/Klein, Zahl und Sonderzeichen
 * wurde als "zu schwach" abgelehnt. Ursache war die Fehler-Zuordnung: Supabase
 * meldet HIBP-Treffer als `weak_password` mit `reasons: ["pwned"]` und dem Text
 * "Password is known to be weak and easy to guess". Die Meldung darf niemals
 * aus dem Text geraten werden — nur die strukturierten `reasons` zählen.
 */
import { describe, it, expect } from "vitest";
import { evaluatePassword, PASSWORD_MIN_LENGTH } from "@/components/auth/PasswordStrength";
import { mapAuthError } from "@/lib/authErrors";

describe("Passwortregeln (Client)", () => {
  it("Kundenfall: 12 Zeichen, Groß/Klein, Zahl, Sonderzeichen ist gültig", () => {
    expect(evaluatePassword("Sommer2026!Xy").valid).toBe(true);
  });

  it("Mindestlänge ist 8", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(evaluatePassword("Qx7zRb2").valid).toBe(false); // 7 Zeichen
    expect(evaluatePassword("Qx7zRb2a").valid).toBe(true); // 8 Zeichen
  });

  it("reine Buchstaben ohne Zahl/Sonderzeichen sind ungültig", () => {
    expect(evaluatePassword("abcdefghij").valid).toBe(false);
  });

  it("lange Passphrasen werden nicht blockiert", () => {
    expect(evaluatePassword(`${"korrekt-pferd-batterie-heftklammer ".repeat(3)}7`).valid).toBe(true);
  });

  it("Sonderzeichen sind nicht erzwungen — eine Zahl reicht", () => {
    expect(evaluatePassword("sommerzeit7").valid).toBe(true);
  });

  it("Client ist nicht lockerer als der Server (Server-Minimum: 6)", () => {
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(6);
  });
});

describe("Fehlerzuordnung: Datenleck vs. Schwäche", () => {
  const supabaseWeak = (reasons: string[]) =>
    Object.assign(new Error("Password is known to be weak and easy to guess, please choose a different one."), {
      reasons,
      weak_password: { reasons },
    });

  it("reasons ['pwned'] → Datenleck-Meldung", () => {
    expect(mapAuthError(supabaseWeak(["pwned"]), "signup").code).toBe("password_leaked");
  });

  it("reasons ['length'] → zu kurz, nicht Datenleck", () => {
    expect(mapAuthError(supabaseWeak(["length"]), "signup").code).toBe("password_too_short");
  });

  it("generisches 'weak password' ohne reasons behauptet NIE ein Datenleck", () => {
    const code = mapAuthError(new Error("Password is too weak"), "signup").code;
    expect(code).toBe("weak_password");
    expect(code).not.toBe("password_leaked");
  });

  it("explizite Breach-Formulierung ohne reasons → Datenleck", () => {
    expect(mapAuthError(new Error("This password has been found in a data breach"), "signup").code).toBe(
      "password_leaked",
    );
  });
});

describe("Fehlerzuordnung: E-Mail, OAuth, Netz, Rate-Limit", () => {
  const cases: Array<[string, string]> = [
    ["User already registered", "user_exists"],
    ["Unable to validate email address: invalid format", "invalid_email"],
    ["Email rate limit exceeded", "rate_limited"],
    ["Failed to fetch", "network_error"],
    ["The popup closed before completing sign in", "oauth_cancelled"],
    ["access_denied", "oauth_cancelled"],
    ["OAuth server_error from provider", "oauth_provider_error"],
    ["Invalid login credentials", "invalid_credentials"],
  ];

  it.each(cases)("%s → %s", (raw, expected) => {
    const mapped = mapAuthError(new Error(raw), "signin");
    if (expected === "invalid_email") {
      // Falls kein eigener Code existiert, darf es nicht als Passwortfehler enden.
      expect(["invalid_email", "unknown"]).toContain(mapped.code);
      expect(mapped.code).not.toContain("password");
      return;
    }
    expect(mapped.code).toBe(expected);
  });

  it("jede Meldung liefert Titel und Beschreibung", () => {
    for (const [raw] of cases) {
      const mapped = mapAuthError(new Error(raw), "signin");
      expect(mapped.title.length).toBeGreaterThan(3);
      expect((mapped.description ?? "").length).toBeGreaterThan(3);
    }
  });
});
