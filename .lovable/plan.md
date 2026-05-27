
## Problem

Der Render schlägt jetzt sauber fehl (kein Hänger mehr!) mit:
> AWS Concurrency limit reached (Original Error: Rate Exceeded.)

Das ist ein bekanntes Lambda-Verhalten: Wenn AWS zu viele parallele Invocations sieht (z.B. weil andere Renders im Konto laufen, oder Lambda gerade hochskaliert), wirft `renderMediaOnLambda` synchron `Rate Exceeded`. Aktuell behandeln wir das als finalen Fehler → Job failed, Credits refunded, User muss manuell neu starten.

Laut Memory ([Deep Sweep Throttle Resilience](mem://features/qa-agent/deep-sweep-throttle-resilience)) haben wir diese Logik im QA-Agent bereits, aber **nicht im Production-Renderpfad** für Universal Creator.

## Lösung

Retry mit exponentiellem Backoff in `render-with-remotion` (Background-Worker), **bevor** wir den Job als failed markieren und Credits refunden.

### Plan

1. **`supabase/functions/render-with-remotion/index.ts`** — `startRemotionRenderInBackground`:
   - Wrap des `renderMediaOnLambda`-Calls in einen Retry-Loop:
     - Max 5 Versuche
     - Backoff: 3s → 6s → 12s → 24s → 48s (mit ±20% Jitter)
     - Retry nur bei Throttle-Mustern: `Rate Exceeded`, `TooManyRequestsException`, `ConcurrencyLimitExceeded`, `AWS Concurrency limit reached`, HTTP 429
     - Alle anderen Fehler → sofort failen (kein blindes Retry)
   - Während Retry: `video_renders.status` bleibt auf `rendering`, aber wir schreiben `error_message = "Warte auf AWS-Kapazität (Versuch X/5)…"` damit der User Feedback sieht
   - Erst wenn alle 5 Versuche scheitern → `failRenderAndRefundOnce` mit klarer Meldung "AWS-Kapazität dauerhaft erschöpft, bitte später erneut versuchen"

2. **`src/components/universal-creator/steps/PreviewExportStep.tsx`** — Anzeige:
   - Wenn `error_message` mit "Warte auf AWS-Kapazität" beginnt, das **nicht** als Fehler darstellen, sondern als gelben "Retry läuft…" Hinweis (Spinner statt rotes X)
   - Polling-Timeout pro Job von 6 min auf **10 min** erhöhen, damit die volle Retry-Kette (max ~93s Backoff + Render) reinpasst

3. **`supabase/functions/check-remotion-progress/index.ts`** — Timeout-Schutz:
   - `UNIVERSAL_CREATOR_TIMEOUT_SECONDS` von 360 → 600 (10 min), passt zu Frontend

4. **Deploy & Test**
   - `render-with-remotion` und `check-remotion-progress` deployen
   - User testet erneut → Erwartung: entweder erfolgreicher Render nach 1-2 Retries, oder klare Meldung nach 10 min mit Refund

### Was wir NICHT ändern

- Lambda-Concurrency-Konfiguration in AWS (nicht im Code-Scope)
- Andere Renderpfade (Director's Cut, Composer) — können in Folge-Loop nachgezogen werden, falls gewünscht

## Technische Details

**Retry-Helper** (neu in `render-with-remotion/index.ts`):
```ts
const THROTTLE_PATTERNS = [
  /rate exceeded/i,
  /toomanyrequests/i,
  /concurrencylimitexceeded/i,
  /aws concurrency limit/i,
  /\b429\b/,
];

async function invokeLambdaWithRetry(payload, renderId, supabase) {
  const delays = [3000, 6000, 12000, 24000, 48000];
  let lastError;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      return await renderMediaOnLambda(payload);
    } catch (e) {
      const msg = String(e?.message ?? e);
      const throttled = THROTTLE_PATTERNS.some(rx => rx.test(msg));
      if (!throttled || attempt === delays.length - 1) throw e;
      lastError = e;
      await supabase.from('video_renders').update({
        error_message: `Warte auf AWS-Kapazität (Versuch ${attempt + 2}/5)…`,
      }).eq('id', renderId);
      const jitter = 1 + (Math.random() * 0.4 - 0.2);
      await new Promise(r => setTimeout(r, delays[attempt] * jitter));
    }
  }
  throw lastError;
}
```

Aufruf-Site ersetzt den direkten `renderMediaOnLambda(...)` durch `invokeLambdaWithRetry(...)`.
