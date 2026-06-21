## Befund

- Die aktuell fehlgeschlagene Szene läuft nicht mit dem letzten Fix: Live-Logs zeigen `BOOT version=v156` und `WIRE_PAYLOAD version=v156`, keine `v158_sync3_face_target_box` Logs.
- Die Szene `5f4005fa-5fe1-429f-b47c-e6478310429a` wurde mit alten großen Face-Boxes dispatched (`area_pct` ca. 2.4–2.6%). Das entspricht genau den Morph-Artefakten.
- Sync-3 bleibt gesetzt. Kein Wechsel auf `lipsync-2-pro`.

## Plan

1. **Version sauber auf v159 bumpen**
   - `COMPOSE_DIALOG_SEGMENTS_VERSION` auf `v159` setzen.
   - Neue eindeutige Logs: `BOOT version=v159`, `WIRE_PAYLOAD version=v159`, `v159_sync3_mouth_box`.

2. **Sync-3 Targeting fail-closed machen**
   - Für Multi-Speaker `bbox-url-pro` darf nur noch mit Mund-zentrierter Box dispatchen.
   - Wenn `mouth_used=false` oder Box-Fläche zu groß ist, wird vor Sync.so abgebrochen und refunded statt ein Morph-Video zu erzeugen.
   - Zielbereich: kompakte Mund-/Untergesichtsbox statt Full-Face/Schulterbox.

3. **Current Scene + Cache invalidieren**
   - Nicht nur die alte Testszene, sondern die aktuelle Szene `5f4005fa-5fe1-429f-b47c-e6478310429a` zurücksetzen:
     - `dialog_shots.plate_identity` entfernen
     - alte `plate_face_cache` AWS-Rekognition-Zeilen auslaufen lassen
   - Dadurch wird beim nächsten Start wirklich neu erkannt.

4. **Edge Function aktiv deployen**
   - `compose-dialog-segments` deployen, damit nicht erneut v156 in Produktion läuft.
   - Danach Logs prüfen, bevor du neu renderst.

5. **Verifikation vor Provider-Kosten**
   - Erwartete Logs vor dem Sync.so-Call:
     - `BOOT version=v159`
     - `WIRE_PAYLOAD version=v159`
     - 4× `v159_sync3_mouth_box`
     - `mouth_used=true`
     - `area_pct` deutlich unter den alten 2.4–2.6%
     - `active_speaker_detection.bounding_boxes_url`, kein `auto_detect:true`

## Technische Details

- Sync.so-Doku bestätigt: `bounding_boxes_url` muss `{ "bounding_boxes": [...] }` enthalten, ein Eintrag pro Frame, `null` außerhalb der sichtbaren/gewollten Frames.
- Der bestehende v156-Live-Lauf erfüllt zwar formal das DTO, targetet aber zu große Boxen. v159 erzwingt Mund-zentrierte Boxen und blockt alte Full-Face-Dispatches.
- Keine Modelländerung: `model: "sync-3"` bleibt unverändert.