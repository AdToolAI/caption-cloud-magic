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
