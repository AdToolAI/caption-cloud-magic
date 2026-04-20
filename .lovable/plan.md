

## Ziel
Zwei verbundene Module bauen:
1. **C3 Activation-Drip** — 4-Touch Email-Sequenz für neue Signups (Day 0/1/3/7)
2. **14-Tage Enterprise-Trial** — Neue User starten automatisch im Enterprise-Modus, danach Paywall-Gate

## Architektur-Überlegung

### Trial-System (kritischer Teil)
**Status Quo:**
- `handle_new_user()` Trigger erstellt Profile beim Signup
- `create_wallet_for_new_user()` initialisiert Wallet mit `plan_code='free'`, 100 Credits
- `check-subscription` Edge Function prüft Stripe + `profiles.plan` für Zugriff
- Enterprise = unlimited Credits, alle Features

**Neuer Flow:**
- Trigger setzt `plan_code='enterprise'` + `trial_ends_at = now() + 14 days` + `trial_status='active'`
- Wallet bekommt Enterprise-Credits (z.B. 5000 für Trial, nicht unlimited um Missbrauch zu vermeiden)
- `check-subscription` checkt zusätzlich Trial-Status:
  - Trial aktiv → Enterprise-Zugriff
  - Trial abgelaufen + keine Subscription → `account_paused = true`
- Neuer Hook `useTrialStatus()` zeigt Restzeit-Banner ("Noch 9 Tage Enterprise-Trial")
- Paywall-Gate Component blockt App-Zugriff wenn `account_paused = true`

**Wichtig:** Keine Stripe-Trials nutzen — wir bauen das DB-seitig, weil:
- Kein Kreditkarten-Zwang beim Signup (bessere Conversion)
- Volle Kontrolle über Pause-Logik
- Trial-Verlängerung möglich (z.B. Win-Back kann Trial reaktivieren)

### Activation-Drip
Analog zur bereits gebauten `process-winback-emails` Edge Function:
- Tägliches `pg_cron` (10:00 UTC)
- Queries auf `profiles.created_at` für Day 0/1/3/7 Cohorts
- Activity-Suppression: Wenn User in letzten 24h aktiv → Email skippen (außer Day 0)
- Templates lokalisiert (DE/EN/ES) im AdTool-Stil

## Implementierungsschritte

### Phase 1 — Datenbank (Migration)
Neue Spalten in `profiles`:
- `trial_status TEXT DEFAULT 'active'` ('active' | 'expired' | 'converted' | 'cancelled')
- `trial_ends_at TIMESTAMPTZ`
- `account_paused BOOLEAN DEFAULT false`
- `activation_emails_sent JSONB DEFAULT '{}'` (tracked: `{day0: timestamp, day1: timestamp, ...}`)

`handle_new_user()` Trigger erweitern:
- Setzt `plan_code='enterprise'`, `trial_ends_at=now()+14d`, `trial_status='active'`
- Wallet mit 5000 Trial-Credits initialisieren

### Phase 2 — Trial-Logik
- **Edge Function `check-trial-status`**: Tägliches `pg_cron` um 09:00 UTC
  - Findet User mit `trial_ends_at < now()` AND `trial_status='active'` AND keine aktive Subscription
  - Setzt `trial_status='expired'`, `account_paused=true`, `plan_code='free'`
  - Sendet "Trial abgelaufen" Email mit Pricing-Link
- **`check-subscription` erweitern**: Berücksichtigt Trial-Status, gibt `trial_active`, `trial_days_remaining`, `account_paused` zurück
- **Hook `useTrialStatus()`**: Liest Trial-Info aus profiles, liefert Status + Restzeit
- **Component `TrialBanner`**: Goldener Banner oben in Layout ("9 Tage Enterprise-Trial verbleibend") mit Upgrade-CTA
- **Component `AccountPausedGate`**: Wrapper um App-Routes, zeigt Paywall wenn `account_paused=true`

### Phase 3 — Activation-Drip Edge Function
`supabase/functions/process-activation-emails/index.ts`:
- **Day 0** (Sofort beim Signup, via `handle_new_user`-Trigger oder dediziert): Welcome + "Erstes Video erstellen" CTA
- **Day 1**: Wenn keine Asset-Erstellung → Tutorial-Video + "Brauchst du Hilfe?"
- **Day 3**: Wenn keine Social-Account-Verbindung → Connect-Reminder
- **Day 7**: Wenn inaktiv → "Trial halbzeit erreicht — vergiss deine Enterprise-Credits nicht"
- Suppression: `last_active_at` Check + `activation_emails_sent` JSONB
- Tägliches `pg_cron` 10:00 UTC

### Phase 4 — UI-Integration
- `TrialBanner` in `Layout.tsx` einfügen (sichtbar wenn `trial_status='active'`)
- `AccountPausedGate` um `<ProtectedRoute>` legen
- Pricing-Page erweitert: Bei `account_paused=true` → "Konto reaktivieren" Headline
- Account-Settings zeigt Trial-Restzeit + "Jetzt upgraden" Button

### Phase 5 — Email Templates
Neue Templates in `process-activation-emails/templates.ts`:
- 4 Activation-Touches × 3 Sprachen = 12 Templates
- 1 Trial-Expired Template × 3 Sprachen = 3 Templates
- AdTool-Branding (Gold #F5C76A, Dark BG)

### Phase 6 — Cron Jobs
2 neue `pg_cron` Jobs:
- `process-activation-emails-daily` @ 10:00 UTC
- `check-trial-status-daily` @ 09:00 UTC

## Was NICHT gebaut wird
- ❌ Keine Stripe-Trials (Kreditkarte beim Signup würde Conversion senken)
- ❌ Keine Daten-Löschung bei Pause (User behält alle Assets, kann nur nicht erstellen/posten)
- ❌ Kein Social-Account-Disconnect bei Pause (nur App-Zugriff blockiert)

## Edge Cases
- **Bestehende User**: Migration setzt `trial_status='converted'` für alle User mit aktiver Subscription, `trial_status='expired'` + `account_paused=false` für Free-User (damit kein bestehender Free-User plötzlich pausiert wird)
- **Win-Back-Coupon einlösen**: Wenn pausierter User über `?coupon=WINBACK20` zahlt → Auto-Reaktivierung via Stripe-Webhook
- **Subscription kündigen**: User behält Zugriff bis `current_period_end`, dann `account_paused=true`

## Reihenfolge (geschätzt ~2-3h)
1. DB-Migration (Spalten + Trigger-Update)
2. `check-trial-status` Edge Function + Cron
3. `useTrialStatus` Hook + `TrialBanner` + `AccountPausedGate`
4. `process-activation-emails` Edge Function + Templates + Cron
5. Pricing-Page Reactivation-Mode
6. End-to-End Test (neuer Signup → Banner sichtbar → Trial manuell auf abgelaufen setzen → Pause-Gate testen)

## Risiko-Hinweis
Das Pause-System ist eine **harte UX-Maßnahme**. Empfehlung: Statt sofortiger Komplettsperrung am Tag 15 → 3-Tage Grace-Period mit verstärktem Banner ("Trial endet in 3 Tagen"), dann Pause. Soll ich das so einbauen?

