

# Fix: Lambda startet nicht - Zurueck zu Event-Modus mit Payload-Optimierung

## Das Problem

Nach dem Wechsel zu `RequestResponse` fire-and-forget startet die Lambda **nie**. Beweis: Nach 8 Minuten gibt es auf S3 weder `progress.json` noch ein Output-Video. Die Lambda schreibt `progress.json` innerhalb der ersten Sekunden -- wenn es keins gibt, hat sie nie angefangen.

**Ursache**: In `RequestResponse`-Modus muss die HTTP-Verbindung offen bleiben bis Lambda fertig ist (5-10 Minuten). Da wir nicht `await`-en und `waitUntil` nach ~120s stirbt, wird die Verbindung getrennt. AWS kann die Lambda-Ausfuehrung dann abbrechen.

**Event-Modus** hingegen legt die Payload in eine Queue und gibt sofort 202 zurueck. Die Lambda laeuft **garantiert** und unabhaengig vom Aufrufer.

## Die Loesung (3 Teile)

### Teil 1: Zurueck zu Event-Modus mit Payload-Groessen-Logging

Wechsel von `RequestResponse` zurueck zu `Event`, PLUS Logging der Payload-Groesse in Bytes. Falls die Payload ueber 256KB liegt, wird eine Warnung geloggt und unnoetige Daten entfernt.

### Teil 2: Payload-Optimierung (unter 256KB halten)

Die Payload enthaelt `inputProps` mit Szenen-Daten. Um unter 256KB zu bleiben:
- Subtitles-Array aus den InputProps entfernen (nur URLs uebergeben, nicht die vollstaendigen Subtitle-Objekte)
- Unnoetige Felder wie `spokenText`, `visualDescription` etc. strippen (nur fuer die UI relevant, nicht fuers Rendering)
- Nur rendering-relevante Felder behalten: `videoUrl`/`imageUrl`, `duration`, `animation`, `startTime`, `endTime`

### Teil 3: Client-Timeout von 8 auf 15 Minuten erhoehen

Selbst wenn Lambda korrekt startet, brauchen komplexe Videos bis zu 10-15 Minuten. Das 8-Minuten-Timeout im Frontend ist zu aggressiv.

## Technische Aenderungen

### Datei 1: `supabase/functions/auto-generate-universal-video/index.ts`

**A) Payload-Groesse loggen** (nach Zeile 571):
```typescript
const payloadSizeBytes = new TextEncoder().encode(asciiSafePayload).length;
const payloadSizeKB = (payloadSizeBytes / 1024).toFixed(1);
console.log(`Payload size: ${payloadSizeKB} KB (limit: 256 KB for Event mode)`);
if (payloadSizeBytes > 250000) {
  console.warn('WARNING: Payload close to or exceeds 256KB Event mode limit!');
}
```

**B) Zurueck zu Event-Modus** (Zeilen 573-620 ersetzen):
```typescript
const lambdaResponse = await aws.fetch(lambdaUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Amz-Invocation-Type': 'Event',
  },
  body: asciiSafePayload,
});

if (lambdaResponse.status !== 202) {
  const errorText = await lambdaResponse.text();
  console.error('Lambda Event invocation failed:', lambdaResponse.status, errorText);
  throw new Error(`Lambda-Start fehlgeschlagen: HTTP ${lambdaResponse.status}`);
}

console.log('Lambda Event invocation accepted (202). Rendering laeuft async auf AWS.');
```

**C) InputProps trimmen** - nur rendering-relevante Felder in die Szenen-Objekte einbauen, keine UI-Only-Texte.

### Datei 2: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`

**Client-Timeout von 8 auf 15 Minuten erhoehen** (Zeile 264):
```typescript
// Timeout after 15 minutes (complex videos can take 10-15 min)
if (renderStartTimeRef.current && Date.now() - renderStartTimeRef.current > 15 * 60 * 1000) {
```

Und die zugehoerige Fehlermeldung aktualisieren (Zeile 275, 283).

## Dateien die geaendert werden

1. **EDIT**: `supabase/functions/auto-generate-universal-video/index.ts` -- Event-Modus + Payload-Logging + InputProps trimmen
2. **EDIT**: `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx` -- Timeout auf 15 Minuten erhoehen

