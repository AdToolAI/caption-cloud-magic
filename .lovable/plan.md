## Aktueller Stand

Der Lip-Sync ist auf die Sync.so Segments-API mit **einer** gemergten Audio-Referenz umgestellt — exakt wie das offizielle „Multiple Segments with Single Audio Input"-Beispiel in der Sync.so-Doku.

### Was war kaputt
- Wir haben pro Sprecher eine voll gepaddete 8-Sekunden-WAV als eigene `refId` an Sync.so geschickt und zusätzlich `audioInput.startTime/endTime` als Crops gesetzt.
- Sync.so hat das mit `The segments configuration is invalid.` abgelehnt.

### Was ist jetzt anders
- `compose-twoshot-lipsync` sendet jetzt nur **eine** Audio-Referenz: den bereits gemergten 8s-WAV-Track (`audio_plan.twoshot.url`).
- Pro Dialog-Turn ein `segment` mit `startTime/endTime` (Video-Timeline) + `audioInput.refId="vo_merged"` + matching Crop.
- Modell: `sync-3` (laut Sync.so robuster für AI-generierte Videos).
- `sync_mode: "remap"` (Sync.so-Default für segmentierte Generationen).
- Bei Provider-Fehler wird die exakte Sync.so-Fehlermeldung in `audio_plan.twoshot.syncJobs.lastError` gespeichert.
- Beide zuvor fehlgeschlagenen Szenen wurden zurückgesetzt — kein erneutes Hailuo-Rendern nötig.

### Was zu testen ist
1. „🎥 Lip-Sync neu rendern" in der betroffenen Szene klicken.
2. Erwartetes Ergebnis: Sync.so akzeptiert den Job, `lip_sync_status='done'`, Stimmen kommen aus den richtigen Mündern, weiterhin 2 Charaktere sichtbar.
3. Wenn es trotzdem scheitert, steht der genaue Sync.so-Fehler in `composer_scenes.audio_plan.twoshot.syncJobs.lastError`.
