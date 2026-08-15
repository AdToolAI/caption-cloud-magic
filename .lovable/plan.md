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
- `dispatch_uncertain` zählt bei `acquireLedgerJob()` als `already_in_flight`. Ein
  Redispatch daraus ist ausschließlich über den expliziten Retry-/Replace-Vertrag
  zulässig — die Liveness-Entscheidung bleibt bewusst und erzeugt keinen versteckten
  zweiten Provider-Auftrag.

### 1b. Concurrency-sichere Initial-Akquise (Pflichtergebnis)

Der Pre-Check allein reicht nicht: Zwei parallele Initial-Aufrufe können beide „kein
aktiver Attempt" sehen und dann beim INSERT konkurrieren. Der Unique-Constraint verhindert
die zweite Zeile, aber nicht den zweiten Provider-Call, solange der Verlierer den
Unique-Fehler als fail-open `null` behandelt.

**Vertrag:** Zwei gleichzeitige `acquireLedgerJob()`-Aufrufe für dieselbe
(scene, run, stage, segment, generation) ergeben deterministisch genau einmal `acquired`
und einmal `already_in_flight`. Der Verlierer gibt **niemals** `null`/fail-open zurück und
dispatcht **niemals**. `composer_replace_pipeline_attempt` wird dabei nie aufgerufen.

Umsetzung (Conflict-Target eindeutig geschlossen): Die Tabelle trägt zwei Unique-Indizes —
`composer_pipeline_jobs_idempotency_key_unique (idempotency_key)` und
`composer_pipeline_jobs_identity_unique NULLS NOT DISTINCT (scene_id, run_id, stage,
segment_id, attempt_no)`. Der Race kollidiert auf dem **Identity**-Constraint, deshalb wird
genau dieser als Conflict-Target gerichtet:

```sql
INSERT INTO composer_pipeline_jobs (...)
ON CONFLICT ON CONSTRAINT composer_pipeline_jobs_identity_unique DO NOTHING
RETURNING id, attempt_no, plate_generation;
```

Da PostgREST kein benanntes Constraint-Target erlaubt, läuft die Initial-Akquise über ein
enges `SECURITY DEFINER`-RPC (`composer_acquire_pipeline_attempt`), das genau dieses
Statement plus den deterministischen Re-Read der Gewinnerzeile enthält und ein Verdikt
`acquired` | `already_in_flight` zurückgibt. Leere INSERT-Rückgabe ⇒ Race verloren ⇒
`already_in_flight` mit dem Handle des Gewinners, **nie** `null`/fail-open. `idempotency_key`
bleibt zusätzlich deterministisch aus derselben Identität (inkl. `attempt_no`) gebildet, ist
aber nicht mehr das Conflict-Target. Das RPC bekommt fixierten `search_path` und EXECUTE nur
für `service_role`.



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
6. Security der neuen RPCs (`composer_acquire_pipeline_attempt`,
   `composer_replace_pipeline_attempt`): `SECURITY DEFINER` mit fixiertem `search_path`,
   EXECUTE nur für `service_role`; Aufruf als `authenticated`/`anon` schlägt fehl.
7. **Echter DB-Concurrency-Smoke (neu, Pflicht):** zwei unabhängige Sessions/Transaktionen
   rufen gleichzeitig die Initial-Akquise derselben Identität auf → genau 1 Zeile,
   1× `acquired`, 1× `already_in_flight`, kein Replace-Aufruf, kein Exception-/fail-open-Pfad.



**Guard-Tests** (vitest, neu `v431LedgerContract.test.ts`):
- **Race-Test (Pflicht, ergänzend zum DB-Smoke):** zwei parallele Initial-Akquisen
  derselben Identität → ein Caller `acquired`, der andere `already_in_flight`,
  `composer_replace_pipeline_attempt` nie aufgerufen; im Dispatcher-Test genau ein
  Provider-Call.

- Initial-Akquise bei bereits vorhandenem aktivem Attempt (inkl. `dispatch_uncertain`)
  ruft `composer_replace_pipeline_attempt` **nicht** auf und liefert `already_in_flight`.


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
