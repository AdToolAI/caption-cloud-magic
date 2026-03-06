
r37 — Rate-Limit Auto-Recovery stabilisieren (auf Basis der neuen Logs)

Befund aus den Logs/Screenshot:
- Remotion-Webhooks klassifizieren korrekt als `rate_limit` (`AWS Concurrency limit reached`).
- Letzter Render-Only-Lauf endet bei RetryAttempt=2, danach kein neuer Backend-Retry sichtbar.
- UI zeigt `Render-Retries 2/3`, aber `Gesamt 4/5` und sofort roten Fehlerzustand.

Wahrscheinliche Ursachen:
1) Zwei Fehlerpfade (Realtime-DB + Render-Polling) konkurrieren; wenn `retryTriggeredRef` schon `true` ist, fällt der zweite Pfad derzeit in `setError(...)` statt „Retry läuft bereits“.
2) Im Render-Polling-Pfad fehlt das Rate-Limit-Backoff (aktuell 30s pauschal statt 60/120/180).
3) `totalAttempts` wird bei jedem fehlgeschlagenen Event erhöht (auch bei Duplikaten), dadurch künstlich hohe Gesamtversuche.
4) Render-Only-Ketten-ID wird nicht sauber fortgeschrieben (`sourceProgressId`), daher Retry-Zählung/Scheduling nicht zuverlässig eskalierend.

Umsetzungsplan:
1. `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
   - Retry-Entscheidung in eine gemeinsame Helper-Funktion ziehen (für beide Pfade).
   - Dedupe einbauen (`failureSignatureRef`), damit derselbe Fehler nicht doppelt gezählt/verarbeitet wird.
   - Wenn Retry schon geplant (`retryTriggeredRef=true`) und Fehler retrybar ist: NICHT `setError`, sondern Status „Retry geplant/läuft“ beibehalten.
   - Rate-Limit im Polling-Pfad auf exponentielles Backoff umstellen (60/120/180), inkl. Countdown-UI (wie in Phase 1).
   - `totalAttempts` nur bei tatsächlich neu gestarteten Retry-Aktionen erhöhen.

2. `supabase/functions/auto-generate-universal-video/index.ts`
   - Render-Only-Chain-ID sauber propagieren:
     - `chainSourceProgressId = existingResultData.sourceProgressId || existingProgress.id`
     - Retry-Zählung auf diese Chain-ID filtern.
     - Bei `updateProgress(... ready_to_render ...)` `sourceProgressId: chainSourceProgressId` persistieren.
   - Dadurch steigen `retryAttempt` und Rate-Limit-Strategie deterministisch pro Kette.

Erwartetes Ergebnis:
- Bei `rate_limit` kein sofortiger harter Fehler mehr im UI.
- Sichtbarer Backoff-Countdown + automatischer Retry 3/3.
- Keine künstliche Aufblähung von `Gesamt`.
- Backend-Retry-Kette bleibt konsistent und eskaliert korrekt.

Validierung nach Umsetzung:
- Einen künstlichen Rate-Limit-Fall auslösen und prüfen:
  1) Countdown 60s/120s/180s erscheint,
  2) keine doppelte Fehleranzeige während geplantem Retry,
  3) neue `universal_video_progress`-Rows enthalten `sourceProgressId`,
  4) `retryAttempt` steigt pro Kette korrekt,
  5) Render startet nach Backoff automatisch erneut.
