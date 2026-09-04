# Topaz validation protocol (pre-registered expectations)

Rate cards: official Replicate model pages, read 2026-09-05
(`PROVIDER_PRICING_VERSION = rates-2026-09-05`).

Expectations below are computed from the shared server pricing module
(`supabase/functions/_shared/picture-pricing.ts`) BEFORE any run happens.
They are the contract the real runs are measured against.

## Pre-registered expectations

| # | Model | Input | Config | Expected output | Expected tier / units | Provider USD | Buffered EUR | User price EUR | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | topaz-image-upscale | 1024x1024 (1.0 MP) | 4x, High Fidelity V2, face enhancement on (strength 0.8) | 4096x4096 = 16.8 MP | 24 MP tier | 0.050 | 0.0474 | 0.15 | curve |
| 2 | topaz-image-upscale | 3000x2000 (6.0 MP) | 2x, Standard V2 | 6000x4000 = 24.0 MP | 24 MP tier (boundary, inclusive) | 0.050 | 0.0474 | 0.15 | curve |
| 2b | topaz-image-upscale | 3100x2100 (6.5 MP) | 2x, Standard V2 | 6200x4200 = 26.0 MP | 48 MP tier (first step above boundary) | 0.100 | 0.0948 | 0.28 | curve |
| 3 | topaz-dust-scratch | 1600x1200 | defaults, grain off | 1600x1200 | assumed 1 unit @ $0.08 | 0.080 | 0.0758 | 0.23 | curve |
| 4 | topaz-colorization | 1600x1200 (b/w source) | saturation 0.2 | 1600x1200 | assumed 2 units @ $0.08 | 0.160 | 0.1516 | 0.44 | curve |
| ref | clarity-pro | 1024x1024 | 2x | 2048x2048 | hardware billed, median run | 0.016 | 0.0152 | 0.03 | legacy_fixed |

Run 2/2b together are the cap-vs-round probe: if the provider caps or rounds
the output, run 2b lands in the same tier as run 2 and the tier table needs a
correction, not the margin curve.

## Measured per run

1. Price preview shown in the UI == `picture_enhance_runs.user_price_eur`.
2. Wallet debit == that price, exactly once.
3. Parameters actually sent to Replicate (`prediction.input`) match the config
   column above — especially `upscale_factor`, `enhance_model`,
   `face_enhancement*`, `saturation`, grain fields.
4. Actual output pixel dimensions and file size.
5. Actual provider charge / units from the Replicate prediction
   (`metrics.predict_time`, billed units) vs. "Provider USD" above.
6. Result appears in the media library and downloads.

## Refund probe

One deliberately failing run (invalid source URL): exactly one refund, no
second refund on retry, run ends in `credits_refunded`.

## Verdict table (filled after the runs)

| # | Expected USD | Actual USD | Delta | Params OK | Output size OK | Wallet OK | Library OK | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.050 | | | | | | | pending |
| 2 | 0.050 | | | | | | | pending |
| 2b | 0.100 | | | | | | | pending |
| 3 | 0.080 | | | | | | | pending |
| 4 | 0.160 | | | | | | | pending |
| refund | n/a | | | | | | | pending |

Global unlock (`PICTURE_TOPAZ_*_ENABLED=true` + flags back in
`ENABLED_PICTURE_FLAGS`) only after every row reads "match" and the user
approved the prices.
