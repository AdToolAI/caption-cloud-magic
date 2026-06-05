**Befund**

- Ja: Ich kann es jetzt klarer erkennen.
- Der Provider liefert weiterhin **keinen echten Errorcode**: `sync_error_code = null`, `status = FAILED`, `error = "An unknown error occurred."`.
- Aber unsere eigenen gespeicherten Daten zeigen den eigentlichen Fehler: Der fehlgeschlagene Run wurde **noch mit dem alten Payload** gestartet.
- In `composer_scenes.dialog_shots.segments` stehen noch diese falschen Felder:
  - `audioInput.startTime`
  - `audioInput.endTime`
- Genau diese Felder sollten seit v55 entfernt sein. Der aktuelle Code macht das bereits, aber der betroffene Run/Retry war noch ein alter `sync-official-segments-v52` Job bzw. stale Scene-State.

**Do I know what the issue is?**

Ja. Das aktuell fehlgeschlagene Lip-Sync ist nicht der saubere v55-Run. Es ist noch ein alter/staler Sync.so-Job bzw. Scene-State mit falschem `audioInput`-Crop-Payload. Sync.so gibt dazu leider nur `error_code: null`, aber die DB beweist, dass die falschen `audioInput.startTime/endTime` noch im gesendeten/gespeicherten Segment-State stecken.

**Plan**

1. **Stale-State-Schutz einbauen**
   - In `sync-so-webhook` alte v52/v54 Jobs, deren gespeicherte Segmente noch `audioInput.startTime/endTime` enthalten, nicht mehr als normalen Fehler weiterverarbeiten.
   - Stattdessen sauber als `stale_payload_audio_crop` klassifizieren, inflight Slot freigeben und idempotent refundieren.

2. **v55-State eindeutig versionieren**
   - In `compose-dialog-segments` die neue Dispatch-Version auf `version: 55` und `engine: sync-official-segments-v55` setzen.
   - In `dialog_shots` zusätzlich `audio_input_mode: "ref_only"` speichern, damit wir sofort sehen, ob wirklich der neue Payload aktiv war.

3. **Payload-Guard vor Dispatch**
   - Direkt vor dem Sync.so-Call validieren: Bei per-speaker WAVs darf kein Segment `audioInput.startTime/endTime` enthalten.
   - Falls doch, sofort lokal abbrechen mit eindeutigem Fehler `segment_audio_input_crop_forbidden`, statt wieder teure Provider-Fehler zu erzeugen.

4. **Reset-Funktion härten**
   - `reset-lipsync-scene` soll alte `dialog_shots.segments`, `sync_job_id`, `replicate_prediction_id` und crop-basierte Segmentdaten garantiert entfernen.
   - Danach startet die Szene wirklich frisch mit v55.

5. **Danach einmal sauber neu starten**
   - Betroffene Szene hart resetten.
   - Neuer Run muss in der DB `engine: sync-official-segments-v55` und `audio_input_mode: ref_only` zeigen.
   - Wenn Sync.so dann trotzdem fehlschlägt, ist es ein anderer Fehler, und wir können ihn sauber von Payload-/State-Altlasten trennen.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>