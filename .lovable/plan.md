
Ziel

- Speed Ramping in Schritt 7 muss sichtbar und sauber pro Szene funktionieren.
- Die Stimme im Preview darf nicht mehr chipmunk/high-pitched klingen.

Was ich im Code konkret gefunden habe

- In `DirectorsCutPreviewPlayer.tsx` wird Geschwindigkeit aktuell doppelt angewendet:
  - `scene.playbackRate` wird in `DirectorsCut.tsx` schon aus dem Szenen-Speed gesetzt
  - danach multipliziert der Player noch einmal mit dem aktiven Keyframe-Speed
- Die Mapping-Logik im Player (`timelineToSourceTime`, `sourceToTimelineTime`, Szenenwechsel) versteht nur eine konstante Geschwindigkeit pro Szene, aber kein echtes Ramping innerhalb der Szene.
- `SpeedRamping.tsx` speichert `easing`, aber der Preview-Player ignoriert es komplett und macht nur harte Sprünge.
- Die Szenendauer wird aus einem simplen Durchschnitt der Keyframe-Speeds berechnet statt aus den echten Zeitabschnitten der Szene.
- In Schritt 7 läuft der eingebettete Preview-Playhead in `StepLayoutWrapper.tsx`, während `SpeedRamping.tsx` weiter einen anderen `currentTime` bekommt. Dadurch können Keyframes an der falschen Stelle landen.
- Die hohe/verzerrte Stimme kommt vom nativen Browser-`playbackRate` auf dem Originalton. `preservesPitch` reicht hier praktisch nicht zuverlässig aus.

Umsetzungsplan

1. Preview-Zeit und Speed-Editor synchronisieren
- `StepLayoutWrapper.tsx` so erweitern, dass der echte Live-Playhead des eingebetteten Players an die Step-Inhalte weitergegeben wird.
- `MotionEffectsStep.tsx` dann mit diesem echten Preview-Playhead an `SpeedRamping` koppeln.

2. Speed-Ramping im Player auf eine einzige Logik umbauen
- In `DirectorsCutPreviewPlayer.tsx` die aktuelle Doppel-Logik entfernen.
- Eine zentrale Speed-Kurven-Berechnung pro Szene einführen:
  - szenenspezifische Keyframes haben Vorrang vor globalen
  - Keyframes werden mit ihrem `easing` interpoliert
  - daraus wird der aktuelle Speed für die aktuelle Position in der Szene berechnet
- Diese eine Kurve wird dann überall verwendet:
  - `video.playbackRate`
  - Timeline-zu-Source-Mapping
  - Source-zu-Timeline-Mapping
  - Szenengrenzen / Übergänge

3. Szenendauer korrekt aus dem Ramp ableiten
- `SpeedRamping.tsx` und `DirectorsCut.tsx` von “simplem Durchschnitt” auf gewichtete Berechnung umstellen.
- Die neue Dauer wird aus den echten Segmenten der Szene berechnet, nicht nur aus dem Mittelwert der Keyframe-Zahlen.
- Die bestehende Cascade-Verschiebung für nachfolgende Szenen bleibt, basiert aber auf der korrekten Dauer.

4. Preview-Audio robust machen
- In `DirectorsCutPreviewPlayer.tsx` den Originalton bei Speed-Ramps nicht mehr per nativer Rate hoch/runter pitchen.
- Preview-Policy:
  - Voiceover und Musik bleiben linear auf 1x, wenn vorhanden
  - Originaler Sprachton wird in Ramp-Segmenten nicht mehr verzerrt, sondern im Preview geduckt/stummgeschaltet statt chipmunked
- So wird das Preview zuverlässig sauber, auch wenn Browser kein gutes pitch-preserving Time-Stretching liefern.

Betroffene Dateien

- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/features/SpeedRamping.tsx`
- `src/components/directors-cut/steps/MotionEffectsStep.tsx`
- `src/components/directors-cut/ui/StepLayoutWrapper.tsx`
- `src/pages/DirectorsCut/DirectorsCut.tsx`

Technische Details

```text
Aktuell:
scene.playbackRate (avg) x aktiver Keyframe-Speed = doppelte Beschleunigung
```

```text
Ziel:
eine einzige Speed-Kurve pro Szene
-> liefert:
   - aktuelle Playback-Geschwindigkeit
   - korrekte Szenendauer
   - korrektes Timeline/Source-Mapping
```

```text
Audio:
saubere Preview ist wichtiger als verzerrte Stimme
bei Ramp != 1x kein Chipmunk-Effekt mehr
```

Verifikation

- Keyframe mitten in einer Szene setzen: Effekt startet genau dort.
- Zwei Szenen mit verschiedenen Rampen testen: Änderungen bleiben szenenlokal.
- `linear`, `ease-in`, `ease-out`, `ease-in-out` testen: sichtbarer weicher Ramp statt harter Sprung.
- Szenendauer und Preview-Speed müssen zusammenpassen.
- Sprache im Preview klingt nicht mehr high-pitched; bei Ramp-Segmenten lieber stumm/geduckt als verzerrt.
