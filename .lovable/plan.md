# Continuity Guardian: "Prüfen"-Fehler beheben

## Ursache (verifiziert in den Edge-Logs)

Der Klick auf **Prüfen** löst diese Kette aus:

```text
Client → extract-video-last-frame  (FEHLER: REPLICATE_API_TOKEN missing)
       → detect-scene-drift        (wird nie erreicht)
```

Edge-Function-Log von `extract-video-last-frame` zeigt mehrfach:
```
ERROR [extract-video-last-frame] error: Error: REPLICATE_API_TOKEN missing
```

Beim ersten "Prüfen" liegt noch kein `lastFrameUrl` für die Vorgängerszene vor, deshalb wird zunächst der letzte Frame extrahiert. Diese Funktion nutzt Replicate (`lucataco/ffmpeg-extract-frame`), aber das Token fehlt im Projekt — und es ist sowieso ein unnötiger externer Hop, weil wir die Frames clientseitig viel schneller per Canvas extrahieren können.

## Lösung: Frame-Extraktion clientseitig per Canvas

Statt Replicate für eine triviale Aufgabe zu bezahlen, ziehen wir den letzten Frame direkt im Browser aus dem Video-Element und laden ihn (als PNG) in den Storage-Bucket `composer-frames`.

Vorteil: kein externer API-Key nötig, Latenz ~200ms statt ~5-15s, keine Credits verbrannt, und wir nutzen die bereits vorhandene Utility `src/lib/stock/extractVideoFrame.ts`.

### Änderungen

1. **`src/hooks/useFrameContinuity.ts` umbauen** auf clientseitige Extraktion:
   - `extractVideoFrame()` aus `src/lib/stock/extractVideoFrame.ts` (oder neue, kleine Helper-Funktion) liefert ein `Blob` für `currentTime = duration - 0.05`.
   - Blob direkt in den Storage-Bucket `composer-frames` hochladen (Pfad: `${userId}/${projectId}/last-frames/${sceneId}-${ts}.png`, RLS-konform mit User-ID als erstem Segment).
   - Public URL via `supabase.storage.from('composer-frames').getPublicUrl(path)` zurückgeben.
   - Optional: persistieren des `last_frame_url` in `composer_scenes` über den Client (RLS deckt das ab).
   - Keine Edge-Function-Aufrufe mehr aus diesem Hook.

2. **Storage-Bucket sicherstellen:**
   - Migration: Bucket `composer-frames` (public read, authenticated write) anlegen, falls nicht vorhanden.
   - RLS-Policies: User darf nur unter eigenem `user_id`-Prefix schreiben (entspricht Memory `infrastructure/storage/background-projects-rls-path-constraint`).

3. **`detect-scene-drift` Edge Function**: bleibt wie sie ist — sie lädt beide Bild-URLs und ruft Gemini 2.5 Flash auf. Kein Replicate-Token erforderlich.

4. **Edge Function `extract-video-last-frame`** als Backup hardenden:
   - Wenn `REPLICATE_API_TOKEN` fehlt, sauberen 503-Fehler mit Hinweis liefern, statt 500.
   - (Optional späterer Cleanup) — wir nutzen sie nicht mehr aktiv.

5. **Toast-Verbesserung**: bei Fehlern in `useContinuityDrift` und `useFrameContinuity` zusätzlich den Original-Fehlertext aus `error.context` ausgeben, damit künftige Fehler nicht generisch "Edge Function returned non-2xx" zeigen.

## Technische Details

- Datei `src/lib/stock/extractVideoFrame.ts` existiert bereits und liefert einen Blob via `<video>` + `<canvas>`. Sie wird im Stock-Library-Flow benutzt; wir wiederverwenden sie.
- Pfad-Schema im Bucket: `{user_id}/{project_id|shared}/last-frames/{scene_id}-{timestamp}.png` — kompatibel mit RLS.
- Cross-Origin: AI-Clip-URLs (Supabase Storage / Replicate-Output, in unseren Bucket gemirrored) liefern CORS-Header → Canvas-Extraktion klappt.
- Fallback: schlägt die Canvas-Extraktion fehl (z. B. cross-origin ohne CORS), zeigt der Toast eine klare Meldung; der User kann das Reference-Bild manuell setzen.

## Dateien

- bearbeitet: `src/hooks/useFrameContinuity.ts` (kompletter Umbau auf Client-Side)
- bearbeitet: `supabase/functions/extract-video-last-frame/index.ts` (besseres Error-Handling, optional)
- bearbeitet: `src/hooks/useContinuityDrift.ts` (detailliertere Fehler-Toasts)
- neu: Migration für `composer-frames` Storage-Bucket + RLS, falls nicht vorhanden

## Resultat

Klick auf **Prüfen** → Frame wird in <1s lokal extrahiert und hochgeladen → `detect-scene-drift` läuft sauber durch → Drift-Score erscheint im Cut-Chip.
