
Ziel: Die neue Fehlerlage beheben, damit Timeout-Fehler nicht mehr als `unknown` enden und Render-Only-Retries zuverlässig starten.

1) Analyse aus den aktuellen Logs (gesichert)
- Letzter Lauf `7l662yv7lj`: Main-Path wurde korrekt auf 24fps reduziert (`1440 Frames`, `framesPerLambda=180`) und endete trotzdem mit `type=timeout`.
- In `video_renders` ist `error_category=timeout` korrekt gespeichert.
- In `universal_video_progress` fehlt aber durchgehend `result_data.errorCategory` (0 von 191 failed rows in 7 Tagen).
- Frontend liest bei `status=failed` primär `result_data.errorCategory`; dadurch entsteht `Pipeline error category: unknown` und der Auto-Retry wird nicht ausgelöst.

2) Backend-Fix: Fehlerkategorie in Progress sauber persistieren
- Datei: `supabase/functions/remotion-webhook/index.ts`
  - Beim Failed-Update von `universal_video_progress` `result_data` mergen (nicht überschreiben) und setzen:
    - `errorCategory`, `errorMessage`, `webhookType`, `failedAt`
  - Bestehende Felder (insb. `lambdaPayload`) müssen erhalten bleiben.
- Datei: `supabase/functions/invoke-remotion-render/index.ts`
  - Bei Immediate-Failures (`lambdaError`) ebenfalls kategorisieren und in `universal_video_progress.result_data` persistieren.
- Datei: `supabase/functions/check-remotion-progress/index.ts`
  - Timeout-Pfade immer mit `errorCategory: 'timeout'` zurückgeben und in DB spiegeln (inkl. `content_config.error_category`).

3) Frontend-Fix: robuste Klassifizierung + Retry-Trigger
- Datei: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
  - Einheitliche `classifyPipelineError()` einführen (inkl. `timeout|zeitlimit|frames pro lambda`).
  - In beiden Fehlpfaden (`status=failed` + polling `fatalErrorEncountered`) diese Funktion nutzen.
  - Dedupe-Guard für doppelte Failed-Events (Realtime + Polling), damit `Gesamt x/5` nicht künstlich hochzählt.

4) Retry-Strategie für Timeout korrigieren (30fps-first bleibt)
- Datei: `supabase/functions/auto-generate-universal-video/index.ts`
  - Render-Only-Scheduling fehlerartabhängig machen:
    - `rate_limit`: bisherige Lambda-Reduktion beibehalten.
    - `timeout`: **keine** künstliche Reduktion der Max-Lambdas (sonst steigt `fpl` unnötig).
  - Timeout-Fallback-Kette ab Retry 1 aggressiver: `24fps -> 20fps -> 15fps` (bei bereits 24fps direkt auf 20fps).
  - Erwartung: bei 20fps typischerweise ~1200 Frames, `fpl≈150` bei 8 Lambdas.

5) Verifikation nach Umsetzung
- DB prüfen: neue failed `universal_video_progress`-Rows enthalten `result_data.errorCategory='timeout'`.
- UI prüfen: kein `unknown` mehr, Retry-Zähler startet korrekt, Render-Only wird automatisch ausgelöst.
- Lauf testen: 30fps-first, bei Timeout automatischer Retry mit 20fps.
- Edge-Logs prüfen: Retry-Payload zeigt reduzierte fps + stabilere `framesPerLambda`.
