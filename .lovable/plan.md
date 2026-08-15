# v431 RS3 — Option A: Atomic Lip-Sync Reset Cancellation

Status: IMPLEMENTATION PLAN — awaiting approval. Kein Deploy, kein Produktions-Resmoke, kein Cleanup historischer Rows in diesem Schritt.

## Ausgangslage (aus Repo/Migrationen belegt)

- `composer_acquire_pipeline_attempt` (aktuelle G3.1b-Fassung, `20260815084640_…sql`) wertet den **jüngsten** Attempt derselben Identität `(scene, run, stage, segment)` aus: aktiv ⇒ `already_in_flight`, sonst **jeder terminale** Vorgänger ⇒ `predecessor_exists`.
- `composer_apply_sync_segment_result` (`20260815185301_…sql`, Z. 419) behandelt `status IN ('failed','stale','cancelled')` bereits als terminal ⇒ `verdict noop/rejected`, keine Pass-/Scene-Mutation.
- `reset-lipsync-scene` und der Direct-Clear-Zweig in `resetSceneLipSync()` schreiben **keine** Ledger-Zeile und erneuern weder `active_run_id` noch `plate_generation`.

**Konsequenz für das Abnahmekriterium:** Reines Cancel reicht nicht. Ein gecancelter Attempt bliebe als terminaler Vorgänger stehen und der nächste Dispatch liefe in `predecessor_exists`. Option A ist erst vollständig, wenn ein per `user_reset` verworfener Attempt aus der Vorgänger-Bewertung ausgenommen wird.

## Umsetzung

### 1. Migration (ein Migrationsschritt)

**a) Neues Primitive** `composer_cancel_open_lipsync_attempts(_scene_id, _expected_run_id, _expected_plate_generation)`
- `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, keine Defaults, keine Overloads, schema-qualifizierte Referenzen.
- Deterministische Lock-Reihenfolge: erst Kandidaten-Jobs `FOR UPDATE` (sortiert nach `id`), dann `composer_scenes FOR UPDATE`.
- Guard: `_expected_run_id = scene.active_run_id` und `_expected_plate_generation = scene.plate_generation`, sonst `stale_reset` ohne jeden Write.
- Kandidaten: `stage IN ('sync_segment','audio_mux')` (niemals `base_video`), gleicher Run + gleiche Generation, `replaced_by IS NULL`, Status in der offenen Menge (`pending`, `dispatching`, `dispatched`, `dispatch_uncertain`).
- Write: bestehender zulässiger Terminalstatus `cancelled`, `error_code='user_reset'`, `completed_at=now()`, Metadata-Marker `user_reset_discarded=true`. Keine Identitätsspalte wird berührt (Immutabilitäts-Trigger bleibt erfüllt).
- Rückgabe: `{ ok, outcome, canceled_job_ids[], external_job_ids[] }` für den bereits existierenden Provider-Cancel in `failLipSync()`.
- GRANT nur `service_role`; `REVOKE ALL` von `PUBLIC`/`anon`/`authenticated`.

**b) Verworfene Attempts aus der Vorgänger-Bewertung nehmen** — additiver Zweig in `composer_acquire_pipeline_attempt`: Ein jüngster Attempt mit `status='cancelled' AND error_code='user_reset'` gilt als *verworfen*, nicht als Vorgänger ⇒ reguläre Neuakquise als Attempt N+1 (`acquired`). Alle anderen terminalen Zustände bleiben unverändert `predecessor_exists`. Der Replace-Vertrag (`composer_replace_pipeline_attempt`) bleibt unangetastet und frozen.

**c) `composer_retryable_failure_reasons()` bleibt unverändert** — `user_reset` wird bewusst **nicht** aufgenommen (nicht retryable).

**d) Late-Callback-Guard, additiv:** in `composer_apply_sync_segment_result` (und dem Mux-/Stitch-Pendant) erhält der bestehende Terminalzweig für `cancelled + error_code='user_reset'` einen eigenen Reason-Label (`user_reset_discarded`) mit demselben `noop`-Verhalten. Keine Pass-Mutation, keine Scene-Mutation, kein Fan-in, kein Mux-Dispatch, keine Resurrection. Die normale Callback-Semantik ändert sich nicht.

### 2. Atomare Reset-Reihenfolge

`reset-lipsync-scene` ruft das Primitive **vor** dem Non-Terminal-Reset auf: Jobs sperren → Scene sperren → Run/Generation prüfen → offene Lip-Sync-Attempts mit `user_reset` terminalisieren → Pass-/Mux-Runtime-Bindings des verworfenen Laufs zurücksetzen → bestehende Lip-Sync-Reset-Semantik → Audit. Kein Run-Wechsel, kein Generation-Bump, `base_video`/Plate unberührt, kein bezahlter Neurender.

### 3. Beide Blockade-Aufrufer migrieren

- `supabase/functions/reset-lipsync-scene/index.ts`
- `src/lib/lipsyncReset.ts::resetSceneLipSync()` — der Direct-Clear-Fallback (`dialog_shots: null`) läuft künftig über denselben Cancel-Vertrag statt am Ledger vorbei.

Danach existiert kein dritter Direct-Clear-Pfad mehr.

### 4. Tests

Neue Suite RS3-S1…S9 plus Resurrection-Test:
offener `sync_segment` ⇒ `cancelled/user_reset`; offener `audio_mux` ⇒ ebenso; bereits terminaler Job ⇒ idempotent unverändert; fremder Run / fremde Generation ⇒ `stale_reset`, kein Write; `base_video` unverändert; Pass-Pointer/Runtime-Bindings zurückgesetzt; zweiter Reset idempotent; Late-Sync.so-Callback ⇒ keine Mutation; Late-Mux/Stitch-Callback ⇒ keine Resurrection; **nach Reset neuer Acquire im selben Run/Generation ⇒ `acquired`, weder `already_in_flight` noch `predecessor_exists`**; `user_reset` nicht in der Retry-Allowlist.

Zusätzlich: Frozen-Suite, `tsgo`, bestehende G3.1/G3.1f/G3.2.2-Smokes.

### 5. Writer-/Security-Audit

Nachweis: beide Reset-Aufrufer nutzen den Cancel-Vertrag, kein verbleibender Direct-Clear, Primitive service-role-only, `anon`/`authenticated`/`PUBLIC` ohne EXECUTE, akzeptiertes Plattform-internes ACL wie dokumentiert.

### 6. Deliverables

- `docs/v431-rs3-report.md` (neu)
- `docs/v431-g3-2-2-report.md` nur um einen Verweis ergänzt

Danach STOP für Review.

## Hinweis zum Umfang

Punkt 1b (Acquire-Zweig für verworfene Attempts) ist ein additiver Eingriff in eine G3.1b-Funktion. Er ist notwendig, weil Option A sonst das genannte Abnahmekriterium nicht erfüllt. Alternative wäre, den Reset einen Generation-Bump machen zu lassen — das ist Option B und ausgeschlossen.
