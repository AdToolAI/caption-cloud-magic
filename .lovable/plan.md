## Befund

Der Backend-Status ist gesund. Die aktuell hängende Szene `4e2d57fe-78e0-4852-9fb6-2e1a48899034` steht auf:

```text
lip_sync_status = running
twoshot_stage = master_clip
replicate_prediction_id = 2azkx3x7tdrmr0cy7jk8d3rrbm
heartbeat = null
```

Für `compose-twoshot-lipsync` gibt es dabei keine echten Request-/Pass-Logs, nur `shutdown`. Das heißt: der Two-Shot-LipSync läuft nicht wirklich. Der Status wird blockiert, bevor die Two-Shot-Pipeline startet.

## Root Cause

Es gibt noch einen zweiten Auto-Trigger im Backend-Webhook:

- `compose-clip-webhook` startet nach fertigem Clip weiterhin pauschal `compose-lipsync-scene`.
- Für Cinematic-Sync mit zwei Sprechern ist aber `compose-twoshot-lipsync` zuständig.
- `compose-lipsync-scene` setzt `lip_sync_status='running'`, läuft dann in die falsche/zu lange Sync-Strecke oder wird beendet.
- Danach blockiert `useTwoShotAutoTrigger`, weil die Szene bereits `running` ist.
- Ergebnis: UI lädt ewig, `twoshot_stage` bleibt auf `master_clip`, und es entstehen keine `pass 1/2` / `pass 2/2` Logs.

Zusätzlich ist `compose-twoshot-lipsync` noch immer auf `replicate.run(...)` aufgebaut. Das ist für lange Medienjobs zu fragil, weil Edge Functions abgebrochen werden können, bevor die zwei Sync.so-Passes fertig sind.

## Plan

1. **Webhook-Auto-Trigger korrigieren**
   - In `supabase/functions/compose-clip-webhook/index.ts` Cinematic-Sync erkennen.
   - Bei `engine_override='cinematic-sync'` und mehreren Sprechern nicht mehr `compose-lipsync-scene`, sondern `compose-twoshot-lipsync` aufrufen.
   - Bei Cinematic-Sync mit einem Sprecher weiterhin `compose-lipsync-scene` erlauben.
   - Der Webhook darf keinen falschen `running`-Status mehr erzeugen.

2. **Two-Shot-Pipeline auf echtes Prediction-Polling umbauen**
   - In `compose-twoshot-lipsync` `replicate.run(...)` durch `replicate.predictions.create(...)` + `predictions.get(...)` Polling ersetzen.
   - Pro Pass sofort `replicate_prediction_id` und Heartbeat in `composer_scenes` speichern.
   - Status sichtbar durchlaufen lassen:

```text
lipsync_1 -> lipsync_2 -> continuity -> done
```

   - Harte Timeouts je Pass behalten; bei `failed`, `canceled` oder Timeout: `lip_sync_status='failed'`, `twoshot_stage='failed'`, Fehlertext setzen und Credits refundieren.

3. **Single-LipSync sicherer machen**
   - `compose-lipsync-scene` darf bei Multi-Speaker/Cinematic-Sync nicht erst `running` setzen und dann hängen.
   - Es soll früh und sichtbar mit `multi_speaker_not_supported` / `failed` abbrechen, falls es versehentlich falsch aufgerufen wird.

4. **Watchdog-Recovery schärfen**
   - `qa-watchdog` soll `master_clip + running + heartbeat null` schneller als stuck erkennen.
   - `replicate_prediction_id`/Heartbeat in die Diagnose aufnehmen.
   - Stale Jobs sauber auf `failed` setzen und Credits erstatten.

5. **Aktuell hängende Szene reparieren**
   - Szene `4e2d57fe-78e0-4852-9fb6-2e1a48899034` auf `pending` zurücksetzen.
   - `twoshot_stage` auf `master_clip` oder `null` zurücksetzen, `clip_error` mit Reset-Grund setzen, `replicate_prediction_id` leeren.
   - Credits für den fehlgeschlagenen Versuch erstatten, falls sie abgezogen wurden.

6. **Validieren**
   - Geänderte Edge Functions deployen.
   - `compose-twoshot-lipsync` direkt für die Szene testen.
   - In DB/Logs prüfen, dass wirklich `pass 1/2` und `pass 2/2` starten und `twoshot_stage` nicht mehr bei `master_clip` hängen bleibt.