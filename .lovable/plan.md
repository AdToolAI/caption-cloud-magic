
Ziel: Das Problem an der Wurzel beheben. Der aktuelle Fix hat zwar einen gemeinsamen Resolver eingeführt, aber die zwei entscheidenden Laufzeitpfade benutzen ihn noch nicht wirklich korrekt. Deshalb fühlt es sich für dich weiterhin 1:1 gleich an.

1. Wahrscheinliche Hauptursache
- Die Vorschau rendert die Canvas-Transition korrekt über `useTransitionRenderer`, aber die eigentliche Playback-/Seek-Logik in `DirectorsCutPreviewPlayer.tsx` rechnet weiterhin mit eigener Boundary-Logik.
- Gleichzeitig friert die Vorschau aktuell nur die Phase `originalBoundary -> tStart` ein.
- Bei positiven Offsets oder längeren Overlaps springt der echte Base-Decoder aber schon auf die nächste Szene, während die Transition noch läuft.
- Ergebnis: Übergang 2 und 3 sehen weiterhin wie ein Dirty Cut mit darüberliegender Transition aus.

2. Zweite Hauptursache im Export
- `DirectorsCutVideo.tsx` nutzt im Render-Pfad zwar `sceneId`, aber die tatsächliche Übergangsplatzierung läuft noch über simples `TransitionSeries` zwischen Sequenzen.
- Das respektiert nicht die vom Resolver berechneten `tStart/tEnd`-Fenster in der Source-Time-Domain.
- Dadurch ist Export-Parität weiterhin nicht wirklich hergestellt, selbst wenn `offsetSeconds` im Payload ankommt.

3. Konkreter Umsetzungsplan
- Preview-Playback vollständig auf den Resolver umstellen
  - In `DirectorsCutPreviewPlayer.tsx` die lokale `findActiveTransition()`-Berechnung entfernen bzw. durch `resolveTransitions + findActiveTransition + findFreezePhase` ersetzen.
  - Eine gemeinsame Helper-Logik einführen:
    - wann die Base-Video-Zeit auf der ausgehenden Szene “gehalten” werden muss
    - wann zur nächsten Szene gesprungen werden darf
    - wann Timeline-Clamping ausgesetzt wird
  - Wichtig: Nicht nur die Freeze-Phase vor `tStart` abdecken, sondern die gesamte Zone behandeln, in der der Base-Decoder sonst zu früh in die nächste Szene kippt.

- Vorschau-Renderer robust gegen Base-Decoder-Sprung machen
  - `useTransitionRenderer.ts` so erweitern, dass während der gesamten aktiven Transition bei Bedarf der outgoing frame bzw. incoming frame kontrolliert gezeichnet wird.
  - Für `crossfade/fade/blur/zoom` klar definieren, wann Canvas dominiert und wann das Base-Video sichtbar bleiben darf.
  - Fallback: Wenn ein Bitmap fehlt, sauberer Crossfade statt harter Umschaltkante.

- Export wirklich auf Resolver-Fenster umstellen
  - `DirectorsCutVideo.tsx` nicht mehr nur “eine Sequence pro Szene + Transition dazwischen” rechnen lassen.
  - Stattdessen die Szene-Dauern und Overlaps aus den aufgelösten Transition-Fenstern ableiten.
  - Die Render-Komposition muss dieselben effektiven Fenster verwenden wie die Vorschau:
    - resolver-basierte Übergangsstarts
    - resolver-basierte Übergangsdauer
    - konsistente Richtung/Typ-Mappings

- Editor-Bug vollständig abschließen
  - `SceneEditingStep.tsx`: `onDurationChange` ebenfalls direkte `sceneId` übergeben.
  - Sonst kann Timing noch immer auf dem falschen Übergang landen, obwohl der Handler schon optional `sceneId` unterstützt.

4. Betroffene Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/preview/useTransitionRenderer.ts`
- `src/components/directors-cut/steps/SceneEditingStep.tsx`
- `src/remotion/templates/DirectorsCutVideo.tsx`
- optional zusätzlich:
  - `src/components/directors-cut/preview/NativeTransitionOverlay.tsx`
  - `src/components/directors-cut/preview/NativeTransitionLayer.tsx`
  damit keine alten Nebenpfade wieder abweichende Übergangslogik nutzen

5. Warum ich glaube, dass das der echte Fehler ist
- Der Resolver existiert bereits.
- Aber der wichtigste Vorschau-Pfad (`DirectorsCutPreviewPlayer`) nutzt weiterhin eigene Übergangs-/Boundary-Logik.
- Und der Export-Pfad nutzt weiterhin `TransitionSeries` auf Basis der Szenensequenzen statt auf Basis der aufgelösten Übergangsfenster.
- Das erklärt exakt, warum dein Bundle korrekt deployed sein kann und das Verhalten trotzdem “identisch” wirkt: Die Architektur wurde nur teilweise, nicht vollständig umgestellt.

6. Erfolgskriterien nach diesem Fix
- Übergänge 2 und 3 bleiben auch dann sauber, wenn der Base-Decoder die echte Source-Boundary überschreitet.
- Positive und negative `offsetSeconds` verhalten sich in Vorschau und Export gleich.
- Kein sichtbarer Dirty Cut mehr unter Crossfade/Fade.
- Dauer-/Offset-Änderungen greifen sicher auf den richtigen Übergang.
