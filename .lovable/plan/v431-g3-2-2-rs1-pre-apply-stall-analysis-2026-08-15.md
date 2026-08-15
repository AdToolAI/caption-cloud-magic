# v431 G3.2.2 — RS1 Pre-Apply Stall Analysis

Nur Analyse. Keine Mutation, kein Cleanup, kein neuer Run, kein Deploy. Der Text unten wird nach Freigabe unverändert als Abschnitt „RS1 Pre-Apply Stall Analysis" an `docs/v431-g3-2-2-report.md` angehängt — sonst nichts.

## 1. Lifecycle-Rekonstruktion (Scene b34d1eae / Run 51f80471)

Ledger `composer_pipeline_jobs`, Run `51f80471-8a3b-42be-894b-6754c4a49ef8`, `plate_generation=7`:

| Zeit (UTC) | Stage | Provider | External ID | Status heute |
|---|---|---|---|---|
| 17:20:46 → 17:23:47 | base_video | ai-happyhorse | 81bjg8b04drmy0d00srsjsp53c | succeeded, `callback_delivery_status=succeeded` |
| 17:24:16 | sync_segment | sync.so | 50b402be-31d0-4f94-bc2f-9ae4f850fe42 | **dispatched**, `completed_at=null`, `callback_delivery_status=null`, `updated_at=17:24:18` |
| 17:25:38 | audio_mux | remotion | 7f983939-6ffe-4691-b52d-674117088d03 | **dispatched**, `completed_at=null`, `callback_delivery_status=null`, `updated_at=17:25:40` |

Belegte Timeline:

- 17:23:52 `DISPATCH_ATTEMPT_STARTED` (auto).
- 17:24:16 Ledger-Attempt d12b2704 akquiriert (`v431_g31b_acquire`, attempt_no=1); `FACE_GATE_PROBE_UNAVAILABLE` non_blocking.
- 17:24:18 Sync.so-Dispatch mit External-ID-Bindung 50b402be (sync-3, preclip, bounding_boxes_url); Ledger `updated_at` friert hier ein.
- 17:25:38 `audio_mux` wird von `sync-so-webhook` akquiriert (`dispatcher=sync-so-webhook`, `fan_in_passes=1`) — d. h. **ein Sync.so-Callback ist damals eingegangen und hat den Fan-in bis Mux ausgelöst**, ohne den `sync_segment`-Ledger zu terminalisieren. Das entspricht dem damaligen G3.1-Observe-Vertrag (Webhook beobachtete nur, Apply lief über Legacy-Writes).
- Danach bis 20:09 kein weiterer Eintrag in `syncso_dispatch_log` für diese Szene. Mux/Remotion 7f983939 blieb ebenfalls `dispatched` (gleiche Observe-Ursache).
- 20:09:26 `DISPATCH_ATTEMPT_STARTED` (auto, nach Clean-Restart).
- Ab 20:18:50 Serie `DISPATCH_ATTEMPT_STARTED` → `PASS_DEDUPE_SKIPPED (v193_pass_already_active)`; die einzige durchgelassene Invocation (20:19:56) endet um 20:19:59.213 mit `ledger dispatch skipped reason=already_in_flight pipeline_job_id=d12b2704` / `g31_observe ledger_already_in_flight existing_status=dispatched`.

**Klassifizierung:** Fall 1 — *Provider terminal + Callback erhalten, aber Ledger unter altem Observe-Vertrag nicht terminalisiert*. Beleg dafür ist die Existenz des `audio_mux`-Attempts mit `dispatcher=sync-so-webhook` um 17:25:38: Fan-in kann nur nach eingegangenem Sync.so-Callback entstehen.

**Offen (nicht vermutet, sondern unbelegt):** Der externe Providerstatus von Sync.so-Job 50b402be ist von hier aus nicht read-only prüfbar — der Sync.so-API-Key liegt ausschließlich als Edge-Secret vor und ein Provider-Read wäre ein neuer Ausführungsschritt. Ebenso sind die Edge-Logs des Zeitfensters 17:24–17:30 und 20:08–20:12 bereits aus der Log-Retention gefallen; die Rekonstruktion stützt sich dort auf persistierte Ledger-/Dispatch-Log-Zeilen. Die externe Bestätigung ist als eigener, freizugebender Read-Only-Schritt zu führen.

## 2. UI-Clean-Restart 20:09 — Trace

Edge-Logs dieses Fensters sind abgelaufen; der Pfad ist über den Zustandsfingerabdruck eindeutig identifizierbar.

Aufgerufen wurde **nicht** der Full-Reset-/Run-Vertrag (`composer-start-scene-generation` → `startSceneRun`/`beginSceneRun`), sondern der Lip-Sync-Clean-Restart **`reset-lipsync-scene`** (`src/lib/lipsyncReset.ts::resetSceneLipSync` bzw. `useResetLipSync`).

Was `reset-lipsync-scene` laut Code schreibt: `lip_sync_status='pending'`, `dialog_shots=null`, `twoshot_stage=null`, `replicate_prediction_id=null`, `clip_error=null`, Plate-Restore über `materializeCompatibilityOutput("base")`, `clip_status='ready'`, `audio_plan.twoshot` bereinigt (faceMap etc.), plus `failLipSync(reason="user_reset")` mit Credit-Refund.

Was er **nicht** anfasst: `active_run_id`, `active_run_started_at`, `plate_generation` und `composer_pipeline_jobs`.

Gemessener Zustand deckt sich exakt damit: `lip_sync_status=pending`, `clip_status=ready`, `clip_error=null`, `dialog_shots` neu aufgebaut (nur Pass-Claim), `active_run_id=51f80471` seit **17:20:44**, `plate_generation=7=plate_ready_generation`, keine `dialog_dispatch_locks`.

Antworten auf die Prüffragen:

- Restart-Funktion: `reset-lipsync-scene` (Lip-Sync-Clean-Restart), nicht der eingefrorene Full-Reset-/Run-Vertrag.
- Neuer Run laut eigenem Vertrag? Nein — der Endpoint ist bewusst als „Lip-Sync-Zustand leeren, Plate behalten, Auto-Trigger neu greifen lassen" spezifiziert.
- `plate_generation`-Wechsel? Nein, ebenfalls vertragsgemäß nicht vorgesehen.
- Canceln/Stale/Replace alter `sync_segment`-/`audio_mux`-Jobs? Nein. `failLipSync` kündigt bekannte Sync.so-Jobs aus `dialog_shots`/`audio_plan` — hier war `dialog_shots` bereits leer bzw. ohne `job_id`, und der **Ledger** ist von diesem Pfad ohnehin nicht adressiert.
- Warum blieb `active_run_id` erhalten? Weil nur `composer-start-scene-generation`/`beginSceneRun` `active_run_id` + `plate_generation` neu stempelt; `reset-lipsync-scene` tut das nicht.
- Warum liefert `composer_acquire_pipeline_attempt` `already_in_flight` auf d12b2704? Die Ledger-Identität ist `(scene_id, run_id, stage, segment_id)` — `plate_generation` gehört nicht dazu. Run und Stage sind unverändert, der Attempt hat `replaced_by IS NULL` und Status `dispatched` ∈ {pending, dispatching, dispatched, dispatch_uncertain} → laut G3.1b-Vertrag korrekt `already_in_flight`.

Fazit: Beide Verträge verhalten sich je für sich vertragsgemäß. Die Lücke liegt zwischen ihnen — `reset-lipsync-scene` macht eine Szene wieder non-terminal, ohne die Ledger-Identität zu erneuern oder zu terminalisieren.

## 3. Post-Cutover Resurrection

Die postulierte Sequenz ist mit den erhobenen Daten **bestätigt**:

```text
terminale Szene (Run R, Gen G, offener Ledger-Attempt aus Observe-Ära)
  → UI „Lip-Sync-Clean-Restart" (reset-lipsync-scene)
  → Szene non-terminal (lip_sync_status=pending, clip_status=ready), Run R + Gen G unverändert
  → Auto-Trigger dispatcht compose-dialog-segments
  → composer_acquire_pipeline_attempt → already_in_flight auf altem Attempt
  → kein Provider-Dispatch, dauerhafte Blockade (nur Pass-Claim-TTL-Schleife alle 10 min)
```

Wichtige Präzisierung: Der Effekt ist **nicht** cutover-spezifisch. Er greift für jede Szene mit historisch offenem Ledger-Attempt, unabhängig vom Deploy. Der Cutover hat ihn nur sichtbar gemacht, weil vor dem Deploy keine Szene mit Observe-Altlasten neu gestartet wurde.

**Klassifizierung: Restart-/Run-Lifecycle-Defekt. Keine G3.2.2-Apply-Regression.** Der Apply-Pfad `composer_apply_sync_segment_result` wurde in diesem Resmoke nie betreten — weder bestätigt noch widerlegt.

## 4. Kein Replacement als neuer Run

`composer_replace_pipeline_attempt` bleibt unverändert im eingefrorenen G3.1b-Vertrag (gleicher Scene-Run, gleiche Generation, neuer Attempt) und wird ausdrücklich **nicht** als Mittel zur Erzeugung einer neuen `run_id` vorgeschlagen.

Kanonisch frische Identität erzeugt allein `composer-start-scene-generation` (ohne `use_existing_run`): `startSceneRun`/`beginSceneRun` vergeben eine neue `run_id`, bumpen `plate_generation`, canceln In-flight-Provider-Jobs und löschen Dispatch-Locks. Alternativ eine brandneue Testszene, die überhaupt keine historischen Ledger-Zeilen besitzt.

## 5. Entscheidungsvorlage — genau eine Empfehlung

**Empfehlung: A — Restart-Defekt vor dem Resmoke beheben.**

Begründung: Der produktive UI-Restart kann generell alte Attempts reaktivieren; das ist kein Einzelfall dieser Szene, sondern eine dauerhafte Blockade-Klasse im Produktivpfad.

Minimal nötige nächste Änderung (nur beschrieben, nicht umgesetzt) — RS2:

1. `reset-lipsync-scene` erhält beim Non-terminal-Machen einer Szene eine explizite Ledger-Verantwortung für genau die Stages, die er logisch verwirft (`sync_segment`, `audio_mux` des aktuellen Runs): entweder Terminalisierung als `canceled` mit `error_code='user_reset'` über ein neues atomares Primitive, oder — vertragskonform sauberer — der Restart erzeugt eine neue Run-Identität über den kanonischen Run-Start.
2. Entscheidung darüber ist ein eigener Contract-Lock-Schritt (RS2), weil sie den eingefrorenen Reset-Vertrag berührt.
3. Erst danach Resmoke-Neuanlauf, und zwar auf einer **frischen Testszene ohne Ledger-Historie**, damit der Apply-Pfad garantiert erreicht wird.

Bis dahin bleibt der Status: **G3.2.2 DEPLOYED — RESMOKE IN PROGRESS / NOT YET ACCEPTED**. Keine Mutation der Jobs d12b2704 / 7f983939, kein Cleanup, kein neuer Run, kein Deploy.
