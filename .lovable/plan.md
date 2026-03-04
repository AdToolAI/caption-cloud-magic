

## Diagnose

**Großer Fortschritt!** Der Fehler ist jetzt:
> "AWS Concurrency limit reached (Original Error: Rate Exceeded)"

Das bedeutet: **Alle Payload-Fixes (r13-r15) haben funktioniert.** Die Lambda startet korrekt, wird aber von AWS gedrosselt weil das Concurrency-Limit erreicht ist.

**Problem:** `invoke-remotion-render` hat keinen Retry bei Rate-Limit-Fehlern im Response Body. Ein HTTP 200 mit Error-Objekt wird sofort als fataler Fehler behandelt (Zeile 273). Der bestehende 429-Fallback (Zeile 310) greift nur bei HTTP-Status 429, nicht bei Concurrency-Fehlern im Body.

## Plan (r16 — Rate Limit Retry)

### 1. Retry mit Backoff in `invoke-remotion-render/index.ts`
- Nach Empfang der Lambda-Response: Prüfe ob `lambdaError` "Rate Exceeded", "Concurrency limit", "TooManyRequestsException" enthält
- Wenn ja: Retry bis zu 3× mit exponential Backoff (5s, 10s, 20s)
- Erst nach erschöpften Retries als fatalen Fehler behandeln
- Logging: `rate_limit_retry_attempt: 1/3` etc.

### 2. Auto-Retry im Frontend erweitern
- Datei: `UniversalAutoGenerationProgress.tsx`
- `isRetryableError` um `Rate Exceeded` und `Concurrency limit` erweitern
- Diese Fehler sind transient — kein Profilwechsel nötig, einfach gleicher Retry

### 3. Canary auf `r16-rateLimitRetry` setzen

**Dateien:**
- `supabase/functions/invoke-remotion-render/index.ts`
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- `supabase/functions/_shared/remotion-payload.ts` (nur Canary)

