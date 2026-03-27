
## Fix für Director's Cut Übergänge

### Wahrscheinliche eigentliche Ursache
Das Problem ist sehr wahrscheinlich nicht mehr die KI-Erkennung der Schnittpunkte, sondern die Preview-Logik selbst:

- Die Übergänge sind bereits an den Szenengrenzen verankert (`scene.end_time`)
- Aber die Preview verwendet bei einem zentrierten Übergang zwei widersprüchliche Regeln:
  1. **CSS-Transition** behandelt die erste Hälfte als „alte Szene raus / neue Szene rein“
  2. **Base-Video-Sync** springt am exakten `scene.end_time` schon auf die nächste Szene um

Dadurch zeigen in der zweiten Hälfte des Übergangs **beide Layer schon die neue Szene** oder die falsche Szene-Zeit. Das erklärt, warum es weiterhin „genauso fehlerhaft“ aussieht.

### Was ich ändern würde

#### 1. Eine gemeinsame Transition-Berechnung einführen
In `DirectorsCutPreviewPlayer.tsx` und `NativeTransitionLayer.tsx` dieselbe Logik verwenden:

- aktive Transition anhand von `scene.id`
- `transitionStart = scene.end_time - duration / 2`
- `transitionEnd = scene.end_time + duration / 2`
- zusätzlich:
  - `outgoingScene = scenes[i]`
  - `incomingScene = scenes[i + 1]`
  - `progress`

So gibt es nur noch **eine Wahrheit** für Zeitpunkt und Layer-Zuordnung.

#### 2. Base-Video während aktiver Transition auf der Outgoing-Szene halten
Im Playback-Loop die aktive Szene nicht mehr nur per
`timelineTime >= start_time && timelineTime < end_time`
bestimmen.

Stattdessen:
- wenn eine Transition aktiv ist:
  - `videoRef` bleibt auf der **outgoing scene**
  - `incomingVideoRef` zeigt die **incoming scene**
- erst **nach** `transitionEnd` wird das Base-Video zur neuen Szene

Das ist der wichtigste Fix.

#### 3. Incoming-Video korrekt relativ zur nächsten Szene mappen
Aktuell wird für das Incoming-Video direkt
`sourceTimeForScene(nextScene, timelineTime)`
verwendet. In der ersten Hälfte eines zentrierten Übergangs liegt `timelineTime` aber noch vor `nextScene.start_time`.

Deshalb die Incoming-Zeit explizit aus dem Übergangsfortschritt ableiten:
- zu Beginn des Übergangs: Start der nächsten Szene
- am Szenenwechsel: passende Position innerhalb der neuen Szene
- am Ende des Übergangs: einige Frames in der neuen Szene

So wird das zweite Video nicht mit negativer bzw. falscher relativer Zeit gefüttert.

#### 4. Seek / Scrub / externe Zeit-Sync ebenfalls transition-aware machen
Nicht nur der Play-rAF:
- `handleSeek`
- externer `currentTime` Sync
- Reset / Restart

müssen bei aktiver Transition beide Layer korrekt setzen:
- Base = outgoing
- Incoming = incoming
- beide `playbackRate` passend zur jeweiligen Szene

Sonst bleibt das Problem beim Scrubben bestehen, selbst wenn Play etwas besser wird.

#### 5. Optional: kleine Debug-Hilfe für exakte Verifikation
Kurzzeitig eine interne Debug-Ausgabe einbauen:
- aktuelle Szene
- outgoing scene
- incoming scene
- progress
- transition active true/false

Damit lässt sich sofort sehen, ob die Layer an der Grenze korrekt umschalten.

### Betroffene Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/preview/NativeTransitionLayer.tsx`

### Technische Kurzfassung
```text
Aktueller Fehler:
Centered transition + base scene switch passieren nicht nach derselben Regel.

Heute:
- CSS denkt: outgoing bleibt bis transitionEnd sichtbar
- Base sync denkt: ab scene.end_time ist schon neue Szene aktiv

Folge:
- zweite Hälfte des Übergangs zeigt falsche Layer-Kombination
- incoming mapping ist vor nextScene.start_time zusätzlich fehlerhaft

Fix:
- gemeinsame resolveActiveTransition(...)
- base video bleibt während aktiver Transition auf outgoing scene
- incoming video bekommt eigene transition-aware source time
- erst nach transitionEnd base auf neue Szene umschalten
```
