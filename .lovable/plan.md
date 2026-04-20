

## Ziel
**Smart In-App Upgrade-Prompts** während des aktiven Trials & für Free/Basic-User. Höhere Conversion als Email-only durch kontextbezogene Trigger und 1-Klick-Checkout mit `TRIAL20` Coupon.

## Status Quo (Code-Inspection)
- ✅ `useUpgradeTrigger` Context existiert bereits (mit Cooldown-Logik je Source)
- ✅ `UpgradeMount` mit 3 Watchern (`CreditThresholdWatcher`, `StreakMilestoneUpsellWatcher`, `UsageRecommendationWatcher`)
- ✅ `useFeatureGate` Hook für Feature-Walls
- ✅ `SmartUpgradeModal` als zentrales Modal
- ✅ URL-Coupon-System (`/pricing?coupon=TRIAL20`) bereits funktional
- ✅ `useTrialStatus` Hook liefert `daysRemaining`, `inGracePeriod`
- ❌ **Fehlt**: Trial-spezifische Trigger (Day 7/10/13)
- ❌ **Fehlt**: `TRIAL20` Stripe Coupon
- ❌ **Fehlt**: Feature-Discovery-Tracking (z. B. "3. Mal Director's Cut genutzt")

## Architektur — was neu hinzukommt

### 1. Stripe Coupon `TRIAL20`
20% Rabatt auf ersten Monat (forever, da Trial-User noch nie gezahlt haben).
Promotion-Code `TRIAL20` für URL-Auto-Apply.

### 2. Neuer Watcher: `TrialUpgradeWatcher`
Triggert während aktivem Trial an strategischen Punkten:
- **Day 7** (Halbzeit): "Du nutzt das System aktiv — sichere dir 20% auf Pro"
- **Day 10**: "Noch 4 Tage Enterprise-Trial — danach automatisches Downgrade"
- **Day 13**: "Letzter Tag! Verliere keine Funktionalität — jetzt mit `TRIAL20`"
- Während Grace-Period: "Konto wird in X Tagen pausiert — jetzt 20% sparen"
- Suppression: max. 1 Prompt pro 48h (separater Cooldown), Skip wenn schon konvertiert

### 3. Neuer Watcher: `FeatureDiscoveryWatcher`
Tracked Power-Feature-Nutzung in `localStorage` + DB-Counter:
- Director's Cut, Sora Long-Form, Video Composer → nach 3. Nutzung Modal
- "Du nutzt Director's Cut intensiv — Pro gibt dir unbegrenzte Renders"
- Tabelle `feature_usage_events` (user_id, feature_key, count, last_used_at)

### 4. SmartUpgradeModal: Trial-Variant erweitern
Neue Variant-Texte für Source `trial_progress`:
- Headline je nach Tag (7/10/13/grace)
- Coupon-Code-Banner: "Deine Vergünstigung: TRIAL20 (20% Rabatt) — 1 Klick zum Checkout"
- CTA-Link führt zu `/pricing?coupon=TRIAL20&plan=pro`
- Tracking: `upgrade_prompt_shown` mit `trial_day` Metadata

### 5. Conversion-Tracking
Neue Spalte in `profiles`: `upgrade_prompts_dismissed JSONB DEFAULT '{}'`
Format: `{"trial_progress_day7": "2026-04-22T...", "feature_discovery_directors_cut": "..."}`
Verhindert wiederholtes Zeigen nach Dismiss.

PostHog Events:
- `upgrade_prompt_shown` (mit source, trial_day, recommended_plan)
- `upgrade_prompt_clicked` (CTA → Pricing)
- `upgrade_prompt_dismissed`
- `upgrade_completed_via_trial_prompt` (Stripe-Webhook setzt Flag)

## Dateien

### Neu
1. `src/components/upgrade/TrialUpgradeWatcher.tsx` — Day-7/10/13/grace Trigger
2. `src/components/upgrade/FeatureDiscoveryWatcher.tsx` — Power-Feature-Counter
3. `src/lib/featureUsageTracker.ts` — Helper für `trackFeatureUsage(feature_key)`
4. `supabase/migrations/...sql` — `feature_usage_events` Tabelle + `upgrade_prompts_dismissed` Spalte

### Edit
1. `src/components/upgrade/UpgradeMount.tsx` — 2 neue Watcher mounten
2. `src/components/upgrade/SmartUpgradeModal.tsx` — Trial-Progress-Variant + Coupon-Banner
3. `src/hooks/useUpgradeTrigger.tsx` — Neue Sources `trial_progress` + `feature_discovery`
4. `src/lib/translations.ts` — i18n-Keys für Trial-Modal-Variants (DE/EN/ES)
5. Power-Feature-Komponenten (Director's Cut, Sora, Composer) — `trackFeatureUsage()` Aufruf

### Stripe (via Tool)
1. Coupon `TRIAL20` erstellen (20% off, forever, applies to subscriptions)
2. Promotion-Code `TRIAL20` aktivieren

## Was NICHT gebaut wird
- ❌ Kein neues Pricing-Modal (nutzt bestehende Pricing-Page mit `?coupon=`)
- ❌ Keine Stripe-Tax-Änderung
- ❌ Kein Cancel-Funnel (das wäre Option C)
- ❌ Keine Änderung an `useTrialStatus` (Lese-Zugriff reicht)

## Edge Cases
- **User dismissed Day 7 → Day 10 zeigt erneut**: OK, neuer Anlass
- **Trial-User zahlt bereits**: `currentPlan !== 'free'` UND `trial_status === 'converted'` → keine Prompts
- **Grace-Period überlappt mit Day 13**: Grace-Variant gewinnt (akuter)
- **Feature-Discovery + Trial-Progress gleichzeitig**: Trial-Cooldown (48h) verhindert Doppel-Show

## Reihenfolge (~75 Min)
1. Stripe Coupon `TRIAL20` erstellen
2. Migration: `feature_usage_events` + `upgrade_prompts_dismissed`
3. `TrialUpgradeWatcher` + Source `trial_progress` in Context
4. `FeatureDiscoveryWatcher` + `featureUsageTracker.ts`
5. `SmartUpgradeModal` Trial-Variant + Coupon-Banner
6. `UpgradeMount` erweitern + i18n-Keys
7. `trackFeatureUsage()` in 3 Power-Features einbauen
8. End-to-End Test (Trial-User auf Day 7 setzen → Modal triggern → Pricing mit Coupon)

