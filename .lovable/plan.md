
Ziel

- Die Text-Overlay-Animationen in Schritt 6 so reparieren, dass sie sichtbar ablaufen statt sofort „fertig“ da zu sein.

Was ich im Code konkret gefunden habe

- Der letzte CSS-Fix ist tatsächlich im Projekt: `src/components/directors-cut/preview/NativeTextOverlayRenderer.tsx` enthält bereits eigene `@keyframes`.
- Das Problem liegt jetzt am Trigger und an der Struktur:
  1. `displayTime` wird zwar an den Renderer übergeben, dort aber aktuell gar nicht genutzt. Der Renderer weiß also nicht, ob das Overlay gerade wirklich startet, ob hineingeseekt wurde oder ob es schon im pausierten Zustand sichtbar war.
  2. Die CSS-Animation startet sofort beim Mount. Neue Overlays werden meistens an der aktuellen, oft pausierten Playhead-Position angelegt. Dadurch läuft die Animation schon im Standbild ab und beim eigentlichen Play ist der Text bereits im Endzustand.
  3. Positionierung und Animation verwenden beide `transform` auf demselben Element. Bei der Standardposition `center` überschreibt die Animation das Zentrier-`transform`, wodurch Fade/Scale/Bounce nicht sauber wirken.

Umsetzung

1. `DirectorsCutPreviewPlayer.tsx` anpassen
- Dem Overlay-Renderer zusätzlich `isPlaying` übergeben.
- Pro Overlay unterscheiden zwischen:
  - echtem Start während laufender Wiedergabe
  - bereits aktiv durch Pause/Seek
- Einen kleinen Trigger wie `runId` oder `shouldAnimateOnEntry` ableiten, damit Animationen nur dann neu starten, wenn der Playhead das Overlay wirklich überschreitet.

2. `NativeTextOverlayRenderer.tsx` umbauen
- Zwei Ebenen statt einer:
  - äußerer Wrapper = absolute Position + Zentrierung
  - innerer Wrapper = nur Animation
- So kollidiert das Positions-`transform` nicht mehr mit `fadeIn`, `scaleUp` und `bounce`.
- Interne Zustände ergänzen:
  - `waiting` = sichtbar vorbereitet, aber Animation noch nicht starten
  - `animating` = Start exakt beim echten Playback-Eintritt
  - `settled` = Endzustand bei Seek mitten ins Overlay

3. Typewriter korrekt koppeln
- Den RAF-Loop nicht mehr beim Mount starten, sondern erst beim echten Animationsstart.
- Wenn man in die Mitte des Overlays seekt, nicht wieder bei 0 Zeichen beginnen, sondern den passenden Zwischen-/Endzustand zeigen.

4. Reset/Re-Trigger sauber machen
- Bei Reset, Replay oder Seek vor den Startzeitpunkt den lokalen Animationszustand zurücksetzen.
- Beim Wechsel des Animationstyps im Editor die Vorschau wieder sauber neu triggern.

Technische Details

- Der Kernfehler ist aktuell: Die CSS-Keyframes sind vorhanden, aber sie werden am falschen Moment ausgelöst.
- Der zweite Kernfehler ist der `transform`-Konflikt auf demselben DOM-Element.
- Ich würde die Animationen weiterhin CSS-basiert lassen, weil das trotz des 250ms-`displayTime`-Throttlings die richtige Strategie ist. Es braucht nur einen playback-aware Start.

Betroffene Dateien

- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/preview/NativeTextOverlayRenderer.tsx`

Verifikation

- Neues Overlay im pausierten Zustand anlegen und danach auf Play drücken: Animation muss erst dann sichtbar starten.
- `fadeIn`, `scaleUp`, `bounce`, `typewriter`, `highlight`, `glitch` testen.
- Center-Position und Eckpositionen testen.
- In die Mitte eines Overlays seeken: kein unerwartetes Neu-Abspielen.
- Replay/Reset testen: dieselbe Animation muss erneut sauber ablaufen.
