
# Fix: Zurueck zu synchroner Lambda-Invocation

## Ursache

Im Dezember 2025 funktionierten Renders mit synchroner Lambda-Invocation (`RequestResponse`). Irgendwann wurde auf asynchrone Invocation (`Event` Modus) umgestellt. Seitdem hat **kein einziger Render** erfolgreich abgeschlossen:

- **Async (Event)**: Lambda gibt sofort 202 zurueck, Edge Function kennt die echte Render-ID nie
- **S3-Pfad-Mismatch**: `check-remotion-progress` sucht unter `renders/pending-XXX/` aber Lambda schreibt unter `renders/<remotion-id>/`
- **Webhook schweigt**: Entweder crasht die Lambda oder der Webhook ist nicht erreichbar

Bisherige erfolgreiche Renders (Dezember 2025) nutzten synchrone Invocation und dauerten 45-60 Sekunden - weit unter dem 120s Edge-Function-Timeout.

## Loesung: Synchrone Invocation wiederherstellen

### Aenderung 1: render-with-remotion - Synchrone Invocation

Datei: `supabase/functions/render-with-remotion/index.ts`

1. **Header aendern**: `X-Amz-Invocation-Type: Event` entfernen (Default ist `RequestResponse`)
2. **Lambda-Antwort parsen**: Die synchrone Antwort enthaelt `renderId`, `outputFile`, `bucketName`
3. **DB sofort aktualisieren**: Den `video_renders` Eintrag mit der echten Render-ID und Output-URL aktualisieren
4. **Webhook bleibt als Fallback**: Die Webhook-Konfiguration bleibt im Payload fuer Sicherheit

Kern-Aenderung (Zeile 448-455):

```text
Vorher:
  headers: {
    'Content-Type': 'application/json',
    'X-Amz-Invocation-Type': 'Event',  // ASYNC - ENTFERNEN
  },

Nachher:
  headers: {
    'Content-Type': 'application/json',
    // Kein Invocation-Type Header = RequestResponse (synchron)
  },
```

Nach dem Lambda-Aufruf:

```text
Vorher:
  if (lambdaResponse.status !== 202) { ... }  // Erwartet 202 Accepted

Nachher:
  if (!lambdaResponse.ok) { ... }  // Erwartet 200 OK
  
  // Lambda-Antwort parsen
  const lambdaResult = await lambdaResponse.json();
  const realRenderId = lambdaResult.renderId;
  const outputFile = lambdaResult.outputFile;
  const outputBucket = lambdaResult.outBucket || bucketName;
  
  // Echte Output-URL zusammenbauen
  const outputUrl = outputFile || 
    `https://s3.${AWS_REGION}.amazonaws.com/${outputBucket}/renders/${realRenderId}/out.mp4`;
  
  // DB aktualisieren mit echten Daten
  await supabaseAdmin.from('video_renders').update({
    status: 'completed',
    video_url: outputUrl,
    completed_at: new Date().toISOString(),
  }).eq('render_id', pendingRenderId);
  
  // Video in Media Library speichern
  // ... (video_creations und media_assets Eintraege erstellen)
```

### Aenderung 2: Edge Function Timeout erhoehen

Datei: `supabase/config.toml`

```text
Vorher:
  [functions.render-with-remotion]
  verify_jwt = true
  timeout_sec = 120

Nachher:
  [functions.render-with-remotion]
  verify_jwt = true
  timeout_sec = 300  # 5 Minuten fuer laengere Renders
```

### Aenderung 3: Frontend-Response anpassen

Datei: `supabase/functions/render-with-remotion/index.ts`

Die Response enthaelt jetzt direkt die fertige Video-URL:

```text
return new Response(JSON.stringify({ 
  ok: true,
  render_id: pendingRenderId,
  real_render_id: realRenderId,
  video_url: outputUrl,
  bucket_name: bucketName,
  status: 'completed',
}), ...);
```

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `render-with-remotion/index.ts` | Event-Header entfernen, Lambda-Antwort parsen, DB direkt aktualisieren |
| `supabase/config.toml` | timeout_sec von 120 auf 300 erhoehen |

## Warum das funktioniert

- Die 5 erfolgreichen Renders im Dezember 2025 nutzten genau diesen synchronen Ansatz
- Render-Zeiten lagen bei 45-60 Sekunden, weit unter dem neuen 300s Timeout
- Die echte Render-ID wird sofort verfuegbar, S3-Pfad-Mismatch geloest
- check-remotion-progress wird nur noch als Fallback benoetigt (nicht mehr als primaerer Mechanismus)
- Kein Warten auf Webhook noetig - das Ergebnis kommt direkt aus der Lambda-Antwort
