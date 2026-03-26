
Ziel: Das Ruckeln im Director’s Cut gezielt beseitigen. Ja: eine schlechte KI-Szenenerkennung kann das Problem verstärken — aber sie ist nach aktuellem Code sehr wahrscheinlich nicht die eigentliche Hauptursache.

1. Einschätzung der Ursache
- `src/remotion/templates/DirectorsCutVideo.tsx`
  - Die Preview rendert weiterhin pro Szene ein eigenes `<Video>`.
  - Dadurch gibt es an jeder Szenengrenze einen Decoder-/Mount-Wechsel, selbst wenn `previewMode` aktiv ist.
  - Das erklärt Ruckler genau an Cuts/Übergängen.
- `src/pages/DirectorsCut/DirectorsCut.tsx`
  - Sobald mehrere Szenen existieren, werden automatisch für alle Grenzen `crossfade`-Transitions angelegt.
  - Wenn die KI zu viele oder zu kurze Szenen erkennt, vervielfacht das die problematischen Übergänge.
- `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
  - Schritt 2 nutzt aktuell bereits die schwere Remotion-Preview, obwohl dort eigentlich nur Rohvideo + Szenengrenzen geprüft werden müssen.
- `supabase/functions/analyze-video-scenes/index.ts`
  - Die Analyse validiert Reihenfolge und Zeiten, aber stabilisiert die Segmentierung nicht ausreichend gegen Mikro-Szenen.

2. Klare Antwort auf deine Frage
- Ja, falsche KI-Szenen können das Stocken verschlimmern:
  - mehr Szenen
  - kürzere Szenen
  - mehr automatische Crossfades
  - mehr Decoder-Wechsel
- Aber: Selbst mit perfekten Szenen bleibt die aktuelle Preview-Architektur an Cuts anfällig, weil sie pro Szene neu rendert.

3. Geplanter Fix
- `supabase/functions/analyze-video-scenes/index.ts`
  - Szenen nach der KI-Antwort stabilisieren:
    - Mindestdauer pro Szene einführen (z. B. 1.5–2.0s)
    - benachbarte Mini-Szenen zusammenführen
    - Maximalzahl der Szenen an Videolänge koppeln
  - Ziel: keine künstliche „Cut-Flut“ mehr aus der Analyse
- `src/pages/DirectorsCut/DirectorsCut.tsx`
  - Nach der Analyse dieselbe Stabilisierung clientseitig nochmals als Sicherheitsnetz anwenden
  - automatische Standard-Transitions nicht mehr pauschal auf alle Szenen setzen
  - in Schritt 2 standardmäßig lieber `none`/harte Cuts statt sofort `crossfade`
- `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
  - schwere Remotion-Preview im Analyse-Schritt ersetzen durch eine leichte Rohvideo-Preview:
    - ein einziges natives `<video>`
    - Audio standardmäßig an
    - Szenenmarker / aktiver Szenenhinweis als Overlay
    - keine Remotion-Transitions im Analyse-Schritt
  - damit prüfst du die KI-Schnitte ohne Render-Overhead
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - optionalen `mode` / `lightweightPreview` einführen
  - für Analyse/Review keine Übergangs-Inszenierung erzwingen
- `src/remotion/templates/DirectorsCutVideo.tsx`
  - Preview weiter vom finalen Render entkoppeln:
    - im `previewMode` Übergänge nur noch als leichte Opacity-/Overlay-Effekte oder reine Cuts
    - keine decoder-teure Szenenlogik für Editor-Playback
  - finaler Export bleibt unverändert hochwertig

4. Was das gezielt löst
- falsche oder zu feine KI-Segmentierung erzeugt nicht mehr unnötig viele Übergänge
- Schritt 2 wird flüssig, weil dort nur noch ein einziges Video läuft
- spätere Schritte behalten die starke Renderlogik für Export, aber die Editor-Vorschau wird entschärft
- Audio und visuelle Prüfung der Szenen werden voneinander entkoppelt und dadurch stabiler

5. Erwartetes Ergebnis
- deutlich weniger Ruckeln an Szenengrenzen
- KI-Analyse fühlt sich ruhiger und kontrollierbarer an
- fehlerhafte KI-Schnitte verschlechtern die Preview nicht mehr so stark
- finaler Render bleibt korrekt, weil die Entlastung primär im Editor passiert

6. Dateien
- `supabase/functions/analyze-video-scenes/index.ts`
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/remotion/templates/DirectorsCutVideo.tsx`

Technischer Hinweis:
Der wichtigste Hebel ist nicht noch mehr Feintuning an einzelnen Übergängen, sondern die Entkopplung von:
1. KI-Szenenerkennung
2. Analyse-Preview
3. finaler Render-Architektur

So verhindern wir, dass jeder erkannte Cut sofort einen teuren Preview-Decoder-Wechsel auslöst.
