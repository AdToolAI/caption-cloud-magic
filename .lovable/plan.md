## Ehrliche Einordnung

Nein — das ist **nicht** der Lip-Sync-Durchbruch. Es ist ein anderes, klar beweisbares Problem: die Szene wird gar nicht erst zu Sync.so geschickt, weil alle Concurrency-Slots durch Leichen blockiert sind. Das erklärt den aktuellen Hänger („Wartet auf Sync.so-Slot… 4/3"), nicht die Frage, ob die Lippen sich am Ende bewegen. Diese Frage bleibt offen, bis nach dem Fix wieder echte Passes durchlaufen.

## Befund (in der Datenbank verifiziert)

Szene `7c11bc27…` (Scene 1):
- `syncso_dispatch_log`: 14:24–14:25 vier Passes `DISPATCHED` (Jobs `b9fc3bd3`, `00c3885a`, `8b171ca5`, `ee34482f`), um 14:28:49 dann `DEFERRED` / `error_class = rate_limited`.
- `composer_scenes`: `twoshot_stage = 'deferred'`, `lip_sync_status = 'pending'`, **`dialog_shots` ist NULL** — obwohl vier Jobs laufen.
- `syncso_inflight_jobs`: 4 aktive Zeilen, `MAX_INFLIGHT = 4` → jeder weitere Dispatch wird abgelehnt.
- `provider_circuit_state`: `closed` — kein Circuit-Breaker-Problem.

Ursache: Slots werden ausschließlich vom Webhook freigegeben, und der Webhook findet die Szene nur über `dialog_shots.passes[].job_id`. Mehrere Client-Pfade (`useTwoShotAutoTrigger.ts`, `SceneDialogStudio.tsx`, `useSceneGenerate.ts`) setzen `dialog_shots: null`, während Jobs noch laufen → Webhook loggt `no_scene_match` → Slot bleibt für immer belegt. `reconcileStaleSyncJobs` läuft nur innerhalb eines Dispatch-Versuchs (500 ms Budget, erst ab 6 min Alter); ein periodischer Aufräumer existiert nicht.

## Fix

### 1. Sofort-Entsperrung (Daten)
Die 4 verwaisten Zeilen in `syncso_inflight_jobs` löschen, damit die laufende Produktion sofort weiterläuft.

### 2. Orphan-Slot-Sweep (`supabase/functions/_shared/syncso-preflight.ts`)
Neue Funktion `sweepOrphanInflightSyncJobs()`:
- löscht Zeilen mit abgelaufenem `expires_at`
- löscht Zeilen älter als 4 min, deren `job_id` nicht mehr in der zugehörigen Szene referenziert ist (Szene fehlt, `dialog_shots` NULL, Job-ID nicht in `passes[]`/`sync_job_id`)
- best-effort, geloggt als `ORPHAN_SLOT_FREED`

### 3. Webhook gibt Slots immer frei (`supabase/functions/sync-so-webhook/index.ts`)
`releaseInflightSyncJob(jobId)` zusätzlich in den Skip-Pfaden `no_scene_match`, `already_applied` und `canceled`.

### 4. Periodischer Sweep im Watchdog (`supabase/functions/lipsync-watchdog/index.ts`)
Zu Beginn jedes Laufs (Cron minütlich) `sweepOrphanInflightSyncJobs()` plus `reconcileStaleSyncJobs()` je betroffenem User → Slot-Leaks heilen künftig in ≤ 1 Minute statt erst nach 15 min `expires_at`.

### 5. Client-Resets härten
`dialog_shots: null` wird nur noch geschrieben, wenn keine aktiven Passes existieren; sonst läuft der Reset über die bestehende Edge-Function `reset-lipsync-scene`, die Jobs canceled, Slots freigibt und Credits erstattet.

## Technische Details
- Kein Eingriff in Geometrie, Face-Gate, Motion-Probe oder Dispatch-Payload — reine Slot-Buchhaltung.
- `MAX_INFLIGHT` (4) bleibt unverändert; das Limit war nicht das Problem, die nicht freigegebenen Slots waren es.
- Deploy: `sync-so-webhook`, `lipsync-watchdog` (plus Shared-Modul).

## Verifikation nach Deploy
```sql
select count(*) from syncso_inflight_jobs where expires_at > now();
-- Szene neu dispatchen: erwartet DISPATCHED statt DEFERRED/rate_limited
```
Danach messen wir die Motion-Verdicts der vier Passes — erst das beantwortet die Lip-Sync-Frage.
