
Ziel: Das Problem nicht weiter im Overlay “wegzuoptimieren”, sondern die eigentliche Ursache in Schritt 3 zu korrigieren: Das Basisvideo läuft offenbar noch auf der falschen Quellzeit. Dadurch ist der Overlay-Snapshot zwar richtig, aber das darunterliegende Video zeigt an den späteren Schnitten noch Bild der alten Szene.

1. Kernbefund aus dem aktuellen Code
- `NativeTransitionOverlay` ist inzwischen weitgehend korrekt:
  - 60fps via eigenem rAF-Loop
  - Snapshot per `original_start_time`
  - Transition-Matching per `sceneId`
  - Timing zentriert um die Szenengrenze
- Aber in `DirectorsCutPreviewPlayer.tsx` läuft das Haupt-`<video>` weiterhin direkt mit:
```ts
const time = video.currentTime;
visualTimeRef.current = time;
```
- Es gibt dort keine Remap-Logik von Timeline-Zeit auf Quellvideo-Zeit pro Szene, obwohl `SceneAnalysis` genau dafür `original_start_time`, `original_end_time` und `playbackRate` hat.
- Das erklärt dein Symptom sehr gut:
  - Overlay blendet Szene 3 ein
  - Basisvideo liegt noch auf “alter” Quellposition
  - dadurch wirkt es so, als würde der Übergang Teile der alten Szene mitziehen
  - je später der Schnitt, desto stärker summiert sich der Drift → deshalb ist Übergang 2/3 schlechter als Übergang 1

2. Saubere Lösung
`src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

Ich würde die Preview auf dieselbe Grundlogik umstellen, die im `CapCutPreviewPlayer` bereits verwendet wird:
- aktuelle Szene aus `displayTime` / `visualTimeRef` bestimmen
- daraus die korrekte Quellzeit berechnen:
```ts
sourceTime =
  (scene.original_start_time ?? scene.start_time) +
  (timelineTime - scene.start_time) * (scene.playbackRate ?? 1)
```
- das native `<video>` aktiv auf diese Quellzeit synchronisieren statt ungefiltert die Timeline-Zeit zu verwenden

3. Konkret betroffene Stellen
A. Playback-/rAF-Loop in `DirectorsCutPreviewPlayer.tsx`
- aktuell wird `video.currentTime` implizit als globale Timeline-Zeit behandelt
- neu:
  - Timeline-Zeit bleibt für UI/Slider/Overlays
  - Video-Zeit wird davon getrennt und aus der aktiven Szene remapped

B. Seek-Handling
- bei Slider-Seeks darf nicht mehr einfach
```ts
video.currentTime = newTime
```
gesetzt werden
- stattdessen muss `newTime` erst auf die korrekte Quellzeit der Zielszene übersetzt werden

C. Externe Zeit-Sync-Logik
- auch der Block mit
```ts
if (Math.abs(currentTime - visualTimeRef.current) > 0.5) { ... }
```
muss auf remappte Zielzeit umgebaut werden
- sonst springt das Video beim nächsten Sync wieder auf die falsche Position

4. Kleine, aber wichtige Overlay-Nachbesserung
`src/components/directors-cut/preview/NativeTransitionOverlay.tsx`
- Das Overlay nutzt aktuell:
```ts
backgroundSize: 'cover'
```
- Das Hauptvideo nutzt aber `object-contain`
- dadurch kann das eingeblendete Bild leicht anders aussehen/liegen als das Basisvideo
- ich würde das Overlay auf contain-artige Darstellung umbauen:
  - kein `cover`
  - zentrierte vollständige Darstellung
  - schwarzer Letterbox-Hintergrund beibehalten
- Das behebt die optische Fehllage, ist aber nicht die Hauptursache des falschen Inhalts

5. Erwartetes Ergebnis
- Übergang 2 und 3 zeigen nicht mehr “alte Szene unter neuer Szene”
- Overlay und Basisvideo liegen an derselben echten Szenengrenze
- spätere Übergänge driften nicht weiter auseinander
- Schritt 3 bleibt flüssig, weil weiterhin nur ein nativer Decoder aktiv ist

6. Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — Hauptfix
- `src/components/directors-cut/preview/NativeTransitionOverlay.tsx` — visuelle Angleichung an `object-contain`

Technische Details
```text
Aktueller Fehler:
Timeline-Zeit wird wie Quellvideo-Zeit behandelt.

Korrekt wäre:
Timeline-Zeit -> aktive Szene bestimmen
aktive Szene -> originale Quellzeit berechnen
nur diese Quellzeit ins <video> schreiben

Formel:
sourceTime =
(scene.original_start_time ?? scene.start_time)
+ (timelineTime - scene.start_time) * (scene.playbackRate ?? 1)

Folge:
Das Basisvideo zeigt endlich denselben inhaltlichen Frame,
auf den auch der Transition-Overlay referenziert.
```
