

## r31 — Lambda 600s + Hybrid Backoff (IMPLEMENTED)

### Problem
- 8 Lambdas + 240s Timeout → 225 fpl × 2.1s = 472s → TIMEOUT ❌
- 20 Lambdas + 240s Timeout → Rate Limit (AWS Concurrency ~10) ❌

### Lösung
Neue Lambda-Funktion mit **600s Timeout** deployed. 8 Lambdas bleiben unter dem Concurrency-Limit und haben genug Zeit.

### Änderungen

#### `_shared/remotion-payload.ts`
- `LAMBDA_TIMEOUT_SECONDS`: 240 → **600**
- `TARGET_MAX_LAMBDAS`: 20 → **8**
- Soft-Max: 84 → **210** fpl
- Hard-Max: 120 → **300** fpl
- bundle_canary: `r31-lambda600s`

#### Alle 5 Render Edge Functions (Fallback-Namen)
- `240sec` → `600sec` in:
  - `invoke-remotion-render/index.ts`
  - `render-with-remotion/index.ts`
  - `render-universal-video/index.ts`
  - `render-directors-cut/index.ts`
  - `auto-generate-universal-video/index.ts`

#### `remotion-webhook/index.ts`
- Timeout-Fehlermeldung: "240s" → "600s"

#### `UniversalAutoGenerationProgress.tsx` (Frontend)
- Rate-Limit-Retry: **exponentieller Backoff** (60s / 120s / 180s für Attempt 1/2/3)
- Timeout/Crash-Retry: flat 30s (wie bisher)
- Live-Countdown-Anzeige: "🔄 Rate-Limit — Auto-Retry in 58s (1/3)..."

### Erwartetes Ergebnis

```text
r31, 1. Versuch (30fps, 8λ, 600s):
  1800 Frames / 8λ = 225 fpl
  225 × 2.1s = 472s < 600s ✅
  8 Lambdas < 10 Concurrency-Limit ✅

Falls Rate-Limit (unwahrscheinlich bei 8λ):
  → 60s Backoff → Retry
  → 120s Backoff → Retry
  → 180s Backoff → Retry
```

Volle 30fps-Qualität, alle Effekte, keine Feature-Reduktion.
