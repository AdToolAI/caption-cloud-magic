
Ziel: Übergänge in der Vorschau in Schritt 2 und 3 wirklich sichtbar machen und die restlichen Step-3-Probleme an den Übergängen beseitigen, ohne die per-Szene-Bearbeitung zu verlieren.

1. Bestätigte Ursachen
- Schritt 2 (`src/components/directors-cut/steps/SceneAnalysisStep.tsx`):
  - Dort läuft nur ein natives `<video>`.
  - Es gibt aktuell keine Transition-Render-Layer; deshalb kann die Vorschau dort Übergänge technisch gar nicht zeigen.
  - Zusätzlich ist die berechnete `videoFilter`-Logik zwar vorhanden, aber im Preview nicht auf das `<video>` angewendet.
- Schritt 3 (`src/remotion/templates/DirectorsCutVideo.tsx`):
  - Die Übergänge sind nicht nur ein Buffering-Thema, sondern die eigentliche Transition-Logik ist für mehrere Typen falsch:
    - `crossfade` / `dissolve` ändern aktuell nur die Helligkeit, aber nicht die Deckkraft der ausgehenden Szene.
    - `fade` geht auf 0.2 und wieder zurück auf 1 statt sauber auszublenden.
  - Dadurch bleibt selbst mit Underlay/Premounting die nächste Szene praktisch unsichtbar.
- Schritt 3 UI:
  - `SceneEditingStep.tsx` hängt `onTimeUpdate` direkt an `setCurrentVideoTime`; dadurch werden Preview-Overlay und `VisualTimeline` dauerhaft mitgerendert. Das verstärkt Probleme genau an Übergängen.

2. Umsetzungsansatz
- Übergangslogik im Remotion-Template korrekt neu aufbauen
  - Datei: `src/remotion/templates/DirectorsCutVideo.tsx`
  - `SceneVideo` bekommt klare Exit-/Entry-Logik pro Transition-Typ.
  - Foreground und Underlay werden nicht mehr nur “irgendwie sichtbar”, sondern gezielt animiert:
    - `crossfade`: aktuelle Szene blendet auf 0 aus, nächste blendet unter ihr ein
    - `dissolve`: wie Crossfade plus leichter zusätzlicher Filtereffekt
    - `fade`: echte Ausblendung (klar definiert, nicht 1 → 0.2 → 1)
    - `wipe` / `slide` / `push` bleiben Reveal-orientiert, aber konsistent
- Leichte Native-Transition-Vorschau für Schritt 2 ergänzen
  - Datei: `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
  - Statt nur das rohe `<video>` anzuzeigen, ergänze ich eine kleine Transition-Preview-Schicht:
    - Basis bleibt das native Video für Performance
    - bei aktiven Szenengrenzen wird eine zweite, synchronisierte Vorschau-Ebene nur im Transition-Fenster eingeblendet
    - so sind Übergänge in Schritt 2 sichtbar, ohne den schweren Remotion-Player wieder einzuführen
  - Dabei wende ich auch die bereits berechneten aktuellen Filter/Effekte auf die Analyse-Vorschau an, damit Schritt 2 und 3 visuell näher zusammenliegen
- Step-3-Preview entlasten
  - Datei: `src/components/directors-cut/steps/SceneEditingStep.tsx`
  - `currentVideoTime` nicht mehr ungefiltert bei jedem Player-Update in den ganzen Step pushen
  - stattdessen gedrosselte Sync für Timeline/Overlay, damit Übergänge nicht durch UI-Re-Renders gestört werden

3. Konkrete Dateien
- `src/remotion/templates/DirectorsCutVideo.tsx`
  - Transition-Mathematik für Exit/Entry pro Typ korrigieren
  - Underlay/Foreground sauber für Crossfade/Dissolve/Fade abstimmen
- `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
  - native Vorschau um echte, leichte Transition-Anzeige erweitern
  - aktuelle Filter-/Szenen-Effekte auch im Analyse-Preview sichtbar machen
- `src/components/directors-cut/steps/SceneEditingStep.tsx`
  - Time-Updates drosseln / Preview-nahe States entkoppeln
- Optional neue Hilfskomponente
  - z. B. `src/components/directors-cut/preview/NativeTransitionOverlay.tsx`
  - damit Schritt 2 die Übergangslogik kapselt statt sie direkt im Step zu vermischen

4. Ergebnis
- Schritt 2: Übergänge sind in der Analyse-Vorschau endlich sichtbar
- Schritt 3: Crossfade, Dissolve und Fade funktionieren wirklich statt fast unsichtbar zu sein
- Die per-Szene-Architektur bleibt erhalten, also weiterhin:
  - Szenen verlängern/verkürzen
  - Slow Motion / PlaybackRate
  - individuelle Szenenbearbeitung
- Die Preview wird konsistenter zwischen Schritt 2 und 3 und bleibt performant

5. Technische Hinweise
- `premountFor={30}` kann bleiben; das ist sinnvoll, aber es löst nicht die eigentliche falsche Transition-Mathematik
- Der wichtigste Fix ist jetzt nicht noch mehr Buffering, sondern:
  1. echte Transition-Animation für beide beteiligten Szenen
  2. native Vorschau-Schicht in Schritt 2
  3. weniger UI-Re-Renders in Schritt 3
