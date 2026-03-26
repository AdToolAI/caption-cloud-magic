
Ziel: Das Zurückspringen der Übergänge und den Voice-Aussetzer gezielt beheben, ohne die flüssige Single-Video-Preview wieder zu verlieren.

1. Bestätigte Ursachen
- In `src/remotion/templates/DirectorsCutVideo.tsx` werden die Preview-Übergänge aktuell auf demselben `<Video>`-Element per `opacity`, `transform` und `clipPath` animiert.
- Gleichzeitig ist auf dem Video noch ein CSS-`transition` gesetzt. In einer framebasierten Remotion-Preview führt das zu Nachziehen und anschließendem Rücksprung, weil der Browser zwischen laufend wechselnden Werten zusätzlich tweened.
- Für `wipe` / `slide` / `push` gibt es in der Preview kein echtes „incoming layer“. Es wird nur das aktuelle Bild verformt. Dadurch wirkt der Übergang halb fertig und springt am Szenenwechsel zurück.
- In `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` ist die Voiceover-Drift-Korrektur zwar entfernt, aber die Voiceover-Spur hängt noch an mehreren Transport-Pfaden:
  - `onPause`
  - `handleSeek`
  - Reset/Restart-Pfade
- Außerdem gibt es keine robuste Behandlung für `waiting` / `stalled` / `canplay` auf dem Voiceover-Audio. Ein kurzer Ladehänger kann deshalb als 1-2 Sekunden Aussetzer hörbar werden.

2. Umsetzung
- `src/remotion/templates/DirectorsCutVideo.tsx`
  - CSS-`transition` auf dem Preview-Video entfernen.
  - Preview-Übergänge nicht mehr durch Verformen des einzigen Video-Layers lösen, sondern als echte Overlay-Logik:
    - Basisvideo bleibt stabil und läuft durch.
    - Ein separater Preview-Overlay-Layer zeigt den nächsten Shot visuell an.
  - Für `crossfade` / `dissolve` / `fade`:
    - Overlay mit nächstem Frame/Thumbnail einblenden.
  - Für `wipe-*`, `slide-*`, `push-*`:
    - Richtung korrekt übernehmen.
    - Bewegung auf dem Overlay-Layer statt auf dem Basisvideo.
  - Für `zoom` / `blur`:
    - als zusätzlicher Effekt über dem stabilen Basisvideo, ohne Reset-Sprung am Boundary.
  - Übergangsfenster sauber bis zum Szenenende clampen, damit nichts am Umschaltpunkt zurückspringt.

- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - Voiceover von transienten Player-Pausen entkoppeln:
    - nicht bei jedem internen `pause` sofort die Voiceover-Spur stoppen
    - nur bei echter User-Pause, Reset oder explizitem Seek eingreifen
  - Voiceover-Position nur noch bei echten Seek-/Reset-Aktionen setzen, nicht bei allgemeinen Transport-Syncs.
  - Audio-Status-Handling ergänzen:
    - `waiting`
    - `stalled`
    - `canplay`
    - `playing`
  - eine kleine Resume-/Recovery-Logik einbauen, damit die Voiceover-Spur nach kurzem Buffering nicht stumm hängen bleibt.

- Optional zur Konsistenz:
  - die Preview-Overlay-Logik an `NativeTransitionOverlay` anlehnen bzw. angleichen, damit Schritt 2 und Schritt 3 gleich reagieren.

3. Was ich bewusst nicht ändere
- keine Rückkehr zu `TransitionSeries` in der Preview
- keine neue per-Szene-Decoder-Architektur
- keine erneute Voiceover-Drift-Korrektur gegen die Videozeit
- finaler Render bleibt unverändert framegenau

4. Erwartetes Ergebnis
- Übergänge springen nicht mehr zurück
- `wipe` / `slide` / `push` wirken als echte eingehende Übergänge
- Single-Video-Preview bleibt flüssig
- Voiceover läuft linear weiter und fängt sich bei kurzen Ladehänger robuster ab

5. Technischer Kernpunkt
```text
Basisvideo bleibt stabil
+ separater incoming Overlay-Layer für Übergänge
+ Voiceover nur bei echten User-Transportaktionen seeken/pause'n
```
