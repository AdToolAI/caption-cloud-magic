## Befund

Das aktuelle Lip-Sync schlägt nicht mehr wegen der alten `segments configuration` fehl. Der aktuelle Fehler ist:

- Sync.so startet Pass 1, bricht dann mit `An error occurred in the generation pipeline` ab.
- Die Scene hat ein 1376×768 Video, aber der gespeicherte Face-Target-Punkt für links wurde als `[215,169]` an Sync.so geschickt.
- Der echte linke Gesichtsmittelpunkt liegt im extrahierten Video-Frame sichtbar eher bei ca. `[315,190]` bis `[360,210]`. Der aktuelle Punkt sitzt zu weit links/oben am Haar-/Randbereich. Das kann Sync.so beim face-targeted Direct API Call crashen lassen.
- Zusätzlich pollt `compose-twoshot-lipsync` teilweise noch selbst im Edge-Function-Hintergrund; für diese Art Job ist die robustere Architektur: Job starten, sofort zurückgeben, Client/Status-Function pollt weiter.

## Plan

1. **Face-Koordinaten korrigieren**
   - In `compose-twoshot-lipsync` und `poll-twoshot-lipsync` die Target-Koordinaten nicht mehr aus `normCenter × videoDims` neu skalieren, wenn bereits echte Pixel-Center aus dem Anchor/Frame vorhanden sind.
   - Stattdessen gespeicherte `center`-Koordinaten direkt verwenden und nur proportional anpassen, falls Video- und Anchor-Dimensionen wirklich unterschiedlich sind.
   - Target-Punkte defensiv in die Face-Bounding-Box ziehen: lieber Gesichtszentrum als Haar-/Randpunkt.

2. **Provider-Payload vereinfachen**
   - Für Two-Pass keine fragilen Extras mehr senden, die Sync.so intern triggern können.
   - `active_speaker_detection.auto_detect=false` nur mit validierten Koordinaten; wenn Koordinaten nicht plausibel sind, klar failen + refund statt Provider-Crash.

3. **Polling sauber aufteilen**
   - `compose-twoshot-lipsync` soll nur Pass 1 erstellen, DB auf `running` setzen und sofort `202` zurückgeben.
   - `poll-twoshot-lipsync` übernimmt Polling, startet Pass 2 nach Pass-1-Erfolg und finalisiert nach Pass 2.
   - Dadurch vermeiden wir Edge-Function-Timeout-/WaitUntil-Risiko und folgen dem stabilen Client-Polling-Pattern.

4. **Fehlerdiagnose verbessern**
   - Den kompletten Sync.so Poll-Response im `audio_plan.twoshot.syncJobs.jobs[].providerResponse` speichern.
   - `targetCoords`, `faceCenter`, `bbox`, `videoDims`, `anchorDims` pro Pass speichern, damit der nächste Fehler sofort sichtbar ist.

5. **Betroffene Scene zurücksetzen**
   - Scene `840536cb-96f0-4912-9c31-bb9b2e46448f` auf `lip_sync_status='pending'`, `twoshot_stage='master_clip'` zurücksetzen.
   - Stale `replicate_prediction_id` und `syncJobs` entfernen, aber Clip, FaceMap und Audio behalten.

## Erwartetes Ergebnis

Nach dem nächsten Klick auf „Lip-Sync neu rendern“ wird Pass 1 mit korrektem Gesichtspunkt gestartet; falls Sync.so dennoch ablehnt, haben wir vollständige Provider-Daten und automatische Credit-Erstattung statt erneutem Blindflug.