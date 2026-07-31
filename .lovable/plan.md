## Ausgangslage (geprüft gegen das verbundene Stripe-Konto)

| Bereich | Code | Stripe live | Status |
| --- | --- | --- | --- |
| Abo (Frontend) | 19,99 € (`price_1TyHcA…`) | existiert, 19,99 €/Monat | falscher Preis |
| Abo (Server, `_shared/stripe-config.ts`) | `price_1SLqZy…` / `price_1TSLxW…` | **existiert nicht** | tot |
| Abo-Coupons `PRO-FOUNDERS-24M`, `PRO-LAUNCH-3M` | im Checkout verdrahtet | **existieren nicht** | falsch konzipiert + tot |
| Credit-Pakete 10/50/100/250 € | 8 Price-IDs `price_1SWO…` | **existieren nicht** | Credit-Kauf schlägt live fehl |
| Founders-Rabatt auf Credits | `FOUNDERS_VIDEO_20` in `ai-video-purchase-credits` | existiert, 20 % | korrekt, bleibt |

## Zielzustand

- **Ein Abomodell: 14,99 €/Monat**, ohne Rabatt, ohne Coupon.
- **Founders-Vorteil: 20 % auf jeden Credit-Kauf, 24 Monate** — bereits über `FOUNDERS_VIDEO_20` + `is_founder_active` umgesetzt, wird nur repariert und sauber kommuniziert.
- Pricing-Seite zeigt **nur 14,99 €**, kein Hinweis auf spätere Erhöhung.

## Schritte

**1. Stripe-Objekte anlegen**
- Neuer wiederkehrender Preis **14,99 €/Monat** auf Produkt `prod_UyE4edZ94ktyOt` (Beta-Basic); der 19,99-€-Preis wird deaktiviert. Laufende Abos bleiben unberührt.
- 8 neue Einmalpreise für die Credit-Pakete (10 / 50 / 100 / 250, je EUR und USD) im aktiven Konto.
- Coupon `FOUNDERS_VIDEO_20` bleibt unverändert (20 %, gilt pro Credit-Kauf; die 24-Monats-Grenze wird serverseitig über `is_founder_active` geprüft).

**2. Abo-Rabattlogik entfernen**
- `supabase/functions/create-checkout/index.ts`: Der Founders-/Launch-Coupon wird **nicht mehr auf das Abo angewendet**. Der Slot-Claim (`claim_founders_slot`) bleibt erhalten — er markiert den Founder-Status für den Credit-Rabatt — aber sein `coupon_id` wird nicht mehr in `session.discounts` gesetzt.
- `PRO_PRICE_IDS` zeigt auf die tatsächlich genutzte Abo-Price-ID, damit der Slot-Claim überhaupt auslöst.
- Manuell übergebene `promoCode`/`couponId` bleiben möglich (Support-Fälle).

**3. Konfiguration angleichen**
- `src/config/pricing.ts`: 14,99 € + neue Price-ID; `getProductInfo` liefert 14,99 €.
- `src/config/stripe.ts`: neue Price-ID, `PRO_REGULAR_PRICE_EUR = 14.99`, `PRO_PROMO_PRICE_EUR` entfällt; tote `PRO_PROMO_COUPONS` und `INTRO_PROMO_CODES` (`START-BASIC`/`START-ENT` existieren nicht) entfernen.
- `src/lib/intro.ts`: tote Intro-Code-Logik entfernen.
- `src/config/aiVideoCredits.ts` und `supabase/functions/ai-video-purchase-credits/index.ts`: neue Credit-Pack-Price-IDs.
- `supabase/functions/_shared/stripe-config.ts`: Price-/Product-Map auf real existierende Objekte, Coupon-Konstanten bereinigen.
- Betroffene Edge Functions neu deployen (`create-checkout`, `ai-video-purchase-credits` und alles, was `stripe-config.ts` importiert).

**4. Texte umstellen**
- Preis überall 14,99 €/Monat: `src/pages/Pricing.tsx`, `src/components/landing/PricingSection.tsx`, `src/pages/Legal.tsx`, `src/components/landing/CompetitorComparisonCard.tsx`, `src/lib/translations.ts` (DE/EN/ES).
- `src/components/landing/FoundersBenefitsDialog.tsx` + `src/components/pricing/FoundersSlotBadge.tsx`: Founder-Vorteil wird umformuliert von „günstigeres Abo" zu **„20 % auf alle KI-Modelle / jeden Credit-Kauf, 24 Monate lang"**. Der Abopreis wird dort nicht mehr als rabattiert dargestellt.

**5. Verifikation**
- Jede im Code verwendete Price-, Product- und Coupon-ID einzeln gegen die Stripe-API auflösen.
- Repo-Sweep: keine `…DRu4kfSFxj…`-ID und kein „19,99"/„19.99" mehr übrig.
- Typecheck.

## Hinweis

Bestehende Abonnenten zu 19,99 € behalten diesen Preis, bis sie kündigen — Stripe migriert laufende Abos nicht automatisch. Sag Bescheid, falls sie aktiv auf 14,99 € umgestellt werden sollen.
