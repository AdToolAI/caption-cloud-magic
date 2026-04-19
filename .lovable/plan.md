

## Befund & Empfehlung

Ich empfehle **klar Option B: Rechnungen nur beim Credit-Kauf**, nicht pro Video. Hier die Begründung:

### Warum nicht pro Video?

| Aspekt | Pro Video (A) | Pro Credit-Kauf (B) ✅ |
|---|---|---|
| **Rechtlich (DE/EU)** | 100+ Mikro-Rechnungen/Monat à €1.51 — Buchhaltungs-Albtraum für Geschäftskunden | 1 Rechnung pro Top-Up — sauber & GoBD-konform |
| **MwSt.-Ausweis** | Auf €0.24 USt. pro Video — wirkt unprofessionell | Auf €10/€50/€100/€250 — Standard |
| **Stripe-Kosten** | Jede Rechnung kostet Stripe-Fees (€0.40 + 1.5%) → frisst Marge | Bereits in `ai-video-purchase-credits` Edge Function vorhanden |
| **User-Inbox** | Spam: 50 Mails/Monat | Sauber: 1-3 Mails/Monat |
| **Implementierung** | Komplett neu (Webhook + DB + Stripe-Invoice-Creation pro Render) | **Existiert bereits** — nur MwSt.-Ausweis fehlt |

**Es gibt keinen rechtlichen Grund** für Pro-Video-Rechnungen — Credits sind ein **Voucher-System** (Prepaid). Der "Verkauf" passiert beim Top-Up, das Einlösen ist nur Nutzung. Das ist genauso wie bei Adobe Creative Cloud Credits, OpenAI API Credits oder Google Cloud Credits — alle stellen nur beim Top-Up Rechnungen aus.

### Was bereits existiert
Die Stripe Checkout Sessions in `ai-video-purchase-credits/index.ts` erzeugen bereits automatische Stripe-Belege. Diese sind über den **Customer Portal** (`customer-portal/index.ts`) und `get-invoices/index.ts` einsehbar. **Aber:** Die MwSt. (19% DE) wird aktuell **nicht ausgewiesen** — die Preise sind als Brutto definiert, aber Stripe hat keine Tax Rate auf die Credit-Käufe konfiguriert (nur auf Subscriptions via `STRIPE_TAX_RATE_19_PCT`).

## Plan: MwSt.-Ausweis auf Credit-Kauf-Rechnungen

### 1) Tax Rate auf Credit-Kauf-Checkout anwenden
In `supabase/functions/ai-video-purchase-credits/index.ts` der Stripe Checkout Session den existierenden `STRIPE_TAX_RATE_19_PCT` (19% inklusiv, DE) hinzufügen — analog zu wie es in `customer-portal/index.ts` für Subscriptions schon gemacht wird:

```typescript
const TAX_RATE_ID = Deno.env.get("STRIPE_TAX_RATE_19_PCT");
const session = await stripe.checkout.sessions.create({
  // ... existing config
  line_items: [{
    price: priceId,
    quantity: 1,
    tax_rates: TAX_RATE_ID ? [TAX_RATE_ID] : undefined,
  }],
  invoice_creation: { 
    enabled: true,  // Erzwingt PDF-Rechnung mit USt-Ausweis
  },
});
```

`invoice_creation.enabled: true` zwingt Stripe, für jeden One-Time-Payment-Checkout eine vollwertige PDF-Rechnung mit MwSt-Ausweis zu erstellen (statt nur eines Belegs).

### 2) USD-Käufe ausschließen
USD-Käufe (US-Kunden) bekommen **keine** deutsche MwSt — Tax Rate nur bei `currency === 'EUR'` anwenden.

### 3) Billing-Page: Credit-Käufe sichtbar machen
`get-invoices/index.ts` listet bereits alle Stripe-Invoices (auch die von Credit-Käufen). Optional: Im UI eine kleine Trennung "Abos" vs. "Credit-Käufe" via `invoice.metadata.type` oder Subscription-Reference.

### 4) Hinweis in der Credit-Kauf-UI
Kleiner Footer-Text im Credit-Pack-Picker:
> *„Alle Preise inkl. 19% MwSt. (Deutschland). Eine Rechnung wird automatisch nach dem Kauf per E-Mail zugestellt und im Billing-Bereich verfügbar."*

## Alternative — falls du B2B-Kunden mit Steuernummer hast
**Stripe Tax** (kostet 0.5% extra pro Transaction) automatisiert:
- VAT-ID-Validierung (Reverse Charge für EU-B2B → 0% MwSt)
- Korrekte Sätze pro EU-Land
- OSS-Reporting

Das ist aber **nur sinnvoll**, wenn du ernsthaft B2B-EU-Kunden außerhalb DE skalierst. Für jetzt reicht der einfache 19%-Tax-Rate-Ansatz.

## Betroffene Dateien
- `supabase/functions/ai-video-purchase-credits/index.ts` — Tax Rate + `invoice_creation: { enabled: true }`
- `src/components/ai-video/CreditPackSelector.tsx` (oder vergleichbar) — kleiner MwSt.-Hinweis
- *Optional:* `src/pages/Billing.tsx` — Trennung Abos vs. Credits in der Invoice-Liste

## Zusammengefasst
**Nein, keine Rechnungen pro Video.** Stattdessen:
- ✅ Credit-Kauf-Rechnungen mit korrektem MwSt-Ausweis
- ✅ Automatische PDF-Generierung via Stripe `invoice_creation`
- ✅ USD-Käufe (USA) korrekt ohne deutsche MwSt
- ✅ Saubere, GoBD-konforme Buchhaltung für deine User

Soll ich das umsetzen?

