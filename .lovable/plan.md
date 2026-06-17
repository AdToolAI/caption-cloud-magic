## Befund

Der neue Face-Gate läuft bereits im aktiven Produktionspfad, aber er schützt uns nicht:

- `compose-dialog-segments` loggt `v129.9_face_gate ... code=skipped reason=gemini_http_400`
- Danach wird trotzdem an Sync.so dispatcht
- Sync.so fällt wieder mit `generation_unknown_error`
- In der Forensik bleibt `Gesicht am ASD-Frame = SKIP`

Damit ist die aktuelle Fehlerursache isoliert: Nicht Sync.so ist an dieser Stelle das erste Problem, sondern unser Gemini-Vision-Request ist falsch geformt. Wir senden die Video-URL als `image_url`; Google/Gateway akzeptiert das nicht für MP4 und antwortet 400. Deshalb kann weder Preflight noch Face-Gate zuverlässig prüfen, ob am ASD-Frame ein Gesicht sitzt.

## Plan

1. **Gemini-Vision Payload korrigieren**
   - In `syncso-preflight` und `_shared/syncso-face-gate` keine MP4-URL mehr als `image_url` senden.
   - Stattdessen einen echten Frame aus dem Video extrahieren oder auf eine gültige multimodale Payload-Form umstellen, die das Gateway akzeptiert.
   - Für unseren Zweck bevorzugt: deterministisches Frame-Bild zum angegebenen `frame_number` erzeugen/verwenden und als Bild prüfen.

2. **Face-Gate darf nicht still überspringen bei HTTP 400**
   - `gemini_http_400` wird als Konfigurations-/Payload-Fehler sichtbar gemacht, nicht als „ok, weiter zu Sync.so“.
   - Bei 400 blocken wir vor Sync.so mit einem internen Fehler wie `face_gate_probe_payload_invalid`, damit keine weiteren Sync.so-Credits verbrannt werden.

3. **Preflight-Anzeige ehrlich machen**
   - `Gesicht am ASD-Frame` darf nur noch `SKIP` zeigen, wenn wirklich kein AI-Key/keine URL vorhanden ist.
   - Bei Gemini-400 soll die UI `FAIL/WARN` mit Grund anzeigen: „Face-Probe request invalid“, nicht grün wirken.
   - Badge-Version im Forensics Sheet auf die neue Version anheben, damit wir im Screenshot sofort sehen, welcher Code aktiv ist.

4. **Dispatch-Logging verbessern**
   - `FACE_GATE_BLOCKED` oder `FACE_GATE_PROBE_ERROR` mit `http_status`, Gateway-Body und exaktem `frame_number/coords/video_kind` in `syncso_dispatch_log.meta` persistieren.
   - So sehen wir künftig in einer DB-Zeile, ob der Gate blockt, skipped oder sauber bestätigt.

5. **Edge Functions deployen und validieren**
   - Betroffene Functions deployen: `syncso-preflight`, `compose-dialog-segments`.
   - Danach gezielt für Szene `ea542657...` prüfen:
     - keine `gemini_http_400` Logs mehr
     - Preflight Face-Probe ist nicht mehr `SKIP`
     - Produktion dispatcht nur noch, wenn Face-Gate `ok` ist

## Nicht im Scope

- Kein erneuter Umbau der Sync.so Payload-Optionen.
- Kein Wechsel auf `bounding_boxes_url`.
- Kein Replay-Experiment, solange unsere eigene Face-Probe noch 400 produziert.
- Keine Änderung an Hailuo/Preclip-Geometrie, bevor der Face-Gate valide misst.