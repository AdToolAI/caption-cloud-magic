## Problem

Die Szenen werden zwar aus der EDL des Composer-Renders übernommen, aber **jeder Zeitwert wird auf 2 Nachkommastellen gerundet** (`Math.round(x * 100) / 100`). Bei 30 fps ist ein Frame 33,33 ms lang — das Runden auf 10 ms verschiebt jeden Cut systematisch um bis zu ±17 ms gegenüber dem tatsächlich gerenderten Frame im MP4. Genau das sieht man als "leicht ungenau".

Zusätzlich landen die Cut-Marker dadurch nicht mehr auf einer echten Frame-Grenze, was beim Snap und beim Player-Seeking zusätzliche Drift erzeugt.

## Fix (3 kleine Änderungen, eine Datei)

**Datei:** `src/lib/directors-cut/composer-edl.ts`

1. **Frame-exakte Konvertierung in `importComposerRenderEDL`**
   - `cutPoints`: nicht mehr `/100` runden, sondern direkt `midFrame / fps` als Sekunden ausgeben (volle Float-Präzision, frame-genau).
   - `start` / `end` der Szenen: ebenfalls direkt aus dem Frame-Index der EDL ableiten (`outputStartFrame / fps`, bzw. der jeweilige `cutPoints[i]`), keine `*100/100`-Rundung mehr.
   - Optional: kleine Helper-Funktion `frameToSec(frame, fps)` für Lesbarkeit.

2. **Geometry-Fallback (`importComposerRenderGeometry`)**
   - Wenn `geometry[i].startSec/endSec` vorhanden sind: diese direkt nutzen statt eine eigene `cursor`-Summation, die Crossfade-Overlaps ignoriert.
   - Fallback-Pfad behält Frame-/ms-Präzision (Rundung höchstens auf 3 Nachkommastellen = ms).

3. **Letzter Fallback (`importComposerScenesDurationsOnly`)**
   - Hier ist nur Sekunden-Auflösung in der DB → auf 3 Nachkommastellen runden statt 2.

## Was das bewirkt

- Cut-Marker liegen exakt auf der gleichen Frame-Position, an der das gerenderte MP4 visuell wechselt.
- Snap-to-Playhead und das Setzen neuer Cuts rasten ohne Drift auf den echten Übergang ein.
- Die UI zeigt weiterhin gerundete `0:04`-Labels — die Genauigkeit ändert sich nur intern (Player-Seek, Snap, Schnitt-Engine).

Keine Änderungen an Edge Functions, Render-Pipeline oder DB nötig — die EDL liefert bereits frame-genaue Daten, sie wurden nur clientseitig "weichgespült".
