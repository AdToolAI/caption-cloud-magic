

## Email-Verifizierung fertigstellen — Plan

### Was bereits existiert ✅
- Edge Function `send-verification-email` (Resend API, deutsche HTML-Vorlage)
- Edge Function `verify-email` (Token-Verifikation + `auth.admin.updateUserById`)
- Tabelle `email_verification_tokens` (mit `id, user_id, token, email, expires_at, verified_at, created_at`)
- Seite `/verify-email` (zeigt Loading/Success/Error-Status)
- `EmailVerificationGate` (blockt geschützte Routen für unverifizierte Nutzer)
- Aufruf bei Signup in `useAuth.signUp()`

### Was fehlt / Probleme ⚠️

1. **Doppelt-Mail-Konflikt:** `supabase.auth.signUp()` triggert Supabases native Confirm-Email PARALLEL zu unserer Resend-Mail → User bekommen 2 verschiedene Mails mit 2 verschiedenen Links.
2. **Sprache hardcodiert auf Deutsch:** App ist EN/DE/ES, aber alle E-Mail-Texte und VerifyEmail-Seitentexte sind nur Deutsch.
3. **Welcome-Bonus-Trigger:** `grant-welcome-bonus` (Edge Function) sollte erst nach Verifizierung greifen — aktuell unklar verkettet.
4. **Resend-Cooldown im Backend fehlt:** Frontend hat 60s Countdown, aber Backend prüft nicht → Spam möglich.

### Umsetzung

#### 1. Native Supabase-Confirm-Email deaktivieren
Im Supabase-Auth-Setting `mailer_autoconfirm = false` BEIBEHALTEN, aber das **native Confirmation-Email-Template entweder deaktivieren oder leeren**, damit nur unsere Resend-Mail rausgeht. Lösung: Im `supabase/config.toml` `[auth.email] enable_confirmations = false` setzen — der Account wird mit `email_confirmed_at = NULL` angelegt, und unsere `verify-email`-Function setzt das Flag manuell via Admin API.

#### 2. Mehrsprachigkeit (DE/EN/ES)
- **`send-verification-email`:** `language` aus `profiles.language` lesen (oder aus Request-Body) und 3 HTML-Templates rendern (Subject + Body in DE/EN/ES). Same Pattern wie `process-activation-emails/templates.ts`.
- **`/verify-email` Page:** alle Strings auf `useTranslation()` umstellen mit i18n-Keys (`verify_email.loading`, `verify_email.success`, etc.).
- **`EmailVerificationGate`:** ebenfalls auf `t()` umstellen.

#### 3. Backend-Cooldown gegen Spam
In `send-verification-email`: vor dem Senden prüfen, ob letzter Token jünger als 60s ist (`created_at > now() - 60s`) → 429 zurückgeben.

#### 4. Welcome-Bonus-Verkettung
In `verify-email`-Function nach erfolgreicher Verifikation `grant-welcome-bonus` aufrufen (idempotent). Aktuell unklar, ob der Bonus auch ohne Verifizierung gewährt wird.

#### 5. Auth.tsx Hinweis verbessern
Nach Signup zur Hinweis-Seite navigieren, die klar sagt: „Wir haben dir eine Verifizierungs-E-Mail an [email] gesendet. Bitte bestätige sie, um loszulegen." Aktuell kommt nur ein Toast.

### Technische Details

**Geänderte/neue Dateien:**
- `supabase/config.toml` → `[auth.email] enable_confirmations = false`
- `supabase/functions/send-verification-email/index.ts` → Sprache-Lookup + 3 Templates + 60s-Cooldown + `cleanupOldTokens`
- `supabase/functions/send-verification-email/templates.ts` (neu) → DE/EN/ES HTML-Renderer (analog `process-activation-emails`)
- `supabase/functions/verify-email/index.ts` → nach erfolgreicher Verifizierung `grant-welcome-bonus` aufrufen
- `src/pages/VerifyEmail.tsx` → `useTranslation()` für alle Strings
- `src/components/auth/EmailVerificationGate.tsx` → `useTranslation()` für alle Strings
- `src/i18n/locales/{en,de,es}.json` → neue Keys: `verify_email.*`, `email_gate.*`
- `src/hooks/useAuth.tsx` → `signUp()` übergibt `language` aus `i18n.language` an `send-verification-email`-Body

**Datenbank:** keine Schema-Änderungen nötig (Tabelle existiert bereits korrekt).

**Sicherheit:** Token-Cooldown via Server-Check, RLS auf `email_verification_tokens` (Service-Role-only), Token läuft nach 24h ab.

### Was unverändert bleibt
- Tabelle `email_verification_tokens`
- Resend-Integration (RESEND_API_KEY ist gesetzt)
- Routing für `/verify-email`
- Auth-Flow (Login, Signup-Form, MFA)

