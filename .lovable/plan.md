
# Mehr Zahlungsmethoden im Stripe-Checkout aktivieren

## Ziel
Aktuell akzeptiert der Checkout nur Kreditkarten. Wir öffnen ihn für die in Deutschland/EU üblichsten Methoden, die auch **für Abos (recurring)** funktionieren.

## Was aktiviert wird

| Methode | Warum | Kompatibilität mit Coupon `PRO-FOUNDERS-24M` |
|---|---|---|
| Karte (bereits aktiv) | Standard | ✅ |
| **SEPA Lastschrift** | Beliebteste DE-Methode für Abos, niedrige Gebühren | ✅ |
| **PayPal** | Vertrauen & Conversion-Boost | ✅ |
| **Klarna** | "Später zahlen" für Pro-Plan | ✅ |
| **Link** (Stripe 1-Click) | Wiederkehrende Käufer, gratis | ✅ |
| **Apple Pay / Google Pay** | Mobile-Conversion, kommt automatisch über Karte | ✅ |

**Nicht möglich** (Stripe-Limit für recurring): Sofort, Giropay, iDEAL, Bancontact, klassische Banküberweisung.
**Nicht über Stripe**: Google Play / App Store (separate Billing-Welt nur für native Apps).

## Umsetzung – 2 Schritte

### Schritt 1: Code-Änderung
**Datei:** `supabase/functions/create-checkout/index.ts` (und gleiche Änderung in `create-enterprise-checkout/index.ts`)

In `stripe.checkout.sessions.create({...})` ergänzen:

```ts
payment_method_types: ['card', 'sepa_debit', 'paypal', 'klarna', 'link'],
// Apple Pay / Google Pay laufen automatisch über 'card' – kein extra Eintrag nötig
```

Optional zusätzlich (verbessert SEPA-UX):
```ts
payment_method_options: {
  sepa_debit: { setup_future_usage: 'off_session' },
}
```

Das war's im Code – keine Migration, keine UI-Änderung, kein neues Secret.

### Schritt 2: Aktivierung im Stripe-Dashboard (durch dich, einmalig)
Stripe verlangt für PayPal/Klarna/SEPA eine Aktivierung pro Account:

1. **Stripe Dashboard → Settings → Payment methods**
2. Aktivieren:
   - ✅ SEPA Direct Debit
   - ✅ PayPal (kurzes OAuth-Login mit PayPal-Business-Konto)
   - ✅ Klarna (1-Klick-Aktivierung)
   - ✅ Link (meist schon an)
   - ✅ Apple Pay (nur Domain `useadtool.ai` & `captiongenie.app` verifizieren – Stripe macht das auf Knopfdruck)
3. Im **Test-Mode** zuerst aktivieren → testen → dann **Live-Mode** wiederholen.

Falls eine Methode nicht aktiviert ist, ignoriert Stripe sie im Checkout (kein Fehler) – der User sieht nur die aktiven.

## Verhalten nach dem Rollout
- Founders-Checkout zeigt automatisch alle aktivierten Methoden.
- Coupon `PRO-FOUNDERS-24M` (€14.99 für 24 Monate) gilt **unverändert** für alle Methoden.
- SEPA-Mandat wird einmalig beim ersten Kauf bestätigt, dann läuft das Abo automatisch.
- Apple/Google Pay erscheinen nur auf kompatiblen Geräten/Browsern.

## Nicht im Scope (bewusst weggelassen)
- **Direkte Banküberweisung** ohne SEPA-Mandat → Stripe unterstützt das nur für One-Off oder Invoices, nicht für Subscriptions. Workaround wäre ein manuelles Invoice-Modell – sage Bescheid, wenn du das für Enterprise willst.
- **In-App-Käufe (Google Play / Apple)** → nur sinnvoll bei nativer Mobile-App, nicht bei Web/PWA. Bringt 15-30% Plattform-Cut.

## Risiko / Aufwand
Sehr klein: 2 Zeilen Code in 2 Edge Functions, der Rest ist Klick-Konfig im Stripe-Dashboard. Rollback = Zeile entfernen.

**Soll ich loslegen?**
