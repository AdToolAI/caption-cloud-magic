

## Ziel
Statt am Tag 15 sofortiger Pause → 3-Tage Grace-Period mit verstärkter Warnung, dann erst Pause am Tag 18.

## Änderungen

### 1. `useTrialStatus` Hook erweitern
Neuer Status-Wert `grace` + Felder:
- `inGracePeriod: boolean` — true wenn `trial_ends_at` in Vergangenheit, aber `< trial_ends_at + 3 days`
- `graceDaysRemaining: number` — Tage bis Pause (0–3)

Logik:
- `now < trial_ends_at` → `active`, Banner zeigt Trial-Restzeit
- `trial_ends_at <= now < trial_ends_at + 3d` → `grace`, Banner zeigt "Trial endet in X Tagen — jetzt upgraden"
- `now >= trial_ends_at + 3d` AND keine Subscription → Pause (via Edge Function gesetzt)

### 2. `check-trial-status` Edge Function anpassen
Aktuelle Query: `trial_ends_at < now()` → pausiert sofort.
Neue Query: `trial_ends_at < now() - INTERVAL '3 days'` → pausiert erst nach Grace-Period.

Zusätzlich: Während der Grace-Period bleibt:
- `trial_status = 'active'` (User hat noch Zugriff!)
- `account_paused = false`
- `plan_code = 'enterprise'` (volle Funktionalität)

Erst nach Grace-Period:
- `trial_status = 'expired'`
- `account_paused = true`
- `plan_code = 'free'` + Wallet auf 0

### 3. `TrialBanner` 3 Visual States
- **Normal** (>3 Tage): Gold, Sparkles-Icon, "X Tage Enterprise-Trial verbleibend"
- **Urgent** (≤3 Tage Trial): Rot/Destructive, Clock-Icon, "Nur noch X Tage!"
- **Grace** (Trial vorbei, in 3-Tage-Grace): Stark pulsierend rot, AlertTriangle-Icon, "⚠ Trial abgelaufen — Konto wird in X Tagen pausiert"

### 4. Grace-Period Reminder-Email (optional, gleiche Edge Function)
Am ersten Tag der Grace-Period (Day 15): Email "Dein Trial ist abgelaufen — du hast noch 3 Tage Zugriff" mit Pricing-CTA. Verhindert dass User unbemerkt pausiert wird.

Tracking via neuer JSONB-Spalte `grace_email_sent_at` ODER einfacher: in `activation_emails_sent` JSONB einen Key `grace_warning` setzen.

### 5. i18n-Keys ergänzen
Neue Keys (DE/EN/ES):
- `trial.graceTitle` — "Trial abgelaufen — Grace-Period aktiv"
- `trial.graceBanner` — "Konto wird in {days} Tagen pausiert"
- `trial.graceCta` — "Jetzt upgraden & Pause vermeiden"

## Was NICHT geändert wird
- ❌ `handle_new_user` (Trial-Start unverändert: 14 Tage)
- ❌ `AccountPausedGate` (greift weiterhin nur bei `account_paused=true`, also nach Grace)
- ❌ Cron-Schedule (bleibt täglich 09:00 UTC)

## Dateien
1. `supabase/functions/check-trial-status/index.ts` — Query + Email-Logik
2. `src/hooks/useTrialStatus.ts` — Grace-Period-Berechnung
3. `src/components/trial/TrialBanner.tsx` — 3rd visual state
4. `src/lib/translations.ts` — 3 neue Keys × 3 Sprachen

Aufwand: ~25 Min, keine DB-Migration nötig.

