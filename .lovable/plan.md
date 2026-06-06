## Befund

Die neue v69-Pipeline ist nicht grundsätzlich kaputt: Eine frische 4-Sprecher-Szene `4d9a1655-...` lief komplett durch:

```text
v69_preclip_unified_ready pass 1..4
Sync.so pass 1..4 done
render-sync-segments-audio-mux dispatched
remotion-webhook success
composer_scenes.lip_sync_status = done
clip_error = null
```

Der noch sichtbare Fehler hängt an einer alten Szene `a59a380d-...` aus der v68-Recovery:

```text
lip_sync_status = failed
twoshot_stage = failed
clip_error = multi_speaker_incomplete_0_of_4 (v68 recovery refund)
dialog_shots.error = stuck_4_speaker_provider_unknown_error_v68_recovery
```

Dafür gab es nach v69/v70 keinen sauberen Reset-Run. Außerdem gibt es noch UI-Buttons, die Lip-Sync direkt per DB-Update / direktem `compose-dialog-segments`-Call neu starten. Das ist gefährlich, weil sie die serverseitige `reset-lipsync-scene`-Pipeline umgehen und alte Fehler-/FaceMap-/Jobdaten stehen lassen oder zu früh starten können.

## Plan

### 1. Aktuell hängende Alt-Szene sauber aus dem v68-Fehlerzustand lösen
- Die alte failed Szene `a59a380d-...` nicht manuell halb reparieren.
- Stattdessen denselben serverseitigen Clean-Reset verwenden wie der sichere Button:
  - offene Sync.so Jobs entfernen
  - Credits idempotent refunden
  - `dialog_shots`, `replicate_prediction_id`, `clip_error`, stale FaceMap/SyncJobs bereinigen
  - Status auf `pending` setzen
- Danach darf nur der normale Auto-Trigger die Szene wieder in v69 starten.

### 2. UI-Reset-Pfade auf eine einzige sichere Route vereinheitlichen
- In `SceneCard.tsx` den Button `🔁 Lip-Sync neu rendern` so ändern, dass er nicht mehr direkt DB-Felder löscht und nicht sofort `compose-dialog-segments` aufruft.
- Stattdessen ruft er `reset-lipsync-scene` auf.
- Der bestehende Auto-Trigger startet danach automatisch `compose-dialog-segments` über die v69-Pipeline.
- Ergebnis: kein alter v68/v5 State kann versehentlich weiterverwendet werden.

### 3. Gefährliche direkte Re-Dispatches entfernen oder absichern
- Alle direkten UI-Aufrufe von `compose-dialog-segments` aus Retry-/Reset-Buttons prüfen.
- Direkte Calls bleiben nur dort erlaubt, wo die Szene nachweislich clean und `twoshot_stage='master_clip'` ist.
- Für normale Fehlerzustände gilt: erst `reset-lipsync-scene`, dann Auto-Trigger.

### 4. v69 serverseitig stärker schützen
- `compose-dialog-segments` soll stale failed v68/v58/v41/v56 States nicht weiterverwenden.
- Wenn `dialog_shots.status='failed'` oder ein alter Fehler wie `v68 recovery refund` erkannt wird, soll die Funktion klar abbrechen mit Hinweis `reset_required`, statt halb in einen alten State einzusteigen.
- Der Reset-Endpoint bleibt der einzige erlaubte Weg aus `failed` zurück zu `pending`.

### 5. Validierung
- Alte failed Szene resetten und danach Logs prüfen:
  - `v69_preclip_unified dispatching`
  - `v69_preclip_unified_ready`
  - Sync.so Passes `done`
  - `render-sync-segments-audio-mux mode=fanout-N-speakers`
  - `remotion-webhook [dialog-stitch] done`
- DB-Endzustand prüfen:
  - `lip_sync_status='done'`
  - `twoshot_stage='done'`
  - `clip_error is null`
  - `dialog_shots.status='done'`

## Wichtig

Ich ändere dabei nicht die v69-Kernpipeline selbst. Die funktionierende Single-Face-Preclip-Logik bleibt geschützt; der Fix räumt nur alte Fehlerzustände und unsichere Neustart-Wege auf.