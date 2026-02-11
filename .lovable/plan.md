
# Fix: Rendering bleibt bei 88% haengen - Lambda asynchron aufrufen

## Problem

Die Logs zeigen klar die Ursache:

```text
14:58:38 - Lambda Aufruf gestartet (synchron, await aws.fetch)
15:02:53 - Function shutdown: wall_clock  (Deno toetet nach ~255s)
```

Die Edge Function wartet synchron auf Lambda (`await aws.fetch()`), aber der Deno `wall_clock`-Timeout toetet den Prozess nach ca. 4 Minuten. Lambda braucht aber oft 2-5 Minuten fuer das Rendering. Die Function stirbt, bevor Lambda antwortet, daher wird die DB nie auf "completed" aktualisiert und die UI bleibt bei 88% stehen.

## Loesung: Lambda asynchron aufrufen (Fire-and-Forget)

Statt synchron auf Lambda zu warten, wird Lambda im **Event-Modus** aufgerufen (asynchron). Die Completion-Erkennung wird dem Webhook und dem bereits implementierten Client-Side S3-Polling ueberlassen.

### Aenderung: auto-generate-universal-video/index.ts

**Was sich aendert (Zeilen ~505-623):**

1. Die `renderId` wird VOR dem Lambda-Aufruf in `result_data` der Progress-Tabelle geschrieben, damit der Client sofort mit dem Render-Polling beginnen kann
2. Lambda wird mit `InvocationType: Event` aufgerufen (HTTP Header `X-Amz-Invocation-Type: Event`). AWS gibt sofort 202 zurueck, ohne auf das Ergebnis zu warten
3. Der gesamte synchrone Post-Lambda-Code (DB-Update, Media Library Save) entfaellt - das wird vom Webhook uebernommen
4. Die Function beendet sich sofort nach dem Lambda-Start mit Status "rendering"

**Vorher:**
```text
// Synchron - wartet auf Lambda (TOETET DIE FUNCTION!)
const lambdaResponse = await aws.fetch(lambdaUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: asciiSafeJson,
});
// ... wartet hier auf Lambda-Ergebnis ...
// ... dann DB-Update, Media Library etc ...
```

**Nachher:**
```text
// RenderId VOR Lambda-Start in Progress schreiben
await updateProgress(supabase, progressId, 'rendering', 88, 'Lambda wird gestartet...', {
  renderId: pendingRenderId,  // Client kann sofort S3-Polling starten!
});

// Lambda ASYNCHRON aufrufen (Fire-and-Forget)
const lambdaResponse = await aws.fetch(lambdaUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Amz-Invocation-Type': 'Event',  // Asynchron!
  },
  body: asciiSafeJson,
});
// AWS gibt sofort 202 zurueck

// Fertig - Webhook + Client S3-Polling uebernehmen den Rest
await updateProgress(supabase, progressId, 'rendering', 90, 'Video wird gerendert...');
```

### Wie Completion dann erkannt wird

Die bestehende Infrastruktur uebernimmt die Erkennung:

```text
Lambda beendet Rendering
  |
  |--> Webhook (remotion-webhook) --> video_renders auf "completed" setzen
  |
  |--> Client S3-Polling (check-remotion-progress) --> Prueft S3 fuer out.mp4
       --> Erkennt Completion --> UI zeigt 100%
```

Beides ist bereits implementiert und funktioniert:
- `check-remotion-progress` prueft S3 auf `out.mp4` fuer `pending-` IDs
- Der Client-Side Polling startet, sobald `resultData.renderId` in der Progress-Tabelle auftaucht (Zeile 208 in UniversalAutoGenerationProgress.tsx)
- Der Webhook aktualisiert `video_renders` auf "completed"

### Was entfaellt

Der gesamte synchrone Post-Lambda-Block (Zeilen 556-623) wird ersetzt:
- Kein `await lambdaResponse.json()` mehr
- Kein manuelles DB-Update auf "completed" (macht der Webhook)
- Kein manuelles Media Library Save (macht der Webhook)
- Kein Credit-Refund im Lambda-Fehlerfall (macht der Webhook bei Fatal Error)

### Webhook-Absicherung

Der Webhook (`remotion-webhook`) muss bei Completion folgendes tun (ist bereits implementiert):
- `video_renders` auf `completed` + `video_url` setzen
- `video_creations` und `media_assets` erstellen
- `universal_video_progress` auf `completed` + 100% setzen

Falls der Webhook ausfaellt, greift das Client-Side S3-Polling als Fallback (prueft alle 10s ob `out.mp4` auf S3 existiert).

## Zusammenfassung

| Datei | Aenderung |
|-------|-----------|
| `auto-generate-universal-video/index.ts` | Lambda asynchron aufrufen (Event-Modus), renderId vor Start in DB schreiben, synchronen Post-Lambda-Code entfernen |

Die Function beendet sich jetzt ~1 Sekunde nach Lambda-Start statt 4+ Minuten zu warten. Das `wall_clock`-Timeout wird nicht mehr erreicht.
