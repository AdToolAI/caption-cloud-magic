

# Fix: Lambda crasht wegen falschem `inputProps`-Format

## Bewiesenes Problem

Alle Universal Creator Renders laufen in den 12-Minuten-Timeout -- kein `progress.json`, kein `out.mp4` auf S3. Das bedeutet: Lambda crasht beim Starten, bevor es ueberhaupt mit dem Rendering beginnt.

## Root Cause: `inputProps` Serialisierung

Direkter Vergleich der beiden Lambda-Payloads:

| Parameter | Director's Cut (funktioniert) | Universal Creator (crasht) |
|-----------|-------------------------------|----------------------------|
| `inputProps` | `finalInputProps` (direktes Objekt) | `{ type: 'payload', payload: JSON.stringify(inputProps) }` (falsches Wrapper-Format) |
| `framesPerLambda` | `150` | fehlt |
| `overwrite` | `true` | fehlt |
| `durationInFrames` | nicht gesetzt (Composition bestimmt) | im Payload gesetzt |
| `width` / `height` | nicht gesetzt (Composition bestimmt) | im Payload gesetzt |
| `fps` | nicht gesetzt (Composition bestimmt) | im Payload gesetzt |
| `timeoutInMilliseconds` | nicht gesetzt | `300000` |
| `jpegQuality` | nicht gesetzt | `80` |
| `webhook.secret` | `null` | String-Wert |

Das `{ type: 'payload', payload: ... }` Format ist ein **Remotion-SDK-internes** Serialisierungsformat. Wenn man Lambda direkt via AWS invociert (wie wir es tun), erwartet Lambda das **rohe Objekt** als `inputProps`. Dieses falsche Format laesst Lambda still crashen.

## Loesung

### Aenderung: Lambda Payload an Director's Cut angleichen
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Zeilen 537-558 ersetzen -- den Payload exakt wie Director's Cut strukturieren:

1. `inputProps` direkt als Objekt senden (nicht gewrappt)
2. `framesPerLambda: 150` hinzufuegen (parallelisiert das Rendering)
3. `overwrite: true` hinzufuegen (verhindert Konflikte)
4. `durationInFrames`, `fps`, `width`, `height` aus dem Payload entfernen (die Composition definiert diese Werte selbst, und sie sind bereits in `inputProps` enthalten)
5. `timeoutInMilliseconds` und `jpegQuality` entfernen (nicht noetig, Lambda hat eigenes Timeout)
6. `webhook.secret` auf `null` setzen (wie Director's Cut)

### Vorher (crasht)

```typescript
const lambdaPayload = {
  type: 'start',
  serveUrl: REMOTION_SERVE_URL,
  composition: 'UniversalCreatorVideo',
  inputProps: { type: 'payload', payload: JSON.stringify(inputProps) }, // FALSCH
  durationInFrames,    // ueberfluessig
  fps,                 // ueberfluessig
  width: ...,          // ueberfluessig
  height: ...,         // ueberfluessig
  codec: 'h264',
  imageFormat: 'jpeg',
  jpegQuality: 80,     // ueberfluessig
  maxRetries: 1,
  timeoutInMilliseconds: 300000,  // ueberfluessig
  privacy: 'public',
  outName: `universal-video-${pendingRenderId}.mp4`,
  webhook: {
    secret: 'remotion-webhook-secret-adtool-2024',  // FALSCH
    ...
  },
};
```

### Nachher (wie Director's Cut)

```typescript
const lambdaPayload = {
  type: 'start',
  serveUrl: REMOTION_SERVE_URL,
  composition: 'UniversalCreatorVideo',
  inputProps: inputProps,          // Direkt, nicht gewrappt
  codec: 'h264',
  imageFormat: 'jpeg',
  maxRetries: 1,
  framesPerLambda: 150,           // Wie Director's Cut
  privacy: 'public',
  overwrite: true,                // Wie Director's Cut
  outName: `universal-video-${pendingRenderId}.mp4`,
  webhook: {
    url: webhookUrl,
    secret: null,                 // Wie Director's Cut
    customData: { ... },
  },
};
```

## Betroffene Datei

| Datei | Aenderung |
|-------|-----------|
| `auto-generate-universal-video/index.ts` | Lambda Payload korrigieren (Zeilen 537-558) |

## Erwartetes Ergebnis

Lambda erhaelt einen sauberen Payload im gleichen Format wie Director's Cut, startet erfolgreich, schreibt `progress.json` und `universal-video-xxx.mp4` auf S3, und das Polling findet die Datei.

