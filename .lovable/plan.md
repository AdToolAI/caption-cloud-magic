Ich habe den Fehler jetzt enger eingegrenzt: Es ist nicht mehr primär die Anzahl der Szenen. Die 6 Szenen kommen zwar an, aber aktuell können zwei falsche Quellen die tatsächlichen Composer-Szenen verfälschen:

1. Der Auto-Detect-Pfad (`PySceneDetect`/Pixel/AI) analysiert das fertig gestitchte Video erneut. Dadurch erkennt er visuelle Binnenwechsel innerhalb einzelner AI-Clips und gibt z.B. Grenzen wie `0–13s, 13–15s, ...` zurück. Das sind keine Composer-Szenen, sondern Shot-Detection-Schätzungen auf dem finalen MP4.
2. Der Composer-Handoff nutzt zwar `sceneGeometry`, normalisiert Crossfade-Overlaps aber falsch. Dadurch wird z.B. aus den echten Clip-Grenzen ungefähr `0–3.75, 3.75–8.25, ...` nicht sauber die sichtbare Timeline `0–4, 4–8.5, 8.5–13, ...`.

Plan zur Behebung:

1. Composer-Handoff als harte Wahrheit erzwingen
   - Wenn `source=composer` und `render_id/project_id` vorhanden sind, wird Director’s Cut ausschließlich aus Composer-/Render-Metadaten aufgebaut.
   - Kein Aufruf von `analyze-video-scenes`, `PySceneDetect` oder Pixel-Detection für Composer-Renders.
   - Die Szene-Liste zeigt dann die ursprünglichen Composer-Szenen, nicht neu geschätzte Shots aus dem fertigen Video.

2. SceneGeometry korrekt in sichtbare Schnittpunkte umrechnen
   - Die gespeicherte `sceneGeometry` enthält Overlaps durch Crossfades.
   - Ich ersetze die aktuelle Midpoint-Normalisierung durch eine exakte Sequenz-Geometrie:
     - Szene 1 startet bei 0
     - jede nächste Szene startet dort, wo die vorige sichtbare Szene endet
     - pro Übergang wird der Crossfade-Overlap einmal von der Timeline abgezogen
   - Für den aktuellen Render ergibt das sinngemäß:
     - Szene 1: 0.00–4.00
     - Szene 2: 4.00–8.50
     - Szene 3: 8.50–13.00
     - Szene 4: 13.00–20.50
     - Szene 5: 20.50–25.00
     - Szene 6: 25.00–29.50/29.67
   - Das entspricht den echten Composer-Clip-Segmenten statt den falschen Detector-Cuts `0–13, 13–15, ...`.

3. Open-in-Director’s-Cut Link robuster machen
   - In `AssemblyTab` wird beim Öffnen aus einem bereits abgeschlossenen Render aktuell nur der lokale `renderId` State verwendet. Nach Seiten-Resume kann dieser leer sein, obwohl ein fertiger Render in der Datenbank existiert.
   - Ich speichere/rehydriere den tatsächlichen `render_id` aus der letzten `video_renders`-Zeile und übergebe ihn immer in der URL.
   - Dadurch lädt Director’s Cut garantiert genau den Render, den der Nutzer gerade sieht.

4. Fallback nur noch als Warnung, nicht als stille Schätzung
   - Falls bei einem Composer-Render keine `sceneGeometry` existiert, soll die App nicht still in die KI/Shot-Detection fallen.
   - Stattdessen: Toast/Status-Hinweis „Render-Metadaten fehlen – bitte neu aus Motion Studio rendern/öffnen“ und optional best-effort aus `composer_scenes.duration_seconds`, aber deutlich als Fallback markiert.
   - Keine blind geschätzten AI-Beschreibungen mehr für Composer-Handoffs.

5. Diagnose sichtbar machen
   - In der Szene-Liste/Toast soll erkennbar sein: „6 Composer-Szenen importiert“ statt „Fusion/PySceneDetect“.
   - Zusätzlich setze ich `aiCutMarkers` auf die echten Composer-Grenzen, damit Timeline-Snapping und Cut-Marker dieselbe Wahrheit nutzen.

Betroffene Dateien:

- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/components/video-composer/AssemblyTab.tsx`
- optional `src/components/video-composer/RenderPipelinePanel.tsx` für denselben robusten `render_id`-Handoff

Nach Umsetzung sollte Director’s Cut beim Öffnen eines Composer-Renders nicht mehr versuchen, Szenen „zu erkennen“, sondern exakt die 6 Composer-Szenen aus dem Render übernehmen.