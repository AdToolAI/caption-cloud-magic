# v511 — Video pricing: architecture cleanup + VAT-aware profitability

Status: Phase 1 + Phase 2 implemented. **No retail price was changed.**

## 1. Pricing architecture (Phase 2.4)

Removed every per-function price table. Deleted:

| Function | Removed table | Worst drift vs. catalog |
| --- | --- | --- |
| generate-vidu-video | `PRICE_PER_SECOND_EUR` (0.375 / 0.195) | +42 % over catalog 0.265 / 0.145 |
| generate-happyhorse-video | `COST_PER_SECOND_EUR` (0.42 / 0.84) | +39 % over 0.30 / 0.605 |
| generate-pika-video | `MODEL_PRICING` (0.12 / 0.27) | +33 % over 0.09 / 0.20 |
| generate-ai-video (Sora), veo, kling, wan, ltx, luma, hailuo, grok, runway, seedance, seedance25 | `MODEL_PRICING` fallbacks | all stale 3.00× values |

`resolveAccountCostPerSecond()` now returns `number | null` and has **no fallback
parameter**. When the canonical catalog cannot price a model, the function
answers `503 PRICING_UNAVAILABLE` — no provider call, no wallet deduction, no
invented rate. Persisted `cost_per_second` rows now store the effectively
charged rate (Pika/HappyHorse/Vidu previously wrote the legacy table value).

Stale "exactly 3.00× provider cost" comments were removed everywhere.

## 2. VAT model (Phase 2.5)

Credits are sold through `ai-video-purchase-credits`. For EUR checkouts the
session attaches the Stripe tax rate `STRIPE_TAX_RATE_19_PCT` as a
`line_items[].tax_rates` entry. A Stripe tax rate is **exclusive by default**
(`inclusive: false`), i.e. 19 % is added ON TOP of the pack price. USD
checkouts carry no tax rate.

Consequence: if the rate is exclusive, the catalog EUR price is already a NET
price and VAT does not reduce our revenue. If that rate object was created as
`inclusive: true`, revenue drops by /1.19. **This single flag decides the whole
table — verify it in Stripe before repricing.**

Chain used below: `gross → (÷1.19 only if inclusive) → ×0.90 payment fees → ÷ provider cost`.

## 3. Profitability per catalog row (EUR, per second unless noted)

Full computed table: `bun /tmp/vat.ts` equivalent over
`src/lib/cost/videoPricingCatalog.ts`. Summary of the 39 rows:

| Scenario | Average multiple over provider cost | Range |
| --- | --- | --- |
| VAT exclusive (current Stripe config) | **1.95×** | 1.38× (Seedance 2.5) … 2.10× (Kling 2.5 Turbo) |
| VAT inclusive (if the rate is inclusive) | **1.64×** | 1.16× … 1.76× |

Examples (gross → net after fees → multiple, VAT-exclusive case):

| Model | Gross €/s | Provider €/s | Net after 10 % fees | × cost | Margin |
| --- | --- | --- | --- | --- | --- |
| Seedance 2.5 | 0.3333 | 0.217 | 0.300 | 1.38× | 27.7 % |
| Kling 3.0 | 0.135 | 0.060 | 0.1215 | 2.03× | 50.6 % |
| Veo 3.1 Fast | 0.86 | 0.40 | 0.774 | 1.94× | 48.3 % |
| Veo 3.1 Pro | 2.365 | 1.10 | 2.129 | 1.94× | 48.3 % |
| Hailuo 2.3 Std | 0.10 | 0.045 | 0.090 | 2.00× | 50.0 % |
| Vidu Q3 Pro | 0.265 | 0.125 | 0.2385 | 1.91× | 47.6 % |

## 4. Proposal (awaiting approval — nothing applied)

* If VAT is **exclusive**: today's 1.95× average sits above the 1.4–1.8× target.
  Reaching ~1.55× on volume models means an across-the-board cut of ≈ 18–20 %
  (e.g. Kling 3.0 0.135 → 0.105 €/s, Hailuo Std 0.10 → 0.08 €/s, Veo 3.1 Fast
  0.86 → 0.68 €/s), with premium/high-risk routes (Veo Pro, Kling Omni,
  HappyHorse Pro) held at ≈ 1.75–1.8×.
* If VAT is **inclusive**: the catalog is already inside the target band
  (1.64× average) and only Seedance 2.5 (1.16×) is below the floor — that one
  is a documented commercial exception.

Recommendation: confirm the tax-rate flag first, then approve one of the two
tables. Competitor comparison follows with the approved scenario.
