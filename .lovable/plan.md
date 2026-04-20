

## Ziel
Coupon-Code aus URL (`/pricing?coupon=WINBACK20`) automatisch auf der Pricing-Page einlesen, sichtbar als "applied" Banner anzeigen und beim Stripe-Checkout mitschicken.

## Status Quo (gefunden via Code-Inspection)
- ✅ `PromoCodeInput.tsx` existiert bereits (manuelle Eingabe + `validate-promo-code` Edge Function)
- ✅ `validate-promo-code` Edge Function existiert (prüft DB-Tabelle `promo_codes`)
- ✅ `create-checkout` Edge Function akzeptiert bereits `promoCode` Parameter und übergibt ihn als Stripe `promotion_code` (siehe `sessionOptions.discounts`)
- ❌ Win-Back Coupon `WINBACK20` existiert nur in **Stripe** (Coupon `p4EYOZC0`), NICHT in unserer `promo_codes` DB-Tabelle
- ❌ Pricing-Page liest den `?coupon=` Query-Param aktuell nicht aus

## Architektur-Entscheidung
Win-Back-Coupons (`WINBACK20`) sind **Stripe-native** Promotion Codes — sie müssen NICHT die `validate-promo-code` Edge Function durchlaufen (die ist für Affiliate-Codes aus unserer DB). Stripe validiert den Code beim Checkout selbst.

→ **Lösung**: URL-Coupon wird direkt durchgereicht (skip DB-Validation) und an `create-checkout` übergeben. Stripe lehnt ungültige Codes mit klarer Fehlermeldung ab.

## Implementierungsschritte

### 1. URL-Param Reader Hook
Neuer Hook `useUrlCoupon()`:
- Liest `?coupon=` aus URL beim Mount
- Speichert in `sessionStorage` (überlebt Navigation innerhalb Pricing-Flow)
- Liefert `{ couponCode, clearCoupon }`

### 2. Pricing-Page Integration
In der bestehenden Pricing-Page (`src/pages/Pricing.tsx` oder ähnlich — muss noch lokalisiert werden):
- Hook einbinden
- Wenn `couponCode` vorhanden: Banner oben anzeigen ("🎉 Coupon WINBACK20 aktiv — 20% Rabatt für 3 Monate")
- Banner mit "Entfernen"-Button (clearCoupon)
- Beim Klick auf "Plan wählen" → `couponCode` an Checkout-Aufruf weitergeben

### 3. Checkout-Aufruf erweitern
Wo aktuell `supabase.functions.invoke('create-checkout', { body: { priceId } })` aufgerufen wird:
- `promoCode` aus URL/sessionStorage hinzufügen
- Edge Function bekommt es bereits ab (kein Backend-Change nötig!)

### 4. Email-Link Format bestätigen
Im Win-Back Email Template (`templates.ts`) sicherstellen, dass Day-30 Link auf `/pricing?coupon=WINBACK20` zeigt (falls noch nicht der Fall).

### 5. Banner-Design
James-Bond-2028 Stil: Gold (`#F5C76A`) Akzent, Glassmorphism, mit Check-Icon. Lokalisiert (DE/EN/ES).

## Was NICHT gebaut wird
- ❌ Keine neue DB-Tabelle (Stripe ist Source of Truth für `WINBACK20`)
- ❌ Keine Änderung an `validate-promo-code` (bleibt für Affiliate-Codes)
- ❌ Keine Änderung an `create-checkout` Edge Function (akzeptiert `promoCode` bereits)

## Aufwand
~30-40 Min (1 Hook + 1 Banner-Component + Pricing-Page Integration + 3 Übersetzungs-Keys)

## Reihenfolge
1. Pricing-Page Datei lokalisieren & Checkout-Call-Stelle finden
2. `useUrlCoupon` Hook erstellen
3. `CouponBanner` Component erstellen
4. Pricing-Page integrieren
5. i18n-Keys hinzufügen (DE/EN/ES)
6. Email-Template-Link verifizieren

