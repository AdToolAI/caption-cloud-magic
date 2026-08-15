# v431 G3.2.2 — Post-Implementation Verification / Acceptance Gate

Nur Verifikation. Kein Production-Deploy, keine Architekturänderung, keine G3.2.3-Arbeit.
`docs/v431-g3-2-2-contract.md` bleibt LOCKED. Einziger geschriebener Artefakt-Output ist die
Ergänzung von `docs/v431-g3-2-2-report.md`.

## Vorab bereits geprüft

- `composer_apply_sync_segment_result` existiert mit **genau einer** Signatur
  (`_pipeline_job_id uuid, _external_job_id text, _write_id text, _provider_status text, _output_url text, _error_text text`),
  `SECURITY DEFINER`, `search_path = pg_catalog, public`.
- `composer_replace_pipeline_attempt` ist unverändert vorhanden (Freeze-Kandidat für §5).
- `composer_touch_lipsync_progress` existiert **nicht** in der Datenbank. Das wird **nicht** als
  N/A oder grün gewertet, sondern zunächst als Contract-Abweichung behandelt. Der Verify-Schritt
  prüft gegen den LOCKED Contract, ob die vollständige Progress-Semantik äquivalent inline in
  `composer_apply_sync_segment_result` umgesetzt wurde:
  - Semantik fehlt oder nur teilweise vorhanden → **RED**, STOP mit Befund.
  - Semantik vollständig und äquivalent inline → **DEVIATION — function inlined** dokumentieren
    und STOP für Review; nicht automatisch READY FOR DEPLOY setzen.


## Ablauf

### 1. Contract-vs-Code Audit
Statische Prüfung von `sync-so-webhook`, `compose-dialog-segments`, `_shared/v431-ledger.ts`
und dem Apply-RPC gegen den gelockten Contract. Belegt werden: Sole-Ownership des Apply,
Provenienzpfad ausschließlich `pipeline_job_id → Ledger-Zeile → scene/run/generation/pass`,
Lock-Reihenfolge `composer_pipeline_jobs FOR UPDATE → composer_scenes FOR UPDATE`, kein
Scene-Hint-/Scan-/`syncso_dispatch_log`-Reattach, kein Whole-JSON-Replace von `dialog_shots`,
keine Fremd-Slot-Mutation, Trennung `segment_result` vs. `scene_verdict`, unveränderte
Partial-Mux-Regel, kein `lipsync_muxing`/`complete`/`applied`/`lip_sync_applied_at` aus dem
Sync-Callback, B11 nur über `dispatch_mux → Mux-Owner → Stitch-Finalizer`, tatsächliche
Löschung (nicht nur Unerreichbarkeit) von B5/B11/B14/B15–B17, genau ein Scene-Failure-Writer.
Ergebnis: **Writer-/Branch-Matrix** im Report.

### 2. SQL / Security Smokes
Per Katalogabfragen: Signatur-Eindeutigkeit, keine Defaults/Overloads, `SECURITY DEFINER`,
`search_path`, Schema-Qualifizierung interner Referenzen, EXECUTE-Grants
(`anon=false`, `authenticated=false`, `service_role=true`), Beschränkung auf
`stage='sync_segment'`, Teilwirkungsfreiheit bei falscher Identität, Auditierung von
`rejected`/`noop`/`applied`.

### 3. Contract-Testmatrix S1–S17 (inkl. S3b, S16b)
Transaktionale DB-Smokes gegen Fixture-Szenen; jeder Fall wird in einer Transaktion aufgebaut,
ausgeführt und zurückgerollt. Erfasst werden Verdict, `segment_result`, Pass-Slot-Diff,
Ledger-Attempt-Zählung und Scene-State-Diff. Abgedeckt: Success/Continue, letzter Success,
Fail-Aggregat bei ≥3 und ≤2 Sprechern, Provider-Fail, Duplicate-Success mit und ohne
vorhandenen `audio_mux`-Attempt, konfliktäres Duplicate, stale Run/Generation, falscher
Pass/Segment, Concurrency-/Crash-Fall, Clobber- und Fremd-Slot-Freiheit, kein Initial-Acquire
im Callback, kein vorzeitiges `lipsync_muxing`, kein `complete`/`applied` (auch single-speaker
non-tight), NOOP-Retryable inkl. Duplicate-Verhalten, ungültige Write-ID/Status-Kombination.

### 4. Mux-Ownership
Statischer Nachweis, dass der Webhook nach dem RPC ausschließlich
`dispatch_mux → acquireLedgerJob('audio_mux') → invoke render-sync-segments-audio-mux` ausführt,
plus Testnachweis, dass der State-Eintritt `lipsync_muxing` erst beim Mux-Owner nach realer
`render_id` erfolgt. Crash-Fall: Apply committed, Edge stirbt vor dem Acquire — identischer
Callback erhält erneut `dispatch_mux`, es entsteht trotzdem genau ein Ledger-Attempt und genau
ein Provider-Dispatch.

### 5. NOOP-Retry Ownership
Nachweis: `sync_noop_retryable` liegt in der DB-Allowlist, der Ersatz läuft ausschließlich über
das eingefrorene `composer_replace_pipeline_attempt` (Definitions-Diff gegen die G0-Fassung),
Edge erzeugt keinen neuen Attempt, `compose-dialog-segments` adoptiert den gelieferten
Replacement-Job und bindet nur dessen Provider-ID.

### 6. Static Writer Guard
Repository-weiter Guard-Lauf auf direkte Sync.so-Writes gegen `dialog_shots`, `pipeline_state`,
`lip_sync_status`, `twoshot_stage`, `lip_sync_applied_at`, `clip_status` und
Sync-Segment-Ledger-Terminalstatus. Jeder Treffer wird klassifiziert (autoritativer RPC /
erlaubte Netzwerk-Nebenwirkung B6/B13 / fremder Pfad / Befund).

### 7. Regression
Frozen-Suite vollständig, `tsgo`, Deno-Checks der berührten Edge Functions, G3.1/G3.1f
Provenienz- und Retry-Suites, G3.2.1 Plate-Apply-Smokes. Vorbestehende Baseline-Schulden
(u. a. lose Typen in `_shared/twoshot-face-map.ts` und `withDialogLock`) werden separat
ausgewiesen und nicht G3.2.2 zugerechnet.

### 8. Abschluss
`docs/v431-g3-2-2-report.md` wird um reale Testzahlen, SQL-Smoke-Ergebnisse, Writer-Audit-Matrix
und Abweichungen ergänzt. Bei vollständig grünem Ergebnis:
**G3.2.2 IMPLEMENTED / VERIFIED — READY FOR DEPLOY REVIEW** (nicht DONE/FROZEN).
Bei einem roten Contract-Gate: STOP mit Befund, keine automatische Reparatur.

## Technische Hinweise

- Smokes laufen über `psql`-Transaktionen mit `ROLLBACK`; keine Datenmutation bleibt bestehen.
- Grants werden über `information_schema.role_routine_grants` / `has_function_privilege` belegt.
- Der Writer-Guard nutzt `rg` über `supabase/functions/**` mit Klassifikationstabelle im Report.
- Keine Migration, kein Deploy, keine Änderung an Contract- oder Freeze-Artefakten.
