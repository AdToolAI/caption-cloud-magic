
# Fix: Lambda-Fehler unsichtbar durch Event-Modus - Wechsel zu synchronem Aufruf mit Background-Processing

## Root Cause (endgueltig)

Das Problem ist NICHT das renderId-Format. **Kein einziger Render war seit Dezember 2025 erfolgreich** - weder mit `pending-UUID`, noch mit 10-Zeichen-IDs, noch mit/ohne `outName`. Die Lambda-Funktion crasht JEDES MAL, aber wir koennen den Fehler nie sehen, weil wir den **Event-Modus** (fire-and-forget) nutzen.

### Beweis:
- `video_renders` Tabelle: 0 erfolgreiche Renders seit Dezember 2025
- Alle Versuche enden als `failed` (Timeout) oder bleiben ewig in `rendering`
- Lambda gibt 202 (Accepted) zurueck, crasht dann intern - wir bekommen NIE die Fehlermeldung
- Die funktionierende `render-with-remotion` Funktion nutzt **synchronen** Modus und sieht Fehler sofort

### Warum Event-Modus blind macht:
```text
Event-Modus (kaputt):
  Edge Function --> Lambda (202 Accepted) --> Edge Function gibt auf
                         |
                         v
                    Lambda crasht --> NIEMAND sieht den Fehler

Synchroner Modus (funktioniert):
  Edge Function --> Lambda --> Ergebnis/Fehler zurueck --> Edge Function reagiert
```

## Loesung: EdgeRuntime.waitUntil + Synchroner Lambda-Aufruf

Die `auto-generate-universal-video` Funktion deklariert bereits `EdgeRuntime.waitUntil()` (Zeile 28-31). Das erlaubt uns:

1. HTTP-Response sofort zurueckgeben (kein Timeout fuer den Client)
2. Lambda **synchron** im Hintergrund aufrufen (ueber `waitUntil`)
3. Die echte Fehlermeldung oder das Ergebnis sehen und in die DB schreiben

### Aenderung in `supabase/functions/auto-generate-universal-video/index.ts`

**Zeilen ~562-597 ersetzen** - Lambda-Aufruf von Event-Modus auf synchronen Background-Aufruf umstellen:

```text
// VORHER (Event-Modus, blind):
const lambdaResponse = await aws.fetch(lambdaUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Amz-Invocation-Type': 'Event',    // <-- fire-and-forget
  },
  body: asciiSafeJson,
});
// Lambda gibt 202, wir sehen nie was passiert

// NACHHER (Synchron im Background):
// 1. Response sofort zurueckgeben
await updateProgress(supabase, progressId, 'rendering', 90, 'Video wird gerendert...');

// 2. Lambda SYNCHRON im Background aufrufen
EdgeRuntime.waitUntil((async () => {
  const lambdaResponse = await aws.fetch(lambdaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // KEIN X-Amz-Invocation-Type = synchroner Modus
    body: asciiSafeJson,
  });

  if (lambdaResponse.ok) {
    const result = await lambdaResponse.json();
    // Echte renderId und outputUrl aus der Antwort
    const realRenderId = result.renderId;
    const outputUrl = result.outputFile || ...;
    // DB aktualisieren: completed + echte URL
  } else {
    const errorText = await lambdaResponse.text();
    // ENDLICH sehen wir den echten Fehler!
    // DB aktualisieren: failed + Fehlermeldung
    // Credits zurueckerstatten
  }
})());
```

Zusaetzlich: `renderId` aus dem Lambda-Payload entfernen (ist kein gueltiger Input-Parameter laut Remotion-Doku).

### Was sich aendert

| Aspekt | Vorher (Event-Modus) | Nachher (Sync + waitUntil) |
|--------|---------------------|---------------------------|
| Lambda-Aufruf | Fire-and-forget (202) | Synchron im Background |
| Fehler sichtbar | Nie | Ja - in DB und Logs |
| Client blockiert | Nein | Nein (waitUntil) |
| Echte renderId | Unbekannt | Aus Lambda-Response |
| Output-URL | Geraten (404) | Echte URL aus Response |
| Timeout-Risiko | Keins | Keins (waitUntil laeuft im Background) |

### Erwartetes Ergebnis

1. **Sofort**: Wir sehen endlich den ECHTEN Fehler, warum Lambda seit Dezember crasht
2. **Nach Behebung des Lambda-Fehlers**: Render laeuft durch, echte Output-URL wird in DB gespeichert, Frontend zeigt 100%
3. **Kein Raten mehr**: Keine fake renderId, keine S3-Pfad-Vermutungen - alles kommt direkt von Lambda
