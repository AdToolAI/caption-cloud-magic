
Ziel: Die Preview sauber lösen, statt weiter an der aktuellen Mischlösung herumzuoptimieren.

1. Kernbefund aus dem Code
- Die Haupt-Preview läuft noch immer über `@remotion/player` in `DirectorsCutPreviewPlayer.tsx`. Auch mit `previewMode` rendert `DirectorsCutVideo.tsx` framebasiert über Remotion. Das ist der Hauptgrund, warum trotz Single-Video-Idee weiter 2–3 Stotterer bleiben.
- Die Preview-Transitions in `DirectorsCutVideo.tsx` animieren aktuell vor allem das laufende Basisvideo (`opacity`, `transform`, `clipPath`). Dadurch wirkt der Übergang „halb richtig“ und springt optisch zurück, weil nicht wirklich die eingehende Szene sauber darübergelegt wird.
- Die Vorschau nutzt noch Export-Logik für die Dauer (`durationInFrames` abzüglich Transition-Overlap). Für die Editor-Preview ist das falsch: dort muss die Zeitachse 1:1 zur echten Videozeit laufen.
- In `NativeTransitionOverlay.tsx` steckt noch `backdropFilter`. Das ist über bewegtem Video teuer und passt genau zu den beobachteten Hängern.

2. Saubere Architektur
Wir trennen Preview und Export konsequent:

```text
Editor-Preview  = natives HTML5-Video + leichte DOM/CSS-Overlays
Finaler Export  = Remotion + TransitionSeries + framegenaue Übergänge
```

Nicht versuchen, beides mit derselben Runtime perfekt zu erzwingen. Genau das erzeugt gerade die Kompromisse.

3. Geplanter Umbau
- `DirectorsCutPreviewPlayer.tsx`
  - Remotion-`Player` aus der Editor-Preview entfernen
  - stattdessen ein natives `<video>` als einzige Videoquelle verwenden
  - dieselbe Prop-API behalten, damit alle Steps weiter funktionieren
  - `displayTime` nur für Slider/Labels throttlen
  - separate schnelle `visualTime` nur für Übergänge, Text und Subtitles nutzen

- Neue leichte Preview-Layer über dem nativen Video
  - eingehende Szene als Snapshot-/Frame-Overlay rendern
  - Basisvideo bleibt stabil
  - nur der Overlay-Layer animiert
  - Transition-Typen (`crossfade`, `fade`, `dissolve`, `wipe`, `slide`, `push`, `zoom`) werden ausschließlich über diesen Layer simuliert

- `NativeTransitionOverlay.tsx`
  - zur zentralen Preview-Transition-Komponente ausbauen
  - Matching nur per `sceneId`
  - Dauer in der Preview auf denselben Standard wie bisher festziehen (`0.8s`, Minimum `0.6s`)
  - `backdropFilter` komplett entfernen
  - bei `blur` stattdessen `filter: blur(...)` auf Overlay/Basisvideo verwenden, nie `backdrop-blur`

- `DirectorsCutVideo.tsx`
  - Preview-Branch nicht mehr als primäre Editor-Preview verwenden
  - Datei bleibt für den finalen Export zuständig
  - Overlap-/`TransitionSeries`-Logik bleibt export-only

4. Wichtige Korrekturen dabei
- Preview-Zeitachse wieder auf volle Videozeit setzen, ohne Transition-Overlap-Abzug
- alle Übergänge exakt an `scene.start_time` / `scene.end_time` ausrichten
- keine Animation mehr direkt auf dem Basisvideo, wenn sie den Eindruck erzeugt, dass alter und neuer Übergang nacheinander laufen
- Overlays über Video ohne Blur-Hintergrund gestalten (halbtransparente Flächen + `text-shadow` statt `backdrop-blur`)

5. Audio sauber stabilisieren
- Voiceover und Musik an das native Video koppeln, nicht mehr an Remotion-Player-Events
- Seek/Pause/Resume nur bei echten User-Aktionen oder nativen Video-Events
- keine laufende Voiceover-Drift-Korrektur während normalem Playback
- bestehende Recovery-Idee (`waiting`, `stalled`, `canplay`) behalten, aber auf die native Preview umstellen

6. Kompatibilität mit dem bestehenden Workflow
- Die Props aus allen Director’s-Cut-Schritten bleiben erhalten: `sceneEffects`, `colorGrading`, `styleTransfer`, `textOverlays`, `subtitleTrack`, `kenBurns`, `voiceoverUrl`, `backgroundMusicUrl`
- Damit brechen keine späteren Steps
- Finaler Export bleibt unverändert hochwertig und framegenau

7. Sicherheitsnetz für Sonderfälle
Falls Szenen echte zusätzliche Medien enthalten (`additionalMedia`, neue Bilder/Videos statt Originalquelle), plane ich einen klaren Fallback:
- Standardfall: native High-Performance-Preview
- Sonderfall mit nichtlinearer Medienquelle: gezielter Fallback auf die bestehende schwerere Preview-Variante nur dort, wo nötig

8. Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/preview/NativeTransitionOverlay.tsx`
- neue leichte Preview-Hilfskomponente unter `src/components/directors-cut/preview/`
- `src/remotion/templates/DirectorsCutVideo.tsx`
- kleine Anschlussänderungen in `StepLayoutWrapper.tsx` und betroffenen Steps, damit überall dieselbe neue Preview genutzt wird

9. Erwartetes Ergebnis
- deutlich flüssigere Editor-Preview
- Übergänge wirken optisch sauber überlagert statt versetzt oder doppelt
- weniger bis idealerweise keine sichtbaren Decoder-/Render-Stotterer im Standardfall
- Audio bleibt stabiler, weil es nicht mehr indirekt über Remotion-Playback mitgezogen wird

10. Kurz gesagt
Der saubere Weg ist nicht „noch ein weiterer Fix im Remotion-Preview-Branch“, sondern ein echter Architekturwechsel:
```text
Remotion nur für Export.
Native Video für Editing-Preview.
Übergänge als leichte Overlay-Simulation.
```
Das ist die robusteste Lösung mit der höchsten Chance, die letzten Stotterer wirklich loszuwerden.
