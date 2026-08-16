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

---

# G. Acceptance Remediation R1 (2026-08-15)

Scope: ausschließlich die sechs Acceptance-Befunde + S10-Ausführbarkeit. Keine neue
Architektur, kein Production-Deploy.

## R1 — F1 `mux_dispatch_requested_at`

`composer_apply_sync_segment_result` erzeugt/merged den Parent
(`jsonb_set(_ds, '{audio_mux}', COALESCE(_ds->'audio_mux','{}'), true)`) und setzt danach
**ausschließlich** `audio_mux.mux_dispatch_requested_at`. `dispatched_at` wird vom
Apply-RPC nicht geschrieben — Exactly-once bleibt am `composer_acquire_pipeline_attempt('audio_mux')`.
Gilt für den Erst-Verdikt-Pfad **und** den Duplicate-Redrive-Pfad.
Smokes: `R1 mux_dispatch_requested_at set` PASS, `R1 no dispatched_at written` PASS, `S2` PASS.

## R2 — F2 `composer_touch_lipsync_progress`

Interner Helper eingeführt (`SECURITY DEFINER`, `search_path = pg_catalog, public`),
die bisher inline vorhandene Progress-Semantik (`dialog_shots`, `lip_sync_status='running'`,
`twoshot_stage='syncso_fanout_<done>_of_<total>'`, `updated_at`) ist dorthin verschoben.
Security-Nachweis (`has_function_privilege`): `PUBLIC`/`anon`/`authenticated`/`service_role`/
`sandbox_exec` = **EXECUTE false**; Aufruf nur RPC-intern.

## R3 — Legacy→State-Bridge (monoton)

`composer_state_from_legacy` kennt `audio_muxing` und mappt es auf höchstens
`lipsync_running` (nie `lipsync_muxing`). Zusätzlich klemmt `composer_scene_state_bridge`
den Legacy-Zweig monoton: steht die Szene bereits auf `lipsync_muxing`/`complete`, wird
sie durch den Legacy-Marker `audio_muxing` **nicht** zurückgestuft.
Smokes: `R3 no state regression on mux handoff` PASS, `R3b monotone bridge` PASS.

## R4 — Stale Test Guard

`materializeSceneOutput.test.ts`: `sync-so-webhook/index.ts` von `FINALIZATION_POINTS`
nach `ATOMIC_DB_WRITERS` (RPC `composer_apply_sync_segment_result`) verschoben —
entspricht dem gelockten §6-Vertrag. 11/11 PASS.

## R5 — Recovery-Direct-Write entfernt

Der Direct-Write in `sync-so-webhook` (ehem. L598–607) ist entfernt; der Branch ist
write-free und delegiert. Die Recovery ist als eng geguardete Vorstufe **im** RPC
implementiert: nur nach bestandener Ledger-/Job-/Run-/Generation-/Pass-Provenienz, nur bei
`ssw:success`, nur für `clip_error ~ '^watchdog_(provider_timeout|auto_retry_|hard_timeout)'`.
Sie nimmt ausschließlich die Failure-Mirrors zurück (`clip_error=NULL`,
`lip_sync_status='running'`, `dialog_shots.status='rendering'`, `recovered_from_watchdog_at`)
und läuft danach in denselben normalen Apply weiter.
Smokes: `R5 watchdog recovery in RPC` PASS, `R5b no recovery for real failure` PASS.

## R6 — DB-Audit im selben Commit

Interner Writer `composer_log_sync_segment_audit` schreibt nach
`composer_scene_transition_log` (`source_signature='g322_sync_segment'`,
`caller_class='sync_segment_apply'`, `detail` = Provenienz-/Verdikt-JSON).
Auditiert werden **alle** Verdikte ab autoritativ aufgelöster Ledger-Zeile
(applied / noop / redispatch / dispatch_mux / rejected); fachliche Rejects kehren normal
zurück, das Audit bleibt committed. Pre-Resolution-Fälle (`missing_binding`,
`job_not_found`, write_id-Matrix) schreiben **keine** DB-Zeile und bleiben in
`composer_callback_observations`. Echte Invarianz-/Security-Korruption bleibt Exception.
Smokes: `R6 audit row on applied`, `R6 audit row on rejected`, `R6 audit caller class`,
`R6b no audit before ledger resolution` — alle PASS.

## R7 — S10 als echter Parallelitätstest

Temporärer Ad-hoc-Grant (kein Migrationsartefakt) an die Sandbox-Rolle, zwei **parallele
psql-Sessions** mit gemeinsamer Startzeit auf denselben letzten Pass:

- Session A: `verdict=dispatch_mux, applied=true` → `acquire('audio_mux') = acquired` → `PROVIDER_INVOKE=true`
- Session B: `verdict=noop, reason=duplicate_callback` → kein Acquire → `PROVIDER_INVOKE=false`
- `audio_mux`-Attempts für die Szene: **1**
- `dialog_shots.audio_mux` enthält nur `mux_dispatch_requested_at`

Nur der Acquire-Gewinner zählt/führt den simulierten Provider-Invoke aus. Fixture und
Audit-Zeilen wurden anschließend gelöscht, der Grant **revoked**
(`has_function_privilege('sandbox_exec', …) = false`, Nachweis nach Cleanup).

## Recheck-Ergebnis

- SQL-Smoke-Matrix S1–S17 + R1/R3/R5/R6: **40 / 40 PASS**.
- S10 Parallel-Harness: **PASS** (siehe oben).
- Static Writer Guard `sync-so-webhook`: kein `.update(`/`.upsert(` auf `composer_scenes`
  mehr; verbleibender `.update(` betrifft ausschließlich das Credit-Wallet-Refund.
- Security: `composer_apply_sync_segment_result` = SECURITY DEFINER,
  `search_path = pg_catalog, public`, EXECUTE nur `service_role`;
  `composer_touch_lipsync_progress` und `composer_log_sync_segment_audit` ohne jeden
  EXECUTE-Grantee.
- `vitest run src/lib/composer`: **450 / 450 PASS** (F4 geschlossen).

**Status: G3.2.2 ACCEPTANCE GREEN — alle sechs Befunde geschlossen, S10 ausgeführt.
Kein Deploy erfolgt. STOP für Review.**

---

# G3.2.2 — Production Deploy Review / Cutover Gate

Stand: 2026-08-15, ~19:15 UTC. **Kein Deploy erfolgt.** Dieser Abschnitt ist reiner
Deploy-Review + Cutover-/Resmoke-Plan. Kein G3.2.3, keine Codeänderung.

## 1. Production-Diff (artifact → reason → production required)

| Artefakt | Grund | Production nötig |
| --- | --- | --- |
| `supabase/migrations/20260815180037_55565e74-….sql` — `composer_retryable_failure_reasons()` (+`sync_noop_retryable`), `composer_mark_sync_refund_applied`, erste Fassung `composer_apply_sync_segment_result` | Basis-Vertrag G3.2.2 | **ja** |
| `supabase/migrations/20260815185301_73dee86e-….sql` — `composer_touch_lipsync_progress` (R2), `composer_log_sync_segment_audit` (R6), `composer_state_from_legacy` + `composer_scene_state_bridge` (monotoner `audio_muxing`-Fix, R3), finale Fassung `composer_apply_sync_segment_result` (R1 ohne `dispatched_at`, R5 geguardete Recovery-Vorstufe, R6 Audit-Write) | Acceptance-Remediation R1 | **ja** |
| Edge Function `sync-so-webhook` | einziger Laufzeit-Konsument des neuen Apply-Vertrags | **ja** |
| `docs/v431-g3-2-2-contract.md`, `docs/v431-g3-2-2-report.md` | Dokumentation | nein |
| `src/lib/composer/output/__tests__/materializeSceneOutput.test.ts`, SQL-Smoke-Skripte (`/tmp/g322_smoke.sql`) | Test/CI, kein Runtime-Artefakt | nein |
| Frontend-Produktivcode (`src/**` außer Tests) | im G3.2.2-Scope unverändert | nein (kein Frontend-Deploy) |

Nachweise (read-only, ausgeführt):

- `rg -n "sandbox_exec" supabase/migrations/20260815180037_*.sql supabase/migrations/20260815185301_*.sql` → **0 Treffer**.
  Die fünf `sandbox_exec%`-Treffer im Migrationsbaum stammen aus älteren G3.1-Migrationen
  (`composer_record_callback_observation`, `composer_reap_cron_tick`) und sind nicht Teil des
  G3.2.2-Diffs. Der temporäre R7-Grant war ad hoc und ist revoked.
- Einzige `GRANT`-Zeilen in beiden G3.2.2-Migrationen: `… TO service_role` für
  `composer_apply_sync_segment_result` und `composer_mark_sync_refund_applied`.
  `composer_touch_lipsync_progress` und `composer_log_sync_segment_audit` enthalten
  ausschließlich `REVOKE` (inkl. `service_role`).
- `composer_replace_pipeline_attempt` wird in keiner der beiden Migrationen definiert
  (kein `CREATE OR REPLACE`), nur aufgerufen. Referenz-Hash der aktuellen Definition:
  `md5(pg_get_functiondef) = c4649e65440a64997376617721792aa8` — dient als Vor-/Nach-Vergleich.
- Keine G3.2.3-/G4-Artefakte: keine Änderung an `compose-clip-webhook`, `remotion-webhook`,
  `compose-dialog-segments`, `composer_bind_plate_attempt`, `composer_bind_sync_pass_attempt`.
- Genau eine Signatur je neuer Funktion (`pg_proc`-Count = 1 für alle drei).

### D1 — Sandbox-Rolle: nachweislich plattformintern (D1-a akzeptiert)

Messung (`pg_roles`, `pg_auth_members`):

| Rolle | login | Mitglied in | Mitglieder |
| --- | --- | --- | --- |
| `sandbox_exec_lbunafpxuskwmsrraqxl` | ja | — | nur `postgres` |
| `anon` / `authenticated` / `service_role` | nein | — | — |
| `authenticator` (PostgREST-Login) | ja | — | — |

- `authenticator` ist **nicht** Mitglied der Sandbox-Rolle; PostgREST kann per `SET ROLE` nur nach `anon`/`authenticated`/`service_role` wechseln. Edge Functions nutzen ausschließlich den Data-API-Pfad bzw. `service_role`.
- Einziges Mitglied der Sandbox-Rolle ist `postgres` (Plattform-Superrolle). Kein Client- und kein Function-Pfad kann sie annehmen.
- Die Rolle ist der Login der Lovable-Exec-Sandbox (`current_user = sandbox_exec`), also plattforminterne Toolchain, nicht Teil der Client-/Edge-Angriffsfläche. Dieselbe ACL besteht bereits bei den eingefrorenen G3.1-Primitiven.

**Entscheidung: D1-a.** Kein Pattern-REVOKE, kein Hardcoding einer umgebungsspezifischen Rolle in Produktionsmigrationen.

Ist-Zustand der G3.2.2-Funktionen:

```text
composer_apply_sync_segment_result  → service_role=X, sandbox_exec_lbunafpxuskwmsrraqxl=X
composer_touch_lipsync_progress     → sandbox_exec_lbunafpxuskwmsrraqxl=X (kein service_role)
composer_log_sync_segment_audit     → sandbox_exec_lbunafpxuskwmsrraqxl=X (kein service_role)
```

Der Security-Vertrag §4 wird redaktionell so präzisiert (kein Code-, kein SQL-Change):

- `PUBLIC = false`
- `anon = false`
- `authenticated = false`
- öffentlicher Apply-RPC `composer_apply_sync_segment_result`: `service_role = true`
- interne Helper `composer_touch_lipsync_progress`, `composer_log_sync_segment_audit`: kein direkter `service_role`-EXECUTE
- `sandbox_exec_lbunafpxuskwmsrraqxl` = platform-internal role, kein Client-/Edge-Pfad, **accepted platform-internal ACL** (mit obigem Nachweis im Bericht)

**§4 Security-Smoke ist damit grün.**


## 2. Pre-Deploy In-flight Gate (read-only)

Regel: Deploy **nur** bei 0 relevanten alten in-flight Sync-Apply-Runs. Terminalität wird
ausschließlich am kanonischen `pipeline_state` gemessen (`complete`, `failed`, `canceled`);
kein Legacy-Mirror überschreibt diese Entscheidung. Bei >0 regulär drainen; kein
Runtime-Fallback, kein Backfill/Rewrite alter Jobs ohne explizite neue Freigabe.

```sql
-- G1: nonterminale Scene + offener sync_segment-Job
select j.id, j.scene_id, j.status, j.external_job_id, j.created_at, s.pipeline_state
from public.composer_pipeline_jobs j
join public.composer_scenes s on s.id = j.scene_id
where j.stage = 'sync_segment'
  and j.status in ('pending','dispatching','dispatched','running')
  and s.pipeline_state not in ('complete','failed','canceled');

-- G2: Szenen in aktiven kanonischen Lip-Sync-States
select id, pipeline_state, pipeline_substate, active_run_id, plate_generation, updated_at
from public.composer_scenes
where pipeline_state in ('lipsync_dispatched','lipsync_running','lipsync_muxing');

-- G3: nonterminale Scene + offener audio_mux-Job
select j.id, j.scene_id, j.status, j.created_at, s.pipeline_state
from public.composer_pipeline_jobs j
join public.composer_scenes s on s.id = j.scene_id
where j.stage = 'audio_mux'
  and j.status in ('pending','dispatching','dispatched','running')
  and s.pipeline_state not in ('complete','failed','canceled');

-- G4: echter Replacement-Attempt in Zustellung
select r.id, r.scene_id, r.stage, r.status, p.id as predecessor_id, r.created_at
from public.composer_pipeline_jobs p
join public.composer_pipeline_jobs r on r.id = p.replaced_by
where r.status in ('dispatching','dispatched');

-- G5: nonterminaler Scene-Pass oder tatsächlich gebundener nichtterminaler Ledger-Job
select s.id as scene_id, x->>'job_id' as job_id, x->>'status' as pass_status,
       x->>'pipeline_job_id' as pipeline_job_id
from public.composer_scenes s,
     lateral jsonb_array_elements(coalesce(s.dialog_shots->'passes','[]'::jsonb)) x
where x->>'job_id' is not null
  and coalesce(x->>'status','') not in ('done','failed','canceled')
  and (
    s.pipeline_state not in ('complete','failed','canceled')
    or exists (
      select 1 from public.composer_pipeline_jobs j
      where j.id::text = x->>'pipeline_job_id'
        and j.status in ('pending','dispatching','dispatched','running')
    )
  );
```

**Gate grün = G1, G2, G3, G4, G5 liefern exakt 0 Rows.**

### Klassifikation der 44 historischen Pass-Slots (alte Gate-Fassung)

Join gegen Scene-State und Ledger (44 Rows / 34 Szenen):

| Scene `pipeline_state` | Pass-Status | `pipeline_job_id` | Ledger-Job | Rows |
| --- | --- | --- | --- | --- |
| `failed` | `rendering` | fehlt | keiner | 16 |
| `failed` | `retrying` | fehlt | keiner | 14 |
| `failed` | `canceled_by_scene_failure` | fehlt | keiner | 8 |
| `canceled` | `rendering` | fehlt | keiner | 3 |
| `complete` | `rendering` | fehlt | keiner | 3 |

- **Alle** zugehörigen Szenen stehen terminal (`failed` / `canceled` / `complete`).
- **Keine** Row trägt eine `pipeline_job_id`; es existiert kein korrespondierender Ledger-Job.
- Jüngste Szenen-Aktualisierung: `2026-08-14 01:13Z` — nichts davon ist jünger als der G3.1-Cutover.

→ Klassifikation: **orphaned stale metadata** aus vor-Ledger-Runs. Diese Rows werden **nie** natürlich drainen; „warte bis G5 = 0" ist ein unerreichbares Gate.

### G1/G3-Observe-Mode-Befund (alte Gate-Fassung)

Die 8 offenen Ledger-Attempts (4× `sync_segment`, 4× `audio_mux`, alle `dispatched`) gehören **alle derselben Szene** `b34d1eae-6bf3-437d-a6ab-624be0155adc` an — und die steht bereits auf `pipeline_state = complete` (17:26Z). G3.1 lief als Observe-Mode: die Attempts wurden gebunden, aber nie terminalisiert. Auch das drainiert nicht von selbst.

### Baseline-Messung 2026-08-15 ~19:14 UTC (korrigierte Gate-Fassung)

| Gate | Rows | Befund |
| --- | --- | --- |
| G1 | 0 | keine nonterminale Szene mit offenem `sync_segment`-Job |
| G2 | 0 | grün |
| G3 | 0 | keine nonterminale Szene mit offenem `audio_mux`-Job |
| G4 | 0 | grün (keine Replacement-Kette in Zustellung) |
| G5 | 0 | historische Pass-Slots gehören terminalen Szenen (`failed`/`canceled`/`complete`) und fallen definitorisch heraus |

**Gate alter Fassung war unerreichbar / kein Cutover-Blocker:**

- G1/G3 (alte Fassung): 8 offene Ledger-Attempts (`sync_segment`/`audio_mux`, alle `dispatched`),
  gehören alle zur selben Szene `b34d1eae-6bf3-437d-a6ab-624be0155adc`, die bereits
  `pipeline_state = complete` steht (G3.1 Observe-Mode, nie terminalisiert).
- G5 (alte Fassung): 44 Pass-Slots ohne `pipeline_job_id`, jüngste Szenen-Aktualisierung
  `2026-08-14 01:13Z`, alle zugehörigen Szenen terminal → orphaned stale metadata aus
  pre-Ledger-Runs.

Konsequenz: Das **korrigierte Gate ist heute 0/0/0/0/0**. Die historischen Rows bleiben
unangetastet; kein Cleanup, kein Backfill, kein „Schönmachen" vor dem Deploy.

## 3. Deploy-Reihenfolge

1. Pre-Deploy In-flight Gate (§2) **exakt 0/0/0/0/0**.
2. DB-Migrationen in Reihenfolge `20260815180037` → `20260815185301`
   (RPCs, Retry-Allowlist, Bridge-Fix).
3. DB-Security-Smoke (§4).
4. Edge Function `sync-so-webhook` deployen, Zeitstempel festhalten.
5. Post-Deploy Static-/Version-Sanity: deployte Function-Version protokollieren; Guard
   „kein `complete`/`applied`-Write und kein Whole-JSON-`dialog_shots`-Write im Webhook“.
6. Erst danach echter UI-Resmoke (§5).

Begründung Zwischenzustände: DB-first ist der einzig kollisionsfreie Weg. Die drei Funktionen
sind additiv, der noch laufende alte Webhook ruft sie nicht auf — Schritt 2 erzeugt daher keine
Inkompatibilität. Webhook-first würde dagegen `composer_apply_sync_segment_result` aufrufen,
bevor die Signatur existiert. Da es je Funktion genau eine Signatur und keine Overloads gibt,
existiert kein Ambiguitätsfenster.

## 4. Unmittelbarer Post-Deploy Security-Smoke (vor UI-Run)

- `composer_apply_sync_segment_result`: genau eine Signatur, `prosecdef = t`,
  `proconfig = search_path=pg_catalog, public`, `service_role` EXECUTE = `true`;
  `anon` = `false`, `authenticated` = `false`, PUBLIC = `false`.
  **D1-a (akzeptiert):** `sandbox_exec_lbunafpxuskwmsrraqxl` trägt aufgrund von Plattform-Default
  Privileges ebenfalls EXECUTE. Nachweislich ist diese Rolle plattformintern: nur `postgres`
  ist Mitglied, `authenticator` (PostgREST-Login) kann sie nicht annehmen, und Client-/Edge-Pfade
  laufen ausschließlich über `anon`/`authenticated`/`service_role`. Sie entspricht dem bereits
  eingefrorenen G3.1-Plattformmuster. Kein projekt-/umgebungsspezifisches REVOKE in
  Produktionsmigrationen. Im Security-Vertrag dokumentiert als **accepted platform-internal ACL**.
- `composer_touch_lipsync_progress`: kein EXECUTE-Grantee, auch nicht `service_role`
  (heute erfüllt für `service_role` = `false`). Nur interne Verwendung.
- `composer_log_sync_segment_audit`: identische Anforderung.
- `composer_replace_pipeline_attempt`: `md5(pg_get_functiondef)` muss
  `c4649e65440a64997376617721792aa8` bleiben.
- `select public.composer_retryable_failure_reasons()` enthält `sync_noop_retryable`
  (heute bestätigt: `{provider_transient_error, provider_timeout, provider_rate_limited,
  dispatch_uncertain_recovery, watchdog_stalled, poller_timeout, mux_redispatch,
  sync_noop_retryable}`).
- Bridge-Smoke in Transaktion mit Rollback: Szene in `lipsync_muxing` + Legacy-Write
  `lip_sync_status = 'audio_muxing'` → bleibt `lipsync_muxing`, kein Rückfall auf
  `plate_ready`/`lipsync_running`.

## 5. Echter Production-Resmoke

Kette: `sync_segment`-Callback → `composer_apply_sync_segment_result` → `dispatch_mux` →
genau ein `audio_mux`-Ledger-Attempt → `render-sync-segments-audio-mux` → echte `render_id` →
`lipsync_muxing` → Remotion/Stitch → `composer_finalize_lipsync_scene(stitch:done)` → `complete`.

Abnahmekriterien (jeweils mit ID/Timestamp im Report zu belegen):

- Callback-Observation = `bound`.
- `sync_segment`-Job korrekt `succeeded` bzw. bei Failure korrekt terminalisiert.
- Pass-Slot korrekt, kein Sibling-Clobber (übrige Slots unverändert).
- `segment_result` und Scene-Verdict getrennt und korrekt.
- `dialog_shots.audio_mux.mux_dispatch_requested_at` gesetzt; der Apply-RPC schreibt **kein**
  `dispatched_at`.
- Genau ein `audio_mux`-Attempt, genau ein tatsächlicher Mux-Dispatch.
- `lipsync_muxing` erst durch den Mux-Owner mit realer `render_id`.
- Kein Rückfall auf `plate_ready`/`lipsync_running` durch die Legacy-Bridge.
- Kein `complete`/`applied` aus `sync-so-webhook`; Finalisierung ausschließlich über den
  Stitch-Finalizer.
- DB-Audit-Zeile (`source_signature = 'g322_sync_segment'`) vorhanden.
- Keine `missing_binding`, `wrong_job`, `stale_run`, `stale_generation`,
  `reinject_missing_pipeline_job_id`.

## 6. Duplicate-/Redrive-Nachweis

Natürlich auftretende Duplicates/Watchdog-Forwards werden ausgewertet; ein produktiver
Provider-Run wird **nicht** künstlich sabotiert. Zusätzlich als Post-Deploy-Smoke
(Transaktion + Rollback) zu belegen:

- Identischer finaler Callback **vor** `audio_mux`-Acquire → erneut `dispatch_mux`.
- Derselbe Callback **nach** existierendem `audio_mux`-Attempt → `noop`.
- Niemals ein zweiter `audio_mux`-Attempt.

## 7. Telemetrie-Fenster

Von Deploy-Zeitstempel bis Resmoke-Ende auswerten und mit IDs/Timestamps festhalten:

- `composer_callback_observations` gruppiert nach Verdict.
- Transition-Audit (`composer_scene_transition_log`, `caller_class = 'sync_segment_apply'`,
  `source_signature = 'g322_sync_segment'`).
- Ledger-Attempts nach `stage` und `status`.
- Reaper-/Watchdog-Fehler.
- Zählungen `missing_binding`, `wrong_job`, `stale_run`, `stale_generation` — Erwartung 0.
  `binding_pending` muss am **Ende** des Fensters ebenfalls 0 sein; ein kurzzeitiger Wert
  während des Dispatch wird dokumentiert, darf aber nicht unresolved stehenbleiben.

## 8. Status

**G3.2.2 DEPLOY PLAN READY — AWAITING GO.**

Offene Punkte aus vorheriger Fassung geschlossen:

1. **D1** — `sandbox_exec_lbunafpxuskwmsrraqxl` ist nachweislich plattformintern (nur
   `postgres` Mitglied, `authenticator` kann sie nicht annehmen, Client-/Edge-Pfade laufen über
   `anon`/`authenticated`/`service_role`). Akzeptiert als **accepted platform-internal ACL**;
   kein REVOKE in Produktionsmigrationen (§1/§4).
2. **In-flight Gate** — korrigiert auf echte In-flight-Semantik. Terminalität nur am kanonischen
   `pipeline_state` (`complete`/`failed`/`canceled`). Korrigierte Baseline: **0 / 0 / 0 / 0 / 0**.
   Historische 8 Ledger-Attempts (G3.1 Observe-Mode, terminale Szene) und 44 Pass-Slots
   (pre-Ledger stale metadata, terminale Szenen) bleiben unangetastet (§2).

Kein Deploy, kein G3.2.3. STOP.

## §9 — Production Deploy + Resmoke (Ausführung)

### 9.1 Pre-Deploy In-flight Gate
- Zeitpunkt: **2026-08-15T20:03:27Z**
- Ergebnis: **G1=0 / G2=0 / G3=0 / G4=0 / G5=0** — Gate GRÜN (In-flight-Scope, nur non-terminale Szenen).

### 9.2 DB-Deploy / Ist-Stand
- Beide Migrationen (Basis-Vertrag + Remediation R1) sind in Produktion wirksam.
- `composer_apply_sync_segment_result` — md5 `a8df11a106912562c3926f319f33eb36`, SECURITY DEFINER, gehärteter `search_path`.
- `composer_replace_pipeline_attempt` — md5 `c4649e65440a64997376617721792aa8` (unverändert, wie gefordert).
- Security-Smoke: `service_role = t` für den öffentlichen Apply-RPC; interne Helper (`composer_touch_lipsync_progress`, `composer_log_sync_segment_audit`) ohne direkten `service_role`-EXECUTE. `PUBLIC/anon/authenticated = false`. D1-a bleibt als *accepted platform-internal ACL* dokumentiert.
- Retry-Allowlist enthält `sync_noop_retryable`.
- Bridge-Smoke (mit Rollback): Legacy-Write `lip_sync_status='audio_muxing'` bei `pipeline_state='lipsync_muxing'` degradiert den kanonischen State **nicht** → **PASS**.

### 9.3 Edge-Deploy
- `sync-so-webhook` deployed. **T_deploy = 2026-08-15T20:04:53Z** (Upload-Start 20:04:40Z).
- Static-Sanity: keine Legacy-Writer, keine direkten `composer_scenes`-Updates auf Pipeline-Feldern; ausschließlich autoritative RPC-Aufrufe.

### 9.4 Echter UI-Resmoke (laufend)
- Szene: `b34d1eae-6bf3-437d-a6ab-624be0155adc` (Projekt `04b80fab-…`), single-speaker, non-tight; Vorlauf war ein vollständiger Sync → Mux → Stitch → `complete`.
- Clean-Restart über *Szenenaktionen → Lip-Sync neu erstellen* (`reset-lipsync-scene`, HTTP 200) um **20:09:22Z**. Reset korrekt: `pipeline_state=plate_ready`, `lip_sync_status=pending`, `dialog_shots` geleert, Plate/`plate_generation=7` erhalten.
- Client-Auto-Trigger dispatcht ab **20:18:52Z** (`compose-dialog-segments`, HTTP 202, weiterhin zyklisch).
- Stand **20:27:17Z**: Szene in `plate_ready` / `pending`, Pass-Status `rendering_preflight`. Es existiert **noch kein** `sync_segment`-Ledger-Attempt, folglich noch kein Sync-Callback und noch kein autoritativer Apply.
- Telemetrie-Fenster T_deploy → 20:27:17Z: **keine** `composer_callback_observations`-Zeilen; damit auch `missing_binding = 0`, `job_not_found = 0`, `wrong_job = 0`, `binding_pending = 0` — aber **ohne positiven `bound`-Nachweis**.

### 9.5 Status
**G3.2.2 DEPLOYED — RESMOKE IN PROGRESS / NOT YET ACCEPTED.**
Deploy und alle Post-Deploy-Smokes (Security, Contract, Bridge, Static) sind grün. Die Abnahmebedingung „echter Sync-Callback → autoritativer Apply → Mux → Stitch → Finalizer mit `bound`-Telemetrie“ ist **noch nicht** erfüllt, weil der Lauf zum Berichtszeitpunkt die Sync.so-Dispatch-Stufe noch nicht verlassen hat. **G3.2.2 wird daher NICHT auf DONE / FROZEN gesetzt.** Kein Cleanup, kein Backfill, keine Reparatur ohne neue Freigabe.

---

## 10. RS1 Pre-Apply Stall Analysis

Nur Analyse. Keine Mutation, kein Cleanup, kein neuer Run, kein Deploy.

**Korrektur zu §9.4:** Die dortige Aussage „Es existiert noch kein `sync_segment`-Ledger-Attempt" ist falsch. Es existiert einer — aus dem Run vom 17:24, also *vor* dem Deploy. Genau er blockiert den Resmoke.

### 10.1 Lifecycle-Rekonstruktion (Scene b34d1eae / Run 51f80471)

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

Der vollständige Preflight dieser Invocation lief fehlerfrei durch (`v168_per_pass_lock ACQUIRED` → `v201_id_only_cast` → `v400_anchor_divergence` (Plate-Anker) → `plateDims mp4_probe 1284x718` → `plate-face-detect 1 face conf 1.00` → `v183/v189/v239/v185` alle ok → `v163_preclip_render OK` (42 Frames, 1.367 s) → `v160_sync3_face_box` → `v163_BBOX_URL_PRIMARY` + `v279 bbox-url uploaded`). Der Stopp erfolgt ausschließlich am Ledger-In-Flight-Guard, unmittelbar vor dem Provider-Dispatch.

**Klassifizierung:** Fall 1 — *Provider terminal + Callback erhalten, aber Ledger unter altem Observe-Vertrag nicht terminalisiert*. Beleg ist die Existenz des `audio_mux`-Attempts mit `dispatcher=sync-so-webhook` um 17:25:38: Fan-in kann nur nach eingegangenem Sync.so-Callback entstehen.

**Offen (unbelegt, nicht vermutet):** Der externe Providerstatus von Sync.so-Job 50b402be ist hier nicht read-only prüfbar — der Sync.so-API-Key liegt ausschließlich als Edge-Secret vor, ein Provider-Read wäre ein eigener Ausführungsschritt. Ebenso sind die Edge-Logs der Fenster 17:24–17:30 und 20:08–20:12 aus der Log-Retention gefallen; die Rekonstruktion stützt sich dort auf persistierte Ledger-/`syncso_dispatch_log`-Zeilen. Die externe Bestätigung ist als eigener, freizugebender Read-Only-Schritt zu führen.

### 10.2 UI-Clean-Restart 20:09 — Trace

Edge-Logs dieses Fensters sind abgelaufen; der Pfad ist über den Zustandsfingerabdruck eindeutig identifizierbar.

Aufgerufen wurde **nicht** der Full-Reset-/Run-Vertrag (`composer-start-scene-generation` → `startSceneRun`/`beginSceneRun`), sondern der Lip-Sync-Clean-Restart **`reset-lipsync-scene`** (`src/lib/lipsyncReset.ts::resetSceneLipSync` bzw. `useResetLipSync`).

Was `reset-lipsync-scene` laut Code schreibt: `lip_sync_status='pending'`, `dialog_shots=null`, `twoshot_stage=null`, `replicate_prediction_id=null`, `clip_error=null`, Plate-Restore über `materializeCompatibilityOutput("base")`, `clip_status='ready'`, `audio_plan.twoshot` bereinigt (faceMap etc.), plus `failLipSync(reason="user_reset")` mit Credit-Refund.

Was er **nicht** anfasst: `active_run_id`, `active_run_started_at`, `plate_generation` und `composer_pipeline_jobs`.

Gemessener Zustand deckt sich exakt damit: `lip_sync_status=pending`, `clip_status=ready`, `clip_error=null`, `dialog_shots` neu aufgebaut (nur Pass-Claim: `status=rendering_preflight`, `preflight_started_at=20:19:58.586Z`, kein `job_id`/`pipeline_job_id`/`run_id`/`attempt_id`), `active_run_id=51f80471` seit **17:20:44**, `plate_generation=7=plate_ready_generation`, keine `dialog_dispatch_locks`.

Antworten auf die Prüffragen:

- Restart-Funktion: `reset-lipsync-scene` (Lip-Sync-Clean-Restart), nicht der eingefrorene Full-Reset-/Run-Vertrag.
- Neuer Run laut eigenem Vertrag? Nein — der Endpoint ist als „Lip-Sync-Zustand leeren, Plate behalten, Auto-Trigger neu greifen lassen" spezifiziert.
- `plate_generation`-Wechsel? Nein, vertragsgemäß nicht vorgesehen.
- Canceln/Stale/Replace alter `sync_segment`-/`audio_mux`-Jobs? Nein. `failLipSync` kündigt bekannte Sync.so-Jobs aus `dialog_shots`/`audio_plan` — hier ohne `job_id` — und adressiert den **Ledger** grundsätzlich nicht.
- Warum blieb `active_run_id` erhalten? Weil nur `composer-start-scene-generation`/`beginSceneRun` `active_run_id` + `plate_generation` neu stempelt.
- Warum liefert `composer_acquire_pipeline_attempt` `already_in_flight` auf d12b2704? Die Ledger-Identität ist `(scene_id, run_id, stage, segment_id)` — `plate_generation` gehört nicht dazu. Run und Stage sind unverändert, der Attempt hat `replaced_by IS NULL` und Status `dispatched` ∈ {pending, dispatching, dispatched, dispatch_uncertain} → laut G3.1b-Vertrag korrekt `already_in_flight`.

Fazit: Beide Verträge verhalten sich je für sich vertragsgemäß. Die Lücke liegt zwischen ihnen — `reset-lipsync-scene` macht eine Szene wieder non-terminal, ohne die Ledger-Identität zu erneuern oder zu terminalisieren.

Zusatzbefund: `rendering_preflight` ist ein hängen gebliebener DB-Status **ohne aktiven Prozess**. Jede Invocation läuft ~2 s und endet mit HTTP 202; nach Ablauf der 10-Minuten-Claim-TTL wiederholt sich der Zyklus lediglich.

### 10.3 Post-Cutover Resurrection

Die postulierte Sequenz ist mit den erhobenen Daten **bestätigt**:

```text
terminale Szene (Run R, Gen G, offener Ledger-Attempt aus Observe-Ära)
  → UI „Lip-Sync-Clean-Restart" (reset-lipsync-scene)
  → Szene non-terminal (lip_sync_status=pending, clip_status=ready), Run R + Gen G unverändert
  → Auto-Trigger dispatcht compose-dialog-segments
  → composer_acquire_pipeline_attempt → already_in_flight auf altem Attempt
  → kein Provider-Dispatch, dauerhafte Blockade (nur Pass-Claim-TTL-Schleife alle 10 min)
```

Präzisierung: Der Effekt ist **nicht** cutover-spezifisch. Er greift für jede Szene mit historisch offenem Ledger-Attempt, unabhängig vom Deploy. Der Cutover hat ihn nur sichtbar gemacht, weil vor dem Deploy keine Szene mit Observe-Altlasten neu gestartet wurde.

**Klassifizierung: Restart-/Run-Lifecycle-Defekt. Keine G3.2.2-Apply-Regression.** Der Apply-Pfad `composer_apply_sync_segment_result` wurde in diesem Resmoke nie betreten — weder bestätigt noch widerlegt.

### 10.4 Kein Replacement als neuer Run

`composer_replace_pipeline_attempt` bleibt unverändert im eingefrorenen G3.1b-Vertrag (gleicher Scene-Run, gleiche Generation, neuer Attempt) und wird ausdrücklich **nicht** als Mittel zur Erzeugung einer neuen `run_id` vorgeschlagen.

Kanonisch frische Identität erzeugt allein `composer-start-scene-generation` (ohne `use_existing_run`): `startSceneRun`/`beginSceneRun` vergeben eine neue `run_id`, bumpen `plate_generation`, canceln In-flight-Provider-Jobs und löschen Dispatch-Locks. Alternativ eine brandneue Testszene ohne jede Ledger-Historie.

### 10.5 Entscheidungsvorlage — genau eine Empfehlung

**Empfehlung: A — Restart-Defekt vor dem Resmoke beheben.**

Begründung: Der produktive UI-Restart kann generell alte Attempts reaktivieren; das ist kein Einzelfall dieser Szene, sondern eine dauerhafte Blockade-Klasse im Produktivpfad.

Minimal nötige nächste Änderung (nur beschrieben, nicht umgesetzt) — RS2:

1. `reset-lipsync-scene` erhält beim Non-terminal-Machen einer Szene eine explizite Ledger-Verantwortung für genau die Stages, die er logisch verwirft (`sync_segment`, `audio_mux` des aktuellen Runs): entweder Terminalisierung als `canceled` mit `error_code='user_reset'` über ein neues atomares Primitive, oder — vertragskonform sauberer — der Restart erzeugt eine neue Run-Identität über den kanonischen Run-Start.
2. Die Entscheidung darüber ist ein eigener Contract-Lock-Schritt (RS2), weil sie den eingefrorenen Reset-Vertrag berührt.
3. Erst danach Resmoke-Neuanlauf, und zwar auf einer **frischen Testszene ohne Ledger-Historie**, damit der Apply-Pfad garantiert erreicht wird.

### 10.6 Status

**G3.2.2 DEPLOYED — RESMOKE IN PROGRESS / NOT YET ACCEPTED** (unverändert). Deploy = PASS. Keine Mutation der Jobs d12b2704 / 7f983939, kein Cleanup, kein neuer Run, kein Deploy.

### 10.7 Weiterführung RS2

Der in §10.5 empfohlene Fix ist als eigener Contract ausgearbeitet:
`docs/v431-rs2-contract.md` — **RS2 CONTRACT DRAFT — DECISION PENDING**.
Er enthält Ist-Vertrag, Blockade-Klasse (Ledger-Identitätsschlüssel), betroffene
Aufrufer, Option A (Ledger-Terminalisierung im Reset), Option B (kanonische neue
Run-Identität), Entscheidungsmatrix, Invarianten und Verifikationsplan.
Die Wahl zwischen A und B ist bewusst offen und ein eigener Freigabeschritt.

---

## 11. RS3 — Option A implementiert

Die Reset-/Run-Lifecycle-Korrektur ist umgesetzt und dokumentiert in `docs/v431-rs3-report.md`
(33/33 DB-Smokes, 546/546 Vitest, Abnahmekriterium S7 erfuellt). Der blockierte Resmoke-Lauf
ist unveraendert; G3.2.2 bleibt **DEPLOYED — RESMOKE IN PROGRESS / NOT YET ACCEPTED**.

### 11.1 RS3-A Post-Deploy Audit — Abschluss

`RS3 DONE / FROZEN` (siehe `docs/v431-rs3-report.md` §6): ACL-Fix am Apply-RPC,
gezielter Redeploy von `compose-dialog-segments` (`T_RS3_effective = 2026-08-15T21:57:44Z`),
Acquire-/Frozen-Nachweis gruen. `composer_acquire_pipeline_attempt` bleibt unveraendert.
Der G3.2.2 Production Resmoke ist ein separates Gate auf einer frischen Testszene
ohne Ledger-Historie, gerechnet ab `T_RS3_effective`; `b34d1eae` bleibt unangetastet.

---

## 12. F1 — Mux/Stitch Terminalization Follow-up (Post-Resmoke Befund)

Der G3.2.2 Production Resmoke auf Szene `be06d0fd-85ec-4822-a18b-ad32e7c82562`
(T_run_start_utc = 2026-08-15T22:46:00Z, run `f7c0eb3b-06be-4106-9932-308cfc5b3bf0`,
generation `2`) endete funktional gruen: Plate → sync_segment → audio_mux → Stitch
produzierte ein finales Clip und die Szene erreichte `pipeline_state = complete`.

Jedoch wurden drei strukturelle Vertragsabweichungen festgestellt (STOP korrekt):

1. `dialog_shots.audio_mux.mux_dispatch_requested_at` ging verloren, weil
   `render-sync-segments-audio-mux` das `audio_mux`-Objekt als Ganzes ersetzt.
2. Der `audio_mux`-Ledger-Job (`ad4da886-6b13-41cd-9d8a-bee424a17293`) blieb auf
   `dispatched`; er wurde nie terminalisiert.
3. Die Szene wurde durch den Legacy-Direct-Update-Pfad in `remotion-webhook`
   (`dialog-stitch`-Branch) auf `complete` gesetzt; `composer_finalize_lipsync_scene`
   wurde nicht aufgerufen.

Die vollständige Analyse, der Beweis der Provenienz-Kette, der Atomic-Finalizer-
Contract, der angepasste Crash-Test und die Race-/Duplicate-Matrix sind in einem
eigenen Deliverable ausgearbeitet:

**`docs/v431-g3-2-2-f1-contract.md` — F1 ANALYSIS / CONTRACT GO — STOP for Review.**

Status: F1 ist analytisch abgeschlossen; Implementierung (`v431 G3.2.2-F1.IMP`)
erfolgt erst nach Freigabe dieses Contracts.

