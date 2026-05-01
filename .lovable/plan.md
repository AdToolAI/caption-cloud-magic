## Problem

Im Stripe-Dashboard sind aktuell **zwei Pro-Produkte** sichtbar:

1. **"Pro Plan (Launch)"** (`prod_UOG4wbiQjDONAj`) — altes Produkt mit Preisen 29,99 € + 19,99 €
2. **"AdTool AI Pro"** (`prod_UREZAv0LG9vz1E`) — neues Produkt aus letztem Setup, **"Keine Preise"** sichtbar

Der neue €29,99-Preis (`price_1TSLxWDRu4kfSFxjEJNi8nGN`) wurde technisch erstellt und im Code verdrahtet, hängt aber am neuen Produkt — und wird im Dashboard offenbar nicht beim neuen Produkt gelistet (bzw. das neue Produkt zeigt fälschlich "Keine Preise"). Außerdem ist es unsauber, **zwei Pro-Produkte** parallel zu haben.

## Lösung

Wir konsolidieren auf **ein** Pro-Produkt und machen alle relevanten Preise + Coupons im Dashboard sichtbar.

### Schritt 1 — Stripe-Konsolidierung (per Edge-Function-Skript)

Ich baue ein einmaliges Setup-Skript, das im Stripe-Live-Konto:

1. **Altes Produkt `prod_UOG4wbiQjDONAj` ("Pro Plan (Launch)") als kanonisches Pro-Produkt behält** (umbenennen auf "AdTool AI Pro").
2. **Alten 19,99 €-Preis archiviert** (deactivate) — wird nicht mehr verwendet.
3. **Den 29,99 €-Preis am alten Produkt prüft/anlegt** und als `default_price` setzt → so ist er garantiert im Dashboard sichtbar.
4. **Zusätzlich einen sichtbaren 14,99 €-Promo-Preis** am gleichen Produkt anlegt (rein zur Dokumentation/Transparenz im Dashboard — Checkout läuft weiter über 29,99 € + Coupon, damit nach 3/24 Monaten automatisch auf 29,99 € hochläuft).
5. **Neues Produkt `prod_UREZAv0LG9vz1E` archiviert** (deactivate).
6. **Beide Coupons verifiziert** (`PRO-FOUNDERS-24M`, `PRO-LAUNCH-3M`) — falls fehlend, neu anlegen.

### Schritt 2 — Code auf altes Produkt zurückmappen

- `src/config/stripe.ts` & `src/config/pricing.ts` Pro-`productId` → `prod_UOG4wbiQjDONAj` (zurück), Pro-Preis-ID bleibt der neue €29,99-Preis (am alten Produkt).
- `supabase/functions/create-checkout` `PRO_PRICE_IDS` aktualisieren falls neue Price-ID entsteht.
- `getProductInfo` Mapping aufräumen.

### Schritt 3 — Verifikation

- Setup-Skript callen → JSON-Output zeigt: 1 aktives Pro-Produkt, 2 sichtbare Preise (29,99 € aktiv + default, 14,99 € als Promo-Anzeige), 2 aktive Coupons.
- Stripe-Dashboard-Check: Du bestätigst, dass **"AdTool AI Pro"** mit den sichtbaren Preisen 29,99 € (Standard) und 14,99 € (Promo) angezeigt wird.
- Checkout-Smoke-Test im Preview: Klick auf "Subscribe" → Stripe-Checkout sollte 29,99 € − 15,00 € Coupon = **14,99 €** zeigen.

## Technische Details

- Preise lassen sich in Stripe **nicht löschen**, nur archivieren (`active=false`). Das ist sauber und beeinflusst keine bestehenden Subscriptions.
- Das Setup-Skript ist **idempotent**: Bei erneutem Aufruf passiert nichts Doppeltes.
- Die zwei sichtbaren Preise (29,99 € + 14,99 €) machen das Dashboard transparent. Der tatsächliche Checkout nutzt aber **immer den 29,99 €-Preis + automatisch passenden Coupon** — sonst läuft die Subscription nach Ende der Promo-Periode nicht automatisch auf 29,99 € hoch.
- Founders-Slot-Logik (1000 Plätze) bleibt unverändert in `create-checkout` + `founders_signups`-Tabelle.

## Was nicht passiert

- Bestehende Subscriptions auf alten Preisen bleiben **unangetastet** (keine automatische Migration alter Kunden auf den neuen Preis).
- Webhook bleibt unverändert.

Nach Approval führe ich Schritt 1–3 in einem Rutsch aus.