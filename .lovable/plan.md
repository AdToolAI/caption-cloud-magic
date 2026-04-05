
Problemursache

Die aktuelle Änderung greift in der Praxis gar nicht. Die Laufzeit-Logs der Analysefunktion zeigen:
- `boundaries: 0`
- `frames: 0`
- daraus wird deterministisch genau 1 Szene gebaut

Das heißt: Nicht die KI “rät” falsch, sondern der Client liefert der Backend-Analyse momentan keinerlei verwertbare Schnitterkennung.

Warum aktuell nichts erkannt wird

1. `extractTimestampedFrames()` läuft im Browser mit Canvas/`video.currentTime`.
- Bei den verwendeten Video-URLs aus der Mediathek/Render-URLs scheitert das sehr wahrscheinlich an CORS/canvas tainting oder an der Videoquelle selbst.
- In `DirectorsCut.tsx` wird dieser Fehler nur geloggt und danach trotzdem die Analysefunktion ohne Frames/Boundaries aufgerufen.

2. `analyze-video-scenes/index.ts` ist inzwischen vollständig von `scene_boundaries` abhängig.
- Wenn keine Boundaries ankommen, baut die Funktion absichtlich nur:
  - `0s → duration`
- Also genau 1 Szene.

3. Die UI ist irreführend.
- `SceneAnalysisStep.tsx` zeigt immer das Badge “Deterministische Analyse”, auch wenn tatsächlich gar keine Deterministik stattgefunden hat.
- In `DirectorsCut.tsx` steht im Toast zwar `KI Vision`, aber die eigentliche Karten-UI bleibt missverständlich.

Umsetzung

1. Browser-basierte Szenenerkennung nicht mehr als Primärpfad verwenden
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- Den aktuellen Canvas-Frame-Extraktionspfad nur noch als optionalen Fast-Path behandeln.
- Wenn Frame-Extraktion fehlschlägt oder 0 Frames liefert, direkt auf serverseitige Analyse umschalten statt “leer” weiterzumachen.

2. Serverseitige echte Schnitterkennung bauen
- Neue oder erweiterte Backend-Funktion, am besten direkt in `supabase/functions/analyze-video-scenes/index.ts`
- Ablauf:
  - Video von `video_url` herunterladen
  - mit FFmpeg/ffprobe serverseitig Frames über die gesamte Dauer extrahieren
  - harte Schnitte über echte Bilddifferenz-/Szenenwechsel-Metriken erkennen
  - optional zusätzlich Fade/Dissolve-Kandidaten über Fenstervergleich erkennen
- Wichtig: Die Szenengrenzen müssen im Backend entstehen, nicht im Browser.

3. Deterministische Fallback-Logik im Backend ergänzen
- Wenn keine clientseitigen `scene_boundaries` mitkommen:
  - Backend soll selbst analysieren
  - erst wenn auch dort wirklich kein Übergang gefunden wird, 1 Szene zurückgeben
- Damit ist “1 Szene” nur noch das Ergebnis einer echten Negativanalyse, nicht mehr eines technischen Frame-Fehlers.

4. Analysefunktion sauber auf zwei Pfade trennen
- Pfad A: `scene_boundaries` vom Client vorhanden
  - Backend übernimmt sie und beschreibt nur die Szenen
- Pfad B: keine `scene_boundaries`
  - Backend berechnet Boundaries selbst aus dem Video
  - danach beschreibt die KI nur die fertigen Segmente
- So bleibt die KI weiterhin aus der Szenenzahl heraus.

5. UI-Status ehrlich machen
- `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
- Anzeige unterscheiden zwischen:
  - Deterministische Analyse
  - Serverseitige Videoanalyse
  - Browser-Frames fehlgeschlagen
  - Nur 1 Szene gefunden
- Badge nicht mehr hartcodiert auf “Deterministische Analyse”.

6. Debug-Transparenz in der Antwortstruktur
- `analyze-video-scenes` soll zusätzlich zurückgeben:
  - `source`
  - `boundaries_used`
  - `analysis_mode`
  - `frame_extraction_method`
  - ggf. `debug_boundary_times`
- So sieht man sofort, ob der Cut bei ~30s überhaupt erkannt wurde.

Betroffene Dateien

- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
- `supabase/functions/analyze-video-scenes/index.ts`
- optional neuer Backend-Helper unter `supabase/functions/_shared/` für ffmpeg/ffprobe-basierte Videoanalyse

Technische Leitlinie

````text
Video URL
  -> Browser-Frames versuchen (optional)
  -> falls leer/fehlerhaft:
       serverseitig Video downloaden
       -> ffmpeg/ffprobe Szenenwechsel erkennen
       -> echte Boundaries erzeugen
  -> KI beschreibt nur die festen Segmente
````

Erwartetes Ergebnis

Danach ist die Szenenerkennung nicht mehr von Browser-CORS abhängig. Auch wenn die Frame-Extraktion im Frontend scheitert, wird das 60s-Video serverseitig direkt analysiert und der Übergang bei 30s kann als echte Szenengrenze erkannt werden, statt wieder bei 1 Szene zu landen.
