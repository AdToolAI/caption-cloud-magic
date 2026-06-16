# Alpha-Plan v2 — Sync.so Multi-Speaker Pipeline

## Leitprinzip für v128
**Terminal means terminal.** Kein Provider-Outcome (COMPLETED, NOOP, UNKNOWN_ERROR, TIMEOUT) darf nach Eintragung in `composer_scenes.dialog_passes[i].status` jemals automatisch einen neuen Dispatch auslösen. Re-Dispatch ist ausschließlich expliziter User-Action vorbehalten.

---

## Stage 0.5 — Dispatch-Lock-Forensik (read-only, MANDATORY, vor v128)

**Ziel:** Vollständiges Mapping aller Codepfade, die Sync.so callen, und der Lock-Semantik. Erst danach darf v128 geschrieben werden.

**Deliverable:** `docs/lipsync/v127.5-dispatch-paths.md` mit:

1. **Dispatch-Path-Inventar** — alle Edge-Functions/Cron-Jobs, die `POST sync.so/v2/generate` (oder verwandte Endpoints) auslösen:
   - `compose-dialog-segments` (4094 LOC) — Erst-Dispatch
   - `poll-dialog-shots` (Cron) — Timeout-/Watchdog-Pfade
   - `sync-so-webhook` — NOOP-Retry-Pfad (Zeilen 486–537)
   - `compose-dialog-scene` — Stage 5 Multi-Speaker-Entry
   - Jeder weitere RPC/Function-Call, der `dispatchSyncSo()` o.ä. nutzt (grep nach `sync.so`, `lipsync-2`, `sync-3`)

2. **Lock-Semantik-Matrix** pro Pfad:
   | Pfad | Liest `dialog_dispatch_locks`? | Schreibt? | Lock-Key (scene/shot/pass/attempt)? | Atomar (INSERT … ON CONFLICT)? | Released wann? |
   |------|-------------------------------|-----------|--------------------------------------|-------------------------------|----------------|

3. **Loop-Forensik** für Scene `cba18767`:
   - Warum 21 Attempts? Welcher Pfad re-dispatchte nach `sync_completed_noop`?
   - Welcher Pfad re-dispatchte nach `provider_unknown_error`?
   - Wurde derselbe `passIdx` mehrfach mit neuem `provider_job_id` belegt?

4. **Terminal-Outcome-Audit** — grep nach allen Stellen, die `dialog_passes[i].status` mit terminalen Werten überschreiben UND danach erneut dispatchen können. Erwarteter Output: Liste der „Recycle-Stellen" im Code.

5. **Akzeptanzkriterien:**
   - ✅ Wir können exakt benennen: welche Pfade dispatchen, welche Locks benutzen, welche umgehen.
   - ✅ Wir kennen den genauen Codepfad jeder Recycle-Stelle (NOOP→Retry, UNKNOWN→Retry).
   - ✅ Wir wissen, ob `dialog_dispatch_locks` leer ist wegen „nie benutzt" oder „sauber released".

**Tool:** read-only Code-Walk via `acp_subagent--explore` + gezielte SQL-Audits. Keine Code-Änderungen.

**Geschätzte Dauer:** 60–90 Min.

---

## Stage 1 — v128 Hotfix (nach Stage 0.5)

### 1.1 Terminal-Status-Taxonomie (erweitert)

Neuer Enum für `dialog_passes[i].status`:

| Provider-Outcome | Neuer Status | Terminal? | Auto-Refund? | UI |
|-----------------|--------------|-----------|--------------|-----|
| `sync_completed` (valid) | `PASS_DONE` | ✅ | nein | grün |
| `sync_completed_noop` (sizeRatio≈1.0, low confidence) | `PASS_DONE_SUSPECT` | ✅ | **nein** | **gelber Badge „degraded"** |
| `sync_completed_noop` (CONFIRMED via 2nd-pass-validation) | `PASS_FAILED_QUALITY_CONFIRMED` | ✅ | ✅ | rot |
| `provider_unknown_error` | `PASS_FAILED_PROVIDER_UNKNOWN` | ✅ | ✅ | rot |
| `watchdog_provider_timeout` (8min) | `PASS_FAILED_TIMEOUT` | ✅ | ✅ | rot |
| `provider_failed` / `rejected` | `PASS_FAILED_PROVIDER` | ✅ | ✅ | rot |
| `429` / `rate_limited` | `QUEUED_BACKOFF` | ❌ | nein | gelb („queued") |
| stale webhook (älter als aktuelle `attempt_id`) | `IGNORE_STALE_WEBHOOK` | n/a | nein | (logged) |

**Invariant:** Kein `PASS_*` darf irgendwo im Code zu `DISPATCHED` zurückgesetzt werden außer durch expliziten User-Retry (neuer `attempt_id`).

### 1.2 NOOP- & Unknown-Error-Loops entfernen

- `sync-so-webhook/index.ts:486–537`: NOOP-Recovery-Block **entfernen**. NOOP → terminal mit `PASS_DONE_SUSPECT` (oder confirmed-fail nach Validation, siehe 1.6).
- Jede Stelle aus Stage-0.5-Audit, die nach `provider_unknown_error` neu dispatcht: entfernen. UNKNOWN → terminal.

### 1.3 Source-of-Truth-Konsistenz

- **Read** Pass-State: ausschließlich aus `composer_scenes.dialog_passes[passIdx]`.
- **Write** jeder Dispatch zusätzlich in `syncso_dispatch_log.meta`:
  ```json
  { "model", "variant", "payload_hash", "pass_idx", "attempt_id",
    "provider_job_id", "dispatch_source" }
  ```
- Migration: Backfill ist nicht nötig (87 alte Rows bleiben NULL); ab v128 müssen alle neuen Rows vollständig sein. CI-Check (siehe 1.7) failed bei NULL.

### 1.4 Lock-Härtung (Scope abhängig von Stage 0.5)

Erst spezifizieren **nach** Stage-0.5-Output. Zielbild (vorläufig):
- Unique-Constraint `(scene_id, pass_idx, attempt_id)` mit TTL 8min.
- Atomarer Claim via `INSERT … ON CONFLICT DO NOTHING RETURNING id`.
- Alle dispatchenden Pfade (compose-dialog-segments, poll-dialog-shots, webhook-Retry — falls noch existent) MÜSSEN denselben Claim respektieren.
- Cleanup-Cron alle 2 min für abgelaufene Locks.
- Konkrete Implementation wird erst nach Code-Walk fixiert.

### 1.5 sizeRatio = log-only

`sizeRatio`-Heuristik triggert **keinen** Retry mehr. Wird nur in `syncso_dispatch_log.meta.quality_metrics` geschrieben für spätere Analyse.

### 1.6 SUSPECT vs CONFIRMED — Validation-Pfad

Für v128 minimal:
- Default: NOOP → `PASS_DONE_SUSPECT` (kein Refund, gelber Badge).
- `PASS_FAILED_QUALITY_CONFIRMED` ist als Status definiert, aber der automatische Validator (2nd-pass face-detection auf Output) kommt erst in einer späteren Stage. Bis dahin: nur manueller Admin-Trigger setzt CONFIRMED.

### 1.7 Guard-Rails

- DB-Constraint / Trigger: blockiert UPDATE von `PASS_*` zurück auf `DISPATCHED` außer bei explizitem User-Retry-Flag.
- Edge-Function-Test: `syncso_dispatch_log.meta.variant IS NOT NULL` für jede neue Row (CI-fail bei NULL).
- Sentry-Alert: jeder Status-Übergang `PASS_* → DISPATCHED` ohne User-Retry-Flag = P1.

### Exit-Kriterien Stage 1
- 5 aufeinanderfolgende 3-Speaker-Renders ≤ 4 min ohne Loops.
- 0 Pass mit > 2 `provider_job_id`s in `syncso_dispatch_log` über 24h.
- Center-Speaker-Sync darf weiterhin schlecht sein (das löst Stage 4).

---

## Stage 2 — Audit-Layer (unverändert)

Per-pass Debug-Artefakte in `composer-debug` Bucket: `preflight.json`, `faces.json`, `sync_request.json`, `sync_response.json`. `debug_path` Spalte in `syncso_dispatch_log`. Cleanup-Cron > 14d.

---

## Stage 3 — UI / Refund (angepasst an 5-Status-Taxonomie)

- `PASS_DONE` → grün, kein Hinweis.
- `PASS_DONE_SUSPECT` → gelber Badge „Lipsync degraded — bitte prüfen", Re-Render-Button (kostet erneut), **kein Auto-Refund**.
- `PASS_FAILED_*` → roter Badge + Original-Plate-Audio als Fallback + **Auto-Refund** (`ceil(passSec)*9` Credits, idempotent über `(shot_id, pass_idx, attempt_id)`).
- `QUEUED_BACKOFF` → gelb „queued, retrying".

---

## Stage 4 — v129 Targeting A/B (Budget freigegeben, ABER erst nach v128-Stabilisierung)

**Gate:** Start frühestens, wenn Stage-1-Exit-Kriterien 48h grün laufen.

3 isolierte Edge-Functions auf 5 fixed Plates (2/3/4 Speaker, edge cases):
- **A:** `frame_number` + `coords` (current)
- **B:** `bounding_boxes_url` (deterministic ASD)
- **C:** Hybrid (bboxes_url + coords als fallback)

Metriken: `completion_outcome`, visual sync score 1–5, latency, refund rate. Winner → production, Verlierer → dokumentierter Fallback. Budget ~€9.

---

## Stage 5–7 (unverändert vs. Alpha-Plan v1)

- **Stage 5 v130 Speed:** Global semaphore (MAX_INFLIGHT=6), per-user cap (3), `Promise.allSettled` pass-parallelism, 429-backoff 1s–16s/max 3.
- **Stage 6 Observability:** Sentry-Cron, QA-Dashboard, daily digest, kill-switch.
- **Stage 7 Not done:** kein Model-Swap-Recovery, kein Segments-API, kein Client-Polling, keine Speculative Pre-Renders.

---

## Reihenfolge (verbindlich)

```text
Stage 0.5 (read-only, 60-90min)
        │
        ▼  Code-Walk-Report approved by user
Stage 1 / v128 Hotfix
        │
        ▼  Exit-Kriterien 48h grün
Stage 2 + 3 (Audit + UI/Refund)
        │
        ▼
Stage 4 / v129 A/B Targeting   (Budget €9)
        │
        ▼  Winner deployed
Stage 5 / v130 Speed
        │
        ▼
Stage 6 Observability
```

---

## Offene Punkte (vor Stage 1 Implementation zu klären)

1. **Stage-0.5-Output:** Welche Lock-Härtung konkret nötig? (Wird erst nach Code-Walk-Report beantwortet.)
2. **CONFIRMED-NOOP-Validator:** Welcher Mechanismus (2nd-pass face-detection, Heuristik, manuelle Admin-Review) entscheidet `PASS_DONE_SUSPECT → PASS_FAILED_QUALITY_CONFIRMED`? Aktueller Vorschlag: v128 nur SUSPECT; CONFIRMED-Pfad in eigener Stage 3.5.
3. **User-Retry-Flag:** Wie exposed? Button „Re-render with new attempt" auf SUSPECT/FAILED-Badge? (Vorschlag: ja, kostet erneut Credits, erzeugt neue `attempt_id`.)
