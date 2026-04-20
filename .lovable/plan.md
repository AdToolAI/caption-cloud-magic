

## Kontext
Smart In-App Upgrade-Prompts sind implementiert (Watcher, Modal, Coupon, Tracking). Stripe `TRIAL20` Coupon existiert (ID `xJBfKkra`), aber der **Promotion-Code** `TRIAL20` (für Auto-Apply via URL `?coupon=TRIAL20`) ist noch nicht angelegt — ohne diesen funktioniert die 1-Klick-Conversion nicht.

Außerdem fehlen einige naheliegende nächste Schritte für ein vollständiges Conversion-System.

## Empfohlene nächste Schritte (Reihenfolge nach Impact)

### 1. Stripe Promotion-Code `TRIAL20` aktivieren (BLOCKER, ~2 Min)
Ohne Promotion-Code erkennt Stripe Checkout den URL-Parameter `?coupon=TRIAL20` nicht und der Rabatt wird nicht angewendet — die gesamten neuen Prompts laufen ins Leere bzgl. Conversion.

- Promotion-Code `TRIAL20` an Coupon `xJBfKkra` koppeln
- `active: true`, ohne Ablaufdatum (oder optional `expires_at` 30 Tage)
- `max_redemptions` optional begrenzen (z. B. 500)

### 2. End-to-End-Verifikation der Trigger (~10 Min)
- Trial-User künstlich auf Day 7/10/13 setzen (DB: `trial_ends_at` zurückdatieren) → Modal triggert
- Power-Feature 3× öffnen (Director's Cut) → Discovery-Modal triggert
- Klick auf CTA → `/pricing?plan=pro&coupon=TRIAL20` → Coupon im Checkout sichtbar
- Dismiss → Cooldown greift (kein Re-Show innerhalb 48h / 72h)

### 3. Conversion-Tracking-Dashboard (Optional, ~30 Min)
Mini-Admin-Widget auf bestehender Admin-Page mit Metriken aus PostHog-Events:
- `upgrade_prompt_shown` pro Source (letzte 30 Tage)
- Conversion-Rate je Source (shown → clicked → completed)
- Top-performende Variant (halfway / ending_soon / last_day / grace)

### 4. Email-Backup für Trial-Day-7/13 (Optional, ~20 Min)
Edge-Function-Cron, der einmalig per Email nudged falls In-App-Prompt nicht gesehen wurde (Fallback-Channel für inaktive User). Nutzt Resend (bereits konfiguriert).

### 5. A/B-Test-Slot für Coupon-Höhe (Optional, später)
Vorbereitung für späteren Test `TRIAL20` vs. `TRIAL30` vs. kein Coupon — würde aber neue Coupons + Variant-Logik im Modal erfordern. Erst sinnvoll nach 100+ Conversions.

## Empfehlung
**Schritt 1 sofort + Schritt 2 direkt im Anschluss.** Schritte 3-5 als separate Folge-Tasks, da sie eigenständige Features sind.

Wenn du zustimmst, lege ich im nächsten Schritt:
1. Den Promotion-Code `TRIAL20` in Stripe an
2. Setze einen Test-Trial-User auf Day 13 (per SQL) und verifiziere das Modal in der Preview

