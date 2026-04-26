## Diagnose

Die 3 verbleibenden roten Szenarien (**Performance Analytics**, **Posting Times Recommendation**, **Campaign Generation**) sind **keine Code-Bugs**. Verifizierung:

- **Direkter Curl-Test** der 3 Funktionen → alle liefern **HTTP 200** mit korrekten, vollständigen Antworten (Best Times, Recommendations, Campaign-Wochenplan).
- **DB-Logs** der letzten Runs zeigen für alle 3 ausschließlich:
  ```
  HTTP 503: {"code":"SUPABASE_EDGE_RUNTIME_ERROR","message":"Service is temporarily unavailable"}
  ```
- Latenzen: **58ms / 62ms / 735ms** → klassisches Edge-Worker-Cold-Start- bzw. Throttle-Symptom wenn der Runner viele Funktionen gleichzeitig feuert.

Das Problem: Der Test-Runner behandelt **transiente 503er als harten Fail**, obwohl die Funktion bei einem Retry sofort wieder antwortet.

## Lösung: Transparenter Retry für 503/504/502

### Änderung 1 — `supabase/functions/ai-superuser-test-runner/index.ts`

In der Scenario-Execution-Schleife (rund um Zeile 555–610) einen **automatischen Retry-Wrapper für transiente 5xx-Edge-Runtime-Fehler** einbauen:

```ts
// Pseudocode
async function invokeWithRetry(fn: string, body: unknown, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(...);
    const text = await res.text();
    
    // Retry nur bei transienten Plattform-Fehlern
    const isTransient = 
      (res.status === 503 || res.status === 504 || res.status === 502) &&
      text.includes('SUPABASE_EDGE_RUNTIME_ERROR');
    
    if (isTransient && attempt < maxAttempts) {
      await sleep(500 * attempt); // 500ms, 1000ms backoff
      continue;
    }
    return { res, text };
  }
}
```

- **Max 3 Versuche** mit linearem Backoff (500ms, 1000ms).
- Greift **nur** bei `503/504/502 + SUPABASE_EDGE_RUNTIME_ERROR`-Body — andere 5xx (echte Code-Fehler) werden **nicht** retryed.
- Wenn nach 3 Retries immer noch 503: Status wird auf **`warning`** gesetzt (statt `fail`) mit Hinweis `"Platform throttling — retried 3x"`. So unterscheiden wir klar zwischen Plattform-Hiccups und echten Bugs.

### Änderung 2 — Sequenzielle statt parallele Execution für sensitive Szenarien

Aktuell läuft `runAllScenarios` mit `Promise.all` über alle Szenarien. Das verursacht den 503-Burst.

- **Throttle auf max 4 parallele Szenarien** (statt all-at-once) mit einer kleinen `pLimit`-artigen Helper-Funktion.
- Reduziert Edge-Worker-Last drastisch und eliminiert die Hauptursache der transienten 503er.

### Änderung 3 — Anomalie-Engine entlasten

Da 503-Wellen jetzt im Test-Runner abgefangen werden, sieht `analyze-superuser-anomalies` weniger False-Positives. Optional ergänzend: **automatisches Schließen alter Anomalien**, deren letzter Run gerade `pass` oder `warning` war (keine Code-Änderung nötig, ist bereits geplant in der vorherigen Iteration).

## Erwartetes Ergebnis

- **3 rote Szenarien → grün** (oder im Worst Case `warning` bei realen Plattform-Problemen — aber nicht mehr `fail`).
- Pass-Rate des KI Superusers steigt von **~85% → ~98%**.
- Kein Maskieren echter Bugs: Nicht-transiente Fehler (HTTP 4xx, andere 5xx, Validation-Errors) bleiben weiterhin `fail`.

## Geänderte Dateien

- `supabase/functions/ai-superuser-test-runner/index.ts` (Retry-Wrapper + Throttle)

## Was NICHT geändert wird

- Die 3 Edge-Functions selbst (`analyze-performance`, `analyze-posting-times`, `generate-campaign`) — sie funktionieren einwandfrei.
- Motion Studio Superuser bleibt unangetastet.
