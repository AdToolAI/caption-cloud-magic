

## Plan: Zentraler E-Mail-Wrapper + Suppression-System

Wir bauen die komplette Sende-Infrastruktur mit Bounce-Handling, Plain-Text-Fallback und Compliance-Headern. Resend bleibt der Provider, DNS ist bereits grün, DMARC läuft.

### 1. Datenbank-Migration

**Neue Tabelle `email_suppression_list`:**
- `email` (text, PK, lowercase)
- `reason` (`bounce` / `complaint` / `unsubscribe` / `manual`)
- `suppressed_at` (timestamptz, default now())
- `details` (jsonb, nullable) — z.B. Bounce-Type von Resend
- RLS: nur Service-Role darf lesen/schreiben

**Neue Tabelle `email_send_log`:**
- `id` (uuid, PK)
- `to_email` (text)
- `from_email` (text)
- `subject` (text)
- `template` (text) — z.B. `verify`, `activation_day_0`, `password_reset`
- `category` (text) — `transactional` / `marketing` / `system`
- `status` (text) — `sent` / `failed` / `suppressed`
- `resend_id` (text, nullable)
- `error` (text, nullable)
- `created_at` (timestamptz, default now())
- RLS: nur Service-Role + Admins lesen

### 2. Zentraler Wrapper `_shared/email-send.ts`

Eine Funktion `sendEmail(opts)` mit folgender Logik:

```text
input: { to, subject, html, template, category, language? }
  ↓
1. Adresse lowercasen + gegen email_suppression_list prüfen
   → Treffer? Log "suppressed", return { skipped: true }
2. Absender + Display-Name nach category wählen:
   - transactional → "AdTool AI <support@useadtool.ai>"
   - marketing    → "AdTool AI <hello@useadtool.ai>"
   - system       → "AdTool Alerts <alerts@useadtool.ai>"
3. Plain-Text aus HTML extrahieren (strip tags + entities)
4. Headers setzen:
   - Reply-To: support@useadtool.ai
   - List-Unsubscribe: <mailto:unsubscribe@useadtool.ai?subject=unsub:{to}>, <https://useadtool.ai/unsubscribe?email={to}>
   - List-Unsubscribe-Post: List-Unsubscribe=One-Click
   (nur für category=marketing)
5. resend.emails.send({ from, to, subject, html, text, headers, reply_to })
6. Ergebnis in email_send_log schreiben (sent oder failed)
```

### 3. Bounce-Webhook `resend-webhook`

Neue Edge Function ohne JWT-Verify:
- Empfängt POST mit `{ type, data: { email, ... } }` von Resend
- Bei `email.bounced` (hard) und `email.complained` → Insert in `email_suppression_list`
- Antwortet immer 200, damit Resend nicht retryt
- Optional: Webhook-Signing-Secret-Verify (`svix-signature`)

### 4. Refactor aller Mail-Funktionen

Jede Funktion ruft statt `resend.emails.send(...)` jetzt `sendEmail(...)` auf:

| Funktion | Category | Absender |
|---|---|---|
| `send-verification-email` | transactional | support@ |
| `send-password-reset-email` | transactional | support@ |
| `send-support-ticket` | transactional | support@ |
| `token-expiry-notifier` | transactional | support@ |
| `process-activation-emails` | marketing | hello@ |
| `process-verify-reminders` | marketing | hello@ |
| `process-drip-emails` | marketing | hello@ |
| `process-winback-emails` | marketing | hello@ |
| `check-trial-status` | marketing | hello@ |
| `monitoring-alerts` | system | alerts@ (statt resend.dev) |

### 5. Unsubscribe-Endpoint (Minimal-Variante)

Neue Edge Function `email-unsubscribe`:
- GET `/functions/v1/email-unsubscribe?email=xxx&token=yyy`
- Validiert Token (HMAC aus E-Mail + ENV-Secret) → verhindert Massen-Unsubscribe
- Trägt Adresse in Suppression-Liste mit `reason='unsubscribe'`
- Zeigt simple HTML-Bestätigung „Du wurdest abgemeldet"

Token wird im Wrapper beim Senden generiert und in den Unsubscribe-Link eingebaut.

### Geänderte/neue Dateien

**Neu:**
- DB-Migration (2 Tabellen + RLS)
- `supabase/functions/_shared/email-send.ts`
- `supabase/functions/resend-webhook/index.ts`
- `supabase/functions/email-unsubscribe/index.ts`

**Edit (10 Mail-Funktionen):** alle aus Tabelle oben

### Test nach Umsetzung

1. Test-Mail an Gmail → SPF/DKIM/DMARC = PASS in „Original anzeigen"
2. Marketing-Mail → „Liste abbestellen" erscheint oben in Gmail
3. Bounce-Test (`bounced@resend.dev`) → Eintrag in `email_suppression_list`
4. Erneuter Send an gleiche Adresse → Log = `suppressed`, Resend nicht aufgerufen
5. Klick auf Unsubscribe-Link → Bestätigungsseite + Eintrag in Liste

### Was du nach Code-Umsetzung manuell machen musst

1. **Resend-Webhook eintragen**: im Resend-Dashboard unter Webhooks die URL `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/resend-webhook` mit Events `email.bounced`, `email.complained` hinzufügen
2. **Webhook-Secret setzen**: Resend zeigt nach dem Anlegen einen Signing-Secret → in Lovable Cloud als Secret `RESEND_WEBHOOK_SECRET` hinterlegen (frage ich danach ab)
3. Optional: Postfächer/Aliase `support@`, `hello@`, `alerts@`, `unsubscribe@` als Empfänger einrichten

