

## Fix: 30s-Dauer und verlorene Übergänge in Schritt 4

### Problem 1: Immer noch 30 Sekunden

**Ursache gefunden in `DirectorsCut.tsx` Zeile 465:**
```typescript
const canonicalDuration = selectedVideo.duration || 30;
```

Wenn ein Mediathek-Video keine `duration_seconds` in den Metadaten hat, ist `selectedVideo.duration` = `undefined`. Die Analyse wird dann mit `30` als Dauer gestartet, und die KI erstellt Szenen die bei 30s enden — obwohl das Video 32s lang ist.

**Alle nachfolgenden Berechnungen** (`actualTotalDuration = Math.max(...end_time)`) ergeben dann korrekt 30s, weil die Szenen selbst falsch sind.

**Lösung:** Vor der Analyse die echte Videodauer direkt vom URL messen (wie `getVideoDuration` in VideoImportStep). Dann mit der gemessenen Dauer analysieren UND `selectedVideo.duration` aktualisieren.

### Problem 2: Übergänge in Schritt 4 fehlen

Schritt 4 (StyleLookStep) leitet `transitions` korrekt an `StepLayoutWrapper` → `DirectorsCutPreviewPlayer` weiter. Aber durch die falsche 30s-Dauer liegen die Transition-Fenster an falschen Positionen. Wenn die Szenen korrekte Zeiten haben, funktionieren die Übergänge automatisch auch in Schritt 4.

### Umsetzung

**1. `DirectorsCut.tsx` — Echte Dauer messen vor Analyse**
- Neue Helper-Funktion `measureVideoDuration(url)` die per `<video>` Element die echte Dauer misst
- In `handleStartAnalysis()`: Vor Frame-Extraktion die echte Dauer messen
- `selectedVideo.duration` mit gemessener Dauer aktualisieren (`setSelectedVideo(prev => ({...prev, duration: measured}))`)
- `canonicalDuration` = gemessene Dauer statt `selectedVideo.duration || 30`

**2. `VideoImportStep.tsx` — Mediathek-Import mit Dauer-Messung**
- In `handleLibrarySelect`: Wenn `metadata.duration_seconds` fehlt, die Dauer direkt vom Video-URL messen (gleiche `getVideoDuration`-Logik, aber mit URL statt File)
- Damit hat `selectedVideo.duration` IMMER einen echten Wert bevor die Analyse startet

### Betroffene Dateien
- `src/pages/DirectorsCut/DirectorsCut.tsx` — Dauer-Messung in `handleStartAnalysis`
- `src/components/directors-cut/steps/VideoImportStep.tsx` — Dauer-Messung bei Mediathek-Select

### Ergebnis
- Video zeigt echte Dauer (32s) in allen Schritten
- Szenen decken die volle Videolänge ab
- Übergänge liegen an den richtigen Positionen (auch in Schritt 4+)

