# v517 — Seedance 2.5 video-input: controlled paid test (10.09.2026)

One approved paid generation. No prices, routing, catalog entries or provider config changed.

## 1. Pre-dispatch record

| Item | Value |
| --- | --- |
| Provider / route | BytePlus ModelArk direct, `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks` |
| Provider model id | `dreamina-seedance-2-5-260628` |
| Edge function | `generate-seedance25-video` (production route, capability gate + preflight passed) |
| Mode | `v2v` (video reference) |
| Reference video | synthetic AI landscape, no people, 1280×720, 24 fps, **8.000 s** |
| Output duration requested | 8 s |
| Resolution | 720p, ratio locked to `adaptive` by the provider contract |
| Audio | off |
| Customer price charged | **$2.64** ($0.33/s × 8 s) |
| Expected provider cost (old estimate) | $0.9676/s → $7.74 |

Verified provider payload (dry run through the real builder, fetch intercepted):

```json
{
  "model": "dreamina-seedance-2-5-260628",
  "content": [
    { "type": "text", "text": "…" },
    { "type": "video_url", "video_url": { "url": "…ref-8s.mp4" }, "role": "reference_video" }
  ],
  "resolution": "720p", "ratio": "adaptive", "duration": 8,
  "watermark": false, "generate_audio": false
}
```

Only the intended video reference was sent — no `first_frame`, no `last_frame`, no reference images,
no stale state.

## 2. Result

| Item | Value |
| --- | --- |
| Task id | `cgt-20260910081232-ckdrt` |
| Generation id | `7c77ebde-0edf-42f5-8524-178443c1d5be` |
| Status | succeeded, stored, wall time ≈ 5:23 min |
| Output | 1280×720, 24 fps, 193 frames, **8.042 s** |
| Reported usage | `completion_tokens = 346,500` (= 346.5 K tokens) |

## 3. Cost

SKU: the only Seedance 2.5 SKU on this account,
`Dreamina-Seedance-2.5-inference-non-video-in-480p-720p`, $0.0107 / K tokens ($10.70 / M).
No separate video-input SKU was created for this task.

- Provider charge: 346.5 K × $0.0107 = **$3.7075** (≈ €3.224)
- Per output second: **$0.4634/s** (on the true 8.04 s: $0.4610/s)
- vs. normal 720p $0.2318/s: **2.00×**
- Token rate per (input + output) second: 346.5 K / 16 s = **21.656 K/s** — the September-measured
  normal 720p rate is 21.66 K/s.

## 4. Hypotheses

- **Hypothesis A — billed on (input duration + output duration) at the normal token rate: CONFIRMED.**
  Match to three decimals (21.656 vs 21.66 K tokens per second).
- **Hypothesis B — $0.9676 per output second: REFUTED.** Measured $0.4634/s, i.e. 48 % of that
  estimate. The Replicate video-input list price is not what the direct ModelArk account pays.

Consequence: video-input cost scales with the length of the reference clip, not with a fixed
multiplier. A 4 s reference on an 8 s output would cost ≈ 1.5×; a 30 s reference ≈ 4.75×.

## 5. Margin at today's price

720p list €0.3333/s (charged €0.33/s after rounding), 19 % VAT inclusive, 10 % payment allowance.

| Customer | Gross 8 s | Net revenue | Provider cost | Contribution | Multiple |
| --- | --- | --- | --- | --- | --- |
| Standard | €2.64 | €2.00 | €3.22 | **−€1.23** | 0.62× |
| Founder (−10 %) | €2.38 | €1.80 | €3.22 | **−€1.43** | 0.56× |

Loss-making at every reference length ≥ output length. Break-even at today's price is roughly a
reference clip of ≤ 0.2 × output length — practically nothing.

## 6. Open items

- BytePlus billing row: the September cycle has not settled this task yet. The line-item
  reconciliation (SKU string, K-token count, USD total on the invoice) can only be done after
  settlement; the provider-reported `completion_tokens` above is the same quantity the invoice bills.
- Currency defect observed, not changed: the wallet is USD, but the charge used the EUR rate
  (€0.3333 → $0.33/s) instead of the derived USD rate ($0.3833/s). Worth a separate look.

## 7. v519 amendment (10.09.2026)

- **No estimated reference duration.** If the clip length cannot be measured, the
  request stops before any wallet deduction (`REFERENCE_DURATION_UNKNOWN`, 400) and the
  user is asked to re-upload or use another file. Same fail-closed rule as unknown wallet
  currency. The former 30 s fallback is removed; 30 s remains only as a clamp for
  *measured* lengths (model input maximum).
- **480p reference formula: UNVERIFIED.** `seedance-2-5-480p` assumes reference+output
  billing by analogy only; it stays flagged until a controlled 480p test is run.
- **Open:** BytePlus invoice line for `cgt-20260910081232-ckdrt` still unsettled;
  predicted $3.7075 (346,500 tokens x $0.0107/K) to be reconciled once it appears.
