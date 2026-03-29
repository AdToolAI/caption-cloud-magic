
Ziel: Die Übergänge 2 und 3 im Universal Director’s Cut zuverlässig sauber machen, statt weiter an Symptomen herumzudoktern. Ich würde das als ein Architektur-Fix umsetzen, nicht als weiteren kleinen Patch.

1. Befund aus dem aktuellen Code
- Die Vorschau und der Export benutzen derzeit nicht dieselbe Übergangslogik.
- Die Vorschau arbeitet schon mit `sceneId`, `original_end_time` und `offsetSeconds`:
  - `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - `src/components/directors-cut/preview/useTransitionRenderer.ts`
- Der Export verliert diese Präzision wieder:
  - `supabase/functions/render-directors-cut/index.ts` wandelt Transitions auf `sceneIndex` um und wirft `offsetSeconds` weg.
  - `src/remotion/templates/DirectorsCutVideo.tsx` sucht Übergänge dann nur noch per `sceneIndex`.
- Zusätzlich gibt es einen echten Cache-Bug in der Vorschau:
  - `useFrameCapture.ts` merkt sich bereits gecapturete Frames nur per `scene.id`.
  - Wenn Szenenzeiten verändert oder neu analysiert werden, bleiben alte Snapshots erhalten und spätere Übergänge zeigen falsche/stale Frames.
- Und es gibt einen Editor-Bug:
  - In `SceneEditingStep.tsx` benutzt `handleTransitionDurationChange()` ein potenziell stale `editingTransitionId`, während der Typ-Handler korrekt `sceneId` direkt bekommt.

2. Was ich bauen würde
Ich würde eine einzige gemeinsame Transition-Engine als Source of Truth einführen, die sowohl Vorschau als auch Export verwendet.

3. Konkreter Umsetzungsplan
- Gemeinsame Transition-Resolver-Utility erstellen
  - zentrale Berechnung pro Übergang:
    - ausgehende Szene
    - eingehende Szene
    - `original_end_time`
    - `offsetSeconds`
    - `leadIn/leadOut`
    - `tStart/tEnd`
    - effektive Dauer
    - Basis-Typ + Richtung
  - dieselbe Clamp-/Overlap-Logik für alle Übergänge, damit 2 und 3 nicht anders behandelt werden als 1.

- Preview stabilisieren
  - `useFrameCapture.ts` so umbauen, dass der Cache bei geänderten Szenenschnitten invalidiert wird.
  - Cache-Key nicht nur `scene.id`, sondern z. B. `scene.id + original_start_time + original_end_time`.
  - alte `ImageBitmap`s sauber freigeben/ersetzen.
  - `useTransitionRenderer.ts` so anpassen, dass bei jedem neuen Transition-Fenster garantiert der richtige Snapshot gezeichnet wird.
  - Wenn ein Snapshot fehlt oder nicht rechtzeitig bereit ist, sauber auf Crossfade/Fade fallbacken statt einen schmutzigen Jump zu zeigen.

- Editor-Fehler beheben
  - `handleTransitionDurationChange()` ebenfalls auf direkte `sceneId`-Übergabe umstellen.
  - Sicherstellen, dass Typ, Dauer und Offset immer auf genau die aktuell bearbeitete Szene geschrieben werden.

- Export auf dieselbe Logik umstellen
  - `render-directors-cut/index.ts` darf `offsetSeconds` und `sceneId` nicht mehr verlieren.
  - `DirectorsCutVideo.tsx` muss Übergänge per `sceneId` an die sortierten Szenen binden, nicht per Array-Position.
  - Die Export-Komposition soll dieselben Transition-Fenster respektieren wie die Vorschau, damit Übergänge 2 und 3 nicht anders gerendert werden.

- Parität Preview vs Export herstellen
  - gleiche Richtungsmappings und gleiche Defaults
  - gleiche Behandlung von `crossfade`, `fade`, `wipe`, `slide`, `push`
  - gleiche Boundary-Logik bei positiven/negativen Offsets

4. Technische Details
- Betroffene Dateien:
  - `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - `src/components/directors-cut/preview/useTransitionRenderer.ts`
  - `src/components/directors-cut/preview/useFrameCapture.ts`
  - `src/components/directors-cut/steps/SceneEditingStep.tsx`
  - `supabase/functions/render-directors-cut/index.ts`
  - `src/remotion/templates/DirectorsCutVideo.tsx`
- Ich erwarte keine Datenbankänderung.
- Der wichtigste strukturelle Fix ist: keine doppelte, voneinander abweichende Übergangslogik mehr.

5. Ergebnis nach Umsetzung
- Übergänge 2 und 3 verwenden dieselbe saubere Logik wie Übergang 1.
- Nach Szenen-Neuschnitt oder Re-Analyse werden keine alten Frames mehr weiterverwendet.
- Vorschau und finaler Export verhalten sich gleich.
- Wenn ein Übergang technisch nicht perfekt vorbereitet ist, gibt es einen kontrollierten sauberen Fallback statt harter/glitchiger Sprünge.

6. Erfolgskriterien
- Crossfade/Fade zwischen Szene 2→3 und 3→4 laufen ohne sichtbaren Dirty Cut.
- Änderungen an Timing/Dauer wirken sofort auf den korrekten Übergang.
- Re-Analyse der Szenen erzeugt aktualisierte Übergänge ohne stale Snapshots.
- Export stimmt visuell mit der Vorschau überein.
