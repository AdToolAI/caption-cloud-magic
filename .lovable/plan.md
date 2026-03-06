
Ziel: Den aktuellen “keinen Fortschritt”-Loop stoppen (3/3 Retries → 429) und die Stabilitätsstrategie so anpassen, dass sie bei echten Fehlerketten greift.

Do I know what the issue is? Ja.

Was aktuell konkret schiefläuft:
1) UI-Root-Cause (sichtbar im Screenshot):  
   `auto-generate-universal-video` liefert korrekt `429 + { error: "capacity_cooldown" }`, aber `UniversalAutoGenerationProgress.tsx` liest bei `response.error` nur die generische Message (“non-2xx”). Der JSON-Body wird nicht aus `FunctionsHttpError.context.json()` gelesen.
2) Stabilitäts-Rollout greift zu selten:  
   In den letzten 24h ist `framesPerLambda=1800` (Stability) nur 1x aufgetreten; die meisten Fehlschläge laufen weiter mit 225/300.
3) Retry-Kette verbrennt Budget ungünstig:  
   Bei `audio_corruption` startet der erste Render-only-Retry oft noch distributed (kann sofort `rate_limit` erzeugen), danach bleibt zu wenig Budget bis zum Lottie-Fallback.
4) Lottie-Stall kommt oft erst beim letzten Versuch:  
   `disableAllLottie` wird erst nach `lambda_crash` aggressiv gesetzt; wenn das erst bei Versuch 3 passiert, endet die Kette vor dem echten Recovery-Versuch.

Umsetzungsplan (r40):
A) UI-Fix für 429/capacity_cooldown (sofort)
- Datei: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- Gemeinsame Helper-Funktion einführen: Edge-Function-Fehler robust parsen:
  - `if (error instanceof FunctionsHttpError) await error.context.json()`
  - Fallback: `error.context.status === 429`
- In beiden Flows anwenden:
  - `startRenderOnlyRetry()`
  - `startAutoGeneration()`
- Bei `capacity_cooldown`: immer `setCapacityCooldown(true)` + `setCooldownMinutes(...)`, kein generischer Red Error State.

B) Stabilitätsstrategie von “zufällig” auf “deterministisch + failure-aware”
- Datei: `supabase/functions/_shared/remotion-payload.ts`
- `determineSchedulingMode()` auf deterministisches Canary-Sampling umstellen (hash-basiert statt `Math.random()`), damit ein User nicht zufällig dauerhaft außerhalb Canary bleibt.
- Zusätzlich Failure-aware Override:
  - Bei Usern mit jüngsten Infra-Failures standardmäßig `stability`.
- Optionaler Schalter für Hotfix-Phase: temporär 100% stability.

C) Render-only Retry-Strategie korrigieren (kein früher Rate-limit-Verbrauch)
- Datei: `supabase/functions/auto-generate-universal-video/index.ts`
- In `runRenderOnlyPipeline()`:
  - `forceStability` nicht nur bei `rate_limit`, sondern auch bei `audio_corruption`, `timeout`, `lambda_crash`.
  - Audio-corruption-Retry bleibt audio-stripped + stability von Versuch 1 an.
  - Lottie-safe früher aktivieren (spätestens ab Retry 2 bei wiederholten Infra-Failures), nicht erst “zu spät” im letzten Slot.
- Retry-Budget so anpassen, dass ein echter Lottie-Recovery-Versuch noch stattfinden kann (z. B. gezielter zusätzlicher letzter Versuch nur für Lottie-Stall-Kette).

D) Observability schließen (für echte Messbarkeit)
- Dateien:
  - `supabase/functions/auto-generate-universal-video/index.ts`
  - `supabase/functions/invoke-remotion-render/index.ts`
- `schedulingMode`, `framesPerLambda`, `estimatedLambdas`, `retryAttempt`, `strategyFlags` in `universal_video_progress.result_data` und `video_renders.content_config` bei jedem Versuch persistieren (auch bei Immediate-Fail-Pfaden).

Validierung nach Umsetzung:
1) UI-Test: 3/3 Retry-Ende muss Cooldown-UI zeigen, nicht “non-2xx”.
2) DB-Check: neue Fehlversuche enthalten vollständig `errorCategory` + Scheduling-Metadaten.
3) Canary/Hotfix-Metrik: Anteil `framesPerLambda=1800` deutlich höher; `rate_limit`-Anteil sinkt.
4) End-to-end: mindestens 5 neue Ketten laufen durch, ohne generischen UI-Abbruch.

Betroffene Dateien:
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- `supabase/functions/_shared/remotion-payload.ts`
- `supabase/functions/auto-generate-universal-video/index.ts`
- `supabase/functions/invoke-remotion-render/index.ts`
