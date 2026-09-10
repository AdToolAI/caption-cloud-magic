# Two separate proposals: (A) Seedance video-reference pricing, (B) currency defect

Both are reported here first. Nothing is implemented, no retail price is changed, no paid job is run.

---

## A — Seedance 2.5 video-reference: pay for what the provider bills

### What the paid test proved

BytePlus bills Seedance 2.5 on tokens, and the token count follows
**reference duration + output duration** at the ordinary resolution rate
(measured 21.656 K tokens/s vs. the September-measured 21.66 K/s for normal 720p).
Video input is therefore not a fixed 4.2x surcharge — it costs exactly as much as the
extra seconds of material the model has to read.

### Proposed billing rule

```text
billable seconds = output seconds + reference video seconds (all references, summed)
charge           = billable seconds x resolution retail rate x discount factor
```

Normal text-to-video and image-to-video stay exactly as today (reference seconds = 0).
No change to any retail per-second rate; the only change is what counts as a billable second.

Examples at the current 720p rate (EUR 0.3333/s), standard customer:

| Reference | Output 5 s | Output 8 s | Output 10 s | Output 15 s |
| --- | --- | --- | --- | --- |
| none | 1.67 EUR | 2.67 EUR | 3.33 EUR | 5.00 EUR |
| 2 s | 2.33 EUR | 3.33 EUR | 4.00 EUR | 5.67 EUR |
| 4 s | 3.00 EUR | 4.00 EUR | 4.67 EUR | 6.33 EUR |
| 8 s | 4.33 EUR | 5.33 EUR | 6.00 EUR | 7.67 EUR |

480p uses the 480p rate on the same formula.

### What the customer sees before generating

The price box gains a second, always-visible line whenever a reference clip is attached:

```text
Video               8 s        2.67 EUR
Reference clip      8 s        2.67 EUR
------------------------------------------
Total              16 s        5.33 EUR
```

Plus one sentence in EN/DE/ES: a reference clip is billed like extra video seconds, so a
shorter reference clip is cheaper. No hidden surcharge, no rounding tricks.

### Discount and refunds

- The Founder / creator discount stays where it is today — applied exactly once inside the
  deduction function on the final total. The formula only changes the second count fed into it.
- Refunds keep using the same total that was charged, with the existing idempotent key, so a
  rejected or failed provider job is still refunded in full including the reference seconds.

### Seamless transitions stay on the cheap path

Motion Studio / Composer keep the existing last-frame / image-based transition as the default.
Video reference remains an explicitly chosen advanced option for cases that need the real
temporal motion of the source clip, and it will then show its own price.

### Open items to settle before this goes live

1. The BytePlus invoice line for task `cgt-20260910081232-ckdrt` has not settled yet.
   I will re-read the billing export once it appears and confirm SKU, K-tokens and USD total
   against the provider-reported 346,500 tokens.
2. 480p has never run with a video reference, so the same formula is assumed, not measured.
   Cheapest possible confirmation: one 480p job, 4 s reference + 4 s output, roughly
   0.09 USD provider cost. I will ask for approval before running it.

Margin note at the current rate: 720p video reference lands near break-even, worse for
Founders. That is a retail-rate question and stays parked until the BytePlus volume-discount
answer arrives, as instructed.

---

## B — Currency defect: root cause found, nothing changed

### What happened

The paid test ran on a **USD** wallet but was charged **0.33 per second**, the EUR rate.
The correct USD rate is 0.3833.

### Root cause

Each generation function reads the wallet currency through a client that is created with the
public key but **without passing the caller's login**. The wallet table only lets a user read
their own row, so with no identity attached the read returns nothing — and the code then
silently falls back to "EUR". The fallback hides the failure completely.

This is not specific to Seedance. The same pattern exists in the Kling, Hailuo, Wan, Luma, LTX,
Grok, Seedance 1/2 and generic video functions. Veo already reads it correctly.
The price *display* endpoint reads the wallet correctly, so USD customers are shown the USD
price and charged the EUR one.

### Impact

- USD wallets are charged about 13 % less than displayed. Never more — no customer was
  overcharged, so there is nothing to reimburse.
- 248 jobs on USD wallets in the last 90 days, 1,445.11 charged — roughly 190 of under-billing.
- GBP: wallets only exist in EUR and USD, so there is no GBP charging path to fix; only Stripe
  purchase prices are GBP-denominated.

### Proposed fix (separate change, not mixed with A)

1. Read the wallet currency with the trusted server key, as Veo already does.
2. Remove the silent "EUR" fallback: if the wallet cannot be read, the request fails closed with
   the existing "pricing unavailable" answer instead of guessing a currency.
3. Apply this to every affected generation function in one pass, plus a regression test that a
   USD wallet resolves the USD rate.
4. No retroactive re-billing.

### Technical notes

- Formula and preview: `supabase/functions/generate-seedance25-video/index.ts`,
  `_shared/videoPricingCatalog.ts` (billable-seconds helper), `useVideoPricingCatalog.ts`,
  `ToolkitGenerator.tsx` price box, EN/DE/ES strings.
- Currency: replace the anon-key wallet read in the `generate-*-video` functions with the
  service-role read used by `generate-veo-video`, and drop the `|| 'EUR'` default.
