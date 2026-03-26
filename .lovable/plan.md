
Ziel: Die Regression rückgängig machen, damit die Vorschau wieder sichtbare Übergänge zeigt und gleichzeitig flüssiger läuft.

1. Bestätigte Ursachen
- In `DirectorsCutPreviewPlayer.tsx` wird `displayTime` nur alle 250ms aktualisiert. Das entlastet React, macht aber sichtbare Übergänge, Subtitle-Wechsel und Overlays stufig statt flüssig.
- In `DirectorsCutVideo.tsx` werden mehrere Transition-Typen (`blur`, `zoom`, `crossfade`, `dissolve`) aktuell alle auf `fade()` gemappt. Dadurch wirken Übergänge wieder „falsch“ oder kaum sichtbar.
- Die Preview nutzt weiter pro Szene ein eigenes `<Video>`. Das bleibt okay, aber sie braucht eine bessere Trennung zwischen:
  - flüssiger Playback-Zeit
  - langsamer UI-Zeit
- In Schritt 2 ist die native Overlay-Logik grundsätzlich richtig, aber auch dort wird die Zeit nur grob aktualisiert, wodurch Übergänge ruckelig wirken.

2. Umsetzung
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - zweite Zeitspur einführen:
    - `playbackTimeRef` für kontinuierliche, frame-nahe Zeit
    - `displayTime` weiter nur throttled für Slider/Labels
  - Subtitle-/Overlay-Berechnung nicht mehr auf dem grob gethrottelten Wert aufbauen, sondern auf einer sanft aktualisierten Preview-Zeit
  - Parent-Updates weiter throttlen, aber lokale visuelle Updates deutlich feiner machen
  - Audio-Sync nur korrigieren, wenn echter Drift vorliegt, ohne unnötige kleine Korrekturen

- `src/remotion/templates/DirectorsCutVideo.tsx`
  - Transition-Mapping verfeinern:
    - `crossfade` / `dissolve` → echter Fade-ähnlicher Overlap
    - `wipe-*` → wipe
    - `slide-*` / `push-*` → slide
    - `zoom` und `blur` nicht mehr stillschweigend wie `fade` behandeln, sondern mit eigener sichtbarer Preview-Näherung
  - prüfen, dass die Übergangsrichtung (`left/right/up/down`) sauber bis in die Presentation übernommen wird

- `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
  - die Native-Preview mit feinerer Zeitaktualisierung versorgen
  - `NativeTransitionOverlay` auf eine glattere Zeitbasis stellen, damit Übergänge in Schritt 2 nicht springen

3. Was ich bewusst nicht ändere
- keine Rückkehr zu Remotion-Audio in der Preview
- keine Auflösung des Szene-Konzepts
- kein Entfernen von `premountFor={60}`
- keine aggressive UI-Updates bei jedem Tick im gesamten Parent-State

4. Erwartetes Ergebnis
- Übergänge werden wieder klar sichtbar
- weniger „stufige“ oder verspätete Blend-/Wipe-Effekte
- weniger Hänger durch bessere Trennung von Playback und UI
- Audio bleibt unabhängig und läuft linear weiter

5. Technische Hinweise
- Der aktuelle Fehler ist wahrscheinlich eine Performance-/Timing-Regression, kein neues Paket- oder Buildproblem.
- Die wichtigste Korrektur ist: nicht alles auf denselben gethrottelten Zeitwert legen.
- Für eine gute Vorschau braucht es zwei Geschwindigkeiten:
```text
Playback-Zeit   -> schnell / visuell flüssig
UI-Zeit         -> langsam / React-schonend
```
