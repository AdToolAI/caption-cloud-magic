# v431 RS3 — Option A: Atomic Lip-Sync Reset Cancellation (Report)

Status: **RS3 IMPLEMENTED — READY FOR REVIEW** (Plan Rev. 5, `.lovable/plan/v431-rs3-option-a-atomic-lip-sync-reset-cancellation-2026-08-15.md`)

## 1. Was implementiert wurde

### DB-Primitive (SECURITY DEFINER, `search_path = pg_catalog, public`)
- `composer_reset_lipsync_with_attempt_cancellation(scene, expected_run, expected_generation, force)`
  — ein Commit: Advisory-Lock → Lip-Sync-Jobs `FOR UPDATE` → Scene `FOR UPDATE` → Run-/Generation-Guard →
  offene `sync_segment`/`audio_mux`-Attempts auf `cancelled` / `error_code = 'user_reset'` →
  Reset-Feldsatz → Reset-Marker `audio_plan.twoshot.rs3_reset` → Audit.
- `composer_rs3_acquire_core(..., _rearm_only)` — serialisierter Acquire unter demselben Advisory-Lock.
  Lock-Ordnung v431-konsistent: **Advisory → Job(s) → Scene** (keine Inversion gegen Callback-Apply).
- Wrapper `composer_acquire_lipsync_attempt_serialized` (Dispatch) und
  `composer_acquire_reset_rearmed_attempt` (rearm-only).
- Epoch-Fence: `composer_rs3_is_pre_reset_attempt(...)` (IMMUTABLE) + `composer_rs3_fence_verdict(scene, job)`.
- `composer_apply_sync_segment_result` = unveränderter G3.2.2-Body (`…_core`) hinter einem
  additiven Fence-Wrapper.

### Edge-Layer
- `reset-lipsync-scene` → nur noch RPC-Aufruf; Provider-Cancels und Credit-Refund sind
  Post-Commit-Best-Effort.
- `_shared/v431-ledger.ts` → `sync_segment` / `audio_mux` laufen ausschließlich über den
  serialisierten RS3-Pfad; alle übrigen Stages unverändert G3.1b.
- `_shared/v431-rs3-fence.ts` neu; eingebunden in `render-sync-segments-audio-mux`
  (vor Mux-Dispatch) und `remotion-webhook` (Mux- und Dialog-Stitch-Callback).
- `_shared/lipsync-fail.ts` respektiert `rs3_reset.refund_claimed` (kein Doppel-Refund).
- `src/lib/lipsyncReset.ts`: Direct-Clear-Zweig entfernt, jeder Reset geht über die Edge-Function.

## 2. Abnahmekriterium

**Nach dem Reset ist ein neuer Sync-Attempt im selben Run/Generation-Kontext wieder möglich.**
Nachgewiesen durch S7: `composer_acquire_lipsync_attempt_serialized` liefert nach dem Reset
`outcome = acquired`, `rs3_outcome = rearmed`, `attempt_no = 2` — ohne Run-Wechsel und ohne
Plate-Bump. Erfüllt: **JA**.

## 3. Testmatrix (transaktional, self-rollback, `/tmp/rs3_smoke.sql`)

**33 / 33 PASS** — S1/S1b Reset+Marker, S2/S2b Cancel offener Attempts + externe IDs,
S3/S3b Fremdstage unberührt + Segment-Autorisierung, S4/S4b stale_reset (Run und Generation),
S5 already_applied, S6 force + Quellwiederherstellung, **S7/S7b Abnahme-Rearm**,
S8 Epoch-Idempotenz (kein Duplikat), S9 verbrauchte Sync-Autorisierung,
S10 unautorisiertes Segment, S11/S11b Mux-Rearm + Verbrauch,
S12/S12b/S12c No-Predecessor-Pfad inkl. Konsum im selben Commit,
S13/S13b Passthrough ohne Marker (G3.1b unverändert), S14 rearm_only ohne Marker,
S15 aktiver Fremd-Vorgänger → fail closed, S16 Stage-Guard,
S17–S20b Fence-Verdikte, S21/S21b Apply-Guard ohne Resurrection, S21d Refund-Marker.

**Concurrency/Deadlock (zwei parallele psql-Sessions, beide Rollback):**
Reset-Session hält den Advisory-Lock, Acquire-Session wartet und läuft danach sauber durch —
kein Deadlock, kein Doppel-Acquire.

**Frozen-Suiten:** `vitest run src/lib/composer src/lib/video-composer` → 546 / 546 PASS
(G3.1, G3.1f, G3.2.2, v427, Intent-Gates). `tsgo --noEmit` → 0 Fehler.
Angepasst wurde nur die Writer-Inventur: `reset-lipsync-scene` ist jetzt ein atomarer
DB-Writer und steht in `ATOMIC_DB_WRITERS` statt in `FINALIZATION_POINTS`.

## 4. Writer- und Security-Audit

- `reset-lipsync-scene` schreibt nicht mehr direkt auf `composer_scenes`; verbleibende
  `.update(`-Aufrufe betreffen ausschließlich das Credit-Wallet-Refund.
- Einstiegspunkte (`composer_reset_lipsync_with_attempt_cancellation`,
  `composer_acquire_lipsync_attempt_serialized`, `composer_acquire_reset_rearmed_attempt`,
  `composer_rs3_fence_verdict`): EXECUTE nur `service_role`; PUBLIC/anon/authenticated revoked.
- Interne Helper (`composer_rs3_acquire_core`, `composer_rs3_is_pre_reset_attempt`,
  `composer_rs3_reset_cancellable_statuses`): kein direkter Grantee.
- `sandbox_exec_<ref>` bleibt als *accepted platform-internal ACL* (D1) dokumentiert.
- Der für die Smoke-Matrix nötige Ad-hoc-Grant an die Sandbox-Rolle wurde nach den Tests
  wieder **revoked** (`has_function_privilege(...) = false` verifiziert).

## 5. Deploy

Edge-Functions deployed: `reset-lipsync-scene`, `render-sync-segments-audio-mux`,
`remotion-webhook`, `sync-so-webhook`, `modelark-poll`, `recover-stuck-composer-clip`,
`lipsync-watchdog`.

## 6. Offen / nächster Schritt

Der blockierte Resmoke-Lauf (Szene `b34d1eae`) ist **nicht** angefasst worden — kein Reset,
kein Redrive, keine Reparatur ohne neue Freigabe. Nach Freigabe genügt ein UI-Reset der Szene,
um den Ledger-Block zu lösen und den Sync → Mux → Stitch-Resmoke zu wiederholen.

**STOP für Review.**
