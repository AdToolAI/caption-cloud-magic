Ich sehe jetzt ziemlich klar, warum es weiterhin falsch wirkt: Die Erkennung läuft aktuell zwar über PySceneDetect, aber wir leiten daraus die Schnittpunkte indirekt über die Dauer der von PySceneDetect erzeugten Clip-URLs ab. Wenn diese Clip-Dauer-Probes ungenau sind oder Clips nicht sauber metadata-probbar sind, entstehen falsche Grenzen. Zusätzlich wird bei importierten Composer-/Motion-Studio-Videos der Metadaten-Lock nur zuverlässig aktiv, wenn das Video über den Handoff-Link mit `source=composer&project_id=...` geöffnet wurde. Wird dasselbe Video später über „Video importieren“ aus der Mediathek geladen, fehlen diese Composer-Metadaten im Import-Objekt – dann versucht Auto-Cut wieder echte Shots im fertigen MP4 zu erraten.

Plan zur Korrektur:

1. Importierte Mediathek-Videos als Composer-Render erkennen
   - In `VideoImportStep.tsx` beim Laden der Videobibliothek zusätzlich `render_id`, `metadata` und ggf. vorhandene Composer-Hinweise aus `video_creations` nutzen.
   - Beim Auswählen eines Videos prüfen, ob es ein Composer/Motion-Studio-Render ist: über `video_creations.render_id`, `metadata.render_id`, `metadata.source`, oder per `output_url`-Lookup in `video_renders`.
   - Diese Informationen im `SelectedVideo` mitgeben, ohne die bestehende UI zu verkomplizieren.

2. Composer-EDL auch bei normalem Import anwenden
   - `DirectorsCut.tsx` erweitert: Wenn ein importiertes Video Composer-Render-Metadaten enthält, wird automatisch derselbe EDL/sceneGeometry Import verwendet wie beim `/directors-cut?source=composer...` Handoff.
   - Dann werden die vorhandenen echten Composer-Szenen gesetzt und Auto-Cut gesperrt, statt das fertige MP4 neu zu analysieren.
   - Ergebnis: Der Fall aus deinem Screenshot („6 Szenen“, aber falsche/komische Cutpunkte) nutzt künftig die gespeicherte Render-Wahrheit, nicht den Detector.

3. PySceneDetect-Ergebnis nicht mehr über Clip-Dauer erraten
   - `detect-scenes-pyscenedetect` soll zusätzlich zu `scene_urls` echte Cut-Zeitpunkte zurückgeben, wenn das Replicate-Modell diese Daten liefert; falls nicht, protokollieren wir das Ausgabeformat sichtbar.
   - Client-Seite: `DirectorsCut.tsx` bevorzugt echte `cut_times`/`boundaries` aus der Funktion und nutzt Clip-Dauer-Probing nur noch als Fallback.
   - Dadurch vermeiden wir Grenzfehler durch HTMLVideo-Metadata-Probes auf temporären Replicate-Clips.

4. Fallback-Detektion stabiler machen
   - Wenn PySceneDetect keine verwertbaren Zeiten liefert, wird der lokale Pixel-Pass immer über den CORS-Proxy versucht, nicht nur als zweiter Kandidat nach dem Original.
   - Der Boundary-Fusion-Schritt bekommt Debug-Ausgaben mit den tatsächlichen Zeitlisten (`adaptive`, `content`, `pixel`, `final`), damit wir bei der nächsten Rückmeldung sofort sehen, welche Quelle falsch liegt.

5. Auto-Analyse beim Import nicht gegen Composer-Lock laufen lassen
   - `handleVideoSelected` soll nicht direkt nach `setSelectedVideo` sofort `handleStartAnalysis()` auf dem alten State auslösen.
   - Stattdessen wird eine kleine Import-Pipeline genutzt: erst Video setzen, Composer-Metadaten prüfen/EDL importieren, nur falls kein Composer-Lock greift Auto-Cut starten.
   - Das beseitigt Race Conditions, bei denen eine automatische Analyse vor dem Lock starten kann.

6. UI-Hinweis verbessern
   - Wenn Szenen aus Composer-EDL/Geometrie stammen, bleibt der Badge sichtbar: „Composer EDL · X Szenen“.
   - Wenn echte Shot-Erkennung läuft, zeigt der Erfolgs-Toast die Quelle und Cut-Zahlen an: `PySceneDetect`, `Pixel`, oder `Fusion`.

Dateien voraussichtlich:
- `src/types/directors-cut.ts`
- `src/components/directors-cut/steps/VideoImportStep.tsx`
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `supabase/functions/detect-scenes-pyscenedetect/index.ts`

Wichtig: Ich würde hier nicht weiter nur an den Schwellenwerten drehen. Der Kernfix ist, Composer-/Motion-Studio-Renders über Metadaten deterministisch zu importieren und echte Boundary-Zeiten zu bevorzugen, statt aus generierten Szeneclips Zeitgrenzen zu rekonstruieren.