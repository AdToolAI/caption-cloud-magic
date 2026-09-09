# v514 — Seedance 2.5 BytePlus billing reconciliation (read-only)

Source: BytePlus bill export `bill_detail_3003890269_20260910_20260901_973094.csv`
(billing cycle 2026-09, consumption 2026-09-01 … 2026-09-09, 62 rows, $209.43).
Job side: `ai_video_generations` where `model = 'seedance-2-5'`, Sept 2026.
Nothing was changed: no prices, no routing, no billing logic, no provider config.

## 1. Reconciliation method and result

Every billing row is `ModelArk_video_generation / Dreamina-Seedance-2.5 /
Dreamina_Seedance_2.5_infer_non_video_in_480p_720p_ap-southeast-1_realtime`,
unit price **$0.0107 / K tokens** ($10.70 / M tokens), package usage 0,
discount 0, savings plan 0. One single SKU, one single unit price — no cheaper
video-input tier and no $6.40/M row appears anywhere in the export.

Matching used the ModelArk task id stored in `artlist_job_id`
(`modelark:cgt-<YYYYMMDDhhmmss>` = task creation in UTC+8) against the billing
row's consumption start (which is the *completion* moment, on average 6.7 min
after task creation, max 19 min), constrained by token math.

* 62 / 62 billing rows matched to an AdTool job (60 by strict token+duration
  match, 2 by nearest-time only because two neighbouring jobs share a duration).
* **Volume check is exact:** billed seconds = 907 s, completed Seedance 2.5
  seconds in September = 907 s. Perfect match.
* 114 Seedance 2.5 job rows in September: 64 completed, 50 failed.
  23 of the failed never reached the provider (create rejected, 400
  `InputImageSensitiveContentDetected`) and therefore have no task id at all.

Token consumption is deterministic:

| Resolution | tokens/second | $/second | €/second (÷1.15) |
| --- | --- | --- | --- |
| 720p | 21.66 | **0.2318** | **0.2016** |
| 480p | 9.71 | **0.1039** | **0.0903** |

Observed min/max per second: 720p 0.2315–0.2325 $/s (essentially zero variance,
duration is the only driver), 480p a single observation (4 s, 38.83 tokens, $0.41).

## 2. Cost by configuration

| Res | Mode | Duration | Avg tokens | Avg cost $ | $/s |
| --- | --- | --- | --- | --- | --- |
| 720p | T2V | 4 s | 87.1 | 0.93 | 0.2325 |
| 720p | I2V (first frame) | 4 s | 87.3 | 0.93 | 0.2325 |
| 720p | mixed | 8 s | 173.7 | 1.85 | 0.2313 |
| 720p | mixed | 10 s | 216.9 | 2.32 | 0.2320 |
| 720p | mixed | 12 s | 260.1 | 2.78 | 0.2317 |
| 720p | mixed | 15 s | 324.9 | 3.47 | 0.2313 |
| 720p | mixed | 20 s | 432.9 | 4.63 | 0.2315 |
| 720p | mixed | 25 s | 540.9 | 5.78 | 0.2312 |
| 720p | mixed | 30 s | 648.9 | 6.94 | 0.2313 |
| 480p | T2V | 4 s | 38.8 | 0.41 | 0.1025 |

T2V vs I2V vs anchor/reference input: **no price difference**. 14 of the 60
matched jobs carried an image input and were billed at exactly the same
tokens/second as pure T2V. Image input does not move the SKU — "non-video-in"
means *no video input*, and an image reference still counts as non-video-in.
We have never produced a video-input (`video_in`) billing row, so the cheaper
video-input tier was never used and never observed in this account.

## 3. Failed / rejected jobs

* 23 create-time rejections (privacy/real-person filter) → no task, **no cost**.
* 26 tasks that ran and were terminated by the output copyright/audio filter or
  timed out → task id exists, **no matching billing row, no cost**.
* Billed seconds equal completed seconds exactly, so **failures and rejections
  do not cost us provider money** in this dataset.
* The "65 calls vs 62 rows" gap: the ModelArk call counter includes the
  zero-cost rejected/timed-out tasks and (at cycle boundary) up to two
  completions settled outside the export window. No unexplained charge.

## 4. Period totals (2026-09-01 … 09-09)

| Metric | Value |
| --- | --- |
| Jobs total | 114 |
| Completed | 64 (907 s) |
| Failed / rejected | 50 (0 provider cost) |
| Billed tokens | 19,599.0 K |
| Provider charge | **$209.43** (≈ €182.11) |
| Avg cost / successful job | $3.27 (€2.84) |
| Avg cost / successful second | **$0.2309 (€0.2008)** |
| Customer charge booked for those jobs | €300.95 gross (VAT-inclusive) |

Failure wastage adds nothing: the effective cost per delivered second equals the
raw provider rate.

## 5. Code vs reality

| Source | Stored cost | Real cost | Delta |
| --- | --- | --- | --- |
| `videoPricingCatalog` `seedance-2-5` | €0.217 /s | €0.2016 /s | stored 7.6 % **too high** (conservative) |
| `videoPricingCatalog` `seedance-2-5-480p` | €0.1085 /s | €0.0903 /s | stored 20 % **too high** (conservative) |
| `seedanceVideoCredits.ts` sell 720p | €0.3333 /s | — | matches catalog |
| `seedanceVideoCredits.ts` sell 480p | €0.1932 /s | — | matches catalog |
| Persisted `cost_per_second` on jobs | 0.33 (retail, rounded) | — | retail, not provider cost — expected |

No under-statement anywhere; both stored provider costs are safely above the
measured rate. Note one legacy row: three early-September jobs carry
`cost_per_second = 0.44`, from before the catalog cleanup.

## 6. Real retail economics (VAT-inclusive, 19 % DE, 10 % payment allowance)

Net factor = 0.90 / 1.19 = 0.7563.

| Res | Customer | Gross €/s | VAT €/s | Net €/s | After fees €/s | Provider €/s | Contribution €/s | Multiple | Margin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 720p | standard | 0.3333 | 0.0532 | 0.2801 | 0.2521 | 0.2016 | 0.0505 | **1.25×** | 20.0 % |
| 720p | founder −10 % | 0.3000 | 0.0479 | 0.2521 | 0.2269 | 0.2016 | 0.0253 | **1.13×** | 11.2 % |
| 480p | standard | 0.1932 | 0.0308 | 0.1624 | 0.1461 | 0.0903 | 0.0558 | **1.62×** | 38.2 % |
| 480p | founder −10 % | 0.1739 | 0.0278 | 0.1461 | 0.1315 | 0.0903 | 0.0412 | **1.46×** | 31.3 % |

Per clip (720p / 480p, gross € vs provider cost €):

| Duration | 720p gross | 720p cost | 720p contribution (std / founder) | 480p gross | 480p cost | 480p contribution (std / founder) |
| --- | --- | --- | --- | --- | --- | --- |
| 5 s | 1.67 | 1.01 | 0.25 / 0.13 | 0.97 | 0.45 | 0.28 / 0.21 |
| 8 s | 2.67 | 1.61 | 0.40 / 0.20 | 1.55 | 0.72 | 0.45 / 0.33 |
| 10 s | 3.33 | 2.02 | 0.51 / 0.25 | 1.93 | 0.90 | 0.56 / 0.41 |
| 30 s | 10.00 | 6.05 | 1.52 / 0.76 | 5.80 | 2.71 | 1.67 / 1.24 |

## 7. Recommendation (not applied)

* **720p — small increase.** At 1.25× standard and 1.13× founder it sits below
  the intended Seedance band (1.35–1.45×) and a single unrefunded incident wipes
  out a clip's margin. Proposal: **€0.3333 → €0.37 /s** (30 s = €11.10) →
  1.39× standard, 1.25× founder. Still clearly under fal's indicative
  ≈ $0.47/s for the same route.
* **480p — small decrease.** At 1.62× it is the most profitable Seedance row and
  the cheap tier should look aggressive. Proposal: **€0.1932 → €0.175 /s**
  (30 s = €5.25) → 1.47× standard, 1.32× founder. The earlier objection to
  €0.165 was based on the stored €0.1085 cost; with the measured €0.0903 the cut
  is comfortably affordable — €0.165 would still yield 1.38×.
* Keep the strategic ordering: 480p stays the volume-acquisition tier, 720p
  carries the normal Seedance margin.
* Revisit after any BytePlus volume agreement — the token rate is the single
  input, so a negotiated $/M token price flows straight into these tables.
