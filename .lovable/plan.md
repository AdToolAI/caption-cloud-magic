## Befund

Der aktuelle Fehler ist wieder kein Frontend-Problem. In der Datenbank steht der letzte Render als `failed` mit `The operation was aborted`, und `content_config.real_remotion_render_id` ist weiterhin leer. Die Function-Logs zeigen: `render-with-remotion` erstellt den Render-Datensatz und baut den Lambda-Payload, aber danach wird keine echte Remotion-Render-ID gespeichert.

Auffällig ist außerdem: Obwohl im Code „Stability Mode“ existiert, läuft der letzte Universal-Creator-Render laut Payload-Diagnose weiterhin mit `DISTRIBUTED scheduling`: 600 Frames → `framesPerLambda=100` → 6 Lambdas. Das ist genau der Bereich, in dem die vorherigen AWS-Concurrency-/Abort-Probleme entstanden sind.

## Plan

1. **Universal-Creator wirklich auf Stability Scheduling zwingen**
   - In `render-with-remotion/index.ts` beim Aufbau des Lambda-Payloads explizit `_schedulingMode: 'stability'` setzen.
   - Für den gezeigten 20s-Render ergibt das 600 Frames → 2 Lambdas statt 6.
   - `maxRetries` nicht mehr aktiv auf `1` heruntersetzen, damit der Normalizer wieder die vorgesehenen 3 internen Remotion-Retries verwenden kann.
   - `timeoutInMilliseconds` auf 600s angleichen, passend zur Lambda-Konfiguration.

2. **Abgebrochene Lambda-Start-Requests als transient behandeln**
   - `AbortError`, `operation was aborted`, `timeout`, `idle timeout` im Lambda-Start-Retry als retrybare Signale klassifizieren.
   - Kurzer Backoff wie bisher, aber nach Ausschöpfen der Versuche mit einer klaren deutschen Meldung und idempotenter Credit-Erstattung.
   - Die Datenbank bekommt strukturierte Felder wie `error_category: 'timeout' | 'rate_limit'` und `failure_stage: 'lambda_start'`, damit die UI nicht nur „non-2xx“ zeigt.

3. **Response-Status konsistent halten**
   - Wenn der Lambda-Start scheitert, bleibt die Function-Antwort bei HTTP 200 mit `{ ok:false, error, error_category }`, statt dass das Frontend nur den generischen `Edge Function returned a non-2xx status code` sieht.
   - Der bestehende `catch`-Block wird erweitert, sodass auch unerwartete Fehler nach bereits abgezogenen Credits denselben strukturierten Fehlerpfad nutzen.

4. **Progress-Check nicht bei fehlender echter Render-ID eskalieren lassen**
   - Wenn nach kurzer Zeit noch kein `real_remotion_render_id` vorhanden ist, soll `check-remotion-progress` keine S3-List-Recovery erzwingen, sondern bis zu einem klaren Start-Failure-Zeitfenster weiter `rendering`/„Start wird bestätigt“ melden.
   - Erst danach als `start_failed` markieren und Credits einmalig erstatten.

5. **Frontend-Fehlermeldung verbessern**
   - `PreviewExportStep.tsx` soll bei `ok:false` direkt die echte Backend-Meldung anzeigen.
   - Für generische `FunctionsHttpError`-Fälle wird `extractFunctionsError()` genutzt, damit Response-Body-Details statt `Edge Function returned a non-2xx status code` erscheinen.

6. **Verifikation nach Umsetzung**
   - Edge Functions `render-with-remotion` und `check-remotion-progress` deployen.
   - Mit einem Smoke-Test prüfen, dass `render-with-remotion` entweder `ok:true` plus `real_remotion_render_id` zurückgibt oder `ok:false` mit klarer Meldung.
   - Den neuesten `video_renders`-Datensatz prüfen: kein leerer `real_remotion_render_id` bei erfolgreichem Start; bei Fehlschlag strukturierte `error_category` und Refund-Flag.