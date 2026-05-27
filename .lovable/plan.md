## Problem

Neue Fehlermeldung im UI:
> `Request idle timeout limit (150s) reached (IDLE_TIMEOUT)`

Ursache: Mit der letzten Änderung wartet `render-with-remotion` synchron auf den AWS Lambda-Start (`await startRemotionRender`). Wenn AWS in den ersten Versuchen abbricht (`operation was aborted`) und unsere Retry-Schedule `[2s, 5s, 10s]` plus tatsächliche AWS-Latenz dazukommt, überschreitet die Edge Function den harten Supabase-Idle-Timeout von **150 s** — die Antwort kommt nie an, das Frontend zeigt `IDLE_TIMEOUT`.

Wir hatten vorher schon `EdgeRuntime.waitUntil` benutzt, das funktioniert; das Problem damals war nur, dass die `real_remotion_render_id` zu spät geschrieben wurde. Das lässt sich aber rein über den Polling-Pfad sauber abfangen — der Webhook ist ohnehin die maßgebliche Quelle.

## Plan

### 1. `supabase/functions/render-with-remotion/index.ts` — zurück auf asynchronen Lambda-Start
- DB-Insert (`video_renders` mit `status: 'rendering'`) bleibt **vor** dem Lambda-Call (wie heute).
- `startRemotionRender(...)` nicht mehr `await`en, sondern in `EdgeRuntime.waitUntil(...)` einhängen.
- Sofort `200 OK` mit `{ ok: true, render_id: pendingRenderId, status: 'rendering' }` zurückgeben — `real_remotion_render_id` wird durch den Hintergrundlauf später in `content_config` geschrieben (Code dafür existiert bereits in `startRemotionRender`).
- Bei nicht abgefangenen Fehlern im Hintergrund kümmert sich `failRenderAndRefundOnce` bereits um Status `failed` + idempotenten Refund.

### 2. `supabase/functions/check-remotion-progress/index.ts` — Warmlauf-Phase tolerieren
- Bestehende Logik („wenn jünger als 30 s und keine `real_remotion_render_id` → weiter `rendering` melden") leicht erhöhen auf **60 s**, damit der asynchrone Start nicht fälschlich als `start_failed` markiert wird.
- Wenn nach > 60 s immer noch keine `real_remotion_render_id` da ist und der DB-Status nicht `failed` ist, weiter `rendering` melden (Webhook übernimmt am Ende) — also keine neue Eskalation, nur die Schwelle anheben.

### 3. `src/components/universal-creator/steps/PreviewExportStep.tsx` — Fehlermeldung-Mapping
- `IDLE_TIMEOUT`/`idle timeout` aus der Backend-Antwort weiterhin abfangen und als „AWS-Start dauert ungewöhnlich lang. Bitte erneut versuchen." anzeigen — als zusätzlicher Sicherheitsnetz-Fall, falls der Edge-Function-Wrapper selbst (vor unserer Antwort) timed-outet.
- Sonst keine UI-Änderungen.

### 4. Verifikation
- `render-with-remotion` und `check-remotion-progress` deployen.
- In den Edge-Function-Logs prüfen: Antwort kommt unter ~2 s, `EdgeRuntime.waitUntil` schreibt `real_remotion_render_id` innerhalb von ~10–30 s.
- Frontend: Render starten → kein `IDLE_TIMEOUT` mehr; Status geht über `rendering` → `completed`.

## Was sich **nicht** ändert

- Scheduling-Mode (`stability`), `timeoutInMilliseconds: 600000`, Backoff-Schedule, Webhook-Pfad, Credit-Refund-Logik.
- `failRenderAndRefundOnce` bleibt 1:1 — Refund weiterhin idempotent über `credit_refund_done`.
