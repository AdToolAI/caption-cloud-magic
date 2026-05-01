## Status (bereits gemacht)

✅ Stripe-Key zeigt jetzt auf **AdTool AI** (`acct_1SLqO0DRu4kfSFxj`)
✅ Pro-Konsolidierung erfolgreich ausgeführt:
- `prod_UOG4wbiQjDONAj` umbenannt → "AdTool AI Pro"
- `default_price` = €29,99 (`price_1TSLxWDRu4kfSFxjEJNi8nGN`)
- €14,99-Promo-Preis als Display angelegt (`price_1TSMQQDRu4kfSFxjqAEZRh4O`)
- Alter €19,99-Preis archiviert
- Verwaistes Produkt `prod_UREZAv0LG9vz1E` archiviert
- Coupons `PRO-FOUNDERS-24M` + `PRO-LAUNCH-3M` aktiv

## Was noch fehlt (Code-Side)

Die Code-Konfiguration zeigt noch auf das jetzt archivierte alte Produkt `prod_UREZAv0LG9vz1E`. Wenn ein User jetzt "Subscribe Pro" klickt, würden Subscriptions auf einem archivierten Produkt-Verweis landen (technisch noch ok, weil Preis-ID das ist was zählt — aber unsauber für Profil-Lookup).

### Schritt 1 — `src/config/stripe.ts` aktualisieren
- `STRIPE_PRODUCT_MAP.pro` von `'prod_UREZAv0LG9vz1E'` → `'prod_UOG4wbiQjDONAj'`
- Price-ID bleibt unverändert (`price_1TSLxWDRu4kfSFxjEJNi8nGN`)

### Schritt 2 — `src/config/pricing.ts` aktualisieren
- `PRICING_V21.pro.productId` von `'prod_UREZAv0LG9vz1E'` → `'prod_UOG4wbiQjDONAj'`
- `getProductInfo`-Mapping ist schon defensiv (mappt beide IDs auf "Pro") → kein Eingriff nötig, alte Subscriptions bleiben kompatibel

### Schritt 3 — Verifikation
- Kurzer Smoke-Test im Preview: Pricing-Seite öffnen → "Subscribe Pro" klicken → Stripe Checkout sollte zeigen: 29,99 € − 15,00 € (Founders-Coupon) = **14,99 €/Monat für 24 Monate**

## Was passiert nicht

- Bestehende Subscriptions auf alten Preisen bleiben unangetastet
- Die parallel existierenden alten "AdTool AI"-Produkte (`prod_TIRWOmhxlzFCwW` €34,95, USD-Versionen, Credit-Packs) werden NICHT angefasst — separates Aufräum-Thema, falls gewünscht

Nach Approval führe ich nur noch die 2 kleinen Code-Edits aus.