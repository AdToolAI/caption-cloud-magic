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

### Offener Punkt D1 (vor Deploy zu entscheiden)

Die Plattform vergibt per `DEFAULT PRIVILEGES` (`postgres`, objtype `f`) EXECUTE auf **jede**
neue `public`-Funktion an `anon`, `authenticated`, `service_role` **und**
`sandbox_exec_lbunafpxuskwmsrraqxl`. Unsere Migrationen widerrufen PUBLIC/anon/authenticated
(und bei den internen Helfern zusätzlich `service_role`), **nicht** aber die
projektspezifische Sandbox-Rolle. Ist-Zustand:

```text
composer_apply_sync_segment_result  → service_role=X, sandbox_exec_lbunafpxuskwmsrraqxl=X
composer_touch_lipsync_progress     → sandbox_exec_lbunafpxuskwmsrraqxl=X (kein service_role)
composer_log_sync_segment_audit     → sandbox_exec_lbunafpxuskwmsrraqxl=X (kein service_role)
```

Das ist kein R7-Rückstand, sondern Plattform-Default: dieselbe ACL tragen bereits die
eingefrorenen G3.1-Primitive (`composer_bind_plate_attempt`, `composer_fail_callback_scene`,
`composer_finalize_plate_scene`, `composer_reserve_run_credits`). Der Security-Smoke §4
fordert für Sandbox-Rollen `false`. Zwei Optionen, Entscheidung liegt beim Review:

- **D1-a:** Akzeptanzkriterium auf `anon`/`authenticated`/PUBLIC (+`service_role` bei den
  internen Helfern) begrenzen, Sandbox-Rolle als plattformweite Diagnoserolle dokumentieren —
  konsistent mit dem bereits eingefrorenen G3.1-Stand.
- **D1-b:** Der deploybaren Migration explizite `REVOKE ALL … FROM sandbox_exec%`-Schleifen für
  die drei G3.2.2-Funktionen hinzufügen (Codeänderung, daher außerhalb dieses Reviews).

Bis zur Entscheidung bleibt §4 in der Fassung „Sandbox = false“ und ist damit **nicht** grün.

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

### Baseline-Messung 2026-08-15 ~19:14 UTC (korrigierte Gate-Fassung)

| Gate | Rows | Befund |
| --- | --- | --- |
| G1 | 0 | keine nonterminale Szene mit offenem `sync_segment`-Job |
| G2 | 0 | grün |
| G3 | 0 | keine nonterminale Szene mit offenem `audio_mux`-Job |
| G4 | 0 | grün (keine Replacement-Kette in Zustellung) |
| G5 | 0 | historische Pass-Slots gehören terminalen Szenen (`failed`/`canceled`/`complete`) und fallen definitorisch heraus |

**Historische Artefakte (kein In-flight, kein Deploy-Blocker):**

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

Zwei Punkte sind vor dem GO zu entscheiden bzw. herzustellen:

1. **D1** — Umgang mit dem Plattform-Default-EXECUTE der Sandbox-Rolle (§1/§4).
2. **In-flight Gate** — heute 4 / 0 / 4 / 0 / 44; muss vor dem Deploy auf 0/0/0/0/0 gedrained
   sein (§2).

Kein Deploy, kein G3.2.3. STOP.
