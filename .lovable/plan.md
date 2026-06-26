## Problem
Der Wechsel auf 10s passiert serverseitig nach ca. 20 Sekunden im `compose-video-clips`-Lauf. Die Live-Logs zeigen noch aktive alte Logik:

```text
Cinematic-Sync scene ...: VO 6.00s > scene 6s → extending to 10s
```

Das heißt: nicht die UI oder die 5s-Lip-Sync-Audio-Auswahl ist die Hauptursache, sondern eine noch deployte Backend-Version bzw. ein zweiter alter Auto-Extend-Pfad in `compose-video-clips`.

## Plan
1. **Alten Auto-Extend endgültig entfernen**
   - `compose-video-clips` so ändern, dass bei `ai-hailuo` niemals wegen Voiceover-/Audio-Länge von 6s auf 10s geschrieben wird.
   - Falls Audio länger ist: nur loggen/Warning zurückgeben, aber `duration_seconds` nicht anfassen.

2. **Hailuo-Dauer als harte Nutzerwahl behandeln**
   - Für Hailuo gilt: exakt `10` bleibt 10, alles andere wird als 6 gerendert.
   - Keine `>=`, `Math.ceil`, `Math.max(audioRequired, userPick)` oder Real-Duration-Sync darf Hailuo auf 10 hochziehen.

3. **Frontend-Polling absichern**
   - In `ClipsTab` den MP4-Duration-Probe nicht mehr benutzen, um Hailuo/Cinematic-Sync `duration_seconds` auf die reale Provider-Dateilänge zurückzuschreiben.
   - Dadurch bleibt die geplante Szene 6s, auch wenn ein Provider/Video-Metadata später 10s meldet.

4. **Audio-Prep absichern**
   - `compose-twoshot-audio` bleibt bei Hailuo strikt auf vorhandener `duration_seconds` und kürzt/padded Audio passend, statt die Szene zu verlängern.
   - Idempotent vorhandene 10s-Audio-Pläne sollen bei erneutem 6s-Render nicht wieder den alten 10s-Wert diktieren.

5. **Backend-Funktionen neu deployen und Logs prüfen**
   - Betroffene Funktionen deployen: `compose-video-clips`, `compose-twoshot-audio`.
   - Danach in den Logs verifizieren, dass statt `extending to 10s` nur noch `honouring user pick` erscheint.

## Ergebnis
Wenn du bei Hailuo 6s auswählst, bleibt die Szene durch UI, Audio-Prep, Master-Render, Polling und Lip-Sync-Start hindurch bei 6s.