## Ziel
Den Lip-Sync-Fehler nicht nur umgehen, sondern die tatsächliche Ursache eingrenzen und danach einen stabilen **sync-3-only** Ablauf herstellen. Kein `lipsync-2` Fallback bleibt aktiv.

## Plan

1. **Sync-2-Fallback zurücknehmen**
   - Entferne den zuletzt eingeführten `lipsync-2` Override aus `compose-dialog-segments`.
   - Stelle sicher, dass alle Dialog-/Multi-Speaker-Pfade ausschließlich `sync-3` verwenden.

2. **Kontrollierte A/B-Diagnose einbauen**
   - Für denselben Preclip + dieselbe Audio-Datei zwei gezielte Test-Dispatches ermöglichen:
     - **A:** `sync-3` mit `active_speaker_detection: { auto_detect: true }`
     - **B:** `sync-3` mit den aktuell berechneten `frame_number + coordinates`
   - Beide Dispatches sauber in `syncso_dispatch_log` protokollieren: Modell, Retry-Variante, ASD-Modus, Frame, Koordinaten, Clip-Metadaten, Job-ID, Fehlertext.

3. **Ursache sichtbar machen**
   - Wenn A funktioniert und B scheitert, liegt die Ursache sehr wahrscheinlich in Frame-Index oder Koordinaten-Transformation.
   - Wenn beide scheitern, liegt die Ursache eher bei Preclip-Encoding, Clip-Dauer, Audio-Input oder Provider-Status.
   - Wenn beide funktionieren, ist der Fehler wahrscheinlich im Retry-/Webhook-State-Handling.

4. **Sync-3-only Retry-Ladder implementieren**
   - Stufe 1: Für saubere Single-Face-Preclips standardmäßig `auto_detect: true` verwenden.
   - Stufe 2: Bei erneutem `generation_unknown_error` auf deterministische `bounding_boxes_url` wechseln, statt `coordinates` zu wiederholen.
   - Stufe 3: Falls nötig, Preclip-Crop leicht erweitern und erneut mit `auto_detect: true` versuchen.
   - Nach maximal 3 sync-3 Versuchen sauber fehlschlagen und Credits idempotent erstatten.

5. **Webhook/Watchdog anpassen**
   - `sync-so-webhook` darf bei `generation_unknown_error` keinen `lipsync-2` Retry mehr erzwingen.
   - Stattdessen setzt er den nächsten sync-3 Retry-State (`coords-pro-auto`, danach `bbox-url`, danach `expanded-crop-auto`).
   - Der bestehende 8-Minuten-Watchdog und Refund-Mechanismus bleiben erhalten.

6. **Letzten fehlgeschlagenen Job recovern**
   - Den zuletzt fehlgeschlagenen Dialog-Job zurück auf `pending` setzen.
   - Mit der neuen Diagnose/Retry-Logik neu dispatchen.
   - Danach anhand der Logs prüfen, welcher Pfad erfolgreich war.

7. **Memory aktualisieren**
   - Projektregel speichern: Dialog-Shot/Lip-Sync Pipeline bleibt `sync-3`-only; kein automatischer `lipsync-2` Fallback für diese Pipeline.

## Erwartetes Ergebnis
Wir wissen danach, ob der echte Fehler in `coordinates/frame_number`, Preclip-Encoding oder State-Handling liegt. Gleichzeitig läuft die Produktion wieder über einen robusteren sync-3-only Pfad.