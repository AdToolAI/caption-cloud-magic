## Problem
Der Klick startet kurz, springt dann aber zurück, weil die Datenbank `engine_override='cinematic-sync'` aktuell ablehnt. Die aktive Constraint auf `composer_scenes.engine_override` erlaubt nur `auto`, `heygen`, `broll`, `sync-polish`. Dadurch schlägt der Single-Row-Update fehl, der Frontend-Handler rollt zurück, und `compose-video-clips` wird nicht aufgerufen.

## Plan
1. **Datenbank-Constraint korrigieren**
   - Bestehende `composer_scenes_engine_override_check` ersetzen.
   - `cinematic-sync` als erlaubten Wert ergänzen.
   - Bestehende Werte unverändert lassen.

2. **Frontend-Fehler nicht mehr verstecken**
   - In `ClipsTab.tsx` den Persistenzfehler nicht nur per `console.warn` loggen, sondern hart abbrechen.
   - Dadurch sieht man bei künftigen Constraint-/RLS-/Schema-Problemen sofort eine echte Fehlermeldung statt „1 Sekunde Render, dann weg“.

3. **Polling-Select vervollständigen**
   - `pollScenes` liest aktuell `clip_source` im Vergleich/Mapping, selektiert es aber nicht. Das wird ergänzt, damit UI und DB bei Cinematic-Sync stabil synchron bleiben.

4. **Optionaler Safety-Check nach Update**
   - Nach dem Persistieren prüfen, ob genau eine Szene aktualisiert wurde bzw. ob kein Fehler zurückkam.
   - Falls nicht, wird ein verständlicher Toast angezeigt und kein falscher Renderstatus vorgespielt.

## Technische Details
- Migration:
  - `ALTER TABLE public.composer_scenes DROP CONSTRAINT IF EXISTS composer_scenes_engine_override_check;`
  - Neue CHECK-Constraint mit `('auto','heygen','broll','sync-polish','cinematic-sync')`.
- Code:
  - `ClipsTab.tsx`: `throw persistErr` statt nur Warnung.
  - `pollScenes`: `clip_source` in `.select(...)` aufnehmen.

## Erwartetes Ergebnis
Nach Approval bleibt die Szene auf „generating“, der `compose-video-clips` Request wird tatsächlich ausgeführt, und der Cinematic-Sync-Status wird nicht mehr sofort zurückgerollt.