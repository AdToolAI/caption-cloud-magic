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
| B11 | Single-Speaker non-tight Finalize (1147–1176) | Whole-JSON, `lip_sync_status='applied'`, `lip_sync_applied_at`, `clip_status='ready'`, `materializeCompatibilityOutput` | – | **terminal complete** | **NICHT G3.2.2** (D4: Finalizer) — siehe §6 |
| B12 | Fan-in Mux-Dispatch (1181–1259) | `try_claim_mux_dispatch`, Whole-JSON `audio_muxing`, `lip_sync_status='audio_muxing'`, `acquireLedgerJob(audio_mux)`, Invoke Mux | neue `audio_mux`-Zeile | ja | RPC-Verdikt `dispatch_mux`; Acquire+Invoke bleiben Edge |
| B13 | FAILED/… Logging (1290–1318) | `syncso_dispatch_log` | – | – | bleibt Edge |
| B14 | Retry-Ladder (1453–1571) | tot (`canRetry=false`, v128) | – | – | wird gelöscht |
| B15 | FAILED → sceneWillFail (1649–1733) | Wallet-Refund, Whole-JSON `failed`, Sibling-Cancel | – | ja | RPC (`fail`, Job=failed) |
| B16 | FAILED → mustFailScene N≥3 (1759–1807) | Refund + Whole-JSON `failed` | – | ja | RPC (`fail`) |
| B17 | FAILED → Scene lebt weiter / partialMux N≤2 (1809–1835) | Whole-JSON, ggf. `audio_muxing` + Mux-Invoke | – | ja | RPC (`continue` bzw. `dispatch_mux`) |

Kritische Befunde:
- **Whole-JSON-Clobber** von `dialog_shots` in B4, B7-Fallback, B10, B11, B12, B15, B16, B17 — Sibling-Passes können verloren gehen.
- **Kein Ledger-Write** im gesamten Sync-Apply: der `sync_segment`-Job wird heute **nie** terminalisiert (nur `audio_mux` wird angelegt). Das ist die zentrale G3.2.2-Lücke.
- Provenienz wird für den Apply **nicht** genutzt: Scene-Findung über `scene_id`-Hint bzw. 200-Zeilen-Scan, Pass-Findung über `passes[].job_id` + `syncso_dispatch_log`-Reattach.

## 2. Provenienz (eingefroren)

`pipeline_job_id` → `composer_pipeline_jobs FOR UPDATE` → `composer_scenes FOR UPDATE` (D1-Reihenfolge)
→ Guards → Pass-Apply → Fan-in → Scene/Mirror → Audit → Job-Terminalisierung. Eine Transaktion.
Kein Resolve über Payload, `dialog_shots`, `external_job_id`, Logs, Scene-Felder. G3.1f-Transport unverändert.

## 3. Kernvertrag: Job-Status ≠ Scene-Verdict

Zwei getrennte Entscheidungen im selben Commit:
- **Job-Status** = ausschließlich Ergebnis *dieses* Provider-Segments (`succeeded` bei COMPLETED inkl. NOOP-Hard-Fail? → nein: NOOP = Segment-Ergebnis fachlich unbrauchbar ⇒ `failed` mit `failure_reason='sync_noop_unrecoverable'`; echter Provider-COMPLETED ohne NOOP ⇒ `succeeded`; FAILED/REJECTED/CANCELED ⇒ `failed`).
- **Scene-Verdict** = Aggregat über alle Passes.
Matrix (verbindlich):

| Callback | früherer Pass failed | Job-Status | Scene-Verdict |
|---|---|---|---|
| success | nein, andere offen | succeeded | continue |
| success | nein, alle done | succeeded | dispatch_mux |
| success | ja | **succeeded** | **fail** |
| provider failed | egal | failed | continue \| fail (Aggregat) |
| NOOP unrecoverable | egal | failed | fail |

## 4. `composer_apply_sync_segment_result` (neu, sole owner)

```
composer_apply_sync_segment_result(
  _pipeline_job_id uuid,
  _external_job_id text,
  _write_id text,            -- Allowlist: 'ssw:success' | 'ssw:failed' | 'ssw:noop_fail' | 'ssw:noop_escalate'
  _provider_status text,     -- COMPLETED | FAILED | REJECTED | CANCELED
  _output_url text,
  _pass_patch jsonb,         -- schmaler Slot-Patch, Whitelist-Keys
  _error_text text
) RETURNS jsonb
-- { applied, verdict, job_status, scene_verdict, pass_idx, reason }
```
Darf ausschließlich: gebundenen `stage='sync_segment'`-Job akzeptieren, Identität fail-closed prüfen
(`run_id`, `plate_generation`, `scene_id`, Pass-Slot via `passes[i].pipeline_job_id = _pipeline_job_id`
und `passes[i].job_id = _external_job_id`), den einen Pass schmal patchen, den Job terminalisieren,
Fan-in unter demselben Lock bestimmen, genau eine Folgeaktion zurückgeben.
Immutable: `run_id`, `plate_generation`, Pass-UUID/`speaker_idx`, `job_id`, `pipeline_job_id`.
Kein Whole-JSON-Replace, keine Mutation fremder Slots, keine neue Ledger-Zeile/kein neuer Attempt.

## 5. Fan-in-Ausgänge (geschlossen)

`continue` | `dispatch_mux` | `fail` | `redispatch` (NOOP-Eskalation) | `noop` | `rejected`.
Kein `complete`, kein `lipsync_muxing` — Eintritt in `lipsync_muxing` bleibt beim echten Mux-Owner
`render-sync-segments-audio-mux` mit realem `render_id` (D6). G3.2.2 gibt nur die Aktion zurück.

## 6. Kein Callback-Job-Hop

Verboten im selben Apply: Terminalisierung von `audio_mux`/Stitch-Jobs, `composer_finalize_lipsync_scene`,
Scene direkt auf `complete`. Folge: **B11 (single-speaker non-tight Direktfinalisierung) verlässt G3.2.2** —
er wird auf `dispatch_mux`/Finalizer-Pfad umgestellt oder bleibt bis G3.3 unverändert; Entscheidung wird
im Vertragsdokument als offener D4-Punkt geführt und **nicht** in G3.2.2 mitmigriert.

## 7. Progress-Helper E

`composer_touch_lipsync_progress` bleibt interner SQL-Helper: kein Grant, kein Edge-RPC, kein Watchdog-Writer,
nur innerhalb der Apply-Transaktion. Bound-job-no-callback-Recovery bleibt G4.

## 8. Concurrency / Idempotency (bewiesen, nicht geraten)

- Duplicate identisch nach Apply → `noop` (Job bereits terminal, Slot-Werte gleich).
- Duplicate konfliktär (anderer Output/Status) → `rejected`, keine Mutation.
- Zwei finale Pass-Callbacks parallel → Serialisierung über Job-Lock → Scene-Lock.
- **`dispatch_mux` exakt einmal:** heute garantiert das `try_claim_mux_dispatch` (bedingtes UPDATE auf
  `dialog_shots.audio_mux.dispatched_at`, verifiziert) *plus* `acquireLedgerJob('audio_mux')` mit
  `already_in_flight`. Beide liegen außerhalb der Apply-Transaktion. Vertrag: der Claim wandert **in** den
  RPC (gleicher Scene-Lock, gleiche Semantik: erster Setzer gewinnt), `dispatch_mux` wird nur dem Claim-Gewinner
  zurückgegeben; der Ledger-Acquire bleibt als zweite Schranke im Edge-Code.
- Stale Run/Generation → kein Scene-/Pass-/Job-Apply, Verdikt `stale_run` / `stale_generation`.
- Falsche Pass-Identität → `wrong_pass`, kein Apply.

## 9. Failure Ownership

Kein neuer allgemeiner Failure-Primitive. `composer_fail_callback_scene` bleibt auf seiner Allowlist
(`ccw:failed`, `ccw:legacy_route_blocked`, verifiziert). Sync.so-Scene-Verdicts gehören vollständig
`composer_apply_sync_segment_result`. `composer_fail_internal_dispatch` (später) für Mux-Invoke-Failures.
`composer_fail_post_plate_handoff` bleibt frozen. Audit: nach G3.2.2 darf es genau **einen** Sync.so-Scene-
Failure-Writer geben (B10/B15/B16/B17 werden ersetzt, nicht dupliziert).

## 10. Security-Vertrag

`SECURITY DEFINER`, `SET search_path = pg_catalog, public`, schema-qualifiziert, `service_role`-only
(REVOKE public/anon/authenticated), keine Default-Parameter, keine Overloads, geschlossene
`stage='sync_segment'`-Prüfung, Ledger-Zeile ist Autorität, Audit-Zeile für applied/rejected/noop.

## 11. Verbindliche Testmatrix (vor Implementierung fixiert)

S1 Erfolg, weitere offen → job succeeded / continue · S2 letzter Erfolg → genau 1× dispatch_mux ·
S3 Erfolg bei früherem Fail → job succeeded / scene fail · S4 Provider-Fail → job failed / korrektes Aggregat ·
S5 Duplicate success → noop · S6 conflicting duplicate → rejected · S7 stale run · S8 stale generation ·
S9 falsche Pass-Identität · S10 zwei finale Callbacks concurrent → 1× Mux · S11 kein Whole-JSON-Clobber ·
S12 keine Fremd-Slot-Mutation · S13 keine neue Ledger-Zeile/kein neuer Attempt · S14 kein `lipsync_muxing`
vor Mux-Owner · S15 kein `complete` aus Sync-Apply. Zusätzlich Frozen-Suite + `tsgo`.

## Späterer Scope (nach Abnahme)

Migration: `composer_apply_sync_segment_result` (+ interner Claim, + `composer_touch_lipsync_progress` intern).
Code: `sync-so-webhook` B4/B7/B9/B10/B12/B15/B16/B17 auf den RPC, Löschung B5/B14, Beibehaltung B6/B13
als reine Edge-Nebenwirkungen. Deliverable `docs/v431-g3-2-2-contract.md`. Danach STOP für Review.
