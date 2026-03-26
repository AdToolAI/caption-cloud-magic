
## Fix: Universal Content Creator — Szenen werden nicht gezeigt

### Ursache
Die Szenen kommen grundsätzlich korrekt bis zum Render an. Die Logs zeigen:
- `sceneCount: 5`
- alle 5 Szenen sind gültig
- jede Szene hat `background.type = video` und eine `videoUrl`

Das Problem sitzt sehr wahrscheinlich im Template `src/remotion/templates/UniversalCreatorVideo.tsx`:

Die neue Komponente `SafeVideo` startet `delayRender()`, aber sie **löst den Handle bei erfolgreichem Laden nie auf**:
- `loaded` wird zwar als State angelegt
- es gibt aber **kein** `onLoadedData` / `onCanPlay` / ähnliches, das `setLoaded(true)` und `continueRender(handle)` ausführt
- nach 20 Sekunden greift deshalb immer der Timeout
- `SafeVideo` schaltet dann auf `GradientFallback` um

Ergebnis: Die Video-Szenen werden nicht sichtbar, obwohl sie im Payload enthalten sind. Stattdessen sieht man nur Verlauf + Text.

### Änderungen

#### 1. `src/remotion/templates/UniversalCreatorVideo.tsx`
`SafeVideo` sauber fertigstellen:

- Erfolgs-Handler ergänzen, z. B. über `onLoadedData` oder `onCanPlay`
- bei erfolgreichem Laden:
  - `setLoaded(true)`
  - `continueRender(handle)`
- mit Guard absichern, damit `continueRender()` nur einmal aufgerufen wird
- bei Error/Timeout weiterhin auf `GradientFallback` wechseln
- optional: ungültige URLs früh abfangen und direkt Fallback rendern

### Warum das den Fehler behebt
Dann blockiert `SafeVideo` den Render nicht mehr künstlich:
- erfolgreiche Pixabay-/Remote-Videos bleiben sichtbar
- nur echte Ladefehler fallen auf den Gradient-Fallback zurück
- Preview und finaler Render verhalten sich wieder konsistent

### Technische Hinweise
- Kein Datenbank- oder Backend-Schema-Fix nötig
- `render-with-remotion` liefert die Szenen bereits korrekt an
- Der Fehler wurde durch die Schutz-Komponente selbst eingeführt, nicht durch die Szenen-Pipeline

### Datei
1. `src/remotion/templates/UniversalCreatorVideo.tsx` — `SafeVideo` Success-Handling ergänzen und `delayRender` korrekt freigeben
