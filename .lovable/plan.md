Ich habe die Live-Daten geprüft. Der aktuelle Fehler ist nicht neu: die laufende Scene `ddde37a6-...` wurde noch mit dem alten v101-Pfad dispatched. Pass 1 ging an `sync-3` mit `active_speaker_detection.bounding_boxes` und fiel mit `provider_unknown_error` aus. Danach wurden 3/4 Pässe fertig, aber die Szene wurde korrekt als unvollständig abgebrochen.

Do I know what the issue is? Ja.

Problem:
- Der deployed/run-time Pfad nutzt weiterhin `v101_preclip_bbox` bzw. `preclip-autodetect-fallback`, nicht den beabsichtigten `v103_preclip_autodetect`.
- Im aktuellen Source-File liegt zusätzlich ein kaputter `if/else`-Block im `usePassPreclip`-Bereich: nach dem v103-Block steht ein extra `}` vor `else if`, dadurch kann der neue Code nicht sauber als Ersatzpfad deployen/greifen.
- Die Retry-Ladder kann bei Preclips wieder in bbox-Varianten fallen; für `sync-3` muss das in diesem Preclip-Pfad hart verboten sein.

Plan:
1. `compose-dialog-segments` Preclip-Branch reparieren
   - Den kaputten `if (usePassPreclip) ... } else if ...` Block korrekt strukturieren.
   - Für `usePassPreclip` immer hart setzen:
     - `model = sync-3`
     - `active_speaker_detection = { auto_detect: true }`
     - keine `bounding_boxes`, keine `bounding_boxes_url`, keine `coordinates`
     - keine `temperature` und kein `occlusion_detection_enabled` für `sync-3`, weil Sync.so diese Optionen bei `sync-3` nativ verwaltet.

2. Preclip-Retry-Ladder absichern
   - Wenn ein Pass eine `preclip_url` hat, dürfen Retry-Varianten wie `coords-pro-box` / `sync3-coords` nicht erneut bbox/coords in den `sync-3` Payload schreiben.
   - Retry bleibt erlaubt, aber der Preclip-Payload bleibt doc-strict und bbox-frei.

3. Sync-Mode korrekt setzen
   - Für den per-pass Tight-Audio-Preclip `sync_mode: cut_off` beibehalten, weil die Tight-WAV-Länge zur Preclip-Länge passt.
   - Kein `loop` mehr auf die 9s Master-Audio-Dauer erzwingen; die Logs zeigen `audio_voiced_sec ≈ video_dur_sec`, also ist `cut_off` hier richtig.

4. Dispatch-Telemetrie eindeutiger machen
   - `syncso_dispatch_log.meta.v103_probe` soll eindeutig zeigen:
     - `stage: preclip-sync3-autodetect-v104`
     - `bbox_count: 0`
     - `asd_mode: auto_detect`
     - `payload_model: sync-3`
     - `sync_mode: cut_off`
     - `preclip_url` statt irreführender Full-Plate-URL.

5. Deploy + saubere Regeneration
   - `compose-dialog-segments` deployen.
   - Die betroffene Scene `ddde37a6-...` sauber zurücksetzen, alte inflight/jobs entfernen und automatisch neu starten lassen.

6. Verifikation
   - In Logs/DB bestätigen:
     - keine `v101_preclip_bbox` Logs mehr
     - neue Logs zeigen `v104`/`v103_preclip_autodetect`
     - alle 4 Dispatches `sync-3` ohne `bounding_boxes`
     - alle 4 Pässe `COMPLETED`
     - Scene nicht mehr `multi_speaker_incomplete_3_of_4`.