# Email-Pipeline Audit — Stand 14.07.2026

## Was aktuell existiert (Ist-Zustand)

**Zwei parallele Sendewege — funktioniert, aber unsauber:**

| Weg | Absender | Genutzt für |
|---|---|---|
| Lovable Emails (managed, `notify.useadtool.ai` verifiziert ✅) | `auth-email-hook` → Queue | Signup / Recovery / Magic-Link / Invite / Email-Change / Reauth |
| Direkt Resend über `_shared/email-send.ts` | `support@`, `hello@`, `alerts@`, `notify@useadtool.ai` | Drip, Winback, Activation, Verify-Reminder, Support, Ticket-Resolved, Campaigns |

**Aktive Cron-Jobs (alle `active=true`):**
- `process-drip-emails-hourly` — stündlich (24h/72h/7d nach Signup)
- `process-activation-emails-daily` — 10:00 UTC
- `process-winback-emails-daily` — 11:00 UTC
- `process-verify-reminders-every-30min` — alle 30 min
- `process-push-reminders-hourly` — stündlich
- `calendar-1h-reminders`, `calendar-24h-reminders`

**Frequenz-Cap (`_shared/emailFrequency.ts`):**
- Global 3-Tage-Cap für Marketing-Klasse ✅ existiert bereits
- Bypass-Liste: alle Auth + Trial-Warnings + Support (`ticket_resolved`, `ticket_reply`, `invoice`, `receipt`)
- Kill-Switch über `system_config.email.marketing_paused`

**Beobachtete Aktivität letzte 14 Tage:** 2 Signups (beide zugestellt). Queue healthy, 0 Fehler.

---

## Gefundene Lücken

1. **`process-verify-reminders` respektiert den 3-Tage-Cap NICHT.** Läuft alle 30 min, ruft `sendEmail` direkt, kein `canSendMarketingEmail`-Check. Template `verify_reminder` ist auch nicht in der Bypass-Liste — d.h. es kann theoretisch mehrfach pro Tag senden, falls die Funktion Empfänger nicht selbst deduped. **Muss auditiert + hart auf ≥72h gecappt werden.**
2. **`process-drip-emails` cappt** (nutzt `canSendMarketingEmail`) — aber die Steps sind fix bei 24h / 72h / 7d. Der 24h-Step verletzt in Kombination mit `activation_day_0` (bypass) potenziell die Nutzer-Wahrnehmung „max alle 3 Tage".
3. **`activation_day_0`** ist im Cap ausgenommen (`stage !== 'day_0'` überspringt Check) — sendet direkt bei Signup zusätzlich zur Auth-Confirm-Mail. Zwei Mails am Tag 1.
4. **Support-Pfad OK**: `send-support-ticket` (User → Support-Inbox) + `notify-ticket-resolved` (Support → User) laufen beide über Resend + `sendEmail`, mit Bypass. DB-Trigger ruft `notify-ticket-resolved` idempotent (`resolved_notification_sent_at` Guard) ✅.
5. **Hybrid-Absender-Chaos**: Auth kommt von `notify.useadtool.ai` (Lovable-managed), Rest von `support@`/`notify@useadtool.ai` (Resend direkt, Root-Domain). Deliverability & DMARC-Alignment könnten leiden, weil `useadtool.ai` selbst kein von Lovable managed Sender ist — nur die Subdomain `notify.` ist verifiziert. **Muss verifiziert werden**, ob Root-Domain-SPF/DKIM sauber steht (sonst gehen `support@useadtool.ai`-Mails in Spam).
6. **`generate-email-campaign` + `send-email-campaign-test`** existieren — das sind Marketing-Bulk-Funktionen. Vor Launch prüfen, dass sie **nicht** ungewollt aktiv/schedulebar sind (Beta = keine Broadcasts).
7. **Keine zentrale Beta-Sperre**: `email.marketing_paused` Kill-Switch existiert, ist aber vermutlich auf `false`. Für die 3-Monate-Beta wäre eine sanfte Drossel (max 1 Mail pro 3 Tage über ALLE Kanäle) sicherer.

---

## Plan (Fix + Absicherung, kein Umbau)

### A) Frequenz-Cap härten (Priorität 1)

1. In `process-verify-reminders/index.ts` `canSendMarketingEmail`/`markMarketingEmailSent` einbauen (analog Winback) und Template-Name `verify_reminder` in eine **eigene** 3-Tages-Prüfung, nicht Bypass.
2. `activation_day_0` in `process-activation-emails` an den Cap koppeln — Ausnahme nur, wenn Auth-Signup-Mail bereits ≥ 1h alt. So keine Doppel-Salve am Tag 1.
3. `canSendMarketingEmail` erweitern: zusätzlich `email_send_log` der letzten 3 Tage nach `recipient_email` prüfen (Cross-Function-Cap statt nur `profiles.last_marketing_email_at`). Robuster wenn irgendwo `markMarketingEmailSent` vergessen wird.

### B) Beta-Modus einführen

4. Neuer Config-Key `email.beta_mode = true` bis 26.10.2026 (Beta-Ende).
5. In `emailFrequency.ts`: wenn `beta_mode`, dann `MIN_INTERVAL_DAYS = 3` bleibt, aber **Winback komplett deaktivieren** (Winback-Job pausieren) — kein Sinn während Beta.
6. `email.marketing_paused = false`, aber Broadcast-Endpunkte (`generate-email-campaign`, `send-email-campaign-test`) mit Guard versehen der bei `beta_mode` 403 zurückgibt.

### C) Deliverability

7. DNS-Check: prüfen, ob `useadtool.ai` (Root) SPF/DKIM/DMARC für Resend gesetzt hat. Falls nein → alle direkten Resend-Sends auf `notify.useadtool.ai` umschalten (`sendEmail` FROM-Konstanten ändern), damit alles über die verifizierte Subdomain läuft. Reply-To bleibt `support@useadtool.ai`.
8. Ein-Klick-Unsubscribe (`List-Unsubscribe`-Header) in `email-send.ts` verifizieren — Compliance & Postbank/Gmail 2024-Regeln.

### D) Support-Pipeline verifizieren

9. Testflow: Ticket erstellen → Bestätigung → Ticket auf `resolved` setzen → `notify-ticket-resolved` per DB-Trigger. Idempotenz + Sprache (DE/EN/ES) prüfen.
10. `SUPPORT_INBOX = info@useadtool.ai` gegen tatsächlich aktives Postfach abgleichen.

### E) Monitoring vor Launch

11. Simple Admin-Query dokumentieren (SELECT auf `email_send_log` mit DISTINCT ON message_id) für tägliches Delivery-Monitoring. Optional: Admin-Panel „Email-Health" (out of scope für Launch, Post-Launch).
12. Alerting: wenn `email_send_log` Status `dlq` oder `failed` > 5 in 1h → Slack/Alert an `alerts@useadtool.ai`.

---

## Technische Details

- Betroffene Dateien: `supabase/functions/_shared/emailFrequency.ts`, `supabase/functions/_shared/email-send.ts`, `process-verify-reminders/index.ts`, `process-activation-emails/index.ts`, `process-winback-emails/index.ts` (nur pausieren), `generate-email-campaign/index.ts`, `send-email-campaign-test/index.ts`.
- Neue Migration nicht nötig — nur `system_config`-Insert (`email.beta_mode = true`, `email.winback_paused = true`).
- Winback pausieren: Cron-Job `process-winback-emails-daily` mit `cron.alter_job(..., active := false)`.
- Kein Umbau der Lovable-Emails-Auth-Pipeline (läuft sauber, Queue healthy).

---

## Deine Freigabe für

1. **Verify-Reminder** — 30-Min-Cron auf 3-Tage-Cap zwingen (aktuell ungebremst). OK?
2. **Winback während Beta AUS** — 3 Monate lang keine "Wir vermissen dich"-Mails. OK?
3. **Alle Nicht-Auth-Mails auf `notify.useadtool.ai`** umziehen (statt Root-Domain-Absender) für saubere Deliverability. OK?
4. **Kampagnen-Endpunkte** hart blocken solange Beta läuft. OK?

Sag Bescheid — dann setze ich A–E in einem Rutsch um.
