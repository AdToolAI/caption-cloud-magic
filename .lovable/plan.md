

## Diagnose — Wahre Ursache

Die DB-Daten zeigen: **Jeder einzelne Render scheitert sofort** mit "AWS Concurrency limit reached (Rate Exceeded)". Das Problem ist **nicht** das Retry-System (das funktioniert korrekt — Profile bleibt auf A). Das Problem ist die **Lambda-Parallelisierung**.

Aktuell:
- Video = 1800 Frames (60s × 30fps)
- `framesPerLambda = 22` (berechnet durch `calculateFramesPerLambda`)
- → **82 parallele Renderer-Lambdas** + 1 Orchestrator = **83 gleichzeitige Lambdas**
- AWS-Konto hat wahrscheinlich ein Limit von 10-50 (typisch für neuere Accounts)
- → **Jeder Render scheitert sofort**, egal wie oft wir retrien

Das Frontend-Retry-System (r19/r20) ist korrekt implementiert — Profile bleibt auf "A". Aber es hilft nichts, wenn der Render **physisch nicht starten kann**.

## Plan (r21 — Lambda Concurrency Fix)

### 1. `framesPerLambda` drastisch erhöhen

**Datei:** `supabase/functions/_shared/remotion-payload.ts`

Die Funktion `calculateFramesPerLambda` anpassen:
- Statt `75-150 Concurrency interpolation` → festen Wert berechnen, der **maximal 5 parallele Lambdas** erzeugt
- Formel: `framesPerLambda = Math.ceil(frameCount / 4)` (4 Renderer + 1 Orchestrator = 5 total)
- Minimum 100 (statt 20)
- Für 1800 Frames → `framesPerLambda = 450` → 4 Lambdas statt 82

Dasselbe in `buildStrictMinimalPayload` anpassen (gleiche Logik).

### 2. Maximale Lambda-Parallelisierung als Konfiguration

**Datei:** `supabase/functions/_shared/remotion-payload.ts`

- Neue Konstante `MAX_CONCURRENT_LAMBDAS = 5` am Anfang der Datei
- `calculateFramesPerLambda` nutzt diese Konstante
- Kommentar: "AWS Concurrency Limit für diesen Account — bei Erhöhung der AWS-Quote kann dieser Wert angehoben werden"

### 3. Frontend: Rate-Limit-Retry-Wartezeit erhöhen

**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

- Wartezeit von 30s auf **90s** erhöhen (falls doch ein Rate-Limit auftritt, braucht AWS mehr Zeit zum Abkühlen)
- Max Retries von 2 auf **3** erhöhen

### 4. Endlosschleife verhindern

**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

- Globalen Retry-Counter einbauen, der über alle Retry-Typen (rate_limit + lambda_crash) zählt
- Nach **5 totalen Fehlversuchen** generell stoppen mit klarer Fehlermeldung
- Verhindert die beobachtete "Endlosschleife"

### Dateien
- `supabase/functions/_shared/remotion-payload.ts` — Hauptfix
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx` — Timeout + Limit

### Erwartetes Ergebnis
- 1800-Frame-Video braucht nur 5 statt 83 Lambdas → passt in jedes AWS-Limit
- Render dauert ~3-5x länger (da weniger Parallelisierung), aber funktioniert zuverlässig
- Wenn AWS-Quote später erhöht wird: `MAX_CONCURRENT_LAMBDAS` hochsetzen für schnellere Renders

