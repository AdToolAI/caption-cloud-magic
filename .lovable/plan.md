
## Email-Verifizierung korrigieren

### Festgestelltes Problem
Die Verifizierungs-Mail kommt an, aber der Link zeigt auf die falsche Domain:
- In der Mail steht `https://captiongenie.app/verify-email?token=...`
- Diese Domain liefert für `/verify-email` aktuell nicht die Verifizierungs-Seite, sondern landet effektiv auf der Landingpage
- Die React-Seite `/verify-email` funktioniert im Projekt grundsätzlich, aber nur auf der korrekt gerouteten Domain

Zusätzlich kommt eine zweite, eher werbliche Aktivierungs-Mail:
- Die Onboarding-/Activation-Mail wird derzeit offenbar auch an **nicht verifizierte** Nutzer gesendet
- Das erzeugt Verwirrung, weil erst die Bestätigung abgeschlossen sein sollte

### Ziel
1. Verifizierungs-Link immer auf die richtige App-Domain zeigen lassen
2. Verifizierung nach Klick zuverlässig abschließen
3. Aktivierungs-/Werbemails erst nach bestätigter E-Mail senden

### Umsetzung

#### 1. Verifizierungs-Link auf die echte aktuelle Domain umstellen
`send-verification-email` wird so angepasst, dass die Ziel-URL nicht mehr von einer veralteten Server-Variable abhängt.

**Änderung:**
- Edge Function akzeptiert zusätzlich `appUrl`
- Beim Signup/Resend wird aus dem Frontend `window.location.origin` mitgeschickt
- Die Function verwendet nur erlaubte Origins und baut daraus:
  `https://<aktive-domain>/verify-email?token=...`
- Fallback bleibt eine definierte Produktionsdomain statt der alten Domain

**Betroffene Dateien:**
- `supabase/functions/send-verification-email/index.ts`
- `src/hooks/useAuth.tsx`
- `src/pages/CheckEmail.tsx`
- `src/components/auth/EmailVerificationGate.tsx`

#### 2. Flow gegen falsche/veraltete Links härten
Falls doch noch alte Bestätigungslinks im Umlauf sind, wird der Client robuster gemacht.

**Änderung:**
- `VerifyEmail.tsx` bleibt primärer Token-Handler
- Optionaler Fallback: falls künftig doch ein Auth-Code-Link (`?code=`) auftaucht, kann der Client ihn sauber verarbeiten statt auf der Startseite zu enden
- Erfolg nach Verifizierung klar anzeigen und Session sauber aktualisieren

**Betroffene Dateien:**
- `src/pages/VerifyEmail.tsx`
- ggf. `src/pages/Index.tsx` oder zentrale Routing-Logik in `src/App.tsx`

#### 3. Signup-Konfiguration bereinigen
Der Signup nutzt aktuell noch `emailRedirectTo: ${window.location.origin}/`, was bei eventuellen nativen Auth-Mails auf die Startseite zeigt.

**Änderung:**
- Redirect-Konfiguration so anpassen, dass sie nicht mehr auf `/` zurückfällt
- Damit wird der Flow auch bei Nebenfällen nicht wieder auf die Homepage umgebogen

**Betroffene Datei:**
- `src/hooks/useAuth.tsx`

#### 4. Aktivierungs-/Werbemails erst nach Verifizierung senden
Die Activation-/Trial-Mails sollen nicht vor bestätigter E-Mail-Adresse rausgehen.

**Änderung:**
- `process-activation-emails` nur noch für Nutzer ausführen, deren E-Mail verifiziert ist
- Dazu die bestehende Verifizierungs-Info (`profiles.email_verified`) als Filter verwenden

**Betroffene Datei:**
- `supabase/functions/process-activation-emails/index.ts`

### Technische Details
- Keine neue Tabelle nötig
- Keine Migration nötig
- Edge Functions müssen nach der Änderung neu deployt werden
- Bestehende Verifizierungstoken können veraltet bleiben, deshalb wird danach mit einer frischen Registrierung bzw. frischem Resend-Link getestet

### Test nach Umsetzung
1. Test-User frisch registrieren
2. Prüfen, dass in der Mail der Link auf `useadtool.ai/verify-email?...` zeigt
3. Link anklicken
4. Erwartung:
   - Verifizierungsseite öffnet sich
   - Erfolgsmeldung erscheint
   - Nutzer gilt danach als bestätigt
5. Prüfen, dass vor der Bestätigung keine Aktivierungs-/Trial-Werbemail mehr kommt
6. Danach einmal kompletten Flow end-to-end erneut testen
