## Ziel

Den Pro-Plan neu bepreisen:

- **Regulärer Preis:** 29,99 €/Monat (statt aktuell 19,99 €)
- **Standard-Promo (alle Neukunden):** 14,99 €/Monat für die ersten **3 Monate**, danach 29,99 €
- **Founders-Deal (erste 1000 Nutzer):** 14,99 €/Monat für **24 Monate**, danach 29,99 €

Nach Slot 1000 läuft automatisch nur noch die 3-Monats-Promo.

---

## Was sich für den Nutzer ändert

- Auf der Landing-Page und `/pricing` steht zukünftig: ~~29,99 €~~ **14,99 €/Monat**, mit Hinweis-Badge:
  - Wenn noch Founders-Slots frei sind: „Founders-Deal — 24 Monate zu 14,99 €. Noch X von 1000 Plätzen frei."
  - Wenn ausverkauft: „Launch-Aktion — 14,99 € für 3 Monate, danach 29,99 €."
- Bei Klick auf „Pro abonnieren" wird automatisch der passende Stripe-Coupon angewendet (24M oder 3M), abhängig davon, ob noch Founders-Slots verfügbar sind.
- Bestehende Pro-Abos werden **nicht angetastet** (kein Preis-Update auf laufenden Subscriptions).

---

## Umsetzung (technisch)

### 1. Stripe (per Tool-Calls in Build-Mode)

a) **Neuer Pro-Preis** in Stripe anlegen (€29,99/Monat, recurring) auf bestehendem Produkt `prod_UOG4wbiQjDONAj` → ergibt neue `price_…`-ID für EUR. Analog für USD ($29,99).

b) **Zwei Coupons** anlegen:
- `PRO-FOUNDERS-24M`: amount_off **15,00 €**, duration `repeating`, duration_in_months **24**
- `PRO-LAUNCH-3M`: amount_off **15,00 €**, duration `repeating`, duration_in_months **3**

(15 € Rabatt auf 29,99 € ≈ 14,99 €. Sauberer als percent_off, da exakter Endpreis.)

### 2. Datenbank — Founders-Slot-Tracking

Neue Tabelle `pro_founders_slots`:

```text
id              uuid pk
user_id         uuid unique (auth.users)
stripe_sub_id   text
claimed_at      timestamptz default now()
```

Plus DB-Funktion `claim_founders_slot(user_id)` mit `SELECT count(*) < 1000 FOR UPDATE`-Logik (atomar, race-condition-safe). Gibt `true/false` zurück.

RLS: nur Service-Role schreibt, jeder authentifizierte User darf eigenen Eintrag lesen.

Plus public RPC `get_founders_slots_remaining()` → `1000 - count(*)` für Live-Counter auf Landingpage (kein Auth nötig, security definer).

### 3. Code-Änderungen

**`src/config/pricing.ts` & `src/config/stripe.ts`:**
- Pro-Preis von `19.99` auf `29.99` setzen
- Neue `priceId` für €29,99 eintragen
- Coupon-IDs als Konstanten exportieren (`FOUNDERS_COUPON_ID`, `LAUNCH_COUPON_ID`)

**`supabase/functions/create-checkout/index.ts`:**
- Vor Checkout-Session: `claim_founders_slot()` aufrufen
- Wenn `true` → `discounts: [{ coupon: FOUNDERS_COUPON_ID }]` an Stripe übergeben
- Wenn `false` → `LAUNCH_COUPON_ID` (3-Monats-Promo)
- Bei erfolgreicher Subscription-Erstellung: `pro_founders_slots`-Eintrag mit `stripe_sub_id` updaten
- Bei Checkout-Abbruch: Slot wieder freigeben (Cleanup über `stripe-webhook` bei `checkout.session.expired`)

**`src/components/landing/PricingSection.tsx` + `src/pages/Pricing.tsx`:**
- Anzeige: ~~29,99 €~~ **14,99 €/Monat**
- Neuer Live-Badge-Komponente `FoundersSlotBadge`, holt Slots-Counter alle 60s via RPC
- Texte: „Noch X/1000 Founders-Plätze — 14,99 € für 24 Monate" bzw. „Launch-Aktion: 14,99 € für 3 Monate"

**`src/lib/intro.ts`:**
- Alte `START-BASIC` / `START-ENT` Logik bleibt unangetastet (ist für andere Pläne)
- Neue Helper `getProPromoLabel(slotsRemaining)` für UI-Texte

### 4. i18n

Neue Keys in `src/lib/translations.ts` (DE/EN/ES):
- `landing.pricing.foundersBadge` — „Noch {count}/1000 Founders-Plätze"
- `landing.pricing.foundersDescription` — „14,99 € für 24 Monate, danach 29,99 €"
- `landing.pricing.launchPromo` — „14,99 € für 3 Monate, danach 29,99 €"
- `landing.pricing.regularPrice` — „Regulär 29,99 €/Monat"

---

## Was NICHT angefasst wird

- Basic-Plan (14,95 €) und Enterprise-Plan (69,95 €) bleiben unverändert
- Bestehende Pro-Subscriptions (alte 19,99 €) bleiben gültig — keine Migration
- `check-subscription`-Funktion: keine Änderung nötig (liest weiterhin Product-ID)

---

## Offene Frage

Soll der **Founders-Deal nach 24 Monaten automatisch auf 29,99 €** hochlaufen (Standard-Stripe-Verhalten bei `duration: repeating`) oder willst du die Founders danach auf einem anderen, dauerhaft vergünstigten Preis halten? Aktueller Plan = automatisch auf 29,99 €. Sag Bescheid, falls anders.

Wenn der Plan passt, **approve** ich's und baue es in einem Rutsch (Stripe-Setup → Migration → Edge-Function → Frontend).
