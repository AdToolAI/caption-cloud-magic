
Ziel

- Den verbleibenden Stotterer nach jedem Übergang beseitigen, ohne das gute Timing der Transition selbst zu verlieren.

Warum es trotz der letzten Fixes noch hängt

- Der aktuelle Flow macht nach jeder Transition immer noch einen Decoder-Handoff auf demselben sichtbaren Playback-Element:
  - `useTransitionRenderer.ts`: Am Ende der Transition wird der aktuelle Haupt-Stream pausiert, auf die Zeit des Incoming-Streams seeked und danach wieder resumed.
  - `DirectorsCutPreviewPlayer.tsx`: Der gesamte Playback-Loop hängt fest an `videoRef.current` als dauerhaftem Source-of-Truth.
- Das Timing ist dadurch zwar genauer geworden, aber die Architektur erzwingt weiterhin `pause -> seek -> resume` direkt nach jeder Transition. Genau dieser sichtbare Re-Sync ist sehr wahrscheinlich der Rest-Stotterer.

Umsetzung

1. Dual-Video auf echtes Ping-Pong umstellen
- Die zwei `<video>`-Elemente bleiben, aber nicht mehr als festes `base` und `incoming`.
- Stattdessen:
```text
slot A / slot B
active slot  = aktuell sichtbarer, laufender Playback-Stream
standby slot = vorseeked für die nächste Transition
```
- Nach einer Transition wird nicht mehr der alte Haupt-Stream nachgezogen, sondern der bereits laufende Standby-Stream wird zum neuen aktiven Stream.

2. Player von festem `videoRef` entkoppeln
- In `DirectorsCutPreviewPlayer.tsx` alle Video-Zugriffe über Helfer führen:
```text
getActiveVideo()
getStandbyVideo()
swapActiveSlot()
```
- Betroffen:
  - RAF-Playback-Loop
  - Play/Pause
  - externe Time-Syncs
  - `handleSeek`
  - `handleReset`
  - Boundary-Advance
  - Non-Sequential-Jump-Korrektur

3. Handoff ohne sichtbaren Re-Seek umbauen
- Den aktuellen Handoff in `useTransitionRenderer.ts` ersetzen:
```text
heute:
Transition endet
-> incoming einfrieren
-> base pausieren
-> base seeken
-> warten
-> zurück auf base zeigen

neu:
Transition endet
-> standby läuft bereits korrekt
-> active slot auf standby umschalten
-> alter active slot pausieren/verstecken
-> alter active slot wird neuer standby
```
- Dadurch entfällt der sichtbare `pause/seek/resume`-Moment nach jedem Übergang.

4. Renderer an Slot-Logik anpassen
- `useTransitionRenderer.ts` soll immer mit „active“ und „standby“ arbeiten, nicht mit hartem `base/incoming`-Denken.
- Preseek bleibt erhalten.
- Während aktiver Transition laufen beide Streams.
- Nach Abschluss gibt es einen Slot-Swap statt eines Frame-Handoffs auf dasselbe Element.

5. Boundary- und Cooldown-Logik auf Slot-Swap abstimmen
- `lastHandoffBoundaryRef` und `transitionPhaseRef` beibehalten.
- Player-seitige Boundary-Seeks an genau der bereits konsumierten Grenze weiter blockieren.
- Cooldown nur noch als Zusatzschutz lassen, nicht mehr als Hauptmechanik gegen den Hitch.

6. Reset-/Scrub-/Änderungs-Pfade sauber mitziehen
- Bei manuellem Seek, Reset, Szenen-/Transition-Änderungen:
  - aktiven Slot eindeutig setzen
  - Standby pausieren und verstecken
  - Preseek-Key, Boundary-Marker, Cooldown und Slot-State zurücksetzen
- So bleibt das Verhalten auch bei Scrubbing und mehreren Übergängen stabil.

Technische Details

- Betroffene Dateien:
  - `src/components/directors-cut/preview/useTransitionRenderer.ts`
  - `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- Kernänderung:
```text
bisher:
videoRef = dauerhaft Source-of-Truth
incomingVideoRef = temporärer Overlay-Stream

neu:
zwei feste Video-Slots
activeSlotRef bestimmt, welches Element gerade Source-of-Truth ist
Renderer und Player greifen immer über active/standby-Helfer darauf zu
```
- Optionaler Schutz:
  - Slot-Swap nur freigeben, wenn der Standby-Stream am Transition-Ende noch in enger Zeittoleranz zur erwarteten Szene liegt.
  - Kein nachträglicher Re-Seek auf dem sichtbaren Stream mehr.

Erwarteter Effekt

```text
vorher:
Transition sieht gut aus
-> danach sichtbarer Mini-Hitch
weil der sichtbare Hauptstream nachträglich resynchronisiert wird

nachher:
Transition sieht gut aus
-> kein Re-Seek auf dem sichtbaren Stream
-> laufender Transition-Stream wird direkt neuer Hauptstream
-> Hitch nach dem Übergang verschwindet
```

Verifikation

- Crossfade, Wipe, Slide, Push und Zoom testen
- Mehrere Übergänge direkt hintereinander testen
- Auf die ersten 0.5–1.0s nach jedem Übergang achten
- Seek, Pause/Resume, Reset und Scrubbing testen
- Prüfen, dass keine neuen Boundary-Sprünge entstehen und die Transitionen sichtbar bleiben
