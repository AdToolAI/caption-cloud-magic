
# Fix: Lambda-Aufruf von Event-Modus auf RequestResponse-Modus umstellen

## Problem-Analyse

Der Universal Video Creator verwendet den Lambda-Aufruf im **Event-Modus** (fire-and-forget). Das bedeutet:
1. Die Lambda akzeptiert den Aufruf (HTTP 202) und laeuft im Hintergrund
2. Wir bekommen KEINE Antwort zurueck -- weder eine Fehlermeldung noch die interne renderId
3. Wenn die Lambda crasht, erfahren wir das erst nach dem 8-Minuten-Timeout
4. Die S3-Progress-Datei (`progress.json`) wird unter einer unbekannten renderId abgelegt, die wir nie erhalten

Der **Director's Cut** verwendet dagegen den **RequestResponse-Modus** und funktioniert korrekt:
- Bekommt sofort `{ renderId, bucketName }` zurueck
- Kann die echte `progress.json` abrufen
- Sieht Lambda-Fehler sofort

## Loesung

Die Lambda-Invocation in `auto-generate-universal-video` wird von Event-Modus auf **RequestResponse-Modus** umgestellt -- identisch zum funktionierenden Director's Cut.

### Warum das funktioniert

- Die Remotion Lambda gibt `{ renderId, bucketName }` **sofort** zurueck (innerhalb von 2-5 Sekunden)
- Das eigentliche Rendering laeuft dann asynchron auf Lambda weiter
- Der Deno-Timeout ist KEIN Problem, weil die Lambda-Antwort schnell kommt
- Der Director's Cut beweist das: gleiche Lambda, gleicher Modus, funktioniert

### Was sich aendert

**Datei: `supabase/functions/auto-generate-universal-video/index.ts`**

1. **Lambda-Invocation**: `X-Amz-Invocation-Type` von `'Event'` auf `'RequestResponse'` aendern
2. **Response-Handling**: Die Lambda-Antwort parsen, um `renderId` und `bucketName` zu extrahieren
3. **Fehler-Erkennung**: Sofortige Fehlermeldung wenn die Lambda das Rendering ablehnt (z.B. Version-Mismatch, ungueltige Props)
4. **Progress-Tracking**: Den echten `renderId` in die DB schreiben, damit `check-remotion-progress` die korrekte `progress.json` findet

### Konkrete Code-Aenderung (Zeile 579-617)

Bisheriger Code:
```
headers: { 'X-Amz-Invocation-Type': 'Event' }
// Event mode returns 202 (no body)
if (lambdaResponse.status !== 202) { ... }
```

Neuer Code (analog zu render-directors-cut):
```
headers: { 'X-Amz-Invocation-Type': 'RequestResponse' }
// RequestResponse returns 200 with { renderId, bucketName }
const result = await lambdaResponse.json();
if (result.errorMessage || result.errorType) {
  throw new Error(result.errorMessage || 'Lambda error');
}
const realRenderId = result.renderId;
const bucketName = result.bucketName;
```

5. **DB-Update**: Den echten `renderId` statt des generierten `pendingRenderId` in `video_renders` schreiben
6. **outName beibehalten**: Der `outName`-Parameter (`universal-video-{id}.mp4`) bleibt fuer die finale Datei-Benennung

### Keine weiteren Dateien betroffen

- `check-remotion-progress` funktioniert bereits korrekt mit echten renderIds
- Die Frontend-Komponenten bleiben unveraendert
- Webhook-Handling bleibt gleich

## Erwartetes Ergebnis

- Sofortiges Feedback wenn die Lambda ein Problem hat (statt 8 Minuten warten)
- Echte Fortschrittsverfolgung ueber `progress.json`
- Diagnosefaehigkeit: Lambda-Fehlermeldungen werden sichtbar
