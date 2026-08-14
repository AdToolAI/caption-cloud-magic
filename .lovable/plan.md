# v431 G2.3 — Scope-Tabelle v2 (nur Analyse, keine Migration)

Nachgezogen: die drei Punkte aus dem Review. Kein Code-Change bis zum GO.

## 1. Die fünf semantischen Pfade

| writeId | from-state(s) | to-state / substate | immutable run source | Legacy-Spiegel | Output im selben Write? | Provider/Credit-Spend davor? | stale behavior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cds:conditional-running-or-pending` (Circuit-Open, index.ts:1285) | `audio_ready`, `lipsync_dispatched`, `lipsync_running` | `keepRunning=true` → `lipsync_running` + substate `circuit_open`; sonst `audio_ready` + substate `circuit_open` | **Request-Body** `run_id` + `plate_generation` (Payload-Erweiterung, siehe §2) | `lip_sync_status`, `twoshot_stage='circuit_open'`, `clip_error` — **atomar im Primitive** | nein | nein (Gate liegt vor dem Wallet-Debit) | stale → No-op, 202-Antwort unverändert |
| `cds:pending-3` (deferred, index.ts:4221) | `audio_ready`, `lipsync_dispatched` | `audio_ready` + substate `deferred` | dito Request-Body | `lip_sync_status='pending'`, `twoshot_stage='deferred'`, `clip_error` — atomar | nein | ja — Initial-Dispatch-Debit wird im selben Zweig refundiert (:4200); Refund bleibt ausserhalb des State-Writes | stale → No-op; Refund läuft unabhängig |
| — `isAdvance/isRetry`-Diagnosezweig (:4204) | — | **nicht migrieren** | — | nur `clip_error` | — | — | reine Diagnose |
| `compose-twoshot-audio:failed` (:653) | `audio_prep` | `failed` + substate `dialog_turns_required` | Request-Body `run_id` + `plate_generation` (:572, seit G2.1 vorhanden) | `lip_sync_status='failed'`, `twoshot_stage='failed'`, `clip_error` — atomar | nein | nein (vor TTS-Spend) | ohne Body-Provenienz kein migrierter Write → Legacy-Ast bleibt |
| `cvc:upload-complete` (:4117) | `idle`, `plate_queued` | `complete` | `sceneRunStamps` (G2.1) | `clip_status='ready'` — atomar | **ja, zwingend** (Output-Tripel + Terminalstate in einem Commit) | nein | stale → No-op, kein Output-Overwrite |
| `cvc:failed/pika` (:4904) | `idle`, `plate_queued`, `plate_rendering` | `failed` + substate `provider_error` | `sceneRunStamps` (G2.1) | `clip_status='failed'`, `clip_error` (+ `twoshot_stage` nur wenn `failedClipUpdate()` es heute setzt) — atomar | nein | ja — Pika-Call davor; Refund-Pfad unverändert | stale → No-op, Antwort bleibt `failed` |

## 2. Punkt 1 — Run-Provenienz für Circuit-Open und Deferred

Verifiziert: `compose-dialog-segments` liest `active_run_id` + `plate_generation`
heute aus dem Szenen-SELECT (:785) und setzt daraus seinen Run-Kontext (:797-798).
Es bekommt diese Werte **nicht** vom Caller. Der Review-Einwand trifft zu.

Konsequenz — Reihenfolge vor der Writer-Migration:

1. **Payload-Erweiterung zuerst.** `compose-dialog-segments` akzeptiert
   `run_id` + `plate_generation` im Request-Body, analog zu
   `compose-twoshot-audio` (:572). Der Scene-Read bleibt nur noch fachlicher
   Datenlader, nie Provenienzquelle.
2. **Dispatch-Bindung beim Erst-Dispatch.** Der Wert wird beim ursprünglichen
   Dispatch einmalig gesetzt; `isAdvance`/`isRetry`-Aufrufe reichen exakt die
   beim Dispatch eingefrorene Provenienz weiter (bereits immutable im Pass-Slot
   aus G2.1: `run_id` + `plate_generation` sind dort per RPC-Guard
   überschreibgeschützt). Für Advance/Retry ist der Pass-Slot damit eine
   zulässige immutable Quelle — der Szenen-Read ist es nicht.
3. **Caller-spezifischer Zuschnitt, wie bei twoshot-audio.** Nur Caller mit
   vollständiger Provenienz laufen über das geguardete Primitive:

| Caller | Gruppe | Provenienz nach Payload-Erweiterung |
| --- | --- | --- |
| Client (`SceneCard`, `ClipsTab`, `SceneClipProgress`, `FaceMapReviewDialog`, `useTwoShotAutoTrigger`) | G2 | ja — Run stammt aus `composer-start-scene-generation` |
| `compose-clip-webhook` (:482) | G3 | nein → Legacy-Write bleibt |
| `_shared/autopilotComposerBridge` (:339) | G5 | nein → Legacy-Write bleibt |
| `lipsync-watchdog` (Advance) | G4 | Pass-Slot-Snapshot, sonst Legacy |

Kein Fail-closed in G2.3 — ein harter Block würde Webhook, Watchdog und
Self-Heal stumm brechen.

## 3. Punkt 2 — Upload → `complete` als Variante C

Variante A (globale Kanten) ist verworfen. Umsetzung als enges Domain-Primitive:

`composer_finalize_upload_scene(_scene_id, _run_id, _generation, _write_id, _upload_url)`

- akzeptiert **ausschliesslich** `_write_id = 'cvc:upload-complete'`
- festes From-Set `{idle, plate_queued}`, fester To-State `complete`,
  kein frei übergebbarer Zielstate
- `SELECT ... FOR UPDATE` auf die Szene, Run-ID- und Generation-Gate
  (`stale_run` / `stale_generation` → No-op)
- Output-Tripel + `pipeline_state='complete'` + `clip_status='ready'`
  in **einem** Commit
- eigener Eintrag in `composer_scene_transition_log` (write_id, Run,
  Generation, From/To, Ergebnis) — bewusst ohne Aufruf von
  `composer_scene_transition_core`, damit `composer_scene_transitions`
  unverändert bleibt
- **keine** neuen globalen Transition-Kanten, **keine** Änderung am
  generischen G0-Core

In der DB verifiziert: `composer_scene_transitions` enthält heute keine Kante
`idle → complete` bzw. `plate_queued → complete`; das bleibt so.

## 4. Punkt 3 — Atomarität kanonischer State + Legacy-Spiegel

Für jeden G2.3-Pfad gilt die G2.2-Regel: ein run-geguardetes Primitive schreibt
State, Substate und die noch benötigten Spiegel unter demselben Row Lock. Kein
`transitionSceneV2()` plus nachgelagertes `.update()`.

| Pfad | Primitive | Spiegel im selben Commit |
| --- | --- | --- |
| Circuit-Open | `composer_park_lipsync_dispatch` (neu, schmal; Modi `circuit_open` \| `deferred`, geschlossene From/To-Semantik) | `lip_sync_status`, `twoshot_stage`, `clip_error` |
| Deferred | dito, Modus `deferred` | `lip_sync_status`, `twoshot_stage`, `clip_error` |
| Twoshot-Audio-Failure | `composer_fail_scene_with_mirrors` (G2.2, wiederverwendet — Modi bleiben geschlossen) | `lip_sync_status='failed'`, `twoshot_stage='failed'`, `clip_error` |
| Pika-Failure | `composer_fail_scene_with_mirrors`, Substate `provider_error` | `clip_status='failed'`, `clip_error` + nur die heute tatsächlich gesetzten weiteren Spiegel |
| Upload-Complete | `composer_finalize_upload_scene` | `clip_status='ready'` + Output-Tripel |

Neu entsteht damit genau **ein** zusätzliches Primitive
(`composer_park_lipsync_dispatch`) plus das Upload-Primitive. Kein generischer
Bypass, keine frei übergebbaren Zielstates.

## 5. Ausserhalb G2.3

Reset-Pfade, `clip_error`-only-Diagnosen, Output-Writes ohne Statuswechsel,
Job-Metadata (`replicate_prediction_id`, `audio_plan`, `dialog_turns`,
`dialog_shots`). `useSceneGenerate` bleibt G5. Webhook und Self-Heal bleiben
bis G3/G5 unverändert.

## 6. Umsetzungsreihenfolge nach GO

1. Payload-Erweiterung `compose-dialog-segments` (`run_id`/`plate_generation`)
   inkl. Weitergabe durch die G2-Caller — noch ohne Writer-Wechsel.
2. DB-Migration: `composer_park_lipsync_dispatch`, `composer_finalize_upload_scene`.
3. Writer-Migration der fünf Pfade, caller-spezifisch.
4. Verifikation: `tsgo`, Composer-/Lip-Sync-Suite, Writer-Inventar-Test um die
   neuen Primitive erweitert, transaktionale DB-Smokes (stale run, stale
   generation, doppelter Callback, unzulässiger From-State, Cancel-Race,
   Audit-Log-Vollständigkeit), Bericht in `docs/v431-g2-3-report.md`.

Baseline-Vermerk: die vorbestehenden Social-Publishing-Reds in
`src/pages/__tests__/Composer.test.tsx` bleiben unverändert ausserhalb Scope.
