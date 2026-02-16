
# Fix: Lambda-Output landet am falschen S3-Pfad -- Polling findet Video nie

## Root Cause

Die Remotion-Komposition `UniversalCreatorVideo` existiert im deployed Bundle auf S3 -- Lambda crasht also vermutlich NICHT. Das eigentliche Problem:

1. Lambda wird im Event-Modus (async) aufgerufen und generiert eine EIGENE interne `renderId` (z.B. `abc123xyz`)
2. Lambda schreibt das fertige Video nach `renders/abc123xyz/out.mp4`
3. Unser S3-Polling sucht aber bei `renders/27iri2fk6z/out.mp4` (unsere `pendingRenderId`)
4. Die Pfade stimmen NIE ueberein -- deshalb immer 404
5. Der Webhook wird nie aufgerufen (unklar warum -- moeglicherweise Lambda-interner Fehler oder Netzwerkproblem)
6. Nach 8 Minuten Timeout: "Rendering fehlgeschlagen"

**Beweis**: Die erfolgreichen Director's-Cut-Renders (Dezember 2025) benutzten `outName` im Lambda-Payload, um den Output-Pfad zu kontrollieren. Der Universal Creator hat KEIN `outName` -- deshalb findet das Polling nie etwas.

## Loesung

`outName` zum Lambda-Payload in `auto-generate-universal-video` hinzufuegen, damit Lambda das Video genau dort speichert, wo unser S3-Polling sucht.

### Aenderung 1: `supabase/functions/auto-generate-universal-video/index.ts`

Im Lambda-Payload (Zeile 535-555) `outName` hinzufuegen:

```
const lambdaPayload = {
  type: 'start',
  serveUrl: REMOTION_SERVE_URL,
  composition: 'UniversalCreatorVideo',
  inputProps: { type: 'payload', payload: JSON.stringify(inputProps) },
  durationInFrames,
  fps,
  width: dimensions.width,
  height: dimensions.height,
  codec: 'h264',
  imageFormat: 'jpeg',
  jpegQuality: 80,
  maxRetries: 1,
  timeoutInMilliseconds: 300000,
  privacy: 'public',
  // NEU: Output-Pfad kontrollieren damit S3-Polling funktioniert
  outName: {
    key: `renders/${pendingRenderId}/out.mp4`,
    bucketName: DEFAULT_BUCKET_NAME,
  },
  webhook: {
    url: webhookUrl,
    secret: 'remotion-webhook-secret-adtool-2024',
    customData: {
      pending_render_id: pendingRenderId,
      user_id: userId,
      credits_used: credits_required,
      source: 'universal-creator',
    },
  },
};
```

### Warum das funktioniert

| Aspekt | Ohne outName (kaputt) | Mit outName (Fix) |
|--------|----------------------|-------------------|
| Lambda schreibt nach | `renders/{Lambda-ID}/out.mp4` | `renders/{pendingRenderId}/out.mp4` |
| S3-Polling sucht bei | `renders/{pendingRenderId}/out.mp4` | `renders/{pendingRenderId}/out.mp4` |
| Pfade stimmen | Nie ueberein | Immer ueberein |
| Ergebnis | Endlos 404, Timeout | Video wird gefunden |

### Warum Director's Cut funktionierte

Die `render-directors-cut` Funktion benutzt `outName: directors-cut-{id}.mp4` (Zeile 491) und erkennt Completion ueber den Webhook. Auch `render-with-remotion` benutzt synchronen Modus und bekommt die echte `renderId` zurueck. Nur `auto-generate-universal-video` hat KEINEN Mechanismus, um den richtigen S3-Pfad zu kennen.

### Erwartetes Ergebnis

1. Lambda rendert das Video (3-5 Min)
2. Output wird bei `renders/{pendingRenderId}/out.mp4` gespeichert
3. S3-Polling (`check-remotion-progress`) findet die Datei
4. Status wird auf `completed` gesetzt, Video wird angezeigt
5. Falls Lambda DOCH crasht: Wir sehen weiterhin den Timeout nach 8 Min, aber dann wissen wir sicher, dass das Problem im Lambda-Rendering selbst liegt (nicht im Polling)
