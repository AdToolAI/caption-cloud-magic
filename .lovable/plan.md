

## Fix: Speed Ramping hat keinen Effekt

### Ursache

In `DirectorsCutPreviewPlayer.tsx` gibt es **3 Stellen** die `video.playbackRate` setzen, und sie kämpfen gegeneinander:

1. **Zeile 567-570**: Setzt `playbackRate = sceneRate` (= 1) **jeden Frame**, bedingungslos
2. **Zeile 613-616**: Setzt `playbackRate = nextRate` bei Szenenwechsel
3. **Zeile 678-682**: Setzt `playbackRate = sceneRate * activeSpeed` — der korrekte Wert mit Speed Ramping

**Problem**: Zeile 568 prüft `if (Math.abs(video.playbackRate - sceneRate) > 0.01)` — wenn Speed Ramping die Rate auf z.B. 0.25 gesetzt hat, erkennt Zeile 568 eine Abweichung und **resettet sofort auf 1.0**. Dann setzt Zeile 680 sie wieder auf 0.25. Jeder Frame hat also: `0.25 → 1.0 → 0.25`. Der Browser-Decoder bekommt widersprüchliche Signale und die Wiedergabe ruckelt oder ändert sich nicht spürbar.

### Fix

**Zeilen 567-570 und 613-616 entfernen**. Stattdessen die gesamte playbackRate-Logik im Speed-Ramping-Block (Zeile 656-683) konsolidieren. Dieser Block berechnet den finalen Wert aus `sceneRate * activeSpeed` und setzt ihn **einmal** pro Frame.

Wenn keine Speed-Keyframes existieren, setzt der Block einfach `playbackRate = sceneRate` (wie bisher Zeile 568).

### Betroffene Datei

- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

### Änderungen

1. **Zeilen 566-570 entfernen** (der erste playbackRate-Block)
2. **Zeilen 613-616 entfernen** (der playbackRate-Block beim Szenenwechsel)
3. **Zeilen 656-683 erweitern**: Immer laufen (nicht nur wenn Keyframes existieren), sceneRate + activeSpeed kombinieren, einmal setzen

