# Video Enhance — provider-specific degressive pricing

## 1. Files that change (pricing only)

Canonical server pricing
- `supabase/functions/_shared/video-enhance-models.ts` — rate cards, `videoProviderCostUsd`, `priceVideoEnhanceRun`, price snapshot
- new `supabase/functions/_shared/video-enhance-curves.ts` — the two provider curves + shared evaluator (no dependency on the general AI-video/Picture margin curve)
- `supabase/functions/_shared/topaz-video-catalog.ts` — interpolation credit rates, default id `apollo` → `chronos`
- `supabase/functions/video-enhance/index.ts` — pass source fps / interpolation model into pricing, log estimated cost vs charge, log Topaz credit drift

Client mirror (display only)
- `src/lib/videoEnhance/rates.ts`, `src/lib/videoEnhance/pricing.ts`, new `src/lib/videoEnhance/curves.ts`
- `src/config/videoEnhanceModels/topazCatalog.ts` — default interpolation `chronos`, Apollo marked premium
- `src/components/ai-video/EnhanceVideoPanel.tsx` — price line already exists; add the Apollo cost notice (EN/DE/ES)

Tests
- new `src/test/videoEnhanceProviderCurves.test.ts`, extend `videoEnhanceParity.test.ts`

Not touched: provider routing, wallet mechanics, refund idempotency, persistence/orchestration, history/job center.

## 2. Curve in code form

```ts
export interface CurvePoint { cost: number; multiplier: number }

export const VCUBE_CURVE: CurvePoint[] = [
  { cost: 0.00, multiplier: 2.5 },
  { cost: 0.20, multiplier: 2.5 },
  { cost: 0.50, multiplier: 2.2 },
  { cost: 1.00, multiplier: 2.0 },
  { cost: 2.00, multiplier: 1.8 },
  { cost: 5.00, multiplier: 1.6 },   // asymptote
];

export const TOPAZ_CURVE: CurvePoint[] = [
  { cost: 0.00, multiplier: 1.8 },
  { cost: 0.50, multiplier: 1.8 },
  { cost: 1.00, multiplier: 1.6 },
  { cost: 2.00, multiplier: 1.5 },
  { cost: 4.00, multiplier: 1.35 },
  { cost: 10.0, multiplier: 1.2 },   // asymptote
];

// linear interpolation between points, constant outside
multiplier = interpolate(curve, providerCostEur);
listPrice  = ceilCent(providerCostEur * multiplier);   // clamped to the curve band
```

Band enforcement: the list multiple is hard-clamped to `[min, max]` of the model's own curve
(vCube 1.6–2.5, Topaz 1.2–1.8). A price floor may not push it over the max; that case is
flagged `floor_conflict` for review instead of silently overcharging.

## 3. Topaz model-aware cost estimator

Credits are estimated per OUTPUT FRAME, from the real chain, calibrated against the
audited runs (51-credit job, the 8–12 credit jobs, the 6–7 credit no-interpolation jobs):

```
outputFrames = ceil(sourceDuration * targetFps)
upscaleCreditsPerFrame  = { 720p 0.0033, 1080p 0.0067, 2k 0.0117, 4k 0.0200 }   // precision family
                          restoration family = same table / ~3.4 (Nyx, Themis)
interpolationPerFrame   = { none 0, chronos-fast 0.005, chronos 0.011,
                            apollo-fast 0.024, apollo 0.0375, aion 0.0375 }
credits = ceil(outputFrames * (upscaleCreditsPerFrame + interpolationPerFrame))
costUsd = credits * TOPAZ_CREDIT_USD
```
Interpolation is only added when the frame rate really changes (existing rule).
Quality mode is carried into the snapshot for observability but does not scale credits —
Topaz does not bill the encoder; inventing a factor would be a guess.

Calibration check: 720p→4K, 15.0 s, 24→60, Apollo → 52 credits estimated vs 51 billed.
1080p→4K, 24→30, Chronos → 8 vs 8–12 billed. 4K, 24 fps, no interpolation → 7 vs 6–7 billed.

These per-frame rates are INFERRED from our own billed runs, not published provider truth.
They stay explicitly marked as calibrated/estimated:

- `topazCostEstimatorVersion = "2026-09-08-calibrated-v1"` is written into every price
  snapshot and stored on the run, next to the existing `estimatorCalibrating` flag.
- High-cost, uncertain configurations get a safety buffer on the ESTIMATED provider cost
  before the curve is applied: `+15 %` when the chain includes an interpolation model whose
  rate has no verified billed sample yet (Apollo, Apollo Fast, Aion) and the estimated cost
  exceeds €2.00. The buffer raises assumed cost, never the multiple — the 1.2x floor is
  never trusted blindly on an unverified Apollo chain.
- Price may never fall below the estimated provider cost, also after cent rounding and
  before any account discount: `listPrice = max(ceilCent(cost * multiple), ceilCent(cost))`.
- vCube keeps the plain deterministic Replicate rate card. No calibration buffer, no
  estimator version logic — the Topaz calibration path is not shared with it.


## 4. Example prices (list price, before account discount)

ByteDance vCube (standard tier)

| Job | provider cost | multiple | list price |
|---|---|---|---|
| 10 s 1080p 30 | €0.07 | 2.50 | €0.17 |
| 10 s 4K 30 | €0.26 | 2.44 | €0.64 |
| 10 s 4K 60 | €0.52 | 2.19 | €1.15 |
| 30 s 4K 60 | €1.57 | 1.89 | €2.96 |
| 30 s 4K 30 Pro (10x rate) | €7.83 | 1.60 | €12.53 |

Topaz (Proteus / precision)

| Job | credits | provider cost | multiple | list price |
|---|---|---|---|---|
| 10 s 1080p→4K 30, no interpolation | 6 | €0.57 | 1.77 | €1.01 |
| 10 s 1080p→4K 30→60, Chronos | 19 | €1.80 | 1.52 | €2.74 |
| 10 s 1080p→4K 30→60, Chronos Fast | 15 | €1.42 | 1.56 | €2.22 |
| 15 s 720p→4K 24→60, Apollo | 52 | €4.93 | 1.33 | €6.54 |
| 10 s 1080p→2K 30, no interpolation | 4 | €0.38 | 1.80 | €0.69 |

The Apollo job used to be charged €3.93 against ~€4.90 real cost (a loss). It now prices at
roughly cost + 33 %, and Chronos — the new default — is materially cheaper for the customer.

## 5. Discounts, transparency, observability

- Order: real provider cost → provider curve → list price → account discount (unchanged,
  applied once in `deduct_ai_video_credits`) → effective multiple.
- Snapshot stores `list_multiplier` and `effective_multiplier_after_discount`; if the
  discounted multiple falls below the curve floor it is flagged for reporting only — the
  discount is never reduced and the price is never raised afterwards.
- UI shows the final estimated price for the actual configuration; picking Apollo shows:
  "Apollo interpolation significantly increases processing cost. Estimated price: €X.XX"
  (EN/DE/ES).
- vCube rate card stays marked estimated; every run logs estimated cost vs charge so actual
  Replicate cost can be reconciled once exposed. Topaz logs estimated vs billed credits as
  pricing drift.

## 6. Tests

vCube 10 s 1080p30 / 10 s 4K30 / 10 s 4K60 / 30 s 4K60 — multiple always within 1.6–2.5.
Topaz 1080p→4K none / Chronos / Chronos Fast / 720p→4K Apollo 24→60 — multiple within
1.2–1.8, Apollo materially above Chronos, no selectable combination priced below cost,
discount applied exactly once, client/server parity.
