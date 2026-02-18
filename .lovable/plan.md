

# Fix: wall_clock Timeout durch RequestResponse-Modus

## Problem

Die Edge Function `auto-generate-universal-video` laeuft als Background-Task via `EdgeRuntime.waitUntil()`. Die Zeitaufteilung:
- ~2 Minuten: Szenen generieren, Voiceover, Untertitel, Beat-Analyse
- Lambda-Invocation im `RequestResponse`-Modus: wartet bis das **gesamte Video gerendert** ist (3-5 Minuten)
- Ergebnis: `wall_clock`-Timeout nach ca. 3,5 Minuten ab Lambda-Start

Der `RequestResponse`-Modus funktioniert beim Director's Cut, weil dort die Edge Function NUR die Lambda aufruft (kein vorheriger Pipeline-Aufwand). Hier ist die Pipeline aber bereits 2+ Minuten gelaufen, bevor die Lambda ueberhaupt startet.

## Loesung

Zurueck zum `Event`-Modus (HTTP 202, fire-and-forget), aber mit Verbesserungen:

### Datei: `supabase/functions/auto-generate-universal-video/index.ts`

1. **Invocation-Modus**: `X-Amz-Invocation-Type` von `'RequestResponse'` zurueck auf `'Event'` aendern
2. **Status-Check**: HTTP 202 statt 200 als Erfolgscode pruefen
3. **Kein Response-Body**: Event-Modus liefert keinen Body, also kein `lambdaResult.renderId` -- der `pendingRenderId` bleibt die einzige ID
4. **Lambda-Error-Handling entfernen**: Die Checks auf `lambdaResult.errorMessage` und `realRenderId` entfallen, da Event-Modus keinen Body hat
5. **DB-Update entfernen**: Das Update von `video_renders` mit `realRenderId` entfaellt

### Warum Event-Modus hier korrekt ist

- Die Lambda bekommt `outName: 'universal-video-{pendingRenderId}.mp4'` -- damit ist der Output-Pfad vorhersagbar
- `check-remotion-progress` sucht bereits nach diesem Dateinamen auf S3
- Der Webhook liefert die Completion-Benachrichtigung
- Die Edge Function muss NICHT auf das Rendering warten

### Konkrete Aenderung (Zeile 579-648)

Bisheriger Code (RequestResponse):
```
'X-Amz-Invocation-Type': 'RequestResponse'
// parses response body, extracts renderId, updates DB
```

Neuer Code (Event):
```
'X-Amz-Invocation-Type': 'Event'
// Event returns 202 with no body
// pendingRenderId stays as the tracking ID
// S3 polling + webhook handle completion
```

### Keine anderen Dateien betroffen

- `check-remotion-progress` funktioniert bereits mit dem `outName`-basierten S3-Pfad
- Frontend-Polling bleibt unveraendert
- Webhook-Handler bleibt unveraendert

## Erwartetes Ergebnis

- Lambda-Invocation kehrt sofort zurueck (HTTP 202, <1 Sekunde)
- Edge Function beendet sich sauber ohne wall_clock-Timeout
- Video-Completion wird via Webhook + S3-Polling erkannt
