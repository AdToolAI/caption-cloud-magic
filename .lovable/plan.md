# v431 G3.2.2 — Sync Segment Authoritative Apply (Contract Lock)

Analyse + verbindlicher Vertrag. Keine Code-Änderung, keine Migration, kein Deploy in diesem Schritt.
Nach Freigabe wird exakt dieser Inhalt als `docs/v431-g3-2-2-contract.md` abgelegt (Deliverable), danach STOP.

## 1. Ist-Audit `sync-so-webhook` (1857 Zeilen, verifiziert)

Alle produktiven Apply-Pfade liegen im Block `state.version===5 && state.engine==='sync-segments'`,
umschlossen von `withDialogLock` (Advisory-Lock, best effort — bei Contention wird **ohne** Lock
weitergeschrieben, Zeile ~508/1841).

| # | Branch (Zeile) | heutige Writes | Ledger | Scene | G3.2.2 Owner |
|---|---|---|---|---|---|
| B0 | Scene-Resolve (327–368) | – | – | – | Ledger-Row (`pipeline_job_id`) ersetzt Hint+Scan |
| B1 | Run-Guard (376–401) | – | – | – | RPC-Guard (run/gen/pass) |
| B2 | Observe (406–413) | `composer_callback_observations` | read | – | bleibt (G3.1, frozen) |
| B3 | already_applied / canceled (417–426) | – | – | – | RPC no-op-Verdikt |
| B4 | v131.8 Recover-from-self-inflicted (454–471) | Whole-JSON `dialog_shots`, `lip_sync_status`, `twoshot_stage`, `clip_error` | – | ja | RPC (schmaler Patch) |
| B5 | v141 Reattach (529–560) | in-memory + späterer Write | – | – | **entfällt** (Pass-Identität kommt aus Ledger) |
| B6 | Orphan-Cleanup (562–575) | Provider-DELETE, inflight-release | – | – | bleibt Edge (Netz-I/O), Verdikt `rejected` |
| B7 | NOOP-Hard-Fail (763–853) | `update_dialog_pass_slot` **oder** Whole-JSON-Fallback, Scene `failed`+`needs_clip_rerender` | – | ja | RPC (Segment-Ergebnis = fail) |
| B8 | NOOP-Eskalation (855–980) | Slot-Patch (job_id/pipeline_job_id=null), Re-Dispatch `compose-dialog-segments` | Retry-Vertrag (G3.1b) | – | RPC-Verdikt `redispatch`, Dispatch bleibt Edge |
| B9 | Success, nicht alle terminal (1071–1131) | Slot-Patch `done`, Scene `running`+`twoshot_stage`, Advance-Kick, Mux-Warmup | – | ja | RPC (`continue`) |
| B10 | v48 Partial-Mux-Refusal N≥3 (1022–1069) | Whole-JSON, Wallet-Refund, Scene `failed` | – | ja | RPC (`fail`) + Refund bleibt Edge/Folgeschritt |
| B11 | Single-Speaker non-tight Finalize (1147–1176) | Whole-JSON, `lip_sync_status='applied'`, `lip_sync_applied_at`, `clip_status='ready'`, `materializeCompatibilityOutput` | – | **terminal complete** | **wird gelöscht** — Umlegung auf `dispatch_mux` (siehe §6) |
| B12 | Fan-in Mux-Dispatch (1181–1259) | `try_claim_mux_dispatch`, Whole-JSON `audio_muxing`, `lip_sync_status='audio_muxing'`, `acquireLedgerJob(audio_mux)`, Invoke Mux | neue `audio_mux`-Zeile | ja | RPC-Verdikt `dispatch_mux`; Acquire+Invoke bleiben Edge |
| B13 | FAILED/… Logging (1290–1318) | `syncso_dispatch_log` | – | – | bleibt Edge |
| B14 | Retry-Ladder (1453–1571) | tot (`canRetry=false`, v128) | – | – | wird gelöscht |
| B15 | FAILED → sceneWillFail (1649–1733) | Wallet-Refund, Whole-JSON `failed`, Sibling-Cancel | – | ja | RPC (`fail`, Job=failed) |
| B16 | FAILED → mustFailScene N≥3 (1759–1807) | Refund + Whole-JSON `failed` | – | ja | RPC (`fail`) |
| B17 | FAILED → Scene lebt weiter / partialMux N≤2 (1809–1835) | Whole-JSON, ggf. `audio_muxing` + Mux-Invoke | – | ja | RPC (`continue` bzw. `dispatch_mux`) — **Partial-Mux-Produktsemantik bleibt erhalten** (§3a) |

Kritische Befunde:
- **Whole-JSON-Clobber** von `dialog_shots` in B4, B7-Fallback, B10, B11, B12, B15, B16, B17 — Sibling-Passes können verloren gehen.
- **Kein Ledger-Write** im gesamten Sync-Apply: der `sync_segment`-Job wird heute **nie** terminalisiert (nur `audio_mux` wird angelegt). Das ist die zentrale G3.2.2-Lücke.
- Provenienz wird für den Apply **nicht** genutzt: Scene-Findung über `scene_id`-Hint bzw. 200-Zeilen-Scan, Pass-Findung über `passes[].job_id` + `syncso_dispatch_log`-Reattach.

## 2. Provenienz (eingefroren)

`pipeline_job_id` → `composer_pipeline_jobs FOR UPDATE` → `composer_scenes FOR UPDATE` (D1-Reihenfolge)
→ Guards → Pass-Apply → Fan-in → Scene/Mirror → Audit → Job-Terminalisierung. Eine Transaktion.
Kein Resolve über Payload, `dialog_shots`, `external_job_id`, Logs, Scene-Felder. G3.1f-Transport unverändert.

## 3. Kernvertrag: Segment-Ergebnis ≠ Scene-Verdict

Zwei getrennte Entscheidungen im selben Commit:
- **Segment-Ergebnis (pre-replacement job result)** = ausschließlich Ergebnis *dieses*
  Provider-Segments. Provider-COMPLETED ohne NOOP ⇒ `succeeded`. FAILED/REJECTED/CANCELED
  ⇒ `failed` (`failure_reason` aus Provider-Klassifikation). NOOP unrecoverable ⇒ `failed`
  (`sync_noop_unrecoverable`). NOOP retrybar ⇒ `failed` (`sync_noop_retryable`, §5a), nach
  `composer_replace_pipeline_attempt` wird der Vorgänger im Ledger final `stale`/`replaced_by`.
- **Scene-Verdict** = Aggregat über alle Passes.

| Callback | Kontext | Segment-Ergebnis (pre-replacement) | Scene-Verdict |
|---|---|---|---|
| success | keine früheren Fails, andere Passes offen | succeeded | continue |
| success | keine früheren Fails, alle Passes done | succeeded | dispatch_mux |
| success | früherer Pass failed, `totalSpeakers ≥ 3` | **succeeded** | **fail** |
| success | früherer Pass failed, `totalSpeakers ≤ 2`, ≥1 Pass done, alle terminal | **succeeded** | **dispatch_mux** (Partial-Mux, §3a) |
| success | früherer Pass failed, `totalSpeakers ≤ 2`, noch nicht alle terminal | succeeded | continue |
| provider failed | Aggregat nicht terminal | failed | continue |
| provider failed | alle terminal, `totalSpeakers ≤ 2`, ≥1 done | failed | **dispatch_mux** (Partial-Mux, §3a) |
| provider failed | sonst terminal mit Fails | failed | fail |
| NOOP retryable | egal | `failed` (`sync_noop_retryable`), nach Replacement `stale`/`replaced_by` (§5a) | redispatch |
| NOOP unrecoverable | egal | `failed` (`sync_noop_unrecoverable`) | fail |

### 3a. Partial-Mux (verbindliche Entscheidung: erhalten)

G3.2.2 ist eine Writer-/Apply-Migration, keine Produktänderung. Die heutige Partial-Mux-Regel
aus B17/B10 (`partialMuxAllowed = totalSpeakers <= 2`, `partialMux = allTerminal && doneCount > 0
&& partialMuxAllowed`, `mustFailScene = !partialMuxAllowed && allTerminal && failedCount > 0`,
verifiziert `sync-so-webhook:1752–1757`) wird **unverändert in den Aggregator des RPC übernommen**.
Ein `failed` Pass schließt `dispatch_mux` also nur bei `totalSpeakers ≥ 3` aus. Die Refusal
`partial_mux_3plus` (Zeile 1068) bleibt als `fail` erhalten. Ein Pass-Fail bleibt in jedem Fall
ein `failed` Ledger-Job — Partial-Mux ändert nur das Scene-Aggregat, nie den Job-Status.

## 4. `composer_apply_sync_segment_result` (neu, sole owner)

`_pass_patch` **entfällt** (Punkt 4 geschlossen). Der Slot-Patch wird serverseitig
deterministisch aus `_write_id` + `_provider_status` + `_output_url` + `_error_text`
abgeleitet; der Caller kann keine Feldkombination mehr vorgeben.

```
composer_apply_sync_segment_result(
  _pipeline_job_id  uuid,
  _external_job_id  text,
  _write_id         text,   -- 'ssw:success' | 'ssw:failed' | 'ssw:noop_fail' | 'ssw:noop_escalate'
  _provider_status  text,   -- COMPLETED | FAILED | REJECTED | CANCELED
  _output_url       text,   -- nur bei ssw:success bedeutsam, sonst muss NULL sein
  _error_text       text
) RETURNS jsonb
-- { applied, verdict, segment_result, scene_verdict, pass_idx, replacement_job_id, reason }
-- segment_result = pre-replacement segment result (succeeded | failed), NICHT finaler Ledger-Lifecycle-Status
```

Serverseitige Write-ID → Slot-Felder-Matrix (geschlossen, keine anderen Keys):

| write_id | erlaubter provider_status | gesetzte Slot-Felder |
|---|---|---|
| `ssw:success` | COMPLETED (+ `_output_url` NOT NULL) | `status='done'`, `output_url`, `finished_at` |
| `ssw:failed` | FAILED/REJECTED/CANCELED | `status='failed'`, `finished_at`, `last_error`, `last_error_class` |
| `ssw:noop_fail` | COMPLETED | `status='failed'`, `finished_at`, `error='sync_noop_unrecoverable'`, `noop_reason` |
| `ssw:noop_escalate` | COMPLETED | `status='pending'`, `job_id=NULL`, `pipeline_job_id=NULL`, `output_url=NULL`, `finished_at=NULL`, `noop_escalation_step+1` |

Jede andere Kombination ⇒ `rejected`, keine Mutation.

**Pass-Guard (verschärft):** Ledger-Row ist Autorität. Geprüft werden *alle*:
`scene_id`, `run_id`, `plate_generation`, `stage='sync_segment'`, die im Ledger gebundene
stabile Segment-/Speaker-Identität (`pass_idx`/`speaker_idx`/Pass-UUID aus `metadata`)
gegen den Slot **und** bestätigend die Pointer `passes[i].pipeline_job_id = _pipeline_job_id`
sowie `passes[i].job_id = _external_job_id`. Pointer sind Bestätigung, nicht Identität.
Immutable: `run_id`, `plate_generation`, Pass-UUID/`speaker_idx`, `job_id`, `pipeline_job_id`
(außer im definierten Reset des `ssw:noop_escalate`-Vertrags, §5a).
Kein Whole-JSON-Replace, keine Mutation fremder Slots.

## 5. Fan-in-Ausgänge (geschlossen)

`continue` | `dispatch_mux` | `fail` | `redispatch` | `noop` | `rejected`.
Kein `complete`, kein `lipsync_muxing` — Eintritt in `lipsync_muxing` bleibt beim echten
Mux-Owner `render-sync-segments-audio-mux` mit realem `render_id` (D6).

### 5a. `ssw:noop_escalate` — Ledger-Vertrag (ohne Änderung am eingefrorenen Primitive)

Wichtig: `composer_replace_pipeline_attempt` wird **nicht** umgedeutet. Audit der eingefrorenen
Implementierung (verifiziert): sie prüft den *gespeicherten* `error_code` des Vorgängers gegen
`composer_retryable_failure_reasons()`, legt den Nachfolger mit `attempt_no+1` und Status
`dispatching` an und setzt den Vorgänger anschließend auf `status='stale'`, `replaced_by=<neu>`,
`completed_at=now()`, wobei der bestehende `error_code` erhalten bleibt.

Daraus folgt die saubere Trennung:
- **Segment-Ergebnis** (fachliches Verdikt dieses Callbacks): `failed` mit
  `error_code = 'sync_noop_retryable'`.
- **Finaler Ledger-Lifecycle-Status nach Replacement**: `stale` mit `replaced_by = replacement_job_id`
  und weiterhin `error_code = 'sync_noop_retryable'`.

Ablauf in **einer** Transaktion des Apply-RPC:
1. aktueller `sync_segment`-Attempt → `status='failed'`, `error_code='sync_noop_retryable'`
   (dieser gespeicherte Wert ist die Autorisierungsgrundlage für Schritt 3).
2. `'sync_noop_retryable'` wird der Allowlist `composer_retryable_failure_reasons()` hinzugefügt
   (heute: `provider_transient_error`, `provider_timeout`, `provider_rate_limited`,
   `dispatch_uncertain_recovery`, `watchdog_stalled`, `poller_timeout`, `mux_redispatch` —
   verifiziert). Die Ergänzung ist Teil der G3.2.2-Migration; das Primitive bleibt unverändert.
3. `composer_replace_pipeline_attempt(previous_job_id, scene, run, 'sync_segment',
   plate_generation, …)` im selben Commit; niemals Initial-Acquire. Rückgabe als
   `replacement_job_id`. Der Vorgänger endet dadurch als `stale`/`replaced_by`.
4. Pass-Paar wird nach dem zulässigen Reset-Vertrag freigegeben (`job_id`/`pipeline_job_id`
   atomar gemeinsam auf NULL, Status `pending`) — kein Einzel-Pointer-Write.
5. Edge darf **keinen** Attempt erzeugen: `compose-dialog-segments` wird mit dem vom RPC
   gelieferten `replacement_job_id` (+ `retry_of_pipeline_job_id`) aufgerufen und bindet nur
   noch die Provider-ID über `composer_bind_sync_pass_attempt` (G3.1f, frozen).
6. Duplicate-Verhalten dieses Zweigs ist ausschließlich in der Duplicate-Matrix (§8) geregelt.

## 6. Kein Callback-Job-Hop — B11 wird umgelegt (Punkt 1)

Verboten im selben Apply: Terminalisierung von `audio_mux`/Stitch-Jobs, Aufruf von
`composer_finalize_lipsync_scene`, Scene direkt auf `complete`.

**B11 ist damit kein offener D4-Punkt mehr.** Nach G3.2.2 existiert im `sync-so-webhook`
kein Zweig, der `complete`/`applied`/`lip_sync_applied_at` schreibt. Auch der
single-speaker-non-tight-Fall läuft über den regulären Post-Sync-Pfad:

```text
sync_segment success
  → dispatch_mux (Verdikt aus dem Apply-RPC)
  → render-sync-segments-audio-mux  (Mux-State-Owner, setzt lipsync_muxing mit render_id)
  → Remotion / Stitch
  → composer_finalize_lipsync_scene (stitch:done)
```

Kein Complete-Compatibility-Zweig als Übergang. `materializeCompatibilityOutput` wandert
damit vollständig zum Finalizer.

## 7. Progress-Helper E

`composer_touch_lipsync_progress` bleibt interner SQL-Helper: kein Grant, kein Edge-RPC,
kein Watchdog-Writer, nur innerhalb der Apply-Transaktion. Bound-job-no-callback-Recovery bleibt G4.

## 8. Concurrency / Idempotency — geschlossene Duplicate-Matrix

Es gibt **keine** pauschale „Duplicate → noop“-Regel mehr. Maßgeblich ist ausschließlich:

| Duplicate-Fall | Bedingung | Ergebnis |
|---|---|---|
| finaler Success, Mux noch nicht beansprucht | kein `audio_mux`-Attempt im Ledger für (scene, run, plate_generation) | erneut `dispatch_mux`, **ohne** den Pass erneut zu mutieren |
| finaler Success, Mux bereits im Ledger | `audio_mux`-Attempt existiert | `noop` |
| finaler Success, Aggregat `continue`/`fail` unverändert | – | `noop` |
| alter retryable-NOOP, Replacement offen | `replacement_job_id` existiert, ist ungebunden und ohne Provider-Dispatch | erneut `redispatch` mit **derselben** `replacement_job_id`, kein zweiter Reset, kein zweiter Attempt |
| alter retryable-NOOP, Replacement bereits gebunden/dispatched | Provider-ID am Replacement gebunden | `noop` |
| konfliktärer Duplicate | anderer Output-URL / anderer Provider-Status als bereits angewandt | `rejected`, keine Mutation |

Weitere Regeln:
- Zwei finale Pass-Callbacks parallel → Serialisierung über Job-Lock → Scene-Lock.
- **`dispatch_mux` ist re-drivable, kein Einmal-Verdikt.** Der RPC persistiert
  `dialog_shots.audio_mux.mux_dispatch_requested_at` (ersetzt die Semantik von
  `try_claim_mux_dispatch`, das dadurch aus dem Sync-Pfad entfällt), verhindert damit aber
  keine Wiederholung. Ein Edge-Crash zwischen Commit und `acquireLedgerJob('audio_mux')` kann
  den Mux so nicht dauerhaft blockieren.
  **Exactly-once-Schranke bleibt `acquireLedgerJob('audio_mux')`** (`already_in_flight`,
  verifiziert in `sync-so-webhook:1229–1244`).
- Gleiches Prinzip für `redispatch`: der RPC-Claim ist wiederholbar, exactly-once liegt bei
  `composer_bind_sync_pass_attempt`.
- Stale Run/Generation → kein Apply, Verdikt `stale_run` / `stale_generation`.
- Falsche Pass-/Segment-Identität → `wrong_pass`, kein Apply.

## 9. Failure Ownership

Kein neuer allgemeiner Failure-Primitive. `composer_fail_callback_scene` bleibt auf seiner
Allowlist (`ccw:failed`, `ccw:legacy_route_blocked`, verifiziert). Sync.so-Scene-Verdicts
gehören vollständig `composer_apply_sync_segment_result`. `composer_fail_internal_dispatch`
(später) für Mux-Invoke-Failures. `composer_fail_post_plate_handoff` bleibt frozen.
Audit: nach G3.2.2 genau **ein** Sync.so-Scene-Failure-Writer (B10/B15/B16/B17 ersetzt).

## 10. Security-Vertrag

`SECURITY DEFINER`, `SET search_path = pg_catalog, public`, schema-qualifiziert,
`service_role`-only (REVOKE public/anon/authenticated), keine Default-Parameter,
keine Overloads, geschlossene `stage='sync_segment'`-Prüfung, Ledger-Zeile ist Autorität,
Audit-Zeile für applied/rejected/noop.

## 11. Verbindliche Testmatrix

- **S1** Erfolg, weitere Passes offen → Job `succeeded`, Verdikt `continue`.
- **S2** letzter Erfolg, alle done → `dispatch_mux`.
- **S3** Erfolg bei früherem Fail, `totalSpeakers ≥ 3` → Job `succeeded`, Scene `fail`.
- **S3b** Erfolg bei früherem Fail, `totalSpeakers ≤ 2`, alle terminal → Job `succeeded`,
  Scene `dispatch_mux` (Partial-Mux erhalten, §3a).
- **S4** Provider-Fail → Job `failed`, Aggregat gemäß §3/§3a korrekt.
- **S5** Duplicate finaler Success **ohne** `audio_mux`-Attempt → erneut `dispatch_mux`,
  Pass unverändert; **mit** `audio_mux`-Attempt → `noop`.
- **S6** konfliktärer Duplicate → `rejected`, keine Mutation.
- **S7** stale Run · **S8** stale Generation · **S9** falsche Pass-/Segment-Identität → kein Apply.
- **S10** zwei finale Callbacks bzw. Wiederholung nach simuliertem Edge-Crash → ggf. mehrfach
  `dispatch_mux`, aber **genau ein** `audio_mux`-Ledger-Attempt und **genau ein** Provider-Dispatch.
- **S11** kein Whole-JSON-Clobber · **S12** keine Fremd-Slot-Mutation.
- **S13** kein Initial-Acquire im Callback (nur `composer_replace_pipeline_attempt`).
- **S14** kein `lipsync_muxing` vor dem Mux-Owner · **S15** kein `complete`/`applied` aus dem
  Sync-Apply (inkl. single-speaker non-tight).
- **S16** NOOP-retryable: Segment-Ergebnis `failed` mit `error_code='sync_noop_retryable'`;
  **finaler** Ledger-Zustand des Vorgängers nach Replacement ist `status='stale'`,
  `replaced_by = replacement_job_id`, `error_code='sync_noop_retryable'` erhalten;
  genau ein Replacement-Attempt (`attempt_no+1`, Status `dispatching`).
- **S16b** Duplicate des alten NOOP-Callbacks: Replacement ungebunden → erneut `redispatch`
  mit derselben `replacement_job_id`; Replacement gebunden → `noop`. Nie ein zweiter Attempt.
- **S17** `_write_id`/`_provider_status`-Mismatch → `rejected` ohne Mutation.

Zusätzlich Frozen-Suite + `tsgo`.

## Späterer Scope (nach Abnahme)

Migration: `composer_apply_sync_segment_result`, Allowlist-Erweiterung um
`sync_noop_retryable`, interner `mux_dispatch_requested_at`-Claim,
`composer_touch_lipsync_progress` (intern). `try_claim_mux_dispatch` verliert seinen Aufrufer.
Code: `sync-so-webhook` B4/B7/B8/B9/B10/B12/B15/B16/B17 auf den RPC, Löschung B5/B11/B14,
Beibehaltung B6/B13 als reine Edge-Nebenwirkungen; Complete-Pfad ausschließlich über
Mux-Owner → Finalizer. Deliverable `docs/v431-g3-2-2-contract.md`. Danach STOP für Review.
