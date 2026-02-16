
# Fix: Lambda zurueck auf Event-Modus (wall_clock Timeout verhindern)

## Problem

Der synchrone Lambda-Aufruf innerhalb von `EdgeRuntime.waitUntil()` wird nach ~62 Sekunden vom Supabase wall_clock Limit gekillt. Lambda braucht aber 3-5 Minuten zum Rendern. Das fuehrt zum Abbruch bei 88%.

Das Replicate-Guthaben ist jetzt wieder aufgefuellt ($50) -- die Szenen-Bilder sollten also wieder korrekt generiert werden.

## Aenderung

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Zeilen 561-668 ersetzen: Den gesamten synchronen Lambda-Block durch einen schlanken Event-Modus-Aufruf:

```text
// VORHER (~110 Zeilen synchroner Code, der nach 62s gekillt wird):
console.log('Invoking Lambda SYNCHRONOUSLY...');
const lambdaResponse = await aws.fetch(lambdaUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: asciiSafeJson,
});
// ... 100 Zeilen Ergebnis-Verarbeitung die nie ausgefuehrt werden

// NACHHER (~20 Zeilen, Event-Modus):
console.log('Invoking Lambda in Event mode (async)...');
const lambdaResponse = await aws.fetch(lambdaUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Amz-Invocation-Type': 'Event',
  },
  body: asciiSafeJson,
});

if (lambdaResponse.status !== 202) {
  // Lambda konnte nicht gestartet werden
  const errorText = await lambdaResponse.text();
  console.error('Lambda invocation failed:', lambdaResponse.status, errorText);
  // Credits zurueckerstatten + Status auf failed setzen
  await supabase.rpc('increment_balance', { ... });
  await updateProgress(supabase, progressId, 'failed', ...);
  return;
}

// Lambda laeuft jetzt im Hintergrund
// Webhook + S3-Polling (check-remotion-progress) uebernehmen die Completion
await updateProgress(supabase, progressId, 'rendering', 90, 'Video wird gerendert...', {
  renderId: pendingRenderId,
});
```

## Warum funktioniert es diesmal

Beim letzten Mal mit Event-Modus war `renderId` im Payload -- das ist kein gueltiger Remotion-Input und hat Lambda moeglicherweise crashen lassen. Jetzt ist `renderId` bereits aus dem Payload entfernt (vorheriger Fix). Lambda generiert seine eigene interne ID und:

1. Rendert das Video (3-5 Min)
2. Ruft den Webhook auf mit `customData.pending_render_id`
3. Webhook findet den DB-Eintrag und markiert ihn als `completed`
4. Frontend-Polling sieht `completed` und zeigt das Video

## Was sich aendert

| Aspekt | Synchron (kaputt) | Event-Modus (Fix) |
|--------|-------------------|-------------------|
| Edge Function Timeout | Ja (62s wall_clock) | Nein (sofort fertig) |
| Lambda-Fehler sichtbar | Nie (wird gekillt) | Via Webhook |
| Completion-Erkennung | Nie (gekillt) | Webhook + S3-Polling |
| Replicate-Bilder | 402 (kein Guthaben) | Funktioniert ($50 Guthaben) |
