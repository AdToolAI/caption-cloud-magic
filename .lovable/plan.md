

## Plan: Conversion absichern — Verify-Reminder + Funnel-Dashboard

Wir bauen drei Bausteine, die zusammen die Conversion vom Signup bis zum ersten Video sichtbar und steuerbar machen:

### Baustein 1: Verify-Reminder-Mail nach 24h

**Neue Edge Function `process-verify-reminders`**
- Läuft stündlich per Cron
- Findet alle User, die:
  - Vor **24–72 Stunden** registriert haben (`created_at` zwischen -72h und -24h)
  - **Noch nicht verifiziert** sind (`email_verified = false`)
  - Noch **keinen Reminder** bekommen haben (neues Feld `verify_reminder_sent_at IS NULL`)
- Sendet **eine** freundliche Reminder-Mail in der jeweiligen Sprache (DE/EN/ES) mit:
  - Klarer CTA „E-Mail jetzt bestätigen"
  - Frischer Resend-Link über bestehende `send-verification-email`-Function (also ein neuer 24h-Token)
  - Hinweis „Falls du dich umentschieden hast, ignoriere diese Mail einfach"
- Markiert `verify_reminder_sent_at = now()` → Idempotenz, jeder User bekommt **maximal einen** Reminder

**DB-Migration:**
- Spalte `profiles.verify_reminder_sent_at timestamptz NULL`
- Cron-Job: `*/30 * * * *` (alle 30 Min)

### Baustein 2: Activation-Drip pausieren bis verifiziert

Bereits durch letzte Änderung gefiltert (`email_verified = true`). Zusätzlich:
- **Day-0-Mail** wird erst getriggert, sobald die Verifizierung erfolgt ist (nicht ab `created_at`)
- Dazu nehmen wir als Anker `email_verified_at` statt `created_at` — neue Spalte oder vorhandenes Feld nutzen

**DB-Migration:**
- Spalte `profiles.email_verified_at timestamptz NULL`
- `verify-email`-Function setzt diese beim erfolgreichen Verify
- `process-activation-emails` nutzt `email_verified_at` als Stage-Anker statt `created_at`

### Baustein 3: Conversion-Funnel-Dashboard im Admin

**Neuer Tab im Admin (`/admin`):** „Conversion Funnel"

Zeigt für die letzten 30 Tage als Bento-Grid (James-Bond-2028-Stil):

```text
┌─────────────────────────────────────────────────────────────┐
│  Signups        │  Verified       │  1. Video       │ Trial→Paid │
│   234           │   189 (80.7%)   │   142 (75.1%)   │  18 (12.6%)│
│   ↑ 12 vs 7d    │   ↑ 4.2pp       │   ↓ 1.8pp        │  ↑ 0.9pp   │
└─────────────────────────────────────────────────────────────┘
```

- **Stufen**: Signup → E-Mail bestätigt → 1. AI-Video erstellt → Upgrade zu Paid
- **Drop-off-Raten** pro Stufe + Vergleich zu vorherigem Zeitraum (7d/30d)
- **Avg. Time-to-Verify** und **Avg. Time-to-First-Video**
- **Reminder-Wirksamkeit**: „Von X gesendeten Remindern haben Y verifiziert (Z %)"
- Filter: Heute / 7 Tage / 30 Tage

**Datenquellen:**
- `profiles` (created_at, email_verified, email_verified_at, verify_reminder_sent_at, trial_status, plan_code)
- `video_creations` + `ai_video_generations` für „1. Video"-Event (frühestes `created_at` pro `user_id`)
- Aggregation über neue Read-Only-RPC `get_conversion_funnel(days int)` für Performance

### Geänderte/neue Dateien

**Neu:**
- `supabase/functions/process-verify-reminders/index.ts`
- `supabase/functions/process-verify-reminders/templates.ts` (DE/EN/ES Reminder-Mail)
- `src/components/admin/ConversionFunnel.tsx`
- DB-Migration: 2 neue Spalten + RPC + Cron-Job

**Edit:**
- `supabase/functions/verify-email/index.ts` → setzt `email_verified_at`
- `supabase/functions/process-activation-emails/index.ts` → Anker auf `email_verified_at`
- `src/pages/Admin.tsx` → neuer Tab „Conversion Funnel"

### Test nach Umsetzung

1. Test-Signup mit Wegwerf-Mail → 24h zurückdatieren → Reminder muss kommen
2. Verifizierung durchklicken → `email_verified_at` muss gesetzt sein
3. Day-0-Activation-Mail erst NACH Verifizierung
4. Funnel-Dashboard zeigt 1/1/1/0 für den Test-User

### Technische Details

- Cron-Frequenz Reminder: alle 30 Min (kein Druck, aber zeitnah)
- Reminder-Token-Cooldown wird umgangen (Service-Function überschreibt vorhandenes Token mit frischer 24h-Lifetime)
- Funnel-Query: einzelne aggregierte SQL-Function statt 4 separate Queries → < 100ms Ladezeit
- Keine externen API-Keys nötig, alles über Resend (bereits konfiguriert)

