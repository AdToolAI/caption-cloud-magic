## Frage
Wurde AWS (Rekognition) im Lip-Sync-Pfad korrekt verwendet?

## Prüfung des Ist-Zustands (nur gelesen, nichts geändert)

**Was AWS-seitig korrekt ist**
- `_shared/face-detect-mediapipe.ts` implementiert eine echte SigV4-signierte `RekognitionService.DetectFaces`-Anfrage. Region wird sauber auf ein gültiges Muster geprüft und fällt auf `eu-central-1` zurück, wenn `AWS_REGION` fehlt oder z. B. `"Global"` ist. Credentials aus `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. Payload als Base64-JPEG, Timeout, saubere Fehlerpfade.
- `_shared/plate-face-detect.ts` ruft Rekognition primär auf **Anchor-JPEGs** (nicht auf mp4) auf — genau so wie Rekognition das erwartet — und liest `MouthLeft/Right/Down` als Landmarks (`landmarks.mouth`) heraus. Diese Landmarks werden persistiert (`mouth_landmarks`) und in `compose-dialog-segments` als `speakerPlateMouths` bzw. `speakerCoords` verwendet — d. h. der Mund-Anker aus Rekognition fließt in den v247-Preclip.
- `_shared/pass-face-preclip.ts` verwendet den Mund-Anker exakt dann, wenn `mouth` und `bbox` da sind (`useMouthAnchor`), erzwingt `faceShareInCrop ≥ 0.42` und liefert die Metriken zurück (`anchor`, `faceShareInCrop`, `mouthOffsetPx`), die `compose-dialog-segments` heute an das `pass`-Objekt hängt.
- `_shared/syncso-face-gate.ts` nutzt Rekognition zusätzlich als Auto-Snap-Guard (v129.22.3).

Kurz: die eigentlichen AWS-Aufrufe (Signatur, Region, Endpoint, Payload-Form) sind korrekt.

**Was nicht korrekt „durchgezogen" ist**
1. **Server-Frame-Extract für den Face-Gate-Probe ist deaktiviert.**
   `_shared/face-frame-extract.ts` liefert immer entweder einen zwischengespeicherten Frame aus dem `composer-frames`-Bucket oder `server_extract_disabled_use_client_canvas`. Dadurch bekommt der Face-Gate im Dispatch-Pfad in 100 % der Fälle `FACE_GATE_PROBE_UNAVAILABLE`. Rekognition selbst wäre bereit, es fehlt nur die JPEG-Quelle.
2. **Preclip-Metriken landen (v249) zwar im Code auf dem `pass`-Objekt, wurden bis zum letzten Dispatch aber nicht in `syncso_dispatch_log` persistiert**, weil das produktive Bundle noch `v222-bridge-recount-resolved` war. Der Code für v249 existiert lokal, nur der Deploy fehlt.
3. **Fallback auf Rekognition „mp4 direkt"** in `plate-face-detect.ts` ist historisch drin (`aws_rekognition_mp4_fallback`), aber Rekognition akzeptiert kein Video — der Kommentar im Code sagt das selbst. Dieser Fallback ist tot, sollte klar deaktiviert oder auf einen JPEG-Extract umgestellt werden, damit er im Log nicht als Erfolgspfad wirkt.

## Bewertung
AWS-Rekognition ist **an sich korrekt eingebunden**: Signatur, Region, DetectFaces auf Bild-Bytes, Landmark-Auswertung, Mund-Anker im Preclip. Die Kette ist aber an zwei Stellen unterbrochen, sodass die AWS-Signale in der Produktion **nicht wirken**:
- Der Server-seitige Frame-Extract ist ausgeschaltet → Face-Gate-Probe kommt nie zu Rekognition.
- Der neue v249-Metrik-Persistenz-Pfad ist noch nicht deployed → die Slice-C-Ladder in `report-lipsync-motion-probe` bekommt weiter NULLs.

Fazit: AWS ist korrekt verwendet, aber der Nutzen kommt nicht durch, solange Frame-Extract offline und v249 nicht produktiv aktiv ist.

## Vorschlag (kein Code-Change ohne Freigabe)

1. **Deploy verifizieren**: sicherstellen, dass `compose-dialog-segments` als `v249-preclip-metrics-persisted` und `report-lipsync-motion-probe` mit Slice-C-Ladder live sind. Danach an einer Test-Szene prüfen, ob `face_share_in_preclip`, `mouth_center_offset_px`, `detector_used` in `syncso_dispatch_log` gefüllt sind.

2. **Face-Gate-Probe wieder scharf machen**: In `face-frame-extract.ts` einen echten Frame-Extract implementieren (Remotion-`still` oder ffmpeg-Edge-Call auf das Preclip-mp4, JPEG nach `composer-frames` schreiben). Dann greift der bestehende Rekognition-Auto-Snap in `syncso-face-gate.ts` wieder — statt `FACE_GATE_PROBE_UNAVAILABLE` bekommen wir echte `ok` / `ok_after_snap` Signale.

3. **Toten `aws_rekognition_mp4_fallback` entfernen** bzw. explizit als „nicht mehr genutzt" markieren, damit Logs nicht irreführen.

4. Erst nach 1–3 den nächsten visuellen Lip-Sync-Test fahren; alles davor läuft weiter am AWS-Signal vorbei.

## Nicht Teil des Plans
- Keine Änderung an Rekognition-Signatur, Region oder Auth — die sind korrekt.
- Keine Änderung an `pass-face-preclip` / `computeMouthCenteredCrop` — der v247-Anker greift, sobald die Landmarks weiterhin sauber ankommen (was sie tun).
- Keine neuen AWS-Ressourcen (Bedrock, S3-Buckets, Lambda-Deploy) — reine Wiring-Reparatur.