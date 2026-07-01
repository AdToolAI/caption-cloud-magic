## Ziel

Der Preview-Player soll beim Ziehen des Musik-/Lautstärke-Sliders flüssig weiterlaufen. Die Lautstärke soll sich live ändern, ohne dass Video, Frame-Zeit, Play/Pause-State oder Audio neu gestartet werden.

## Diagnose

Aktuell wird bei jeder Slider-Bewegung der komplette Remotion-Preview-Tree aktualisiert. Zusätzlich enthalten die `<Audio />`-Keys die Volume-Werte. Dadurch wird bei jedem Prozent-Schritt ein neues Audio-Element erzeugt; mit `pauseWhenBuffering` kann das den Player kurz blockieren oder ganz einfrieren. Für moderne UX ist das falsch: Lautstärke muss imperativ am Audio-Gain geändert werden, nicht durch Re-Mount der ganzen Komposition.

## Umsetzungsplan

1. **Preview-Audio vom Video-Render entkoppeln**
   - Im `RemotionPreviewPlayer` eigene `HTMLAudioElement`-Refs für Voice-over und Hintergrundmusik verwalten.
   - Der Remotion-Player rendert in der Preview nur Video/Subtitles/Visuals; Audio wird in der Preview extern gemischt.
   - Für Export/Lambda bleibt der bestehende Remotion-Audio-Pfad erhalten.

2. **Live-Mixer ohne Re-Render bauen**
   - Volume-Änderungen setzen direkt `audio.volume` auf den vorhandenen Audio-Elementen.
   - Keine Remotion-Komposition neu rendern, kein Audio-Key-Wechsel, kein Player-Remount.
   - Preview-Master-Volume, Mute, Voice-over-Volume und Background-Music-Volume werden sauber multipliziert.

3. **Playback-Sync sichern**
   - Play/Pause steuert Player, Voice-over und Musik gemeinsam.
   - Seek-Bar setzt `currentTime` der Audio-Elemente passend zu `frame / fps`.
   - Hintergrundmusik looped sauber; Voice-over läuft linear.
   - Kleine Drift-Korrektur während Playback, damit Audio und Video synchron bleiben.

4. **Memo-Logik korrigieren**
   - `MemoizedPlayer` darf bei reinen Volume-Änderungen nicht mehr neu rendern.
   - Re-Render nur noch bei echten visuellen/timeline-relevanten Änderungen: Szenen, Subtitles, URLs, Dauer, Format, Komponente, Loop.

5. **Template stabilisieren**
   - Volume-Werte aus den `<Audio />`-Keys in `UniversalCreatorVideo.tsx` entfernen.
   - Export verwendet weiterhin die final berechneten Lautstärken, aber ohne Re-Mount-Probleme in der Preview.

6. **Slider-Verhalten glätten**
   - Musik-Slider kann weiterhin live den Prozentwert anzeigen.
   - Während Dragging wird nur der externe Preview-Mixer aktualisiert; Persistenz/Render-Payload bleiben korrekt über denselben zentralen Customization-Builder.

7. **Verifikation**
   - Preview starten, während Playback den Musik-Slider schnell hoch/runter bewegen.
   - Prüfen: Video läuft weiter, Play/Pause bleibt bedienbar, Audio ändert sich live, Export-Payload nutzt dieselbe Lautstärke wie Preview.