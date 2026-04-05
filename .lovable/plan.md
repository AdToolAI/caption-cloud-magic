
Ziel

Die Szenenanalyse soll nur echte, belegbare Schnitte zurückgeben. Bei deinem 60s-Video mit genau einem harten Cut bei 30s muss das Ergebnis exakt 2 Szenen sein: 0–30s und 30–60s.

Gefundene Ursachen im aktuellen Code

1. `src/pages/DirectorsCut/DirectorsCut.tsx`
- Im `catch` von `handleStartAnalysis` werden aktuell 3 Mock-Szenen gesetzt.
- Wenn die Analyse fehlschlägt, sieht der Nutzer trotzdem künstliche Szenen statt eines echten Fehlers.

2. `extractVideoFrames` in `DirectorsCut.tsx`
- Es wird mit fixer 0.1s-Logik gearbeitet, aber bei 200 Frames hart gecappt.
- Bei 60s werden dadurch effektiv nur ca. die ersten 20 Sekunden gesampelt.
- Ein echter Schnitt bei 30s wird so oft gar nicht gesehen.

3. `supabase/functions/analyze-video-scenes/index.ts`
- Die Edge Function lässt die KI die Szenenzahl weiterhin frei bestimmen.
- `generateFallbackScenes()` erfindet bei Unsicherheit neue Szenen aus der Videodauer, statt sauber zu sagen: “nicht sicher”.

Umsetzungsplan

1. Fake-Szenen im Frontend entfernen
- In `src/pages/DirectorsCut/DirectorsCut.tsx` den Demo-Fallback mit 3 Szenen löschen.
- Bei Analysefehlern keine künstlichen Szenen mehr setzen.
- Stattdessen klaren Fehlerstatus + Retry anzeigen.

2. Vollständige Videolänge analysieren
- Die Frame-Extraktion so umbauen, dass Samples gleichmäßig über die gesamte Dauer verteilt werden.
- Nicht mehr `Frame N = (N-1)*0.1` annehmen.
- Pro Frame den echten Zeitstempel mitsenden.

3. “Echte Analyse” statt freier KI-Schätzung
- Einen kleinen visuellen Cut-Detector einbauen, der aus aufeinanderfolgenden Frames echte starke Bildwechsel erkennt.
- Die KI soll nicht mehr die Anzahl der Szenen raten, sondern nur noch:
  - erkannte Schnitt-Kandidaten bestätigen/verwerfen
  - die finalen Szenen beschreiben
  - passende Effekte vorschlagen

4. Edge Function konservativ machen
- `supabase/functions/analyze-video-scenes/index.ts` auf echte Zeitstempel umstellen.
- Harte 0.1s-Annahmen im Prompt und Mapping entfernen.
- Wenn kein klarer Schnitt belegbar ist: genau 1 Szene zurückgeben.
- `generateFallbackScenes()` auf 1 Vollvideo-Szene umstellen statt Dauer-basiert zu raten.

5. UI transparenter machen
- In Schritt 2 sichtbar machen, ob das Ergebnis:
  - verifiziert
  - konservativer Fallback
  - fehlgeschlagen
  ist.
- Keine Erfolgsmeldung mehr, wenn intern nur ein Fallback oder Fehler vorlag.
- Die sichtbare Szenenzahl soll nur echte Analyse-Ergebnisse zeigen.

Validierung

- 60s Video mit einem harten Cut bei 30s => exakt 2 Szenen
- 60s Video ohne Cut => exakt 1 Szene
- Fehlerfall => 0 künstliche Szenen, stattdessen Fehlermeldung
- Videos >20s => Schnitte nach 20s werden weiterhin korrekt erkannt

Technische Details

- Betroffene Dateien:
  - `src/pages/DirectorsCut/DirectorsCut.tsx`
  - `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
  - `supabase/functions/analyze-video-scenes/index.ts`
  - optional neuer Helper, z. B. `src/lib/directors-cut-scene-detection.ts`
- Payload-Änderung:
  - bisher: `frames: string[]`
  - neu: `frames: Array<{ time: number; image: string }>`
- Bestehende Stabilisierung bleibt erhalten, aber nur noch als Nachbearbeitung echter Schnitt-Kandidaten.

Ergebnis

Danach basiert die Erkennung nicht mehr auf “Ratespielen”, sondern zuerst auf echten visuellen Schnittsignalen über die komplette Videolänge. Die KI beschreibt dann nur noch bestätigte Szenen. Für dein Beispiel bedeutet das zuverlässig 2 Szenen statt 3 oder 5.
