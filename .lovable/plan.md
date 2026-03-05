

## Diagnose

Die Logs zeigen eine klare Kausalkette:

1. **Replicate 429 (Kein Guthaben)**: Alle 5 Szenen-Visuals scheitern mit "429 Too Many Requests — less than $5.0 in credit". SVG-Placeholder-Uploads funktionieren korrekt (r22 Fix greift).

2. **Lambda-Start erfolgreich**: `invoke-remotion-render` startet Lambda erfolgreich (Status 200, renderId `7ph97xox93`), `framesPerLambda: 450` (r21 Fix greift — nur ~4 Lambdas).

3. **Lambda TIMEOUT nach 120s**: Die Lambda-Funktion heißt `remotion-render-4-0-424-mem2048mb-disk2048mb-**120sec**` — sie hat ein **AWS-seitiges Timeout von 120 Sekunden**. Aber `timeoutInMilliseconds` im Payload ist `300000` (5 Minuten). Das hilft nichts, weil die Lambda-Funktion selbst nach 120s von AWS gekillt wird.

4. **Webhook liefert `type: "timeout"`**: Der Webhook-Handler klassifiziert das korrekt als `timeout`, aber die Fehlermeldung ist `undefined` (weil `errors` bei Timeout-Webhooks nicht gesetzt ist). Die Status-Message wird: `"Rendering fehlgeschlagen: undefined"`.

5. **Frontend zeigt "Unknown error"**: Weil `errorMessage` = `"undefined"` ist, und das Frontend-Error-Category-Mapping den String "undefined" nicht erkennt → `errorCategory: unknown`.

### Kernproblem

Ein 1800-Frame (60s) Video mit `framesPerLambda: 450` erzeugt 4 Renderer-Lambdas, die jeweils 450 Frames rendern müssen. Bei einer Lambda mit nur **120s Timeout und 2048MB RAM** ist das **physisch unmöglich** — 450 Frames × ~0.5-1s pro Frame = 225-450s benötigt, aber nur 120s verfügbar.

### Zwei Fixes nötig

**A) `framesPerLambda` an das Lambda-Timeout anpassen** — statt nur Concurrency zu begrenzen, muss die Arbeit pro Lambda in 120s schaffbar sein. Bei ~0.5s/Frame schafft eine Lambda ~200 Frames in 120s. Sicherheitsmarge: `framesPerLambda = 120` → 15 Lambdas für 1800 Frames. Das ist ein Mittelweg: weniger als 82 (vorher), mehr als 4 (r21).

**B) Timeout-Fehlermeldung fixen** — `errors` ist bei Timeout-Webhooks `undefined`, was zu "Unknown error" im Frontend führt.

## Plan (r23 — Lambda Timeout Fix)

### 1. `framesPerLambda` an Lambda-Timeout kalibrieren

**Datei:** `supabase/functions/_shared/remotion-payload.ts`

- `MAX_CONCURRENT_LAMBDAS = 5` ersetzen durch timeout-basierte Berechnung
- Neue Konstante: `LAMBDA_TIMEOUT_SECONDS = 120` und `ESTIMATED_SECONDS_PER_FRAME = 0.5`
- `MAX_FRAMES_PER_LAMBDA = Math.floor(LAMBDA_TIMEOUT_SECONDS / ESTIMATED_SECONDS_PER_FRAME * 0.7)` = ~168
- `calculateFramesPerLambda` setzt `framesPerLambda = Math.min(MAX_FRAMES_PER_LAMBDA, frameCount)` 
- Für 1800 Frames → ~11 Lambdas (statt 4 oder 82)
- Minimum bleibt 100 (kurze Videos)

### 2. Timeout-Fehlermeldung korrigieren

**Datei:** `supabase/functions/remotion-webhook/index.ts`

- Bei `type === 'timeout'`: Wenn `errors` undefined/null ist, setze `errorMessage` auf `"Lambda-Timeout: Rendering hat das Zeitlimit überschritten"`
- `errorCategory` wird bereits korrekt auf `'timeout'` gesetzt (Zeile 215), aber nur wenn es nicht vorher als `unknown` klassifiziert wird — der `classifyError`-Check auf `errorMessage` liest jetzt "undefined" als String, trifft keine Regex → fällt durch zu `type === 'timeout'` Check → **sollte eigentlich `timeout` sein**. Muss prüfen ob der Frontend-Code `timeout` korrekt handled.

### 3. Frontend: `timeout` Error-Category behandeln

**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

- `timeout` als retry-fähigen Fehler behandeln (same-profile retry wie `rate_limit`, da es ein transientes Infrastruktur-Problem ist)
- User-Message: "Das Rendering hat das Zeitlimit überschritten. Erneuter Versuch..."

### Dateien
- `supabase/functions/_shared/remotion-payload.ts` — Hauptfix: framesPerLambda Kalibrierung
- `supabase/functions/remotion-webhook/index.ts` — Fehlermeldung bei Timeout
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx` — Timeout-Handling

### Erwartetes Ergebnis
- 1800-Frame-Video: ~11 Lambdas statt 4, jede rendert ~164 Frames in ~82s (unter 120s Limit)
- Kein "Unknown error" mehr bei Timeouts
- Bei echtem Timeout: klare Meldung + automatischer Retry

