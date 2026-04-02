
Ziel

- Das szenenspezifische Speed Ramping in Schritt 7 so reparieren, dass Änderungen wirklich nur die ausgewählte Szene betreffen und nicht andere Keyframes mitziehen.

Was ich im Code gefunden habe

- Die Vorschau-Logik im Player ist grundsätzlich schon auf szenenspezifische Zeiten umgestellt:
  - `DirectorsCutPreviewPlayer.tsx` nutzt für Szenen-Keyframes bereits `compareTime = timelineTime - sceneStart`.
- Das eigentliche Problem sitzt sehr wahrscheinlich im Editor von Schritt 7:
  1. `SpeedRamping.tsx` nutzt für neue Keyframes standardmäßig `currentTime` direkt als `time`.
     - In Schritt 7 kommt `currentTime` aus dem Parent (`DirectorsCut.tsx`) und ist die globale Timeline-Zeit.
     - Für szenenspezifische Keyframes müsste hier aber die relative Szenenzeit benutzt werden.
  2. `SpeedRamping.tsx` behält `selectedKeyframe` beim Szenenwechsel.
     - Wenn vorher ein globaler oder anderer Szenen-Keyframe ausgewählt war, bearbeiten Presets/Slider weiter genau diesen Keyframe.
     - Dadurch wirkt es so, als würden „alle Szenen“ mit angepasst.

Geplanter Fix

1. `src/components/directors-cut/features/SpeedRamping.tsx`
- Einen klaren Kontext für die aktuelle Bearbeitung ableiten:
  - global = absolute Zeit
  - Szene = relative Zeit innerhalb der ausgewählten Szene
- Neue Keyframes bei ausgewählter Szene nicht mit der absoluten Timeline-Zeit anlegen, sondern mit relativer Szenenzeit.
- Den roten Zeit-Indikator ebenfalls im Szenenmodus relativ anzeigen, damit UI und gespeicherte Werte dasselbe Koordinatensystem nutzen.
- `selectedKeyframe` beim Wechsel von `selectedSceneId` automatisch zurücksetzen oder nur dann weiterverwenden, wenn der Keyframe zur aktuellen Szene gehört.
- `applyPreset()` absichern:
  - nur aktuell sichtbaren Keyframe bearbeiten
  - sonst neuen Keyframe im aktuellen Kontext anlegen

2. `src/components/directors-cut/steps/MotionEffectsStep.tsx`
- Die aktuelle Szenenposition sauber an `SpeedRamping` weitergeben:
  - wenn eine Szene gewählt ist, relative Zeit für diese Szene berechnen
  - sonst globale Zeit wie bisher
- Optional: die Berechnung einmal zentral kapseln, damit Timeline und Editor konsistent bleiben

Warum das den Fehler erklärt

- Aktuell sieht die UI zwar nach „Szene 4 bearbeiten“ aus, intern kann aber noch ein zuvor ausgewählter Keyframe aus Global/anderer Szene aktiv sein.
- Zusätzlich werden neue Szenen-Keyframes wahrscheinlich mit falscher Zeitbasis gespeichert.
- Diese Kombination führt genau zu dem Verhalten, das du beschreibst:
  - Szene wechseln
  - Zeit anpassen
  - andere Keyframes ändern sich scheinbar mit

Verifikation

- In Schritt 7 Szene 1 auswählen, Keyframe anlegen, Zeit/Speed ändern
- Danach Szene 4 auswählen und prüfen, dass kein alter Keyframe mehr ausgewählt ist
- In Szene 4 neuen Keyframe anlegen und sicherstellen, dass nur `sceneId === Szene4` geändert wird
- Zwischen Global, Szene 1 und Szene 4 hin- und herschalten
- Prüfen, dass die Vorschau pro Szene unterschiedliche Geschwindigkeiten zeigt
- Prüfen, dass globale Keyframes weiterhin als Fallback funktionieren, wenn eine Szene keine eigenen Keyframes hat

Technische Details

- Hauptursache ist jetzt sehr wahrscheinlich kein Preview-Renderer mehr, sondern ein Mismatch im Editor-State:
```text
UI sagt: "du bearbeitest Szene 4"
interner selectedKeyframe sagt evtl.: "globaler Keyframe ist noch aktiv"
Preset/Slider ändern dann den falschen Datensatz
```
- Zusätzlich muss im Szenenmodus überall dieselbe Zeitbasis gelten:
```text
global   -> absolute timeline time
szene    -> time relativ zu scene.start_time
```
