
Ziel: Nicht noch mehr am Overlay schrauben, sondern die Preview-Zeitquelle sauber vereinheitlichen. Der aktuelle Fehler sitzt sehr wahrscheinlich in `DirectorsCutPreviewPlayer.tsx`, nicht mehr in der Capture-Logik.

1. Kernbefund aus dem Code
- `NativeTransitionOverlay` ist aktuell im Wesentlichen korrekt:
  - eigener rAF-Loop
  - Snapshot über `original_start_time`
  - Matching per `sceneId`
  - Timing um die Szenengrenze zentriert
- Aber `DirectorsCutPreviewPlayer` fährt gerade zweigleisig:
  - `visualTimeRef` wird im rAF rein per Wall-Clock hochgezählt
  - das `<video>` wird nur bei Abweichung `> 0.1s` auf `timelineToSourceTime(...)` zurückgesetzt
- Dadurch gibt es zwei unterschiedliche Wahrheiten:
  - Overlay orientiert sich an `visualTimeRef`
  - tatsächlich sichtbares Bild kommt vom nativen Decoder und kann hinterherhängen
- Genau das passt zu deinem Symptom: späterer Übergang zeigt noch Teile der alten Szene, obwohl der Overlay formal schon in Szene 3 ist.

2. Saubere Lösung
`src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

Ich würde die Preview auf eine einzige führende Zeitquelle umbauen:

- Während Playback darf nicht mehr `visualTimeRef += delta` die Wahrheit sein.
- Stattdessen:
  - das `<video>` bleibt der führende Decoder
  - pro Frame wird aus `video.currentTime` wieder die passende Timeline-Zeit berechnet
  - Overlay, UI und `onTimeUpdate` hängen an dieser rückgerechneten Timeline-Zeit

Kurz:
```text
source video time -> current scene bestimmen -> timeline time ableiten
```

3. Konkrete Umsetzung
A. Bidirektionales Mapping ergänzen
- Neben `timelineToSourceTime()` auch `sourceToTimelineTime()` einführen
- Formel pro aktiver Szene:
```ts
timelineTime =
scene.start_time +
(sourceTime - sourceStart) / playbackRate
```
- mit:
```ts
sourceStart = scene.original_start_time ?? scene.start_time
playbackRate = scene.playbackRate ?? 1
```

B. Playback-Loop korrigieren
- kein freies Hochzählen von `visualTimeRef` mehr
- stattdessen im rAF:
  - `sourceTime = video.currentTime`
  - passende Szene anhand `original_start_time/original_end_time` bzw. remapptem Bereich bestimmen
  - daraus `timelineTime` berechnen
  - `visualTimeRef.current = timelineTime`
- `setDisplayTime` und `onTimeUpdate` bleiben throttled, aber basieren auf echter Decoder-Zeit

C. Nur noch bei echten Seeks aktiv setzen
- `video.currentTime = timelineToSourceTime(...)` nur bei:
  - Slider-Seek
  - Reset
  - externer Zeit-Synchronisation
  - Szenensprung / manuellem Jump
- nicht mehr als dauernde Drift-Korrektur im Playback-Loop

D. PlaybackRate am nativen Video korrekt setzen
- wenn eine Szene beschleunigt/verlangsamt ist:
  - `video.playbackRate = currentScene.playbackRate ?? 1`
- sonst läuft das Video linear weiter und das Mapping stimmt nur auf dem Papier

4. Wichtiger Nebenaspekt
Der aktuelle `timelineToSourceTime()`-Ansatz sucht nur nach Timeline-Szene und springt dann hart am Decoder herum. Das kann zwar “formal” korrekt wirken, ist aber genau die Art von Entkopplung, die zu alten Frames an den Cuts führt. Mit decodergeführter Zeit fällt diese Drift weg.

5. Overlay nur leicht nachziehen
`src/components/directors-cut/preview/NativeTransitionOverlay.tsx`
- vermutlich nur kleine Nacharbeit:
  - weiter `visualTimeRef` verwenden
  - aber jetzt bekommt es eine Timeline-Zeit, die wirklich aus dem sichtbaren Videoframe kommt
- Falls nötig:
  - die aktive Transition robust gegen Grenzfälle am Szenenende clampen
  - sonst keine neue Logik nötig

6. Erwartetes Ergebnis
- Übergang 2 und 3 ziehen keine alte Szene mehr mit
- Overlay und Basisvideo referenzieren endlich denselben sichtbaren Moment
- keine kumulative Drift über mehrere Schnitte
- Performance bleibt gut, weil weiterhin nur ein nativer Decoder läuft

7. Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — Hauptfix
- `src/components/directors-cut/preview/NativeTransitionOverlay.tsx` — höchstens kleiner Folge-Fix

Technische Details
```text
Aktueller Fehler:
timeline clock und decoder clock laufen getrennt.

Besser:
Beim Abspielen ist der Decoder führend.
Die Timeline-Zeit wird aus video.currentTime zurückgerechnet.

Alt:
visualTimeRef += delta
video.currentTime wird nur gelegentlich korrigiert

Neu:
visualTimeRef = sourceToTimelineTime(video.currentTime)
video.currentTime wird nur bei echten Seeks gesetzt
video.playbackRate folgt der aktiven Szene
```
