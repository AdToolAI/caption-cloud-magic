# v431 G3.2.2 — Sync Segment Authoritative Apply (Implementierung)

Grundlage: `docs/v431-g3-2-2-contract.md` (LOCKED). Kein Scope über den Contract hinaus,
keine G3.2.3-Arbeit, kein Produktions-Deploy.

## Vorbereitender Schritt (im Build-Modus zuerst)

Die drei Cleanup-Punkte (§3-Titel, Matrixspalte, RPC-Return `segment_result`) liegen bereinigt
vor. Der erste Build-Schritt schreibt exakt diese Fassung nach `docs/v431-g3-2-2-contract.md`,
damit die abgelegte Datei mit der freigegebenen Fassung übereinstimmt. Keine fachliche Änderung.

## 1. Migration (eine Migration, additiv)

- Neue RPC `composer_apply_sync_segment_result(_pipeline_job_id, _external_job_id, _write_id,
  _provider_status, _output_url, _error_text) RETURNS jsonb` als **sole owner** des
  Sync-Segment-Apply. Rückgabe: `{ applied, verdict, segment_result, scene_verdict, pass_idx,
  replacement_job_id, reason }`, wobei `segment_result` das pre-replacement Segment-Ergebnis ist,
  nicht der finale Ledger-Lifecycle-Status.
- Ablauf in einer Transaktion (Contract §2): `composer_pipeline_jobs FOR UPDATE` →
  `composer_scenes FOR UPDATE` → Guards → Pass-Apply → Fan-in-Aggregat → Scene/Mirror → Audit →
  Job-Terminalisierung.
- Serverseitige Ableitung des Slot-Patch aus `_write_id` + `_provider_status` (Contract §4);
  jede unzulässige Kombination ⇒ `rejected` ohne Mutation. Kein `_pass_patch`-Parameter.
- Pass-Guard: `scene_id`, `run_id`, `plate_generation`, `stage='sync_segment'`, gebundene
  Segment-/Speaker-Identität, plus bestätigende Pointer. Kein Whole-JSON-Replace, keine
  Fremd-Slot-Mutation.
- Aggregator übernimmt die Partial-Mux-Regel unverändert (`≤2` erlaubt Partial-Mux, `≥3` ⇒ fail).
- `composer_retryable_failure_reasons()` wird um `sync_noop_retryable` erweitert.
- NOOP-Escalate: Attempt auf `failed`/`sync_noop_retryable`, dann
  `composer_replace_pipeline_attempt` im selben Commit (Vorgänger endet `stale`/`replaced_by`),
  Pass-Paar atomar auf `pending` zurückgesetzt.
- Interner Claim `dialog_shots.audio_mux.mux_dispatch_requested_at` (re-drivable);
  `composer_touch_lipsync_progress` bleibt intern ohne Grant.
- Security: `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, schema-qualifiziert,
  `service_role`-only, keine Default-Parameter, keine Overloads.

## 2. `sync-so-webhook`-Migration

- B4, B7, B8, B9, B10, B12, B15, B16, B17 rufen ausschließlich den neuen RPC und handeln nur
  noch dessen Verdikt ab (`continue` | `dispatch_mux` | `fail` | `redispatch` | `noop` |
  `rejected`).
- Löschung: B5 (Reattach), B11 (Single-Speaker-Finalize), B14 (tote Retry-Ladder).
- Beibehaltung als reine Edge-Nebenwirkungen: B6 (Orphan-Cleanup), B13 (Dispatch-Log),
  Wallet-Refund, `acquireLedgerJob('audio_mux')` + Mux-Invoke, Re-Dispatch von
  `compose-dialog-segments` mit dem vom RPC gelieferten `replacement_job_id`.
- Kein `complete`/`applied`/`lip_sync_applied_at` mehr im Webhook; Complete-Pfad läuft über
  Mux-Owner → Finalizer.
- Exactly-once bleibt bei `acquireLedgerJob('audio_mux')` bzw.
  `composer_bind_sync_pass_attempt`.

## 3. Tests

- Vollständige Contract-Matrix S1–S17 inklusive S3b und S16b als DB-Smokes in Transaktionen
  (Rollback, keine Produktionsdaten-Mutation).
- Security-Smokes: keine Overloads, kein Grant an public/anon/authenticated, `search_path` gesetzt.
- Statischer Guard-Test: keine verbliebenen Whole-JSON-`dialog_shots`-Writes und kein
  `complete`/`applied`-Write im `sync-so-webhook`.
- Frozen-Suite komplett grün, plus `tsgo`.

## 4. Deliverable

`docs/v431-g3-2-2-report.md` mit Migrationsinhalt, Branch-Mapping, Smoke-Ergebnissen
(S1–S17/S16b), Security-Smokes, Suite-/tsgo-Ergebnis und explizitem Vermerk „kein Deploy“.
Danach STOP für Review.

## Nicht enthalten

Kein Produktions-Deploy, keine G3.2.3-Arbeit, keine Änderung an eingefrorenen Primitiven
(`composer_replace_pipeline_attempt`, `composer_bind_sync_pass_attempt`,
`composer_fail_callback_scene`, G3.1/G3.1f-Transport).
