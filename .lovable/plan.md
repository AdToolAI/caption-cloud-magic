

## Fix: Transition-Timing — Ursache gefunden

### Das eigentliche Problem

Nach gründlicher Code-Analyse habe ich die **echte Ursache** identifiziert, die alle bisherigen Patches nicht adressiert haben:

**Während einer Transition spielt das Base-Video über die Szenengrenze hinaus.** Da beide `<video>`-Elemente dasselbe Quellvideo laden, zeigt das Base-Video in der zweiten Hälfte der Transition denselben Inhalt wie das Incoming-Video. Der Nutzer sieht die nächste Szene auf BEIDEN Layern → visuell wirkt es, als käme die Transition "zu früh."

Zusätzlich: Der Resolver arbeitet in **Source-Time** (`original_end_time`), aber der Renderer sollte in **Timeline-Time** (`visualTimeRef`) arbeiten. Wenn Source-Time und Timeline-Time voneinander abweichen (z.B. durch Trimming oder Neuanordnung), stimmen die Übergangsfenster nicht mit dem überein, was der Nutzer auf der Timeline sieht.

### Konkreter Fix (3 Dateien)

**1. `transitionResolver.ts` — Boundary auf Timeline-Time umstellen**
- Statt `scene.original_end_time` (Source-Time) wird `scene.end_time` (Timeline-Time) als Boundary verwendet
- `originalBoundary` bleibt als Metadaten-Feld für den Player erhalten
- Neues Feld `timelineBoundary` für die tatsächliche Fenster-Berechnung

**2. `useTransitionRenderer.ts` — Drei Fixes**
- **Time-Source**: `visualTimeRef.current` statt `baseVideoRef.current?.currentTime` verwenden
- **Base-Video einfrieren**: Während einer aktiven Transition das Base-Video auf die letzte Frame der ausgehenden Szene clampen (`originalBoundary - 0.05`), damit es nicht über die Grenze hinausspielt
- **Incoming-Video abspielen**: `incoming.play()` starten, wenn die Transition beginnt; `incoming.pause()` wenn sie endet

**3. `DirectorsCutPreviewPlayer.tsx` — Scene-Tracking stabilisieren**
- Wenn `cachedActiveTrans` aktiv ist, `sceneInfo` auf die ausgehende Szene fixieren (nicht zur nächsten Szene wechseln)
- `timelineTime` während Transitions an `outgoingScene.end_time` clampen statt frei laufen zu lassen
- Nach Transition-Ende: Base-Video korrekt auf die nächste Szene seeken

### Warum das funktioniert

```text
VORHER:
  Base-Video spielt über Boundary → zeigt nächste Szene
  Incoming-Video zeigt nächste Szene (statisch)
  → Beide Layer = gleicher Inhalt → "zu früh"

NACHHER:
  Base-Video eingefroren bei letztem Frame
  Incoming-Video spielt ab Start der nächsten Szene
  → Sauberer Crossfade zwischen zwei verschiedenen Inhalten
  → Timing exakt an Timeline-Boundary
```

### Erwartetes Ergebnis
- Übergang 1 wird sichtbar (Renderer nutzt jetzt korrekte Timeline-Time)
- Übergänge 2 und 3 starten an der richtigen Stelle (nicht mehr "zu früh")
- Alle Transition-Typen (Crossfade, Slide, Wipe, Push) funktionieren korrekt

