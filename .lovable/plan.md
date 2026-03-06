


## r32 — Lottie-Stall-Recovery (IMPLEMENTED)

### Problem
- Render crasht mit `A delayRender() "Waiting for Lottie animation to load"` 
- Fehler wurde als `unknown` klassifiziert → falsche Retry-Strategie (FPS-Reduktion statt Lottie-Fix)

### Lösung
Lottie-Stall wird jetzt als `lambda_crash` erkannt. Retry-Strategie deaktiviert gezielt Lottie statt FPS zu senken.

### Änderungen

#### Fehlerklassifikation (4 Dateien)
Neue Regex VOR generischem `lambda_crash`:
```
/waiting for lottie|delayrender.*lottie|lottie.*animation.*load/i → 'lambda_crash'
```
- `remotion-webhook/index.ts` — classifyError()
- `check-remotion-progress/index.ts` — errorCategory block
- `invoke-remotion-render/index.ts` — classifyImmediate()
- `UniversalAutoGenerationProgress.tsx` — classifyPipelineError() (VOR timeout-Check, da Lottie-Errors docs-Links mit "timeout" enthalten können)

#### Retry-Strategie (`auto-generate-universal-video/index.ts`)
`runRenderOnlyPipeline()` — Lottie-aware Branching:
- **Lottie-Stall erkannt** (`lambda_crash` + Lottie-Regex in errorMessage):
  - FPS bleibt bei 30 (kein Downgrade!)
  - Retry 1: `disableLottieIcons=true`, `disableMorphTransitions=true`, `forceEmbeddedCharacterLottie=true`
  - Retry 2/3: `disableAllLottie=true` (komplett)
  - Flags werden in `inputProps.diag` injiziert + in `result_data` persistiert
- **Sonstiger lambda_crash** (nicht Lottie): Defensive Lottie-Disable + FPS-Reduktion
- Timeout/Rate-Limit/Unknown: Verhalten unverändert (wie r28/r31)

#### Observability
- `bundle_probe`: `r29-lambda240s` → `r32-lottieRecovery`

### Erwartetes Ergebnis

```text
Lottie-Stall, 1. Retry:
  → Kategorie: lambda_crash (nicht mehr unknown)
  → FPS: 30 (unverändert)
  → Flags: disableLottieIcons + disableMorphTransitions + forceEmbeddedCharacterLottie
  → Render sollte durchgehen ✅

Lottie-Stall, 2. Retry (falls nötig):
  → disableAllLottie=true → alle Lottie-Komponenten aus
  → Maximale Stabilität ✅

Normaler Run ohne Lottie-Stall:
  → Volle 30fps Qualität, alle Effekte ✅
```

---

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
