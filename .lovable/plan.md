## Diagnose

Der Slider ist jetzt authoritativ — top. Der rote „AI-Analyse nicht verfügbar / Netzwerkfehler — Basis-Plan" Toast erscheint aber weiterhin, obwohl die Edge Function laut Logs sauber durchläuft (Pass A ~17s, Pass B ~8s, Persist ok).

Konkret zeigt das an:

- Der Fehler ist **nicht** Timeout (`isAbort=true`) und **nicht** ein bekannter Status (402/429/413/504). Es ist der generische Fall `Netzwerkfehler` in `useStoryboardTransition.ts` Zeile ~1222 — d.h. `fetch()` hat vor der Antwort geworfen (TypeError: Failed to fetch / abgebrochene Verbindung / kurzer Connectivity-Blip / Browser-Extension / Preflight).
- Die Edge Function braucht ~25–35s bis zur Antwort. In dieser Zeit ist die Verbindung anfällig gegenüber:
  - kurzen WLAN/Proxy-Aussetzern,
  - Tab-Throttling,
  - HTTP/2-Stream-Resets,
  - Browser-Extensions (Adblocker, "Bestätigen Sie, dass Sie es sind" im Screenshot → Sicherheits-Overlay).
- Der Late-Arrival-Retry im Grace-Window versucht die gleiche Anfrage nochmal — der Nutzer sieht aber sofort den roten Fallback-Toast + „Lokaler Fallback-Plan"-Banner, weil das Sheet nach 45s ohne Erfolg geöffnet wird bzw. der Late-Retry ebenfalls im gleichen Netzwerkzustand fehlschlägt.

Der eigentliche Fix ist daher nicht am Slider, sondern am Netzwerk-Resilienz-Pfad.

## Plan (v237 — Network Resilience für Briefing-Deep-Parse)

1. **Sofortiger Silent-Retry auf reine Netzwerkfehler**
   - In `useStoryboardTransition.ts` bei `fetch`-Reject ohne `status` (echter `TypeError: Failed to fetch`) bis zu **2 stille Retries** mit 1,5s / 4s Backoff einfügen, **bevor** der Soft-Fail-Pfad greift.
   - Der War-Room bleibt sichtbar mit Label `Verbindung wiederhergestellt — analysiere weiter …`.
   - Timeout/Abort/HTTP-Status bleiben unverändert (kein Retry auf 4xx/5xx).

2. **Late-Arrival-Retry nur einmal, mit Backoff und eigenem AbortController**
   - Der bestehende Late-Arrival-Fetch bekommt 1 zusätzlichen Versuch nach 8s, wenn der erste erneut mit reinem Netzwerkfehler bricht.
   - Bricht auch dieser, öffnet sich der Fallback wie heute — aber mit klarerem Toast (`Verbindung instabil — Basis-Plan als Fallback`).

3. **Bessere Fehler-Attribution im Console-Log**
   - `console.error('[useStoryboardTransition] deep-parse failed', ...)` erweitern um `navigator.onLine`, `e?.name`, `e?.cause?.code`, `attempt`, so dass wir im nächsten Bugreport eindeutig sehen, ob es Offline, DNS, CORS oder Stream-Reset ist.

4. **Kein Verhaltenswechsel bei echten Serverfehlern**
   - 402/429/413/504 und Abort/Timeout laufen weiterhin exakt in ihre bestehenden Pfade. Retry greift ausschließlich bei „reinem" Netzwerkfehler (kein `status`, kein `AbortError`).

5. **Version-Bump**
   - `CLIENT_PIPELINE_VERSION` → 237.

## Ergebnis nach Umsetzung

- Der Fallback-Toast erscheint nur noch, wenn wirklich **3 Versuche + 45s Late-Retry** scheitern — praktisch nur bei echtem Verbindungsverlust.
- Der Slider-Fix aus v236 bleibt unangetastet.
- Bei sporadischen Netzwerk-Blips (wie im aktuellen Screenshot mit dem Sicherheits-Overlay) läuft die Analyse still weiter und öffnet direkt den echten AI-Plan statt des Basis-Fallbacks.
