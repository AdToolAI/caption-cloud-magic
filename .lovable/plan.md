## Ziel

Lip-Sync wird bei jedem erkannten Fehler sofort sauber abgebrochen, refundiert und auf einen retry-fähigen Zustand zurückgesetzt. Pro Szene läuft immer nur EIN Lip-Sync-Auftrag. Bis zu 4 verschiedene Sprecher pro Szene erlaubt, aber niemals derselbe Charakter mehrfach gleichzeitig.

## Neue Regeln

### 1. Cast-Validierung (1–4, eindeutig)

- Bevor Lip-Sync überhaupt startet, validiert `compose-dialog-scene` / `compose-dialog-segments`:
  - max. 4 distinct Sprecher pro Szene.
  - Jeder `character_id` darf in einer Szene nur EINEM `speaker_idx` zugeordnet sein.
  - Überlappende Turns desselben `character_id` (Zeitfenster schneiden sich) sind verboten.
- Verletzungen führen sofort zu `failLipSync('cast_invalid_duplicate_character' | 'cast_invalid_too_many_speakers' | 'cast_invalid_overlapping_turns')` mit klarer Meldung im UI. Kein Sync.so-Dispatch.
- Im UI (SceneDialogStudio): vor dem „Lip-Sync starten"-Button identische Charaktere bzw. >4 Sprecher hart blocken inkl. erklärendem Hinweis.

### 2. Single-Flight-Lock pro Szene

- Atomic claim in `composer_scenes`: nur fortfahren, wenn `lip_sync_status NOT IN ('running','stitching')` UND `twoshot_stage NOT IN ('composing_dialog','dialog_chain','lipsync_*')`.
- Verlierer eines parallelen Calls: 202 „already_running", kein zweiter Sync.so-Call.
- `syncso_inflight_jobs`: pro `scene_id` darf nur 1 offener Job stehen. Neuer Dispatch nur, wenn dieser Eintrag fehlt oder beendet ist.
- `useTwoShotAutoTrigger`: Inflight-Lock pro Szene mind. 60 s, Re-Invoke nur bei klar terminalem Status (`pending` oder `failed`), nie bei `running` / `stitching`.

### 3. Sofort-Abbruch bei Fehlern

Eine zentrale `failLipSync(scene, reason)`-Routine, ausgelöst durch:

- Sync.so `FAILED` / `REJECTED` / `CANCELED`
- Preflight-, Codec-, Face-Gate-, VAD-Block
- Cast-Validierungsfehler (siehe 1.)
- Per-Shot Timeout (8 min) oder Per-Scene Timeout (12 min)
- Edge-Function-Exception oder unbekannter Provider-Status

`failLipSync()` macht in einer Operation:

1. Offene Sync.so-Jobs der Szene best-effort canceln und aus der Inflight-Registry entfernen.
2. `dialog_shots.status = 'failed'` + `error = <reason>`.
3. `lip_sync_status = 'failed'`, `twoshot_stage = 'failed'`, `clip_error = <reason>`.
4. Idempotenter Credit-Refund über die bestehende Refund-Hilfsroutine.
5. `replicate_prediction_id = null`.

Danach kein weiterer Sync.so-Aufruf für diese Szene, bis User explizit „Neu starten" klickt (oder ein klar als transient klassifizierter Fall wie 429 vorliegt).

### 4. Loop- und Ladebalken-Schutz

- `usePipelineProgress`: `lip_sync_status = 'failed'` zählt sofort als Terminal → Balken endet, Toast „Lip-Sync abgebrochen, bitte erneut starten".
- Stale `running` >12 min ohne Sync.so-Jobaktivität → `failLipSync('watchdog_stuck')`.
- `useTwoShotAutoTrigger`: alle bisherigen Auto-Retry-Pfade auf `failed` werden entfernt. Reset auf `pending` nur durch:
  - User-Klick „Lip-Sync neu rendern", oder
  - eindeutig transiente Klassifizierung (`syncso_concurrency`, `http_429`).
- Webhook (`compose-clip-webhook`) triggert NIE Lip-Sync nach, wenn `lip_sync_status` zuletzt `failed` oder `canceled` war.

### 5. Stuck Scene jetzt bereinigen

- Die aktuell hängende 3er-Szene wird über die neue `failLipSync()`-Routine sauber zurückgesetzt: Status `pending`, `dialog_shots = null`, Credits refundiert, Inflight-Eintrag entfernt.

### 6. Verifikation

- Edge-Function-Logs prüfen: jeder Fehlerpfad ruft genau 1× `failLipSync`, kein doppelter `sync.so/generate`-Call pro Szene innerhalb 60 s, Refund einmalig.
- Manueller Re-Try funktioniert für 1-, 2-, 3- und 4-Sprecher-Szenen.
- Test: Szene mit zweimal demselben Charakter → wird im UI hart blockiert und gar nicht erst dispatched.

## Ergebnis

- Fehlerhafte Lip-Syncs brechen sofort ab, geben Credits zurück, blockieren keine neuen Versuche.
- Kein paralleler Lip-Sync derselben Szene mehr möglich.
- 1–4 unterschiedliche Sprecher pro Szene sind unterstützt; doppelte oder überlappende gleiche Charaktere sind ausgeschlossen.
- Ladebalken endet immer in einem klaren Erfolgs- oder Fehlerzustand.