## Befund

Der aktuelle Fehlrun ist Szene `ffefe177-9715-44a5-a961-e7851e8ffa36`.

- Satz 1 und 2 wurden korrekt mit deterministischen Face-Coords gerendert.
- Satz 3 wurde zuerst korrekt mit Coords gestartet, ein Sync.so-Fehler kam aber per `sync-so-webhook` zurück.
- Der Webhook hat noch die alte Retry-Logik: bei einem Coords-Fehler setzt er `deterministic_coords=false` und `force_coords=false`.
- Dadurch wurde Satz 3 erneut im `auto_detect`-Modus gestartet.
- Der neue Integrity-Guard hat genau das erkannt und den Clip absichtlich blockiert, bevor ein falsches Gesicht final gestitcht wird.

Kurz: Der Fix in `poll-dialog-shots` ist richtig, aber dieselbe Retry-Regel fehlt noch in `sync-so-webhook`.

## Plan

1. **Webhook-Retry auf dieselbe Policy wie Poller bringen**
   - `sync-so-webhook/index.ts` erweitert `prepareRetryFromWebhook()` um Multi-Speaker-Erkennung.
   - Bei 2+ Sprechern und vorhandenen `target_coords` darf der Webhook nie auf `auto_detect` zurückfallen.
   - Stattdessen setzt er beim Retry:
     - `force_coords=true`
     - `deterministic_coords=true`
     - `frame_number_override=round((start+end)/2*24)`

2. **Webhook-Race entschärfen**
   - Wenn ein FAILED-Webhook für einen alten Job kommt, darf er keinen späteren/neueren Job überschreiben.
   - Der Webhook matched weiter per `sync_job_id`, aber der Retry bleibt coords-locked und kann keinen auto-detect-Zustand mehr erzeugen.

3. **Diagnose-Logs im Webhook ergänzen**
   - Loggen, ob Retry `coords-locked` oder `auto` ist.
   - Loggen von `turn`, `speaker`, `frame_number_override`, `retry_count`.

4. **Betroffene Szene sauber zurücksetzen**
   - Szene `ffefe177-9715-44a5-a961-e7851e8ffa36` wird auf den intakten Masterclip zurückgesetzt:
     - `dialog_shots=null`
     - `lip_sync_status='pending'`
     - `twoshot_stage='master_clip'`
     - `lip_sync_applied_at=null`
     - `clip_error=null`
   - `clip_url` bleibt erhalten, damit keine neue Szenengeneration nötig ist.

5. **Neu triggern und validieren**
   - `compose-dialog-scene` erneut für diese Szene starten.
   - Logs prüfen: Satz 3 darf bei Retry nicht mehr `mode=auto` zeigen.
   - DB prüfen: alle Shots final `ready` und `deterministic_coords=true`; danach Stitching/Done.