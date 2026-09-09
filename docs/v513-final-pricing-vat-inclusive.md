# v513 — Stripe tax verification + FINAL pricing table (VAT-inclusive). PROPOSAL ONLY.

Read-only Stripe verification, 09.09.2026, live account `acct_1SLqO0DRu4kfSFxj` ("AdTool AI").

## 1. Stripe tax behavior — verified

| Object | Finding |
| --- | --- |
| Tax rate (only one in the account) | `txr_1SddkIDRu4kfSFxjax6JhmHx` "Umsatzsteuer", 19.0 %, DE, active, **`inclusive: true`** |
| Subscription prices EUR / USD / GBP (14.95) | all **`tax_behavior: inclusive`**, active |
| Credit packs USD + GBP (10/50/100/250) | all **`tax_behavior: inclusive`** |
| Credit packs EUR (10/50/100/250) | **`tax_behavior: unspecified`** — see mismatch below |
| Stripe Tax settings | `status: active`, head office DE, default `tax_behavior: inferred_by_currency` |
| Stripe Automatic Tax in code | **not enabled anywhere** — no `automatic_tax` in any checkout session |
| Applied tax | `ai-video-purchase-credits` attaches `STRIPE_TAX_RATE_19_PCT` to EUR line items only; `create-checkout` (subscriptions) attaches **no** tax rate; `customer-portal` sets it as `default_tax_rates` on subscription updates |

**Conclusion: VAT is never added on top.** The one tax rate is inclusive, and all
prices whose behavior is set are inclusive. A displayed €10.00 is charged as €10.00.
This matches the intended VAT-inclusive model, so the **VAT-inclusive scenario is the
correct pricing basis**.

### Concrete example — Starter credit pack, EUR

```
Displayed price      10.00 EUR
Checkout total       10.00 EUR   (verified live session
                                  cs_live_a1LwI8ZU675ujWacm6pHgnsXc5XIf0nS11uAJZSq6GtyQGtugnp5fRuvcs:
                                  subtotal 1000, total 1000)
VAT portion (19% incl.) 1.60 EUR  (10.00 - 10.00/1.19)
Net revenue           8.40 EUR
- payment fees ~10%   0.84 EUR
= effective revenue   7.56 EUR
```

Subscription, EUR: displayed €14.95 → charged €14.95 → VAT €2.39 → net €12.56.

### Two configuration mismatches (no price impact, but fix later)

1. The four **EUR credit-pack prices carry `tax_behavior: unspecified`** while their
   USD/GBP twins are `inclusive`. Today the inclusive tax rate governs the outcome, so
   the charged total is still €10.00 — but the price objects should be set to
   `inclusive` for consistency and for any future switch to Automatic Tax.
2. The verified live EUR session shows `total_details.breakdown.taxes: []` — that
   session ran **before** the tax rate existed (the rate was created later). New EUR
   credit checkouts do attach it. Subscriptions still attach no tax rate at all, so
   Stripe reports no VAT line on subscription invoices even though the price is
   inclusive. That is a bookkeeping gap, not an overcharge.

## 2. Veo sourcing comparison — comparison only, no change

| | Our route | fal equivalent |
| --- | --- | --- |
| Route | Replicate `google/veo-3.1-fast` and `google/veo-3.1` (predictions API, webhook) | `fal-ai/veo3.1` / `fal-ai/veo3.1/fast` |
| Catalog IDs | `veo-3.1-lite-720p`, `veo-3.1-lite-1080p`, `veo-3.1-fast` → `google/veo-3.1-fast`; `veo-3.1-pro` → `google/veo-3.1` | — |
| Stored provider cost | 0.15 / 0.22 / **0.40** €/s (fast), **1.10** €/s (pro) | Veo 3.1: $0.40/s with audio, $0.20/s without, 4K $0.40–0.50 [3](https://fal.ai/models/fal-ai/veo3.1) · Veo 3.1 Fast: $0.15/s with audio, $0.10/s without, 4K $0.30–0.35 [5](https://fal.ai/models/fal-ai/veo3.1/fast) |
| Rough delta | 0.40 €/s ≈ $0.46 vs $0.15 → **≈ 3.0×**; 1.10 €/s ≈ $1.27 vs $0.40 → **≈ 3.2×** | |
| Resolution | 720p / 1080p (we cap at 1080p) | 720p / 1080p / true 4K |
| Duration | 4–8 s | 4–8 s (+ extension) |
| Audio | native, on | native, priced separately (audio-off tier is ~33% cheaper — we have no audio-off tier) |
| References / last frame | `reference_images`, `last_frame`, seed, negative prompt (Replicate schema, verified 10.08.2026) | same feature set plus extension endpoints |

Caveats before acting: fal's published rate is a list price for the audio-on tier, and
our stored cost may include a deliberate buffer for failed/retried predictions. The
per-second numbers on the Replicate model pages were not machine-readable in this pass,
so the "3×" is a fal-vs-stored comparison, not a Replicate-vs-fal one. Recommended next
step (not done): pull 30 days of actual Replicate Veo spend and divide by generated
seconds to get our true realised cost. **No Veo price and no Veo route changed.**

## 3. Final pricing table — VAT-inclusive basis

Chain: `gross ÷ 1.19 × 0.90 (payment fees) ÷ provider cost`. Founder = gross × 0.90 first.
Targets: Seedance 2.5 ~1.38×, standard ~1.50–1.58×, premium ~1.66–1.70×, hard cap 1.80×
(re-validated after customer-friendly rounding). Veo rows are listed for completeness but
are **frozen** pending the sourcing audit above.


### Seedance 2.5

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Seedance 2.5 (ModelArk) | 0.2170 | 0.3333 | 1.16× | **0.4000** | 1.39× | 1.25× | 28% | 20% |
| Seedance 2.5 480p (ModelArk) | 0.1085 | 0.1932 | 1.35× | **0.2000** | 1.39× | 1.25× | 28% | 20% |

### Seedance 1/2

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Seedance 1 Lite (Draft) | 0.0200 | 0.0450 | 1.70× | **0.0400** | 1.51× | 1.36× | 34% | 27% |
| Seedance 1 Lite 1080p | 0.0450 | 0.1000 | 1.68× | **0.0900** | 1.51× | 1.36× | 34% | 27% |
| Seedance 2.0 Fast 720p | 0.1500 | 0.3200 | 1.61× | **0.3100** | 1.56× | 1.41× | 36% | 29% |
| Seedance 2.0 720p | 0.1800 | 0.3850 | 1.62× | **0.3700** | 1.55× | 1.40× | 36% | 29% |

### Kling

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kling 3.0 1080p | 0.0600 | 0.1350 | 1.70× | **0.1250** | 1.58× | 1.42× | 37% | 29% |
| Kling 2.5 Turbo Pro | 0.0300 | 0.0700 | 1.76× | **0.0600** | 1.51× | 1.36× | 34% | 27% |
| Kling 2.6 | 0.0400 | 0.0900 | 1.70× | **0.0800** | 1.51× | 1.36× | 34% | 27% |
| Kling 3.0 Omni | 0.2000 | 0.4300 | 1.63× | **0.4100** | 1.55× | 1.40× | 36% | 28% |

### Veo

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Veo 3.1 Lite 720p | 0.1500 | 0.3200 | 1.61× | **0.3400** | 1.71× | 1.54× | 42% | 35% |
| Veo 3.1 Lite 1080p | 0.2200 | 0.4750 | 1.63× | **0.4900** | 1.68× | 1.52× | 41% | 34% |
| Veo 3.1 Fast 1080p | 0.4000 | 0.8600 | 1.63× | **0.9000** | 1.70× | 1.53× | 41% | 35% |
| Veo 3.1 Pro 1080p | 1.1000 | 2.3650 | 1.63× | **2.4500** | 1.68× | 1.52× | 41% | 34% |

### Hailuo

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hailuo 2.3 Std 768p | 0.0450 | 0.1000 | 1.68× | **0.0900** | 1.51× | 1.36× | 34% | 27% |
| Hailuo 2.3 Pro 1080p | 0.0750 | 0.1650 | 1.66× | **0.1550** | 1.56× | 1.41× | 36% | 29% |

### Wan

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wan 2.5 Std | 0.0400 | 0.0900 | 1.70× | **0.0800** | 1.51× | 1.36× | 34% | 27% |
| Wan 2.5 Pro | 0.0700 | 0.1550 | 1.67× | **0.1450** | 1.57× | 1.41× | 36% | 29% |
| Wan 2.6 Std | 0.0400 | 0.0900 | 1.70× | **0.0800** | 1.51× | 1.36× | 34% | 27% |
| Wan 2.6 Pro | 0.0700 | 0.1550 | 1.67× | **0.1450** | 1.57× | 1.41× | 36% | 29% |
| Wan 2.7 720p | 0.1000 | 0.2200 | 1.66× | **0.2000** | 1.51× | 1.36× | 34% | 27% |
| Wan 2.7 Pro 1080p | 0.1500 | 0.3200 | 1.61× | **0.3100** | 1.56× | 1.41× | 36% | 29% |

### LTX

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LTX 2.3 Fast | 0.0600 | 0.1350 | 1.70× | **0.1200** | 1.51× | 1.36× | 34% | 27% |
| LTX 2.3 Pro | 0.0800 | 0.1800 | 1.70× | **0.1600** | 1.51× | 1.36× | 34% | 27% |

### Vidu

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vidu Q3 Pro (Start+End) | 0.1250 | 0.2650 | 1.60× | **0.2500** | 1.51× | 1.36× | 34% | 27% |
| Vidu Q3 Pro I2V | 0.1250 | 0.2650 | 1.60× | **0.2500** | 1.51× | 1.36× | 34% | 27% |
| Vidu Q3 Turbo T2V | 0.0650 | 0.1450 | 1.69× | **0.1300** | 1.51× | 1.36× | 34% | 27% |

### Grok

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Grok Imagine | 0.0500 | 0.1100 | 1.66× | **0.1000** | 1.51× | 1.36× | 34% | 27% |

### Runway

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Runway Gen-4 Aleph | 0.0800 | 0.1800 | 1.70× | **0.1650** | 1.56× | 1.40× | 36% | 29% |

### Luma

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Luma Ray 2 Std | 0.0700 | 0.1550 | 1.67× | **0.1450** | 1.57× | 1.41× | 36% | 29% |
| Luma Ray 2 Pro | 0.1200 | 0.2550 | 1.61× | **0.2500** | 1.58× | 1.42× | 37% | 29% |
| Luma Ray 3.2 (5s) | 0.0600 | 0.1350 | 1.70× | **0.1250** | 1.58× | 1.42× | 37% | 29% |
| Luma Ray 3.2 (10s) | 0.0900 | 0.2000 | 1.68× | **0.1850** | 1.55× | 1.40× | 36% | 29% |

### Sora

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sora 2 Standard (EOL 24.09.2026) | 0.1000 | 0.2200 | 1.66× | **0.2200** | 1.66× | 1.50× | 40% | 33% |
| Sora 2 Pro (EOL 24.09.2026) | 0.5000 | 1.0800 | 1.63× | **1.1000** | 1.66× | 1.50× | 40% | 33% |

### Pika

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pika 2.2 Std | 0.0400 | 0.0900 | 1.70× | **0.0800** | 1.51× | 1.36× | 34% | 27% |
| Pika 2.2 Pro | 0.0900 | 0.2000 | 1.68× | **0.1850** | 1.55× | 1.40× | 36% | 29% |

### HappyHorse

| Model | Provider €/s | Current €/s | Current ×(net) | Proposed €/s | Std × | Founder × | Std margin | Founder margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HappyHorse 720p | 0.1400 | 0.3000 | 1.62× | **0.3100** | 1.67× | 1.51× | 40% | 34% |
| HappyHorse Pro 1080p | 0.2800 | 0.6050 | 1.63× | **0.6300** | 1.70× | 1.53× | 41% | 35% |

### Currently above 1.80× (net, standard customer)

- none

### Founder margin below 1.20× after discount

- none


## 4. Answers to the open questions

* **Rows currently above 1.80×:** none. Under the confirmed inclusive basis the whole
  catalog sits between 1.16× and 1.76×.
* **Seedance 2.5:** current 0.3333 €/s is only **1.16× net**, and **1.04× for founders** —
  effectively break-even after fees, before any refund or failed generation. This is below
  even the aggressive 1.35–1.45× target. Two options, reported rather than applied:
  (a) raise to 0.40 €/s (1.39× / 1.25× founder), or (b) hold the price as a deliberate
  acquisition subsidy and accept ~0 contribution on founder traffic.
  The 480p tier at 0.1932 €/s is 1.35× — already inside target; a cut to 0.165 €/s would
  drop it to ~1.15×, i.e. the same break-even problem as the 720p tier. Under the
  VAT-inclusive basis I would **not** cut 480p; the earlier 0.165 suggestion came from the
  VAT-exclusive scenario, which is now disproven.
* **Weak founder margins at proposed prices:** only the Seedance pair (1.25×). Everything
  else stays ≥ 1.36×.
* **Competitor check (Seedance):** fal lists ≈ $0.473/s at 720p and $0.2205/s at 480p
  [2](https://fal.ai/learn/tools/how-to-access-seedance-2-5-on-fal), i.e. ≈ 0.41 / 0.19 €/s.
  Our current 0.3333 / 0.1932 €/s already undercuts fal, and 0.40 / 0.20 €/s would still
  be at or below fal's list price. Seedance stays competitive either way.

## 5. Status

Nothing in `src/lib/cost/videoPricingCatalog.ts` or in any Stripe object was modified.
Awaiting approval of the table in section 3 (and of the Seedance decision) before the
catalog is updated.
