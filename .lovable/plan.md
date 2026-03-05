

## Diagnose: Warum die Endlosschleife trotz r25 weiterläuft

### Kernproblem gefunden: `calculateFramesPerLambda` hat einen Mathe-Fehler

Die Funktion in `_shared/remotion-payload.ts` (Zeile 55) berechnet:

```text
Beispiel: 60s Video @ 30fps = 1800 Frames

concurrencySafe = ceil(1800 / 8) = 225   ← braucht 225 frames/lambda für max 8 Lambdas
timeoutSafe     = 168                     ← MAX_FRAMES_PER_LAMBDA (mit 0.7 Safety Margin)

framesPerLambda = min(168, max(225, 100)) = min(168, 225) = 168  ← GEKAPPT!
estimatedLambdas = ceil(1800 / 168) = 11  ← IMMER NOCH 11 Lambdas!
```

**Das Timeout-Limit (168) überschreibt das Concurrency-Limit (225).** Ergebnis: 11 Lambdas statt der angestrebten 8 → AWS Concurrency Limit → Rate Limit → Retry → wieder 11 Lambdas → Endlosschleife.

### Warum 225 frames/lambda tatsächlich sicher ist
- 225 Frames × 0.5s/Frame = 112.5s → **unter dem 120s Hard-Timeout**
- Die 0.7 Safety Margin (168) ist zu konservativ und verhindert, dass das Concurrency-Ziel eingehalten wird

### Für Retries wird es noch schlimmer
- Attempt 1: effectiveMaxLambdas = 6, concurrencySafe = ceil(1800/6) = 300
- 300 Frames × 0.5s = 150s → **übersteigt 120s Timeout!**
- System sitzt fest: zu wenige Lambdas → Timeout, zu viele Lambdas → Rate Limit

---

## Plan: 3 chirurgische Fixes

### Fix 1: `calculateFramesPerLambda` korrigieren (`_shared/remotion-payload.ts`)

**Problem:** `min(timeoutSafe, concurrencySafe)` priorisiert Timeout über Concurrency.

**Lösung:** Zwei Limits einführen:
- **Soft Limit** (168): Bevorzugt, mit Safety Margin
- **Hard Limit** (240): Absolutes Maximum basierend auf 120s Timeout

Neue Logik:
```text
hardTimeoutMax = floor(120 / 0.5) = 240   ← absolutes Max
softTimeoutMax = 168                       ← bevorzugt (mit Margin)

Wenn concurrencySafe <= softTimeoutMax → verwende softTimeoutMax (sicherer)
Wenn concurrencySafe <= hardTimeoutMax → verwende concurrencySafe (Concurrency-Priorität)
Wenn concurrencySafe > hardTimeoutMax  → verwende hardTimeoutMax + reduziere fps auf 24
```

Für 1800 Frames: `concurrencySafe=225, hardMax=240` → **225 frames/lambda, 8 Lambdas** ✅

Für Retries (Attempt 1, 6 Lambdas): `concurrencySafe=300 > 240` → **Fallback auf 24fps** (1440 Frames, ceil(1440/6)=240) ✅

### Fix 2: Render-Only Pipeline fps-Reduktion (`auto-generate-universal-video/index.ts`)

In `runRenderOnlyPipeline`: Wenn der berechnete `framesPerLambda` das Hard-Limit übersteigt, automatisch `fps` von 30 auf 24 reduzieren und `durationInFrames` entsprechend anpassen. Das spart 20% Frames bei kaum sichtbarem Qualitätsverlust.

### Fix 3: Frontend Retry-Wartezeit verkürzen (`UniversalAutoGenerationProgress.tsx`)

Aktuell: 60s × Attempt-Nr. Wartezeit bei Rate-Limit (bis zu 180s).
Nachher: 30s feste Wartezeit (die Lambda-Reduktion löst das Problem, nicht die Wartezeit).

---

## Erwartetes Ergebnis

```text
Vorher (60s Video):
  framesPerLambda=168 → 11 Lambdas → Rate Limit → Endlosschleife

Nachher (60s Video, 1. Versuch):
  framesPerLambda=225 → 8 Lambdas → innerhalb AWS Limit ✅

Nachher (Retry Attempt 1):
  24fps → 1440 Frames, framesPerLambda=240 → 6 Lambdas ✅

Nachher (Retry Attempt 2):
  24fps → 1440 Frames, framesPerLambda=360 → 4 Lambdas ✅
```

### Dateien
- `supabase/functions/_shared/remotion-payload.ts` — Fix `calculateFramesPerLambda`
- `supabase/functions/auto-generate-universal-video/index.ts` — fps-Reduktion in `runRenderOnlyPipeline`
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx` — kürzere Wartezeiten

