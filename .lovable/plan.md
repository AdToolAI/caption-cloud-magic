
## Ziel
Nur noch **ein** Abo: **Beta-Basic – 14,99 €/Monat**. Pro/Enterprise/Legacy-Produkte werden aus UI, Gating-Logik und Preistabellen entfernt. Alle bezahlten Nutzer erhalten den vollen Funktionsumfang (kein Feature-Lock mehr innerhalb der Beta).

## Was ist heute inkonsistent
- `src/config/pricing.ts` listet Basic + Pro + Enterprise (14,99 / 29,99 / 69,95).
- `src/pages/Pricing.tsx` zeigt „29,99 durchgestrichen → 14,99".
- `src/pages/Credits.tsx` zeigt Basic-Preis als **14,95 €** (falsch, Tippfehler).
- Gating-Checks in `Coach.tsx`, `Carousel.tsx`, `Rewriter.tsx`, `BrandKit.tsx`, `AccountHeroHeader.tsx`, `CSVUploadDialog.tsx` prüfen auf alte Produkt-IDs (`prod_TDoYdYP1nOOWsN`, `prod_TIRWOmhxlzFCwW`, `prod_TIRYBu4fdR2BEw`) → aktuelle Beta-Basic-Zahler werden dort als „Free" behandelt.
- `check-subscription` Edge Function mappt noch alte Produkt-IDs auf Tier-Namen.

## Änderungen

**1. Zentrale Plan-Definition**
- `src/config/pricing.ts`: nur noch **ein** Eintrag `beta-basic` (14,99 € EUR / 14.99 $ USD, Price-ID `price_1SLqZyDRu4kfSFxjfhMnx186`, Product-ID `prod_TIRSoTyzmRpbpT`). Pro & Enterprise-Objekte entfernt.
- `src/config/stripe.ts`: entfernt `STRIPE_PRICE_IDS.pro` / `.enterprise` und Produkt-IDs `pro` / `enterprise`. `PRO_REGULAR_PRICE_EUR`-Referenzen bereinigen. Nur `basic` bleibt.
- Neuer Helper `isSubscribed(subscribed, productId)` in `src/config/pricing.ts` – ersetzt alle `isPro`-Checks (Beta = ein Plan = alle Features frei).

**2. Pricing-Seite (`src/pages/Pricing.tsx`)**
- Nur eine Karte: „Beta-Basic – 14,99 €/Monat".
- Kein durchgestrichener 29,99-Preis mehr; stattdessen „Beta-Preis" + „14,99 € für 24 Monate garantiert (Founders 1000)".
- SEO-Meta anpassen (Title/Description auf 14,99).

**3. Landing / Home**
- `src/pages/Index.tsx` und relevante Landing-Sections: Preistext auf 14,99 € vereinheitlichen, Pro-/Enterprise-Vergleichstabellen entfernen.

**4. Credits-Seite (`src/pages/Credits.tsx`)**
- Basic-Preis von 14,95 → **14,99** (EUR & USD Anzeige).
- Pro-Plan-Karte entfernen; nur Beta-Basic + Credit-Packs (14,95/29,95/44,95 bleiben unverändert, wie zuletzt bestätigt).

**5. Feature-Gating vereinheitlichen**
Ersetze in diesen Dateien den alten `isPro`-Check (`productId === 'prod_TDoYdYP1nOOWsN'` etc.) durch `isSubscribed(subscribed, productId)`:
- `src/pages/Coach.tsx`
- `src/pages/Carousel.tsx`
- `src/pages/Rewriter.tsx`
- `src/pages/BrandKit.tsx`
- `src/components/account/AccountHeroHeader.tsx`
- `src/components/performance/CSVUploadDialog.tsx`

Damit sind alle bezahlten Beta-Nutzer überall vollwertig freigeschaltet.

**6. `getPlanFromProductId` (in `pricing.ts`)**
- Nur noch Mapping `prod_TIRSoTyzmRpbpT → Beta-Basic, 14,99 €`. Legacy-IDs (Pro/Enterprise) werden auf „Beta-Basic" gemappt, damit Altkäufer nicht als „unbekannt" erscheinen.

**7. Edge Function `check-subscription`**
- Entfernt Tier-Ableitung (Basic/Pro/Enterprise). Gibt zurück: `{ subscribed, product_id, plan: 'beta-basic', subscription_end }`.

**8. Text/Kopie**
- Alle Vorkommen „Pro Plan"/„Enterprise Plan"/„Basic Plan" in sichtbaren Strings (Account, Header-Badges, Toasts) → **„Beta-Basic"**.

## Nicht Teil dieses Plans
- Stripe-Produkte in Stripe selbst archivieren (kann später per Dashboard/API; Code referenziert sie ohnehin nicht mehr).
- Credit-Pack-Preise (bleiben).
- Founders-Preisgarantie-Logik (existiert bereits).

## Technische Notiz
Ein neuer Helper zentralisiert alle Zugangsprüfungen:
```ts
// src/config/pricing.ts
export const isSubscribed = (subscribed: boolean, _productId?: string | null) => !!subscribed;
```
Damit können später weitere Tiers wieder eingeführt werden, ohne 6 Dateien anfassen zu müssen.
