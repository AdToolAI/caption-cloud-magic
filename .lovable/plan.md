## Befund

Der Screenshot passt zur Datenlage: Die letzte Szene `6d0d31d5-276d-453e-a154-30557fe1e207` ist wieder im alten `v153_preflight_block` gelandet.

Was ich geprüft habe:
- `dialog_shots.anchor_face_layout` ist bei der Szene **nicht vorhanden**.
- `compose-video-clips` Logs zeigen für diese Szene **kein** `v278_anchor_layout`.
- `compose-dialog-segments` Logs zeigen deshalb: alter `v242_persisted_id_first_hydration` mit nur `lock=1/4`, danach `v153_plate_box_duplicate_for_speakers=[3]`.
- Es gibt aber verwertbare Daten in `audio_plan.twoshot.faceMap`: 4 Anchor-Gesichter mit Character-IDs. Das kann als Recovery-Quelle für v278 dienen.

Kurz: Die v278.1-Idee ist richtig, aber die Route wird für diese Szene nicht erreicht, weil der persistierte `anchor_face_layout` fehlt. Der alte partielle Rekognition-Seed wird dann zuerst benutzt und verursacht wieder die Duplicate-Fehlermeldung.

## Plan

1. **Fallback-Anchor-Layout direkt in `compose-dialog-segments` bauen**
   - Wenn `dialog_shots.anchor_face_layout` fehlt, aber `audio_plan.twoshot.faceMap` vollständige Anchor-Gesichter enthält, baut `compose-dialog-segments` daraus zur Laufzeit ein `AnchorFaceLayout`.
   - Quelle: `faceMap.faces[].bbox`, `faceMap.width`, `faceMap.height`, `faceMap.faces[].characterId`.
   - Damit können auch bereits existierende/halb kaputte Szenen in den v278-Router kommen, ohne dass der Clip komplett neu durch `compose-video-clips` muss.

2. **v278-Router vor alten persisted/partial Locks priorisieren**
   - Sobald ein vollständiges Anchor-Layout vorhanden ist, wird die alte `persistedBboxes`-/`assignmentLock`-Hydration übersprungen.
   - Dadurch kann ein partieller `v274_anchor_rekognition_partial` Seed den v278-Pfad nicht mehr blockieren.

3. **v278-Layout bei erfolgreicher Recovery speichern**
   - Wenn das Layout aus `faceMap` gebaut wurde, wird es in `dialog_shots.anchor_face_layout` persistiert.
   - Spätere Retries/Webhooks müssen es nicht erneut rekonstruieren.

4. **Preflight-Block entschärfen, wenn v278 verfügbar ist**
   - Der `v153_plate_box_duplicate` Block bleibt für alte/unsichere Pfade aktiv.
   - Für den v278-Pfad blockt er nicht mehr auf alte doppelte Cache-Boxen, sondern bewertet die vom Hungarian Router erzeugten bijektiven Boxen.

5. **Letzte Szene sauber zurücksetzen**
   - Nach dem Code-Fix setze ich nur diese letzte Szene von `v153_preflight_block` wieder in einen retry-fähigen Lip-Sync-Zustand zurück, ohne den ganzen Clip neu rendern zu müssen.
   - Credits bleiben nicht doppelt belastet; Refund-Status bleibt idempotent.

6. **Gezielte Verifikation**
   - Edge Function deployen.
   - Für die Szene prüfen, dass Logs `v278_router` zeigen und nicht mehr `v153_preflight_block`.
   - Danach Datenbank prüfen: `anchor_face_layout.slots = 4`, `plate_identity` kommt vom `v278-rekognition-hungarian` Pfad oder es gibt eine echte Count-Mismatch-Meldung statt Duplicate-Falschalarm.

## Technische Änderung

Betroffene Datei:
- `supabase/functions/compose-dialog-segments/index.ts`

Wahrscheinliche kleine Ergänzung:
- Helper `buildAnchorLayoutFromFaceMap(...)`, lokal oder in `_shared/plateFaceSlotRouter.ts`, je nachdem was sauberer in die bestehenden Imports passt.

Keine UI-Änderung, keine neue Datenbank-Migration.