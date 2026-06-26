
## Ziel
26/29 → 29/29 grün. Die drei Fails sind **keine echten Bugs**, sondern reine Smoke-Mock-Lücken — die Functions wurden noch nicht in den `x-qa-mock`-Pfad eingebunden.

## Root-Cause pro Fail

| Function | Fehler | Ursache |
|---|---|---|
| `analyze-image-v2` | 401 Unauthorized | Ruft `supabase.auth.getUser()` mit dem Anon-Header des Sweep-Callers → kein echter User → 401. Hat zwar `x-qa-mock` in CORS, aber **kein Short-Circuit** im Handler. |
| `search-stock-videos` | 401 Unauthorized | Gleiche Mechanik (User-Check vor Mock-Pfad), und `x-qa-mock` fehlt sogar in CORS. |
| `extract-subtitle-keywords` | 500 `extraction_failed` „No ob[ject generated]" | Geht direkt zum Lovable-AI-Gateway (Gemini structured output) — kein `qaMock`-Pfad. Wenn das Gateway im Sweep-Kontext kein valides Object liefert, schlägt es hart fehl. |

## Fix (3 kleine, gleichartige Patches)

In jeder der drei Edge-Functions ganz am Anfang des Handlers (direkt nach dem OPTIONS-Return) den standardisierten Mock-Guard einbauen:

```ts
import { isQaMockRequest, qaMockResponse } from '../_shared/qaMock.ts';
…
if (isQaMockRequest(req)) {
  return qaMockResponse({ /* function-spezifischer Sample-Body */ });
}
```

Function-spezifische Mock-Payloads:

- **extract-subtitle-keywords** → `{ results: [{ id: '1', keywords: ['test'] }] }`
- **search-stock-videos** → `{ ok: true, videos: [], total: 0, source: 'mock' }`
- **analyze-image-v2** → `{ ok: true, quality: { resolution:{width:1920,height:1080}, aspectRatio:'16:9', fileSize:0, qualityScore:90, issues:[] }, crops:{square:'',portrait:'',story:''} }`

Zusätzlich bei `search-stock-videos` `x-qa-mock` in den CORS-Allow-Headers ergänzen (analog zu `analyze-image-v2`).

## Verifikation
1. Functions deployen.
2. Im QA-Cockpit erneut „Sweep starten".
3. Erwartung: **29/29 Pass**, keine 401/500 mehr in Briefing, Misc und Picture/Image.

## Nicht im Scope
- Keine Änderungen an Produktions-Logik der drei Functions.
- Keine Registry-Body-Anpassungen nötig (Bodies sind valide).
- Wave B (weitere ~250 Functions) bleibt separates Paket.
