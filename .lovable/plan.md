## Befund

Der neueste technische Sync-Run ist nicht mehr abgebrochen: `lip_sync_status = done`. Das Problem ist jetzt sichtbar im Ergebnisvideo.

Die eigentliche Ursache ist sehr wahrscheinlich der **Masterclip vor dem Lip-Sync**:

- Der Hailuo-Quellclip wird aktuell mit dem vollen `ai_prompt` erzeugt.
- In diesem Prompt steht noch der komplette Dialog-Block:

```text
Samuel and Matthew speak to camera in turns with natural, subtle lip-sync mouth movement...
- Samuel says: ...
- Matthew says: ...
```

- Danach bekommt Sync.so nur Zeitfenster, in denen es einzelne Sprecher neu animieren soll.
- Außerhalb dieser Fenster bewahrt Sync.so aber den ursprünglichen Videoinhalt.
- Wenn der ursprüngliche Hailuo-Clip bereits sprechende Münder hat, bewegen sich die Lippen also weiter, obwohl das Voiceover-Fenster vorbei ist.

Kurz: **Sync.so macht inzwischen was wir verlangen, aber der Input-Clip ist falsch: er ist nicht wirklich stumm/neutral.**

## Plan

1. **Cinematic-Sync-Masterprompt säubern**
   - Für `engineOverride = cinematic-sync` wird vor dem Hailuo-Render der Dialog vollständig aus dem Prompt entfernt.
   - Der Masterclip bekommt nur noch die visuelle Szenenbeschreibung, keine Sprecherzeilen, keine “speak to camera”, keine “lip-sync mouth movement”-Anweisungen.

2. **Neutralen Two-Shot-Master erzwingen**
   - Für Multi-Speaker-Szenen wird ein spezieller Masterclip-Prompt verwendet:
     - beide Charaktere sichtbar
     - natürliche Präsenz
     - ruhige/geschlossene Lippen
     - subtile Kopf-/Kamera-/Körperbewegung
     - keine Sprech-/Mundbewegungs-Performance
   - Die Szene soll also wie ein stummes Schauspiel-/Listening-Plate wirken, auf das Sync.so anschließend gezielt die echten Sprecherfenster setzt.

3. **Negative Prompt für Masterclip härten**
   - Bei cinematic-sync wird der Provider-`negative_prompt` erweitert um Begriffe wie:
     - talking mouth
     - lip movement
     - speaking animation
     - open mouth speech
     - exaggerated facial talking
   - Diese Wörter kommen nicht in den positiven Prompt, sondern nur in das dedizierte Negative-Prompt-Feld.

4. **Prompt-Leak in Hailuo verhindern**
   - `stripDialogForAnchor(...)` wird nicht nur für den Anchor verwendet, sondern auch für den Hailuo-Masterclip.
   - Damit kann ein `[Dialog]...[/Dialog]` Block nicht mehr bis zum Video-Provider durchrutschen.

5. **Erfolgsstatus sauber halten**
   - Wenn `poll-twoshot-lipsync` final erfolgreich ist, wird `clip_error` gelöscht.
   - Erfolgreiche Fallback-/Retry-Läufe behalten Diagnose-Metadaten, werden aber nicht mehr als Fehler im UI angezeigt.

6. **Betroffene Szene vollständig neu rendern**
   - Für die aktuelle Szene muss nicht nur Lip-Sync neu gestartet werden, sondern **Clip + Lip-Sync**.
   - Ich setze die stale Masterclip-/Lip-Sync-Metadaten zurück, damit Hailuo mit dem neuen neutralen Prompt einen frischen stummen Masterclip erzeugt.

7. **Deploy & Validierung**
   - Deploy: `compose-video-clips` und `poll-twoshot-lipsync`.
   - Danach prüfe ich:
     - der an Hailuo gesendete Prompt enthält keinen Dialogblock mehr
     - `clip_error` ist bei erfolgreichem Ergebnis leer
     - die Szene steht wieder sauber auf einem regenerierbaren Zustand

## Erwartetes Ergebnis

Der neue Masterclip zeigt beide Charaktere ohne dauerhaftes Sprechen. Sync.so animiert danach nur noch die jeweiligen Sprecherfenster, statt vorhandene falsche Mundbewegungen aus dem Quellclip weiterzutragen.

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>