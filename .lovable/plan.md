## Antwort auf die Frage: Ja, AWS wird jetzt benutzt — aber der Aufruf schlägt fehl

Belegt aus den aktuellen Logs (Scene `7c11bc27…`, 13:01 UTC):

```
[mouth-motion-verdict] pass=3 probe_retry frame extraction issues (0/6 ok):
t=0.18:unparsable_lambda_body:  | t=0.86:unparsable_lambda_body:  | …
verdict=unknown frames=0 … 206 ms
```

Zwei Dinge stehen darin:

1. **Kein Replicate/lucataco mehr** — kein `model_lookup_404` in keinem Log. Die AWS-Umstellung aus v347 ist wirksam.
2. **Der AWS-Still-Aufruf liefert nichts Verwertbares**: Lambda antwortet mit HTTP-OK, aber **leerem Body** (`unparsable_lambda_body:` ohne Inhalt), und zwar für alle 6 Frames in ~200 ms zusammen. Ein echter Still-Render dauert Sekunden — es wurde also nie gerendert; der Payload wird vom Remotion-Lambda gar nicht erst angenommen.

Der Unterschied zur funktionierenden Strecke: Preclips und Plates gehen über `invoke-remotion-render` (Payload-Sanitizing, Rate-Limit-Retry, Event-Fallback, Status über `video_renders`). Der neue Probe ruft Lambda direkt und roh auf — ohne diese Absicherung und ohne die Felder, die diese Strecke mitliefert.

### Und deshalb scheitert die Szene trotz v347

v347 hat den Webhook entschärft (`unknown` = nur Telemetrie). Das **Mux-Gate wurde aber nicht mitgezogen**: `render-sync-segments-audio-mux` blockiert weiterhin jeden Pass, dessen Verdict nicht exakt `moved` ist — genau daher der Text im Screenshot: „Die Mundbewegung konnte für Samuel Dusatko, Matthew Dusatko, Sarah Dusatko, Kailee nicht serverseitig bestätigt werden." Solange die Messung kaputt ist, kann kein Pass jemals `moved` erreichen, also fällt jede Szene.

## Fix v348

1. **Still-Rendering über die bewährte Strecke statt Roh-Invoke**
   - `_shared/aws-frame-probe.ts` dispatcht künftig wie `pass-face-preclip`: `video_renders`-Zeile mit eigener `source: "dialog-pass-motion-probe"`, Aufruf über `invoke-remotion-render`, Ergebnis über Polling/Storage-URL.
   - Bevor die Antwort verworfen wird, werden HTTP-Status, `X-Amz-Function-Error` und Body-Länge geloggt — damit ein leerer Body nie wieder als anonymer „unparsable" endet.
   - `remotion-webhook` bekommt für die neue `source` einen No-Op-Zweig (nur `video_renders` abschließen, keine Szenen-Patches).

2. **Widerspruch im Mux-Gate auflösen**
   - `static` (echte Messung, keine Bewegung) → blockiert weiterhin hart. Unverändert streng.
   - `unknown` (Messung ausgefallen) → blockiert **nicht** mehr. Die Szene wird gemuxt, das Pass-Ergebnis wird als `motion_unverified` markiert und im Log/Diagnosefeld geführt.
   - Begründung: eine ausgefallene Eigenmessung darf ein erfolgreiches Provider-Ergebnis nicht in einen Kundenfehler verwandeln — genau das passiert seit v344.

3. **Regression absichern**
   - Test: `unknown` in allen Passes ⇒ Mux läuft, Szene wird nicht `failed`, kein `needs_clip_rerender`.
   - Test: ein `static`-Pass ⇒ Mux blockiert weiterhin.
   - Bestehender Guard-Test gegen `lucataco`/`replicate.com` bleibt.

4. **Deploy und Verifikation**
   - Deploy: `render-sync-segments-audio-mux`, `sync-so-webhook`, `remotion-webhook`.
   - Danach an einer echten Szene prüfen: Frames > 0 oder — falls AWS weiter zickt — Szene läuft trotzdem mit Lip-Sync durch statt zu scheitern.

## Technische Details

- Betroffen: `supabase/functions/_shared/aws-frame-probe.ts`, `supabase/functions/render-sync-segments-audio-mux/index.ts` (Zeilen 198–232), `supabase/functions/remotion-webhook/index.ts`, `supabase/functions/_shared/mouth-motion-verdict.test.ts`.
- Kein Bundle-Redeploy nötig: `DialogTurnFaceCropVideo` existiert im aktuellen `REMOTION_SERVE_URL`-Bundle.
