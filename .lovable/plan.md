# v431 G3.1b — Schließungspaket vor Deploy/Drain

Kein Deploy. Erst die drei offenen Punkte schließen, dann Verifikation, dann STOP mit Bericht.

## Befund zu Punkt 1 (Nachweis geführt, Code-Change nötig)

`acquireLedgerJob()` besitzt die geforderte Unterscheidung **nicht**. Aktuell gilt:
findet die Vorabfrage irgendeinen nicht-terminalen Attempt (`pending`, `dispatching`,
`dispatched`, `dispatch_uncertain`) derselben (scene, run, stage, segment, generation),
ruft der Helper unbedingt `composer_replace_pipeline_attempt` auf. Ein doppelter oder
paralleler Initial-Dispatch löst damit einen laufenden Provider-Job als `stale` ab und
erzeugt einen zweiten Auftrag — Doppel-Spend. Das wird korrigiert.

## Befund zu Punkt 2 (teilweise korrekt, eine Regel muss weg)

`classifyDispatchFailure()` behandelt heute `400|401|403|404|409|422` als `rejected`.
408 und 429 fallen bereits in `uncertain` (kein Treffer im Muster) — richtig. Falsch ist
`409`: eine Konfliktantwort beweist keine Nichtannahme. Außerdem ist die Textregel
`not found` zu breit und wird auf einen Provider-Ablehnungswortlaut verengt.

## Änderungen

### 1. Akquise vs. Retry trennen (`_shared/v431-ledger.ts`)

- `acquireLedgerJob()` ersetzt niemals mehr. Findet es einen aktiven Attempt derselben
  Identität, gibt es je nach `intent` zurück:
  - Default (Initial-Akquise): **kein** Dispatch. Rückgabe eines Ergebnisses mit
    `outcome: "already_in_flight"` plus Handle des bestehenden Attempts; Telemetrie
    `ledger_already_in_flight`. Der Aufrufer dispatcht nicht erneut.
  - Kein aktiver Attempt: INSERT wie bisher, `outcome: "acquired"`.
- Echte Retries laufen ausschließlich über `replaceLedgerAttempt()` mit **explizitem**
  `previousJobId` und `retryReason`; beide Felder sind Pflicht, `composer_replace_pipeline_attempt`
  bleibt der einzige Weg. `retry_reason` wandert in die Metadaten des neuen Attempts.
- Rückgabetyp wird ein Discriminated Union, damit „nicht dispatchen" nicht mit
  „Ledger nicht verfügbar" (fail-open `null`) verwechselbar ist.

### 2. Aufrufer anpassen

Fünf Dispatcher rufen `acquireLedgerJob()`: `compose-video-clips`, `compose-dialog-segments`,
`render-sync-segments-audio-mux`, `sync-so-webhook` (Fan-in-Mux). Sie behandeln
`already_in_flight` als „bereits unterwegs" — kein Provider-Call, strukturierte
Log-Zeile, Legacy-Verhalten unverändert (Observe bleibt read-only, kein State-Write).
`compose-clip-webhook` nutzt bereits den expliziten Replace-Pfad und bekommt nur
`retryReason: "replicate_auto_retry"` ergänzt.

### 3. Classifier verschärfen

- `rejected` nur bei `400`, `401`, `403`, `404`, `422` sowie beweisbarer lokaler
  Validierung/Abbruch vor dem Absenden.
- `408`, `409`, `429`, alle `5xx`, Timeouts, Netzwerkabbrüche, unbekannte Antworten →
  `uncertain`. 408/409/429 werden explizit vor der Ziffernregel abgefangen, damit die
  Semantik nicht versehentlich wieder kippt.
- Die bestehende 429-Sonderbehandlung in `compose-dialog-segments` bleibt und ist damit
  deckungsgleich mit dem Shared-Classifier.

## Verifikation (Gate vor Deploy)

**DB-Smokes** (transaktional, mit Rollback):
1. INSERT ohne `plate_generation` → abgelehnt; UPDATE auf `plate_generation` → abgelehnt;
   `created_at` immutable.
2. Replace-Rollback: Replace mit falscher Scene/Run/Stage/Generation → keine Mutation,
   kein neuer Attempt.
3. Paralleler Replace: zwei Ablösungen desselben Vorgängers → genau eine gewinnt, der
   Verlierer bekommt `null` und legt keine Zeile an.
4. `failed` vs. `dispatch_uncertain`: Settle wirkt nur aus `pending`/`dispatching`,
   niemals über `dispatched`/`succeeded` hinweg.
5. Reaper: überfälliger Dispatch → `dispatch_uncertain`, nie `stale`, nie terminal.
6. Security des neuen RPC: `SECURITY DEFINER` mit fixiertem `search_path`, EXECUTE nur
   für `service_role`; Aufruf als `authenticated`/`anon` schlägt fehl.

**Guard-Tests** (vitest, neu `v431LedgerContract.test.ts`):
- Initial-Akquise bei aktivem Attempt ruft `composer_replace_pipeline_attempt` **nicht**
  auf und liefert `already_in_flight`.
- `replaceLedgerAttempt` ohne `previousJobId`/`retryReason` ist nicht aufrufbar (Typ + Laufzeit).
- Classifier-Matrix: 400/401/403/404/422 → rejected; 408/409/429/500/502/503/504/Timeout/
  unbekannt → uncertain.
- Observe bleibt read-only: kein `update`/`rpc`/State-Write in den Observe-Pfaden;
  `binding_pending` wird nur gemessen.
- Keine Berührung eingefrorener Lip-Sync-Belange (Masken, Crops, Preclips, Provider).

Ergänzend `tsgo --noEmit` und `deno check` der berührten Funktionen.

## Ablauf danach

`G3.1b Implementation PASS → Deploy → Drain-Fenster → 0 missing_binding, 0 job_not_found,
0 wrong_job bei Post-Deploy-Jobs → Bericht → STOP.`

`binding_pending` bleibt reine Messung, `stale_run`/`stale_generation` diagnostisch.
G3.2 bleibt bis zum grünen Drain-Bericht gesperrt. Es wird in diesem Schritt nicht
deployt.
