## Diagnose

Der aktuelle Job hängt nicht in der Cloud selbst; der Backend-Status ist gesund. In der betroffenen Szene ist `lip_sync_status = 'running'`, `twoshot_stage = 'master_clip'`, aber die Lip-Sync-Funktion loggt nur `shutdown` und keine `pass 1/2`-Logs. Das zeigt: Der Request wird zwar gestartet/abgebrochen, aber die Pipeline kommt gar nicht stabil bis zu den eigentlichen Sync.so-Passes.

Zusätzlich gibt es noch einen alten Auto-Trigger in `ClipsTab.tsx`, der vor dem Funktionsaufruf wieder optimistisch `lip_sync_status='running'` setzt. Genau diese Race Condition wurde im neuen Hook bereits entfernt, existiert dort aber weiterhin und kann die Duplicate-Run-Sperre der Backend-Funktion blockieren.

## Plan

1. **Doppelten Frontend-Trigger entfernen**
   - In `src/components/video-composer/ClipsTab.tsx` den alten state-based Cinematic-Sync Auto-Trigger deaktivieren/entfernen.
   - `useTwoShotAutoTrigger.ts` bleibt die einzige Quelle für Auto-Starts.
   - Wichtig: Kein Frontend-Code setzt mehr `lip_sync_status='running'`; nur die Backend-Funktion reserviert Credits und setzt den Status.

2. **Backend-Start robuster machen**
   - In `compose-twoshot-lipsync` den Startstatus atomar reservieren: pending/null/failed darf starten, frisches running wird ignoriert, stale running wird sauber übernommen.
   - `twoshot_stage` soll nach Reservierung direkt auf `lipsync_1` wechseln, damit die UI nicht ewig bei `master_clip` steht.
   - Bei früheren Fehlern vor der Background-Pipeline wird kein endloser Running-State zurückgelassen.

3. **Sync.so nicht mehr als langen blocking `replicate.run` ausführen**
   - Replicate-Aufrufe für die Lipsync-Passes auf Prediction-Polling umstellen: Prediction erstellen, `replicate_prediction_id` sofort speichern, Status in Intervallen poll’en, harte Max-Laufzeit erzwingen.
   - Dadurch sieht man jederzeit, ob Sync.so wirklich läuft, failed oder timed out.
   - Bei Timeout/Failure: `lip_sync_status='failed'`, `twoshot_stage='failed'`, Fehlertext setzen, Credits idempotent zurückgeben.

4. **Watchdog/Recovery anpassen**
   - Der Watchdog soll stuck Jobs nicht nur nach `updated_at`, sondern auch nach `audio_plan.twoshot.heartbeat.started_at` bzw. `replicate_prediction_id` bewerten.
   - Aktuelle Running-Szenen, die noch auf `master_clip` hängen, werden sauber auf `failed` gesetzt und erstattet, damit der Auto-Trigger danach neu starten kann.

5. **Validierung**
   - Funktionen deployen.
   - Den aktuell hängenden Scene-Status prüfen/resetten.
   - Danach muss ein neuer Versuch in der DB sichtbar durchlaufen: `lipsync_1` → `lipsync_2` → `continuity` → `done`, mit `pass 1/2` und `pass 2/2` in den Logs statt nur `shutdown`.