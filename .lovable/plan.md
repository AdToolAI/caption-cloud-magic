
# Fix: Stale-Detection zu aggressiv + Infrastruktur-Hinweis

## Problem

Die `check-remotion-progress` Edge Function nutzt zeitbasierte Schaetzung wenn keine `progress.json` auf S3 existiert. Diese Schaetzung ist bei `0.92` (92%) gedeckelt (Zeile 452 in check-remotion-progress). Jeder Poll danach gibt identisch `0.92` zurueck, was nach 5 Polls (50 Sekunden) die Stale-Detection ausloest - obwohl das eigentlich erwartetes Verhalten ist.

## Loesung

### Aenderung 1: check-remotion-progress gibt Progress-Quelle zurueck

In `supabase/functions/check-remotion-progress/index.ts`: Das `progress`-Objekt um ein Feld `progressSource` erweitern (`'s3-progress-json'`, `'time-based'`, `'default'`). So kann der Client unterscheiden ob der Progress echt ist oder geschaetzt.

```text
progress: {
  ...bisherige Felder,
  progressSource: progressSource  // NEU
}
```

### Aenderung 2: Client-Stale-Detection nur bei echtem Progress anwenden

In `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`:

- Wenn `progressSource === 'time-based'`: KEINE Stale-Detection, stattdessen den globalen 8-Minuten-Timeout nutzen (der existiert bereits)
- Wenn `progressSource === 's3-progress-json'`: Stale-Detection nach 10 Polls (100 Sekunden) statt 5

So wird bei zeitbasiertem Progress (wo kein echter Lambda-Fortschritt gemessen werden kann) auf den 8-Minuten-Timeout vertraut, und bei echtem S3-Progress wird schneller reagiert wenn die Lambda tatsaechlich haengt.

### Aenderung 3: Bessere Fehlermeldung

Statt "Rendering macht keinen Fortschritt" bei Timeout:
- "Video-Rendering hat das Zeitlimit ueberschritten (8 Minuten). Credits werden automatisch erstattet. Bitte versuche es erneut."

## Zusammenfassung der Datei-Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `supabase/functions/check-remotion-progress/index.ts` | `progressSource` Feld zur Response hinzufuegen |
| `UniversalAutoGenerationProgress.tsx` | Stale-Detection nur bei echtem S3-Progress, sonst globaler Timeout |
| `UniversalAutoGenerationProgress.tsx` | Bessere Timeout-Fehlermeldung |

## Wichtiger Hinweis zur Infrastruktur

Die Remotion Lambda erstellt weder `progress.json` noch `out.mp4` auf S3. Das bedeutet, das Remotion-Bundle auf S3 ist veraltet und muss lokal neu deployed werden:

```text
1. npx remotion lambda sites create src/remotion/index.ts --site-name=adtool-remotion
2. Die neue Bundle-URL als REMOTION_SERVE_URL Secret aktualisieren
```

Ohne diesen Schritt wird das Rendering immer beim 8-Minuten-Timeout enden und Credits zurueckerstattet. Die Code-Fixes sorgen aber dafuer, dass die UI sich korrekt verhaelt und der User eine klare Fehlermeldung bekommt.
