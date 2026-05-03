Ich habe jetzt genauer nachgeschaut: Ja, die Daten für gerenderte Composer-Videos sind grundsätzlich vorhanden. Das Problem liegt sehr wahrscheinlich nicht nur in der Szenenerkennung, sondern an der Übergabe-/Mapping-Schicht zwischen Composer-Render und Director’s Cut.

Konkreter Befund:
- Der Director’s Cut importiert aktuell Composer-Szenen aus `composer_scenes`, aber nutzt `duration_seconds` aus der Storyboard-/Clip-Tabelle und skaliert sie pauschal auf die gemessene Endvideo-Länge.
- Das finale Render-Video ist aber nicht einfach `Summe aller duration_seconds`: In `compose-video-assemble` wird pro Clip die echte MP4-Dauer geprobt, dann rendert `ComposedAdVideo` mit festen 15 Frames Crossfade zwischen Szenen. Dadurch sind die echten Schnittpunkte im finalen Video verschoben.
- Zusätzlich wird im Studio tatsächlich `DirectorsCutPreviewPlayer` genutzt, nicht der zuvor angepasste `CapCutPreviewPlayer`. Die frühere Timecode-Korrektur greift also im sichtbaren Editor nicht vollständig.
- Es gibt außerdem einen Draft-Restore aus `sessionStorage`: wenn ein alter Auto-Cut-Draft vorhanden ist, kann der neue Composer-Import blockiert werden, weil `scenes.length > 0` ist. Das erklärt, warum trotz Composer-Daten weiterhin 3 falsche/random Szenen auftauchen können.

Ich plane folgende Korrektur:

1. Composer-Handoff-Draft sauber priorisieren
- Wenn URL `source=composer&project_id=...` enthält, darf ein alter Director’s-Cut-Draft nicht gewinnen.
- Der Composer-Import soll alte Auto-Cut-Szenen überschreiben, wenn sie nicht zum aktuellen Composer-Projekt gehören.
- Dafür markieren wir importierte Szenen intern mit Handoff-Metadaten wie `sourceProjectId`/`handoffSource`, ohne normale Upload-Videos zu beeinflussen.

2. Echte Render-Geometrie aus Backend-Daten rekonstruieren
- Im Composer-Import nicht mehr nur `composer_scenes.duration_seconds` verwenden.
- Zusätzliche Daten laden:
  - `clip_url`, `upload_url`, `upload_type`, `clip_source`, `clip_lead_in_trim_seconds`
  - das neueste `video_renders.content_config` für diesen Composer-Render, falls vorhanden (`durationInFrames`, `fps`, `totalDuration`, `scenesCount`).
- Für jede Szene browserseitig die echte Clip-Dauer mit `probeMediaDuration()` messen, analog zur Render-Funktion.
- Timeline-Schnittpunkte exakt wie `ComposedAdVideo` berechnen:

```text
sceneFrames[i] = round(effectiveSceneDuration[i] * fps)
visualStartFrame[0] = 0
visualStartFrame[i] = sum(sceneFrames[0..i-1]) - i * CROSSFADE_FRAMES
visualEndFrame[i] = visualStartFrame[i] + sceneFrames[i]
```

- Dadurch liegen die Director’s-Cut-Szenen an denselben Stellen wie das gerenderte Video, inklusive Crossfade-Overlap.

3. Source-Zeit im Director’s-Cut-Preview korrekt behandeln
- In `DirectorsCutPreviewPlayer` sicherstellen, dass `timelineToSourceTime()` und die Reverse-Mapping-Logik mit Composer-Handoff-Szenen korrekt arbeitet.
- Für Composer-Handoff ist das finale Stitch-Video bereits eine lineare Datei. Deshalb muss die Szene im Editor die Endvideo-Zeit verwenden, nicht wieder die ursprünglichen Einzelclip-Zeiten.
- Ergebnis: Klick auf Szene 2 springt wirklich an Szene 2 im finalen MP4, nicht an eine falsch kumulierte Position.

4. Beschreibungen nicht mehr „random“ wirken lassen
- Beschreibung der Composer-Szenen aus vorhandenen Daten bilden:
  - zuerst `text_overlay.text` oder `scene_type` + kurzer Prompt,
  - dann `ai_prompt`,
  - dann `stock_keywords`,
  - sonst neutral `Szene N`.
- Keine KI-Beschreibung für Composer-Handoff aus dem finalen MP4 ableiten.

5. Eigene Uploads unverändert lassen
- Der Upload-Flow ohne `source=composer` bleibt bei der Hybrid-/Artlist-Erkennung.
- Auto-Cut bleibt weiterhin manuell nutzbar; wenn ein Nutzer bewusst Auto-Cut klickt, darf er den Composer-Handoff überschreiben.

6. Backend-Handoff-Metadaten verbessern
- `compose-video-assemble` soll künftig die tatsächlich verwendete `remotionScenes`-Geometrie in `video_renders.content_config` speichern: Szene-ID, effectiveDuration, frameStart, frameEnd, crossfadeFrames, fps.
- `check-remotion-progress` soll bei abgeschlossenem Composer-Render zusätzlich `composer_projects.output_url/status` aktualisieren, damit spätere Handoffs stabil anhand der gerenderten Projekt-Daten arbeiten.

Betroffene Dateien:
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/types/directors-cut.ts`
- `supabase/functions/compose-video-assemble/index.ts`
- `supabase/functions/check-remotion-progress/index.ts`

Zielzustand:
- Composer-Video mit 6 gerenderten Szenen ergibt im Director’s Cut 6 korrekt beschriftete Szenen.
- Timecodes entsprechen dem final gerenderten MP4, nicht den nominalen Storyboard-Dauern.
- Alte Auto-Cut-Drafts können den Composer-Handoff nicht mehr verdecken.
- Eigene Uploads bleiben weiterhin mit Auto-Cut/Szenenerkennung nutzbar.