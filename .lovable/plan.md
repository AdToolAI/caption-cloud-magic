
Ziel: Das Problem nicht mehr mit Timing-Fixes zu kaschieren, sondern die Preview-Architektur in Schritt 3 sauber auf echten Zwei-Layer-Transitionen umzubauen.

1. Wahrscheinliche eigentliche Ursache
- `DirectorsCutPreviewPlayer.tsx` ist aktuell für harte Schnitte optimiert, nicht für echte Übergänge:
  - darunter läuft nur ein einziges natives `<video>`
  - darüber blendet `NativeTransitionOverlay` nur ein Standbild der nächsten Szene ein
- Das erklärt genau dein Symptom:
  - während Übergang 2/3 zeigt das Basisvideo weiterhin die alte Szene
  - darüber kommt nur ein Snapshot der neuen Szene
  - dadurch “zieht” der Übergang optisch alte Inhalte mit
- Zusätzlich ist die aktuelle `sourceToTimelineTime()`-Logik grundsätzlich fragil:
  - sie versucht aus `video.currentTime` wieder die Timeline zu erraten
  - bei geschnittenen / beschleunigten / umsortierten Szenen ist diese Rückrechnung nicht eindeutig
  - spätere Übergänge werden dadurch eher schlechter als besser

2. Saubere Lösung
Ich würde die Editor-Preview für Übergänge auf ein echtes Zwei-Video-System umstellen:

```text
base video = aktuelle Szene
incoming video = nächste Szene
CSS steuert Crossfade / Slide / Wipe / Zoom
```

Nicht mehr:
```text
laufendes Video + statischer Snapshot
```

3. Konkreter Umbau
A. `DirectorsCutPreviewPlayer.tsx` zur führenden Orchestrierung machen
- Transition-Zone pro Szenegrenze berechnen
- außerhalb einer Transition:
  - nur Base-Video sichtbar
- innerhalb einer Transition:
  - Base-Video auf aktueller Szene
  - Incoming-Video auf nächster Szene
  - beide exakt auf korrekte Quellzeiten setzen
  - Effekt per CSS animieren

B. Neue Hilfslogik einführen
- `timelineToSourceTimeForScene(scene, timelineTime)`
- `getActiveSceneAtTime(time)`
- `getActiveTransitionAtTime(time)`
- kein globales `sourceToTimelineTime()` mehr als führende Playback-Wahrheit

C. Playback-Modell vereinfachen
- im Playback bleibt die Timeline-Zeit führend
- pro rAF:
  - Timeline-Zeit fortschreiben
  - Base-Video auf exakte Quellzeit der aktiven Szene syncen
  - bei aktiver Transition zusätzlich Incoming-Video auf exakte Quellzeit der Folgeszene syncen
- nur kleine Drift-Korrekturen, kein aggressives Springen bei jedem Frame

D. `NativeTransitionOverlay.tsx` ersetzen oder stark verkleinern
- die aktuelle Snapshot-Logik ist nur ein Workaround
- stattdessen:
  - entweder komplette Ablösung durch `NativeTransitionLayer`
  - oder `NativeTransitionOverlay` nur noch als reiner Effekt-Layer ohne Capture

4. Warum das sauberer ist
- Alte Szene kann nicht mehr “durchschleifen”, weil die neue Szene nicht mehr als Bild, sondern als echtes zweites Video vorliegt
- Slide/Wipe/Push sehen korrekt aus, weil wirklich zwei bewegte Quellen gegeneinander animiert werden
- Spätere Übergänge driften nicht kumulativ weg, weil nicht mehr aus Decoder-Zeit zurückgerechnet werden muss

5. Erwartete Änderungen
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - Hauptumbau auf Base-/Incoming-Video-Architektur
- `src/components/directors-cut/preview/NativeTransitionOverlay.tsx`
  - entfernen, stark vereinfachen oder in reinen Effekt-Layer umbauen
- optional neue Datei:
  - `src/components/directors-cut/preview/NativeTransitionLayer.tsx`

6. Erwartetes Ergebnis
- Übergang 2 und 3 zeigen endlich keine alte Szene mehr
- Slide, Wipe, Crossfade wirken wie echte Übergänge statt wie Overlay-Tricks
- Schritt 3 bleibt flüssig, weil weiterhin native Videos genutzt werden statt Remotion
- Filter aus Schritt 4 können weiterhin auf beide Videolayer konsistent angewendet werden

7. Technische Details
```text
Aktueller Fehler:
1 Decoder + 1 Snapshot-Overlay

Das reicht für sichtbare Fake-Transitions,
aber nicht für saubere spätere Schnitte.

Sauberer Zielzustand:
2 native Videolayer während aktiver Transition
- current scene video
- next scene video

Animation:
opacity / transform / clip-path

Zeitmodell:
timeline clock ist führend
jede Ebene wird direkt aus Szene + Timeline-Zeit gemappt
keine inverse source->timeline Rückrechnung als Hauptlogik
```
