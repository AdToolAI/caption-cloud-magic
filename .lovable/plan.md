

# Fix: Video-Rendering bleibt bei 92% haengen

## Problem-Analyse

Das Rendering bleibt bei 92% stehen, weil:

1. **Die Lambda crasht still** -- seit dem Start um 20:00:17 gibt es keinen Output auf S3 (weder `universal-video-wtg90yhfwr.mp4` noch `renders/wtg90yhfwr/out.mp4`) und keinen Webhook-Aufruf
2. **Fehlende Metadata im Lambda-Payload** -- die Top-Level-Felder `durationInFrames`, `fps`, `width`, `height` fehlen im Lambda-Aufruf. Ohne diese muss die Lambda intern `calculateMetadata` ausfuehren, was zu "Invalid array length"-Crashes fuehren kann
3. **92% ist das Maximum der Zeitschaetzung** -- die `check-remotion-progress` Funktion begrenzt die zeitbasierte Fortschrittsschaetzung auf 0.92 (Zeile 544), daher bleibt die Anzeige bei 92% stehen wenn kein echtes Ergebnis kommt

## Loesung

### Aenderung 1: Lambda-Payload mit expliziten Metadata-Feldern erweitern

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Im Lambda-Payload (ca. Zeile 537-554) werden die vier kritischen Felder als Top-Level-Parameter hinzugefuegt:

```typescript
const lambdaPayload = {
  type: 'start',
  serveUrl: REMOTION_SERVE_URL,
  composition: 'UniversalCreatorVideo',
  inputProps: inputProps,
  codec: 'h264',
  imageFormat: 'jpeg',
  maxRetries: 1,
  framesPerLambda: 150,
  privacy: 'public',
  overwrite: true,
  outName: `universal-video-${pendingRenderId}.mp4`,
  // NEU: Explizite Metadata um calculateMetadata-Crashes zu umgehen
  durationInFrames: durationInFrames,
  fps: fps,
  width: dimensions.width,
  height: dimensions.height,
  webhook: {
    url: webhookUrl,
    secret: null,
    customData: { ... },
  },
};
```

Dies verhindert, dass die Lambda intern `calculateMetadata` ausfuehren muss, was die haeufigste Ursache fuer stille Crashes ist.

### Aenderung 2: Timeout-Meldung verbessern

**Datei:** `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

Nach dem 8-Minuten-Timeout wird die `universal_video_progress`-Tabelle aktualisiert, damit der "Erneut versuchen"-Button korrekt funktioniert und der Status nicht bei "Rendering 92%" haengen bleibt.

## Technische Details

- Die vier Metadata-Felder (`durationInFrames`, `fps`, `width`, `height`) werden bereits in `inputProps` berechnet, muessen aber zusaetzlich als Top-Level-Felder im Lambda-Payload stehen
- Dies ist ein bekanntes Remotion Lambda v4 Verhalten (dokumentiert im Memory-Eintrag `remotion-lambda-explicit-metadata-requirement`)
- Die Edge Function wird nach der Aenderung automatisch deployed
- Kein lokaler Abgleich noetig -- nur der Edge-Function-Code aendert sich, nicht die Remotion-Compositions

