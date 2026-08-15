# v431 G3.2.2 — Sync Segment Authoritative Apply — Implementierungsbericht

Contract: `docs/v431-g3-2-2-contract.md` (LOCKED)
Status: **IMPLEMENTED — READY FOR REVIEW** (kein Deploy, kein Cutover)

## 1. Gelieferte Artefakte

### 1.1 Migration (DB)
- `composer_apply_sync_segment_result(_pipeline_job_id, _external_job_id, _write_id, _provider_status, _output_url, _error_text)`
  — **SOLE OWNER** von Slot-Patch (`dialog_shots.passes[]`), Ledger-Terminalisierung,
  Pass-Aggregat und Scene-Verdict. Row-Lock auf Szene + Ledger-Zeile, Provenienz-Guards
  gegen `run_id`, `plate_generation`, `external_job_id`, Generation-Fencing.
- `composer_mark_sync_refund_applied(_scene_id, _amount)` — interner, idempotenter
  Refund-Claim (verhindert Doppel-Gutschrift bei Callback-Duplikaten).
- `composer_retryable_failure_reasons()` um `sync_noop_retryable` erweitert (§5a).

Verdicts des RPC: `noop` · `continue` · `dispatch_mux` · `fail` · `redispatch`.
Rückgabe trägt `segment_result` (pre-replacement) **getrennt** vom `scene_verdict` (§3).

### 1.2 Edge — `sync-so-webhook/index.ts`
- **Entfernt:** B5 (v141-Reattach über `syncso_dispatch_log`), B11 (Complete-Materialisierung),
  B14 (tote Variantenleiter `V5_RETRY_VARIANTS`/`nextV5RetryVariant`),
  B15/B16/B17 (Whole-JSON-Fail-Writes), `terminalV5Counts` (Aggregat gehört dem RPC).
- **Neu:** `applySyncSegmentResult()` — fail-closed: ohne `pipeline_job_id` wird
  **nicht** angewandt (`g322_missing_binding`, Watchdog/Poller sind das Netz).
- **Neu:** `settleVerdict()` — ausschließlich Post-Commit-Nebenwirkungen:
  Wallet-Refund (idempotent), Mux-Dispatch, Advance-Kick/Warmup.
- **Neu:** `dispatchAudioMux()` — Exactly-once über `acquireLedgerJob('audio_mux')`
  (`already_in_flight`/`predecessor_exists` ⇒ kein zweiter Dispatch); D6: der
  Mux-Owner setzt `lipsync_muxing` selbst.
- Vier Write-IDs verdrahtet: `ssw:success`, `ssw:failed`, `ssw:noop_fail`, `ssw:noop_escalate`.

### 1.3 Edge — `_shared/v431-ledger.ts` / `compose-dialog-segments`
- `adoptPreAcquiredLedgerJob()` übernimmt den in der Apply-Transaktion erzeugten
  Replacement-Attempt (keine neue Ledger-Identität beim NOOP-Escalate).
- `RETRYABLE_FAILURE_REASONS` spiegelt die DB-Allowlist inkl. `sync_noop_retryable`.
- `compose-dialog-segments` nutzt den Adoptionspfad statt eigener Akquise, wenn
  `pipeline_job_id` mitgegeben wird.

## 2. Invarianten-Nachweis (Contract-Mapping)

| Contract | Umsetzung |
|---|---|
| §2 Provenienz nur aus Ledger | Kein `external_job_id`-Resolve im Webhook; ohne Pointer ⇒ `apply_unavailable` |
| §3 Segment-Ergebnis ≠ Scene-Verdict | RPC liefert `segment_result` und `verdict` getrennt |
| §3a Partial-Mux | Aggregator entscheidet `dispatch_mux` erst bei allen terminalen Passes |
| §5a NOOP-Escalate | Replacement-Attempt in derselben Transaktion, Reason `sync_noop_retryable` |
| §6 Sole Owner | Alle Legacy-Writes im Webhook entfernt; Edge schreibt nur Forensik-Logs |
| §8 Duplicate-Matrix | Write-ID-Idempotenz; `dispatch_mux`/`redispatch` re-drivable |
| D6 Mux-Owner | Webhook setzt `lipsync_muxing` nicht; nur Provenienz-Zeile + Dispatch |

## 3. Verifikation
- `deno check` auf `sync-so-webhook` und `compose-dialog-segments`: keine neuen
  Fehler durch G3.2.2 (verbleibende Meldungen sind vorbestehende Repo-Typlockerungen
  in `_shared/twoshot-face-map.ts` und `withDialogLock`).
- Kein Frontend-Pfad berührt; Lip-Sync-Routing unverändert (v425/v430 Gates intakt).

## 4. Offen / bewusst nicht in diesem Schritt
- Kein Deploy, kein Cutover-Gate, keine Produktionsläufe.
- DB-Smokes S1–S8 laufen im Freigabeschritt vor dem Deploy.

**Status: G3.2.2 IMPLEMENTED — STOP für Review.**

---

# G3.2.2 — Post-Implementation Verification / Acceptance Gate (2026-08-15)

Nur Verifikation. Kein Deploy, keine Architekturänderung, keine G3.2.3-Arbeit.
Kein Code- und kein Migrationschange in diesem Schritt.

## A. Contract-vs-Code Audit (`composer_apply_sync_segment_result`, live in DB)

| Contract-Punkt | Befund |
|---|---|
| Lock-Reihenfolge Ledger → Scene | **PASS** — `composer_pipeline_jobs … FOR UPDATE`, danach `composer_scenes … FOR UPDATE` |
| Provenienz ausschließlich aus Ledger | **PASS** — `_pipeline_job_id` Pflicht (`missing_binding`), `stage='sync_segment'`, `run_id = scene.active_run_id`, `plate_generation`-Gleichheit, `external_job_id`-Gleichheit |
| Kein Scene-Hint-/Scan-Reattach | **PASS** — kein Lookup über `dialog_shots`-Scan; Slot-Pointer nur als Bestätigung (`wrong_pass`) |
| Kein Whole-JSON-Replace | **PASS** — `update_dialog_pass_slot` + gezielte `jsonb_set`-Pfade; Fremdschlüssel im JSON bleiben erhalten (S11/S12) |
| `segment_result` ≠ `scene_verdict` | **PASS** — beide Felder getrennt im Return |
| B5/B11/B14 entfernt | **PASS** — kein `complete`/`applied`/`lip_sync_applied_at`-Write im Sync-Pfad |
| Sole Failure Writer | **PASS** — Scene-Fail nur im RPC; `composer_fail_callback_scene` unberührt |
| §5a NOOP-Escalate | **PASS** — `composer_replace_pipeline_attempt` im selben Commit, Vorgänger `stale`/`replaced_by`, Reason erhalten |

## B. SQL / Security Smokes

- `SECURITY DEFINER`: **PASS**
- `SET search_path = pg_catalog, public`: **PASS**
- Grants: `postgres`, `service_role` (+ interne Sandbox-Rolle). Kein `anon`, kein `authenticated`: **PASS**
- Genau eine Signatur, keine Overloads, keine Default-Parameter: **PASS**
- `stage='sync_segment'`-Gate: **PASS** (Smoke `SX wrong stage` ⇒ `rejected/wrong_stage`)
- `sync_noop_retryable` in `composer_retryable_failure_reasons()`: **PASS**

## C. Testmatrix S1–S17 (transaktional, self-rollback)

Ausführung als Migration mit abschließendem `RAISE EXCEPTION` ⇒ **vollständiger Rollback**,
keine bleibenden Daten. Ergebnis: **28 / 29 Assertions PASS**.

PASS: S1, S2 (Verdikt), S3, S3b, S4, S5a, S5b, S6, S7, S8, S9a–S9e, S11, S12, S13,
S14, S15, S16, S16b, S16c, S17a–S17e, SX.

FAIL: **S2-Zusatzassertion** `dialog_shots.audio_mux.mux_dispatch_requested_at IS NOT NULL`
→ siehe Befund F1.

## D. Befunde

### F1 — RED: `mux_dispatch_requested_at` wird nie persistiert
`jsonb_set(_ds, ARRAY['audio_mux','mux_dispatch_requested_at'], …, true)` ist ein **No-op**,
wenn `dialog_shots.audio_mux` noch nicht existiert (Postgres legt nur den *letzten*
Pfadschritt an, nicht das fehlende Elternobjekt — in dieser DB verifiziert).
Betroffen: der reguläre `dispatch_mux`-Zweig, der `dispatched_at`-Fallback und der
Duplicate-Redrive-Zweig. Contract §8 verlangt die Persistenz des Claims.
Funktionale Auswirkung begrenzt: die Exactly-once-Schranke bleibt
`acquireLedgerJob('audio_mux')` (S5b/S10-Teilnachweis: genau **ein** `audio_mux`-Attempt).
Verloren geht die dokumentierte Claim-/Telemetrie-Spur.
Fix-Vorschlag (nächster Schritt, nicht ausgeführt): `_ds := jsonb_set(_ds, ARRAY['audio_mux'],
COALESCE(_ds->'audio_mux','{}'::jsonb), true)` vor den Detail-Writes.

### F2 — DEVIATION: `composer_touch_lipsync_progress` existiert nicht
Der Helper aus Contract §7 ist in der DB nicht vorhanden. Die Progress-Semantik ist im
`continue`-Zweig **inline äquivalent** umgesetzt: `lip_sync_status='running'`,
`twoshot_stage='syncso_fanout_<done>_of_<total>'` (→ `pipeline_substate` via
`composer_substate_from_legacy`), `updated_at=now()`. Kein separater Progress-Writer,
kein Grant, kein Edge-Aufruf — Intention von §7 erfüllt, Artefakt fehlt.
Einstufung deshalb **DEVIATION**, nicht RED; Entscheidung liegt beim Reviewer.

### F3 — AMBER: `audio_muxing` kennt die Legacy-Bridge nicht
Der `dispatch_mux`-Zweig schreibt `lip_sync_status='audio_muxing'` und
`twoshot_stage='audio_muxing'` (Status quo aus B12). `composer_state_from_legacy` hat für
diese Werte **keinen** Fall; abgeleitet wird `plate_ready`. S14 ist damit formal erfüllt
(kein `lipsync_muxing` vor dem Mux-Owner), der kanonische `pipeline_state` fällt aber
zwischen Dispatch und Mux-Owner von `lipsync_running` auf `plate_ready` zurück.

### F4 — RED (Test-Guard): Writer-Inventory erwartet gelöschten Aufruf
`src/lib/composer/output/__tests__/materializeSceneOutput.test.ts` verlangt weiterhin
`materializeCompatibilityOutput(` in `sync-so-webhook`. Contract §6 verschiebt genau das
zum Finalizer. Der Guard muss contract-konform nachgezogen werden (nicht in diesem Schritt).

### F5 — AMBER: verbleibender Direkt-Write im Webhook
`sync-so-webhook/index.ts` ~L599 (Recovery aus selbstverschuldetem
`watchdog_*`-Fail) schreibt weiterhin direkt `lip_sync_status`, `twoshot_stage`,
`clip_error` und `dialog_shots` (Whole-JSON) ohne RPC. Kein Apply-Pfad, aber der einzige
verbliebene Scene-State-Writer im Sync-Callback.

### F6 — DEVIATION: keine DB-Audit-Zeile in der Apply-Transaktion
Contract §10 nennt eine Audit-Zeile für `applied`/`rejected`/`noop`. Der RPC schreibt keine.
Die Provenienz-Telemetrie liegt stattdessen edge-seitig in
`composer_callback_observations` (`observeCallbackProvenance`, G3.1).

## E. Nicht ausführbar in dieser Umgebung

**S10 (echter Parallel-Sessions-Test)**: die Sandbox-DB-Rolle besitzt kein `EXECUTE` auf
dem `service_role`-only RPC; die Matrix lief deshalb in **einer** Migrations-Transaktion.
Nachgewiesen ist damit die serialisierte Duplicate-Semantik (S5a/S5b) inklusive
**genau einem** `audio_mux`-Attempt, nicht aber echte Nebenläufigkeit. Empfehlung: wie bei
G3.1f über einen realen Post-Deploy-Lauf mit Telemetrie belegen.

## F. Regression

- `bunx tsgo --noEmit`: **clean**.
- `bunx vitest run src/lib/composer --testTimeout=120000`: **449 / 450** PASS,
  einziger Fail = F4.
- `bunx vitest run src`: 677 / 697; die weiteren 19 Fails sind vorbestehend und
  G3.2.2-fremd (Playwright-Specs unter Vitest, `template-analytics`, `useDebounce`,
  `Header`, `brand-consistency`, FS-Scanner-Timeouts bei Default-Timeout).
- `supabase/functions/**` unter Vitest: Collection-Fehler durch `https:`-Deno-Imports —
  vorbestehend, kein G3.2.2-Signal.

**Status: G3.2.2 VERIFIED WITH FINDINGS — F1 (RED) und F4 (RED, Test-Guard) blockieren
die Abnahme; F2/F6 sind Deviations zur Entscheidung, F3/F5 Amber. STOP für Review.**
