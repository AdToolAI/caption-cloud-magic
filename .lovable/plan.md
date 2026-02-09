

# Fix: Progress-Oszillation zwischen 92% und 99% stoppen

## Ursache

Es laufen **zwei Polling-Mechanismen gleichzeitig**, die beide denselben `progress` State ueberschreiben:

1. **DB-Polling** (jede Sekunde): Liest `progress_percent` aus der Datenbank (z.B. 92%) und setzt `setProgress(92)`
2. **Client-Render-Polling** (alle 10 Sekunden): Ruft `check-remotion-progress` auf, bekommt `overallProgress: 0.92` zurueck, berechnet `90 + Math.floor(0.92 * 10) = 99` und setzt `setProgress(99)`

Da beide unabhaengig voneinander den gleichen State beschreiben, springt die Anzeige staendig zwischen 92% und 99% hin und her.

Zusaetzlich: Die Remotion Lambda produziert nie ein fertiges Video (`out.mp4` auf S3 ist immer 404), deshalb endet das Polling nie von selbst.

---

## Loesung: 3 Aenderungen

### Aenderung 1: DB-Polling stoppen wenn Client-Polling uebernimmt

In `UniversalAutoGenerationProgress.tsx`, Funktion `startClientRenderPolling`: Sobald das Client-Render-Polling startet, wird das DB-Polling (`pollIntervalRef`) gestoppt. Es darf nur EINE Quelle den Progress setzen.

```text
Datei: src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx

In startClientRenderPolling (Zeile 238):
- ZUERST pollIntervalRef stoppen (clearInterval + null setzen)
- Dann erst clientRenderPollRef starten
```

### Aenderung 2: Progress darf nur steigen, nie sinken

Funktionaler State-Update verwenden, damit der Wert nie zurueckspringt:

```text
In startClientRenderPolling (Zeile 280):
  Statt: setProgress(displayPercent)
  Neu:   setProgress(prev => Math.max(prev, displayPercent))

In handleProgressUpdate (Zeile 185):
  Statt: setProgress(data.progress_percent || 0)
  Neu:   setProgress(prev => Math.max(prev, data.progress_percent || 0))
```

### Aenderung 3: Stale-Progress-Erkennung im Client-Polling

Wenn der Progress sich ueber 5 aufeinanderfolgende Polls nicht aendert UND kein `out.mp4` gefunden wird, fruehzeitig als Fehler behandeln (statt 8 Minuten warten):

```text
In startClientRenderPolling:
- lastProgressRef tracken
- staleCount hochzaehlen wenn Progress gleich bleibt
- Nach 5 stale Polls (= 50 Sekunden): Fehlermeldung anzeigen
  "Rendering macht keinen Fortschritt. Bitte versuche es erneut."
```

---

## Zusammenfassung der Datei-Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `UniversalAutoGenerationProgress.tsx` | DB-Polling stoppen wenn Client-Polling startet |
| `UniversalAutoGenerationProgress.tsx` | Monoton steigende Progress-Werte (Math.max) |
| `UniversalAutoGenerationProgress.tsx` | Stale-Progress-Erkennung nach 5 unveraenderten Polls |

---

## Wichtiger Hinweis

Diese Fixes beseitigen die UI-Oszillation und sorgen fuer eine saubere Fortschrittsanzeige. Das eigentliche Problem - dass die Remotion Lambda kein Video produziert - bleibt bestehen und erfordert ein Redeployment des Remotion-Bundles auf S3. Das ist ein separater Infrastruktur-Schritt.

