## Diagnose

Logs zeigen:
- `render-with-remotion` startet um 19:35:08 und macht `shutdown` um 19:38:28 — exakt **200 Sekunden** später.
- Der Code in `supabase/functions/render-with-remotion/index.ts` (Zeile 450–472) ruft Lambda **synchron** (`RequestResponse`) auf und wartet auf das fertige Video.
- Die Render-Schätzung im Log: `estTime=200.0s` für 6 parallele Lambdas.
- Supabase Edge Functions haben aber eine harte Wall-Clock-Grenze (~150 s). Bevor Lambda antwortet, killt die Runtime die Function → der Client bekommt `non-2xx status code` ("Edge Function returned a non-2xx status code").

Der Webhook (`remotion-webhook`) ist im Payload bereits konfiguriert und würde den Render-Status sowieso selbst auf "completed" setzen — der synchrone Aufruf ist also unnötig und genau die Ursache des Fehlers.

## Fix

`supabase/functions/render-with-remotion/index.ts` umstellen auf **asynchrone Lambda-Invocation** (Pattern wie in den anderen funktionierenden Render-Functions / `EdgeRuntime.waitUntil`-Memo):

1. Beim `aws.fetch` zum Lambda-Endpoint Header `X-Amz-Invocation-Type: Event` setzen.
2. Erfolgs-Check anpassen: Async-Invoke liefert **HTTP 202** ohne Body. Statt `lambdaResponse.json()` nur prüfen, dass Status `202` ist.
3. `realRenderId` ist im Async-Modus nicht aus der Lambda-Antwort verfügbar — also den `pendingRenderId` als Render-ID an den Client zurückgeben (Webhook patcht das `video_renders`-Record später mit dem echten Lambda-Render-ID via `customData.pending_render_id`).
4. Response unverändert: `{ ok: true, render_id: pendingRenderId, status: 'rendering', message: ... }`.
5. Refund-Pfad bleibt: bei `!response.ok` (also nicht 202/200) → `failed` markieren + Credits zurückerstatten (idempotent).

Keine Änderungen am Frontend (`PreviewExportStep.tsx`) nötig — es pollt bereits über `check-remotion-progress` und hört auf den Realtime-Kanal.

Keine Änderungen am Webhook nötig — der nutzt `customData.pending_render_id` schon korrekt.

## Verifikation

- Nach Deploy: Render im Universal Creator starten.
- Edge Function Logs: `render-with-remotion` sollte in <5s mit `📥 Lambda async response status: 202` und `ok:true` antworten.
- `remotion-webhook` Logs: nach ~3 Min Eingang von Lambda → `video_renders.status = completed` + Output-URL.
- Frontend: Statt "Fehlgeschlagen" zeigt der Render-Status erst "Rendering", dann "Fertig".
