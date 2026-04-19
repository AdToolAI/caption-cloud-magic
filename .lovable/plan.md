

## Status

`RESEND_API_KEY` ist als manueller Runtime-Secret schon in deinem Projekt vorhanden — perfekt, dann brauchen wir den Resend-Connector NICHT. Edge Functions können direkt mit dem Key gegen die Resend-API sprechen.

## Vereinfachter Plan: B1 Drip-Kampagne via Resend (direct API)

### Sender
`AdTool <notify@useadtool.ai>` (deine verifizierte Domain auf Resend)

### 1. DB-Migration
- Tabelle `drip_email_log` (`id`, `user_id`, `drip_step` 1/3/7, `sent_at`, `progress_at_send`, `status`)
- Unique-Index `(user_id, drip_step)` → strikte Idempotenz, kein Doppel-Send
- Spalte `profiles.drip_emails_enabled` BOOLEAN DEFAULT true
- Spalte `profiles.unsubscribe_token` UUID DEFAULT gen_random_uuid() UNIQUE

### 2. Edge Function `process-drip-emails`
- Cron-getriggert (stündlich via pg_cron)
- Findet User in Zeitfenstern: 24h±30min (Tag 1) / 72h±30min (Tag 3) / 7d±30min (Tag 7)
- Filter: `drip_emails_enabled = true`, kein Eintrag in `drip_email_log` für diesen Step
- Berechnet Progress aus 5 Tabellen (gleiche Logik wie `useGettingStartedProgress`)
- Threshold-Check: Tag 1 < 100%, Tag 3 < 60%, Tag 7 < 100%
- Lädt HTML-Template (Sprache aus `profiles.language`, Fallback EN)
- POST direkt an `https://api.resend.com/emails` mit `Authorization: Bearer ${RESEND_API_KEY}`
- Loggt nach `drip_email_log` (sent / failed / skipped)
- Optional: `?dry_run=true&user_id=<uuid>&step=1` für End-to-End-Test ohne DB-Log

### 3. Email-Templates (3× DE/EN/ES, inline-HTML)
Speicherort: `supabase/functions/_shared/drip-templates/`

| Tag | Subject (DE / EN / ES) | Inhalt |
|---|---|---|
| **1** | „Dein erstes Video wartet" / „Your first video is waiting" / „Tu primer video te espera" | Hero + CTA zum ersten offenen Step |
| **3** | „Noch X von 5 Schritten" / „X of 5 steps left" / „X de 5 pasos pendientes" | Inline-Progress-Bar + Step-Liste |
| **7** | „Letzte Erinnerung + Bonus" / „Last reminder + bonus" / „Último recordatorio + bono" | Trend-Beispiele + Upgrade-Hint |

Style: James-Bond-2028 Look (gold #F5C76A Akzente), aber **weißer Body** für Mail-Client-Kompatibilität. Jede Mail enthält Footer mit Unsubscribe-Link → `https://useadtool.ai/email-preferences?token={unsubscribe_token}`.

### 4. Pg_cron Schedule
Job stündlich (`0 * * * *`) → triggert `process-drip-emails` via `net.http_post` mit Service-Role-Key.

### 5. Frontend
- **Neue Route** `/email-preferences` (lokalisiert): liest `?token=` aus URL, zeigt Status + Toggle „Onboarding-Erinnerungen erhalten" + Sofort-Unsubscribe-Button
- **Neuer Toggle in `ProfileTab.tsx`**: „E-Mail-Erinnerungen" Switch (gleicher Endpunkt, schaltet `drip_emails_enabled`)

### 6. End-to-End-Test
Dry-Run-Aufruf für Tag 1, 3 und 7 → Mail landet in deinem Posteingang, ohne dass `drip_email_log` geschrieben wird. So sehen wir alle 3 Mails sofort.

## Aufwand
| Schritt | Zeit |
|---|---|
| DB-Migration | 10 min |
| 3 HTML-Templates × 3 Sprachen | 35 min |
| Edge Function `process-drip-emails` (mit Dry-Run) | 30 min |
| Pg_cron Job | 5 min |
| `/email-preferences` Page + Account-Toggle | 25 min |
| E2E-Test (Dry-Run für Tag 1/3/7) | 15 min |
| **Gesamt** | **~2h** |

## Was wir NICHT brauchen
- ❌ Resend-Connector (Direct API-Call mit existierendem Key reicht)
- ❌ Lovable-Email-Domain-Setup (Resend macht das)
- ❌ Connector-Gateway (kein OAuth-Refresh nötig)

## Nach Approval
1. Migration ausführen
2. Templates + Edge Function bauen
3. Pg_cron einrichten
4. Frontend (Preferences + Toggle)
5. Dry-Run für alle 3 Drip-Mails an deine Test-Adresse

