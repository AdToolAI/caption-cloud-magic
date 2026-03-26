
Ziel: Den Director’s-Cut-Editor so umbauen, dass im KI-Analyse-Schritt der Originalton wirklich hörbar ist und die Vorschau an Szenenübergängen nicht mehr stockt. Da du das Bundle bereits korrekt deployed hast, liegt das Problem sehr wahrscheinlich nicht mehr im Render-Bundle, sondern in der lokalen Editor-Preview.

1. Hauptursachen, die ich im aktuellen Code sehe
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - Der Preview-Ton läuft noch über separate `new Audio(...)`-Elemente.
  - Diese Audio-Elemente setzen weiter `crossOrigin = 'anonymous'` und schlucken `play()`-Fehler still weg.
  - Ergebnis: Die UI kann „unmuted“ anzeigen, aber der Ton startet real nie.
- `src/remotion/templates/DirectorsCutVideo.tsx`
  - An Übergängen werden weiterhin zwei Video-Decodes parallel erzeugt:
    - aktuelle Szene
    - nächste Szene als Underlay im Overlap
  - Genau dort entsteht das sichtbare Stocken.
  - Gleichzeitig gibt es aktuell kein echtes Vorladen mehr (`premountFor` ist gar nicht mehr vorhanden), also kommt der zweite Decoder auch noch spät dazu.
- `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
  - Der Step ist zwar schon entschärft, trägt aber noch eigene Preview-/Hilfslogik mit, die für die KI-Analyse nicht nötig schwer ist.

2. Geplanter Fix
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - Preview-Audio robust neu aufsetzen:
    - `crossOrigin` bei den nativen Preview-Audioquellen entfernen
    - Audio-Fehler nicht mehr still wegschlucken, sondern sauber behandeln
    - Audio-Ready/Error-State einführen
    - Originalaudio beim ersten Play explizit an `internalTime` koppeln und bei Seek/Play/Pause sauber mitsynchronisieren
  - `initialMuted={false}` nicht nur in State übernehmen, sondern wirklich auf die aktive Preview-Audioquelle anwenden
  - Den „Audio aktivieren“-Hinweis nur zeigen, wenn Audio absichtlich stumm ist — nicht wenn das Laden/Starten fehlgeschlagen ist

- `src/remotion/templates/DirectorsCutVideo.tsx`
  - Die schwere Übergangslogik von der Editor-Preview trennen:
    - Finaler Render bleibt bei der bestehenden Sequence-per-scene-Architektur
    - Preview-Modus bekommt eine leichtere Strategie ohne echten Doppel-Decode desselben Videos
  - Konkret:
    - im `previewMode` keine gleichzeitige Live-Video-Überlappung von aktueller + nächster Szene mehr
    - stattdessen vereinfachte, flüssige Preview-Transitions (z. B. Cut/Fade/Overlay-basiert), die nur einen aktiven Video-Decoder brauchen
  - Dadurch bleibt der Export korrekt, aber der Editor wird endlich flüssig

- `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
  - Preview im Analyse-Schritt auf die robuste Audio-/Lightweight-Preview anbinden
  - übrige step-lokale Preview-Hilfslogik weiter entschlacken, damit Step 2 nicht zusätzlich Last erzeugt

3. Erwartetes Ergebnis
- Im KI-Analyse-Schritt ist der Originalton direkt hörbar
- Der Nutzer kann den Ton weiterhin manuell muten
- Die Vorschau stockt an Szenenübergängen deutlich weniger oder gar nicht mehr
- Der finale Export bleibt unverändert korrekt, weil nur die Editor-Preview leichter gemacht wird

4. Dateien
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/remotion/templates/DirectorsCutVideo.tsx`
- `src/components/directors-cut/steps/SceneAnalysisStep.tsx`

5. Technischer Hinweis
- Ich würde diesmal bewusst nicht noch einmal nur an kleinen Mute-/Transition-Details schrauben.
- Der saubere Fix ist: Audio-Start im Editor korrekt machen und die Editor-Preview von der finalen Render-Architektur entkoppeln, damit nicht dieselbe Szene-Overlap-Logik den Browser ausbremst.
