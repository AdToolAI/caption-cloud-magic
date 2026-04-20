

## Email-Verifizierung — Final Polish

### Was noch fehlt für Produktionsreife

#### 1. Toast-Texte in `useAuth.signUp()` lokalisieren
- Aktuell hardcoded Deutsch: „Account erstellt! Bitte prüfen Sie Ihre E-Mail…"
- Lösung: `useTranslation()`-Hook verfügbar machen oder `i18n.t()` direkt in `signUp` nutzen
- Neue i18n-Keys: `auth.signupSuccessTitle`, `auth.signupSuccessDesc`, `auth.signupErrorGeneric`

#### 2. Dedizierte „Check your email"-Hinweis-Seite
- Neue Route: `/auth/check-email` mit Mail-Adresse als Query-Param (`?email=user@example.com`)
- Inhalt:
  - Großes Mail-Icon + „Wir haben dir eine E-Mail gesendet"
  - „Prüfe **user@example.com** (auch Spam-Ordner)"
  - Resend-Button (mit 60s Countdown, ruft `send-verification-email` auf)
  - „Andere E-Mail nutzen" → zurück zu `/auth`
- In `Auth.tsx`: nach erfolgreichem Signup → `navigate('/auth/check-email?email=...')`
- Vollständig DE/EN/ES lokalisiert

#### 3. Resend-Domain-Verifizierung dokumentieren (kein Code, nur Hinweis)
- Falls Mails nicht ankommen: Domain `useadtool.ai` muss in Resend-Dashboard mit DNS-Records (SPF, DKIM, DMARC) verifiziert sein
- Ohne Domain-Verifizierung sendet Resend nur an die eigene Account-E-Mail (Free-Plan-Limit)
- Reine Info — kein Code-Change nötig

### Geänderte/neue Dateien
- `src/hooks/useAuth.tsx` → Toasts via `i18n.t()` statt hardcoded
- `src/pages/CheckEmail.tsx` (neu) → Hinweis-Seite mit Resend-Button
- `src/pages/Auth.tsx` → nach Signup zu `/auth/check-email` navigieren
- `src/App.tsx` → neue Route `/auth/check-email` registrieren
- `src/lib/translations.ts` → neue Keys: `auth.signupSuccess*`, `checkEmail.*`

### Was unverändert bleibt
- Edge Functions `send-verification-email` und `verify-email`
- Tabelle `email_verification_tokens`
- Resend-Integration und Cooldown-Logik
- `EmailVerificationGate` und `/verify-email`-Seite

### Test-Plan nach Implementierung
1. Mit einer **fremden E-Mail-Adresse** registrieren (nicht die in Resend hinterlegte)
2. Prüfen: kommt die Mail an? (Posteingang + Spam)
3. Falls nein → Resend-Domain-Setup in Resend-Dashboard prüfen
4. Verifizierungs-Link klicken → Erfolg-Seite + Welcome-Bonus gutgeschrieben
5. Sprache wechseln (DE/EN/ES) und Signup wiederholen — Mail-Sprache prüfen

