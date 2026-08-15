# v431 RS2 — Reset-/Run-Lifecycle Contract Lock (nur Analyse & Contract)

Ausgangslage aus RS1: `reset-lipsync-scene` macht eine Szene wieder non-terminal, ohne
die Ledger-Identität zu erneuern oder verworfene Stages zu terminalisieren. Dadurch
blockieren alte `dispatched`-Attempts (`sync_segment` d12b2704, `audio_mux` 7f983939)
jeden neuen Dispatch dauerhaft mit `already_in_flight`. Klassifizierung: Restart-/Run-
Lifecycle-Defekt, keine G3.2.2-Apply-Regression.

Dieser Schritt liefert **ausschließlich** Analyse und einen Contract. Keine Code-
Änderung, keine Migration, kein Deploy, kein Cleanup, kein Resmoke, kein G3.2.3.

## Ziel

Ein entscheidungsreifer, review-fähiger Contract, der beide Fixrichtungen vollständig
ausarbeitet und mit einer Entscheidungsmatrix vergleicht. Die Wahl der Richtung und die
Implementierung sind separate, eigens freizugebende Schritte.

## Inhalt des Deliverables `docs/v431-rs2-contract.md`

1. **Ist-Vertrag Reset (eingefroren)** — was `reset-lipsync-scene` heute exakt schreibt
   und bewusst nicht anfasst (`active_run_id`, `active_run_started_at`,
   `plate_generation`, `composer_pipeline_jobs`), inkl. Refund-/`failLipSync`-Pfad.
2. **Blockade-Klasse** — welche Guards greifen (`v193_pass_already_active`,
   `ledger already_in_flight`, `predecessor_exists`), an welcher Stelle der Lauf stoppt,
   und welche Stage-Kombinationen dauerhaft blockieren können.
3. **Betroffene Aufrufer** — alle UI- und Backend-Pfade, die eine Szene non-terminal
   machen, ohne Ledger-Identität zu erneuern (Reset-Flow, Retry-Pfade, Watchdog-/
   Recovery-Forwarder), mit Bewertung, ob dieselbe Blockade-Klasse dort entstehen kann.
4. **Option A — Ledger-Terminalisierung im Reset**
   - Neues atomares Primitive: Cancel der offenen Stages des aktuellen Runs
     (`sync_segment`, `audio_mux`) mit `error_code='user_reset'`.
   - Signatur, Provenienz-Guards (Run/Generation), Idempotenz, Immutabilitäts-Trigger-
     Verträglichkeit, Verhalten bei später eintreffenden Provider-Callbacks
     (Late-Callback gegen canceled Attempt).
   - Auswirkung auf G3.2.2-Apply (`composer_apply_sync_segment_result`) und auf
     Refund-Idempotenz.
5. **Option B — Kanonische neue Run-Identität**
   - Clean-Restart delegiert an den Run-Start-Vertrag (neue `run_id`,
     `plate_generation`-Bump, In-flight-Cancel, Dispatch-Lock-Löschung).
   - Auswirkungen auf Generation-Fencing, Plate-Wiederverwendung (`plate_ready_generation`),
     Kosten/Credits (Plate-Neurender vs. Restore), UX-Semantik „nur Lip-Sync zurücksetzen".
6. **Entscheidungsmatrix** — Eingriffstiefe, Regressionsrisiko für die Lip-Sync-Kette
   (v425/v430/v431), Kostenwirkung, Wirkung auf Alt-Szenen mit Ledger-Historie,
   Testaufwand, Rückbaubarkeit.
7. **Invarianten, die in beiden Optionen unverletzt bleiben** — u. a. kein
   `composer_replace_pipeline_attempt` als Mittel für neue `run_id` (G3.1b bleibt
   eingefroren), keine neue Ledger-Identität ohne Run-Bezug, Apply bleibt Sole Owner.
8. **Verifikationsplan (nur beschrieben)** — DB-Smokes und UI-Resmoke-Vorgabe:
   Resmoke ausschließlich auf einer frischen Testszene ohne Ledger-Historie.
9. **Offene, unbelegte Punkte** — externer Sync.so-Status von 50b402be (Provider-Read
   ist ein eigener freizugebender Read-Only-Schritt), abgelaufene Log-Retention der
   Fenster 17:24–17:30 und 20:08–20:12.

## Nicht Teil dieses Schritts

- Keine Wahl zwischen A und B, keine Implementierung, keine Migration.
- Keine Mutation an d12b2704 / 7f983939, kein Cleanup, kein neuer Run.
- Status bleibt: **G3.2.2 DEPLOYED — RESMOKE IN PROGRESS / NOT YET ACCEPTED**.

## Abschluss

`docs/v431-rs2-contract.md` erstellen, `docs/v431-g3-2-2-report.md` um einen kurzen
Verweis auf RS2 ergänzen, danach STOP für Review.
