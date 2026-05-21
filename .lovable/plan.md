## Befund

Der aktuelle Fehler ist nicht mehr primär ein Sync.so-Timeout, sondern ein blockierter Preflight:

- Die betroffene Cinematic-Sync-Szene landet auf `lip_sync_status = failed`.
- `clip_error` ist konkret: `dialog_missing_face_coords: samuel-dusatko, matthew-dusatko`.
- `audio_plan.twoshot.anchor_face_audit` bestätigt zwar `detected: 2`, `humans: 2`, `ok: true`, aber es wird kein `audio_plan.twoshot.faceMap` mit `characterId -> [x,y]` gespeichert.
- Die neue `compose-dialog-scene` Pipeline erwartet dieses FaceMap bereits fertig im `audio_plan.twoshot.faceMap`; die alte Pipeline konnte es selbst nachberechnen. Dadurch schlägt die neue Pipeline vor dem ersten Sync.so-Job fehl.

## Plan

1. **FaceMap-Logik in die neue Pipeline übernehmen**
   - In `supabase/functions/compose-dialog-scene/index.ts` die robuste Face-Detection/Identity-Mapping-Logik aus der alten `compose-twoshot-lipsync` Pipeline wiederverwenden/adaptieren:
     - Charakter-Portraits für die Sprecher auflösen.
     - Zwei Gesichter im gepinnten Anchor/Reference-Frame erkennen.
     - Gemini Identity-Match: linkes/rechtes Gesicht eindeutig auf `samuel-dusatko` / `matthew-dusatko` mappen.
     - `faceMap` mit `faces[].characterId`, `center`, `width`, `height` in `audio_plan.twoshot.faceMap` persistieren.

2. **Keine harte Sperre bei vorhandenem Audit aber fehlendem FaceMap**
   - `compose-dialog-scene` soll bei `anchor_face_audit.ok === true`, aber fehlendem/stalem `faceMap`, selbst eine frische FaceMap-Erzeugung starten.
   - Erst wenn nach dieser Erzeugung Sprecher-Koordinaten fehlen, sauber fehlschlagen mit klarer Fehlermeldung und Refund-Schutz.

3. **Reset/Retry für die aktuell kaputte Szene**
   - Nach dem Code-Fix die betroffene Szene aus dem `dialog_missing_face_coords` Failure zurück auf retryfähigen Zustand setzen:
     - `lip_sync_status = pending`
     - `twoshot_stage = master_clip`
     - `dialog_shots = null`
     - `lip_sync_applied_at = null`
     - `clip_error = null`
   - Der Auto-Trigger startet danach wieder `compose-dialog-scene`.

4. **Deploy & Validierung**
   - `compose-dialog-scene` deployen.
   - Funktion gezielt für die betroffene Szene anstoßen oder den Auto-Trigger greifen lassen.
   - Prüfen, dass `dialog_shots.version = 2` entsteht und die Shots `target_coords` enthalten.
   - Danach `poll-dialog-shots` prüfen: erster Turn muss einen Sync.so Job dispatchen statt direkt `failed` zu werden.

## Dateien

- `supabase/functions/compose-dialog-scene/index.ts`
- Optional nur zur Daten-Reparatur: `composer_scenes` Datensatz der betroffenen Szene

## Erwartetes Ergebnis

Die neue Dialog-Shot-Lip-Sync-Pipeline erzeugt ihre Face-Koordinaten selbst, statt an einem fehlenden Legacy-Cache zu scheitern. Dadurch startet Sync.so wieder korrekt pro Sprecher-Turn mit festen Zielkoordinaten.