## Stripe Payment Methods reduzieren

Aktuelle Konfiguration enthält `card`, `sepa_debit`, `paypal`, `klarna`, `link`. Da im Stripe-Dashboard derzeit nur **PayPal**, **Google Pay** und **Apple Pay** (zusätzlich zur Karte) aktiviert sind, passen wir die Edge-Functions an, damit der Checkout sauber bleibt und Stripe keine inaktiven Methoden ausblenden muss.

### Änderungen

**1. `supabase/functions/create-checkout/index.ts`**
- `payment_method_types` reduzieren auf: `["card", "paypal", "link"]`
  - `card` deckt **Apple Pay** und **Google Pay** automatisch ab (wenn Domain verifiziert + im Dashboard aktiv).
  - `link` ist Stripes 1-Click-Wallet, schadet nicht und erhöht Conversion.
- `payment_method_options.sepa_debit` Block entfernen (nicht mehr nötig).
- Kommentar anpassen: nur noch aktive Methoden erwähnen.

**2. `supabase/functions/create-enterprise-checkout/index.ts`**
- Gleiche Reduzierung: `payment_method_types: ["card", "paypal", "link"]`.
- `payment_method_options.sepa_debit` entfernen.

### Was unverändert bleibt
- Founders-Coupon-Logik, Slot-Reservierung, Webhooks.
- Apple Pay / Google Pay funktionieren ohne extra Code-Eintrag (laufen über `card`), solange:
  - im Stripe-Dashboard aktiviert (✅ bereits erledigt),
  - die Domain `useadtool.ai` (und ggf. `captiongenie.app`) in **Stripe → Settings → Payment methods → Apple Pay → Domains** verifiziert ist.

### Später nachziehen
Wenn SEPA / Klarna im Dashboard aktiviert werden, fügen wir sie wieder zur Liste hinzu (1-Zeilen-Änderung).
