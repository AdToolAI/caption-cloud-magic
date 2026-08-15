# v431 G3.2.2 — Acceptance Remediation R1

Ziel: die sechs Acceptance-Befunde F1–F6 schließen, S10 echt parallel ausführbar machen,
danach das vollständige Acceptance Gate erneut fahren. Kein Deploy, kein G3.2.3,
keine neue Architektur. `docs/v431-g3-2-2-contract.md` bleibt LOCKED und unverändert.

## Vorab verifizierte Fakten

- `composer_state_from_legacy` hat keinen Fall für `audio_muxing` (weder in `_twoshot_stage`
  noch in `_lip_sync_status`) — der Wert fällt auf den `clip_status='ready' + clip_url`-Fall
  und liefert `plate_ready`. Der Rückschritt entsteht im Legacy-Zweig von
  `composer_scene_state_bridge`, der `derived` bedingungslos übernimmt.
- Die vorhandene G0/G3-Audit-Infrastruktur ist `public.composer_scene_transition_log`;
  `composer_finalize_plate_scene` schreibt dort bereits zwei Audit-Zeilen (A-Compat-Patch).
  Keine neue Telemetrie-Tabelle nötig.
- Rechte-Realität für S10: `composer_apply_sync_segment_result` ist auf
  `postgres`, `service_role`, `sandbox_exec_lbunafpxuskwmsrraqxl` gegrantet — die Rolle
  der Shell-Sessions ist `sandbox_exec` und fehlt dort. Für
  `composer_acquire_pipeline_attempt` und `composer_replace_pipeline_attempt` existiert
  der `sandbox_exec`-Grant bereits (Präzedenzfall). `cron`-Schema ist für die Rolle
  gesperrt, `dblink`/`pg_background` sind nicht installiert.

## Arbeitsschritte

### R1 — F1: `mux_dispatch_requested_at` (RED)
Endgültige Regel: In `composer_apply_sync_segment_result` wird unter dem bestehenden
Scene-Row-Lock zuerst der Parent erzeugt/gemergt
(`_ds := jsonb_set(_ds, '{audio_mux}', COALESCE(_ds->'audio_mux','{}'::jsonb), true)`),
danach **ausschließlich** `mux_dispatch_requested_at` schmal gesetzt. `dispatched_at` schreibt
der Apply-RPC nicht — weder im Erst- noch im Redrive-Zweig; es gehört allein dem
Dispatch-Owner nach erfolgreichem `audio_mux`-Acquire. `mux_dispatch_requested_at` ist damit
nur der re-drivable Request-Claim; Exactly-once bleibt am Ledger-Acquire. Kein
Whole-JSON-Replace, Sibling-Keys bleiben erhalten. Duplicate-Redrive: fehlender
`audio_mux`-Ledger-Attempt ⇒ erneut `dispatch_mux`, vorhandener Attempt ⇒ `noop`.
Smokes: fehlender Parent, vorhandener Parent mit Sibling-Keys, Duplicate/Crash-Redrive,
plus negativer Guard „`dispatched_at` wird vom Apply-RPC nie geschrieben".

### R2 — F2: `composer_touch_lipsync_progress`
Interner SQL-Helper wie im Contract §7 spezifiziert; die heutige Inline-Progress-Semantik
(`lip_sync_status='running'`, `twoshot_stage='syncso_fanout_<done>_of_<total>'`,
`updated_at=now()`) wandert wertgleich dorthin. `SECURITY DEFINER`,
`search_path = pg_catalog, public`, `REVOKE ALL FROM PUBLIC`; Aufruf nur aus
`composer_apply_sync_segment_result`, keine zusätzliche Transition-Autorität,
keine State-Entscheidung im Helper.
Smokes: Wert-für-Wert-Vergleich Inline vs. Helper für `done/total`-Kombinationen; zusätzlich
Security-Nachweis, dass **kein** Grantee direkten EXECUTE besitzt — weder `anon`,
`authenticated`, `PUBLIC` noch `service_role` oder die Sandbox-Rollen; ausgeführt wird der
Helper ausschließlich intern durch den Definer.

### R3 — F3: Legacy→State-Bridge, monotone Regel für genau diesen Fall
Endgültige Regel: Legacy `audio_muxing` (in `twoshot_stage` oder `lip_sync_status`) wird gegen
den aktuellen kanonischen State **monoton** ausgewertet:
- aktuell `lipsync_dispatched` ⇒ höchstens `lipsync_running`;
- aktuell `lipsync_running` ⇒ bleibt `lipsync_running`;
- aktuell `lipsync_muxing` oder später (`complete`) ⇒ kein Rückschritt, State bleibt;
- die Bridge setzt wegen `audio_muxing` niemals selbst `lipsync_muxing`.
Terminale Legacy-Signale (`failed`, `canceled`, `done/applied`) bleiben unverändert wirksam;
sonst wird keine Bridge-Semantik angefasst und `sync-so-webhook` zieht nichts vor.
Smokes: (a) `plate_ready → lipsync_dispatched → lipsync_running → mux handoff` ohne
Rückschritt; (b) **Beweis-Smoke**: Mux-Owner setzt `lipsync_muxing`, danach Legacy-Bridge-Trigger
mit `audio_muxing` ⇒ State bleibt `lipsync_muxing`; (c) bestehende Legacy-Pfade
(fail/cancel/complete) unverändert.


### R4 — F4: stale Test-Guard
`src/lib/composer/output/__tests__/materializeSceneOutput.test.ts` auf §6 ziehen:
negativer Guard, dass `sync-so-webhook` kein `materializeCompatibilityOutput(` enthält,
positiver Guard, dass der Aufruf im vorgesehenen Finalizer-Pfad existiert.
Keine Produktionslogik wird an den alten Test angepasst.

### R5 — F5: verbliebener Direct-Write im Recovery-Zweig
`sync-so-webhook/index.ts` L598–607 (Recovery aus selbstverschuldetem `watchdog_*`-Fail).
Entscheidung (nicht offen): der Pfad läuft **über den autoritativen RPC**. In
`composer_apply_sync_segment_result` entsteht dafür eine eng geguardete Vorstufe, die
**kumulativ** nur dann greift:
- `segment_result = COMPLETED` (normaler erfolgreicher Segment-Apply), und
- Ledger-, Run-, Generation-, Job- und Pass-Prüfung sind bereits bestanden, und
- der aktuelle Failure entspricht exakt dem bekannten selbstverursachten Muster
  (`lip_sync_status='failed'` bzw. `dialog_shots.status='failed'` mit
  `clip_error ~ '^watchdog_(provider_timeout|auto_retry_|hard_timeout)'`).
Sie nimmt ausschließlich die dafür nötigen Failure-Mirrors und `clip_error` zurück und läuft
danach in denselben normalen Apply weiter — kein generischer „unfail"-Mechanismus, kein
zweiter Writer, keine eigene Transition-Autorität. Der Edge-Branch wird vollständig
**write-free**: nur Logging, danach RPC-Aufruf; bei `rejected`/`noop` schreibt er nichts.
Danach Static Writer Guard erneut: 0 unautorisierte Sync-Apply-Writer.


### R6 — F6: DB-Audit in derselben Transaktion
Auditiert wird **erst ab autoritativ aufgelöster Ledger-Zeile**. Sobald
`composer_apply_sync_segment_result` den Job über `pipeline_job_id` aufgelöst hat, schreibt es
für `applied`, `noop` und `rejected` je eine Zeile in `composer_scene_transition_log`
(bestehende G0/G3-Infrastruktur, kein zweiter SoT) im selben Commit. Inhalt ausreichend zur
Rekonstruktion: `scene_id`, `run_id`, `plate_generation`, `pipeline_job_id`, `external_job_id`,
`write_id`, `pass_idx`, `segment_result`, `verdict`, `reason`, Vorher/Nachher-State.
Abgrenzungen, verbindlich:
- **Pre-RPC-Provenienzfälle** (`missing_binding`, `job_not_found` und vergleichbare) bleiben
  **ausschließlich** in `composer_callback_observations`. Ohne autoritative Ledger-Zeile gibt es
  keine belastbare `scene_id`; es wird keine Scene-Zuordnung nur fürs Audit erfunden.
- **fachliche `rejected`/`noop`-Verdikte nach Auflösung** (wrong_run, wrong_generation,
  wrong_job, wrong_pass, wrong_stage, stale_write, duplicate) ⇒ normaler RPC-Return, kein
  `RAISE`; die Audit-Zeile bleibt committed.
- **echte Invarianz-/Security-Corruption** ⇒ weiterhin Exception mit Rollback; dort kann
  naturgemäß keine Audit-Zeile derselben Transaktion persistieren.
Testmatrix: mindestens ein `rejected`-Fall mit anschließend nachweisbar vorhandener
Audit-Zeile, plus Negativ-Nachweis, dass `missing_binding` keine Transition-Log-Zeile erzeugt.


### R7 — S10 echt parallel (Pre-Deploy-Gate)
Der Apply-RPC bleibt im Produktionsartefakt **service-role-only**; kein Grant wandert in die
G3.2.2-Migration. Ablauf streng dreiteilig als Ad-hoc-Test-SQL im Testfenster:
1. temporärer Test-DB-only `GRANT EXECUTE ... TO sandbox_exec`;
2. S10-Lauf: zwei echte parallele `psql`-Sessions, Barrier über `pg_advisory_lock`, beide auf
   dieselbe Scene und denselben letzten Pass; jede Session ruft nach `dispatch_mux`
   instrumentiert `composer_acquire_pipeline_attempt('audio_mux')`. **Nur der Acquire-Gewinner**
   zählt und führt den simulierten Provider-Invoke aus; ein `already_in_flight`-Ergebnis
   invoket nie. Erwartung: mehrfaches `dispatch_mux` zulässig, **genau ein**
   `audio_mux`-Ledger-Attempt, **genau ein** Provider-Invoke. Synthetische Testdaten werden
   anschließend vollständig gelöscht;
3. `REVOKE` des temporären Grants, danach Security-Smoke als Beweis: Enumeration **aller**
   Nicht-Owner-Grantees aus `proacl` — neben Owner/`postgres` darf ausschließlich
   `service_role` EXECUTE besitzen; explizit `sandbox_exec=false`,
   `sandbox_exec_lbunafpxuskwmsrraqxl=false` (bestehender Grant wird mit entfernt),
   `anon=false`, `authenticated=false`, `PUBLIC=false`.
Ist der temporäre Grant nicht durchsetzbar oder die Parallelität technisch blockiert:
STOP mit präzisem Infrastruktur-Befund — kein schwächerer Single-Session-Ersatz,
keine Umdeklaration als Production-Smoke.


### Recheck (vollständig, nicht nur die reparierten Fälle)
S1–S17 inkl. S3b/S16b, S10 parallel, Security-Smokes (DEFINER/search_path/Grants/Overloads),
Static Writer Guard, Frozen-Suite, `tsgo`, Deno-Baseline, G3.1/G3.1f-Regression, G3.2.1-Regression.
Ergebnis wird in `docs/v431-g3-2-2-report.md` ergänzt.

## Technische Artefakte

- Migration 1: `composer_apply_sync_segment_result` (R1, R2-Aufruf, R5-Vorstufe, R6) +
  `composer_touch_lipsync_progress` (R2) + `composer_state_from_legacy` /
  `composer_scene_state_bridge` (R3). **Kein Grant-Statement für S10** — der
  `sandbox_exec`-Grant ist ausschließlich temporäres Ad-hoc-Test-SQL (GRANT → S10 → REVOKE)
  und niemals Teil eines deploybaren Migrationsartefakts.
- `supabase/functions/sync-so-webhook/index.ts` (R5).
- `src/lib/composer/output/__tests__/materializeSceneOutput.test.ts` (R4).
- Harness-Skripte unter `/tmp` (nicht im Repo), Smoke-SQL transaktional mit Rollback,
  außer S10 (braucht committete Zeilen, danach Cleanup).
- `docs/v431-g3-2-2-report.md` (Recheck-Abschnitt).

## Abschluss

Nur wenn alle REDs geschlossen sind, F2 deviationsfrei ist und S10 tatsächlich PASS liefert:
**G3.2.2 IMPLEMENTED / VERIFIED — READY FOR DEPLOY REVIEW**. Danach STOP.
Kein Deploy, kein G3.2.3.
