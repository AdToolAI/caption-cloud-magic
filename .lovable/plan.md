

## Plan: Edge Functions deployen + Logging fixen

### Diagnose

| Problem | Ursache | Fix |
|---|---|---|
| Webhook → 404 NOT_FOUND | `resend-webhook` Function nicht deployed ODER `verify_jwt=true` blockt | Function explizit deployen + `verify_jwt=false` setzen |
| `email_send_log` leer trotz erfolgreicher Sends | `_shared/email-send.ts` ist nur ein Modul — Funktionen die es importieren wurden evtl. seit der Wrapper-Einführung nicht redeployed | Alle Mail-sendenden Functions redeployen |

### Schritt 1: `supabase/config.toml` ergänzen

`verify_jwt = false` für `resend-webhook` setzen — Resend kann keinen JWT mitschicken, Authentizität läuft über die Svix-HMAC-Signatur (bereits im Code implementiert).

### Schritt 2: Edge Functions deployen

Die folgenden Functions deployen, damit alle den neuen Wrapper aktiv haben:
- `resend-webhook` (kritisch — 404 fixen)
- `send-verification-email` (damit Bounce-Test funktioniert)
- `send-password-reset-email`
- `send-support-ticket`
- alle weiteren `send-*-email` Functions die existieren

### Schritt 3: End-to-End-Test

1. Im Resend-Dashboard auf das fehlgeschlagene `email.bounced`-Event klicken → **„Replay"** → Webhook nochmal feuern lassen
2. Ich prüfe parallel:
   - Logs der `resend-webhook` Edge Function → muss `[resend-webhook] suppressed (bounce): bounced+test1@resend.dev` zeigen
   - `SELECT * FROM email_suppression_list` → muss neuen Eintrag haben
   - `SELECT * FROM email_send_log ORDER BY created_at DESC LIMIT 10` → muss den ursprünglichen `sent`-Eintrag zeigen
3. Falls grün → Re-Send-Block-Test: nochmal Signup mit gleicher Adresse → Log muss `status='suppressed'` zeigen

### Schritt 4: Aufräumen

Falls `email_send_log` immer noch leer bleibt obwohl Functions neu deployed wurden, prüfe ich ob die Functions, die Mails senden, tatsächlich den neuen `sendEmail`-Wrapper benutzen oder noch direkt `resend.emails.send()` aufrufen — und migriere die letzten Hold-Outs.

### Was du tun musst

Nichts. Sobald du den Plan freigibst, mache ich alles selbst — Config setzen, deployen, Replay triggern (bzw. dich kurz bitten den Replay-Button im Resend-Dashboard zu klicken), Datenbank checken.

