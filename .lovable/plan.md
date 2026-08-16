# v431 G3.2.2-F1.IMP — Deploy-Status-Reklassifizierung + Evidence Pack (V0–V3)

## V0 — Umgebung: eindeutig festgestellt (Gate-Antwort)

Es gibt in diesem Projekt genau **eine** Datenbank. Der `psql`-Zugang zeigt auf den
Pooler der produktiven Projekt-DB (`aws-1-eu-central-1.pooler.supabase.com`,
Datenbank `postgres`) — dieselbe Instanz, die Preview und veröffentlichte App nutzen.
Es existiert keine lokale, keine Staging- und keine Test-DB.

Damit gilt: **`composer_finalize_lipsync_scene` liegt bereits in der produktiven DB.**
Der bisher berichtete Status „STOP vor Deploy" war für die DB-Hälfte falsch und wird
korrigiert zu:

```text
F1.IMP DB-Hälfte:    LIVE (Migration angewendet, RPC vorhanden)
F1.IMP Edge-Hälfte:  NICHT deployed (Quellstand nur im Repo)
```

Auch die acht Contracttests liefen folglich gegen die produktive DB (als
self-cleaning Migration) — das ist im Report so zu benennen, nicht als „Test-DB".

### Ist-Risiko der bereits live liegenden RPC

Die Funktion ist heute **dormant**: einziger Aufrufer wäre der neue
`remotion-webhook`-Zweig, der nicht deployed ist. `pg_stat` weist keine Aufrufe aus,
ACL ist `service_role`-only (plus Owner), kein `anon`/`authenticated`. Die produktive
Kette verhält sich damit exakt wie vor F1.IMP: Stitch-Callbacks laufen noch über den
alten Direct-Update-Pfad, `mux_dispatch_requested_at` geht weiterhin verloren, der
`audio_mux`-Ledger-Job bleibt weiterhin auf `dispatched`. Der F1-Befund besteht in
Production also unverändert fort.

### Zu klärender Nebenbefund vor dem Edge-Deploy

Der Testlauf lief als Migration gegen Production. Vor jedem weiteren Schritt wird
belegt, dass er rückstandsfrei war: keine Test-Zeilen in `composer_pipeline_jobs`,
`composer_scenes`, `composer_projects`, keine zusätzlichen Funktionen, keine
zusätzlichen Grants. Findet sich Residuum, ist das ein STOP-Befund mit Cleanup-Vorschlag,
kein stillschweigender Fix.

## V1 — Baseline-Beweis (Vitest + Deno)

1. Expliziter Pre-F1.IMP-Commit wird dokumentiert, nicht blind `HEAD~1`:
   F1.IMP liegt vollständig in `7e6cd297c` („F1.IMP finalisiert und getestet"),
   Vorgänger und damit Baseline ist **`b142c81c4`**. Der Diff `b142c81c4..7e6cd297c`
   wird im Report vollständig gelistet, damit die Ein-Commit-Annahme belegt statt
   behauptet ist.
2. `git worktree add` auf `b142c81c4` in ein temporäres Verzeichnis. Kein Checkout im
   Arbeitsbaum. Gleicher Node-/Deno-Stand, gleicher Lockfile-Stand (Lockfile-Hash
   beider Stände wird verglichen), identische Vitest-Config, identischer Befehl:
   `npx vitest run --reporter=basic`.
3. Vergleich als sortierte Failure-Listen auf Testnamen-Ebene, nicht als Zahlen.
   Diff muss leer sein; ein neuer Failure ⇒ STOP.
   Referenzlauf auf HEAD (bereits gemessen): **720 passed / 44 failed** über 764 Tests
   in 100 Dateien. Die früher berichteten 721/43 stammten aus einem anderen
   Suite-Zuschnitt; der Report wird auf diesen vollständigen Befehl vereinheitlicht.
4. Klassifikation der roten Dateien: Playwright-Specs, die unter Vitest gar nicht
   lauffähig sind (`tests/e2e/*`, `tests/visual/*`, `tests/*.spec.ts`), getrennt von
   echten Unit-Failures (u. a. `lipsync-frozen-contract.test.ts`,
   `scene-state-write-contract.test.ts`, `materializeSceneOutput.test.ts`,
   `clientReaderContract5E.test.ts`, `lipSyncIntentGateScanner.test.ts`).
   Für die zweite Gruppe gilt: identisch rot in der Baseline, sonst STOP.
5. Gezielter Grün-Nachweis der G3.1-, G3.1f-, G3.2.2- und RS3-relevanten Suiten auf HEAD,
   einzeln ausgeführt und namentlich gelistet.
6. Deno: `deno check` derselben Dateien auf Baseline-Worktree und HEAD, Diagnostics
   textuell gegenübergestellt. Erwartung: exakt dieselben sechs Meldungen
   (`dialog-lock.ts`, `hasBackgroundMusic`).

## V2 — DB-Contracttests + Atomizitätsnachweis ohne Test-Hook

1. Beleg, dass die acht Szenarien gegen genau den heute installierten Funktionsbody
   liefen: `pg_get_functiondef` gegen den Migrationsinhalt vergleichen.
2. Happy Path: Ledger `dispatched → succeeded` und Scene → `complete` in einem Commit.
3. **Atomizität ohne produktiven Test-Hook.** Der Finalizer ist ein einzelner
   PL/pgSQL-Body ohne Subtransaktionen, wird also vom Aufrufer in genau einer
   Transaktion ausgeführt. Nachgewiesen wird das zweistufig:
   - strukturell: Beleg aus dem Funktionsbody, dass zwischen Ledger-Update und
     Scene-Update kein `EXCEPTION`-Block und kein Commit-Punkt liegt, jede Exception
     also den kompletten Call zurückrollt;
   - reproduzierbar: ein echter Fehlerfall **innerhalb desselben Calls**, der nach dem
     Ledger-Write und vor dem erfolgreichen Scene-Write entsteht (Constraint-Verletzung
     auf dem Scene-Update-Pfad, z. B. unzulässiger Zielzustand). Danach Prüfung:
     Ledger unverändert `dispatched`, Scene unverändert nicht-`complete`.
   Lässt sich ein solcher natürlicher, deterministischer Fehler **nicht** ohne jede
   Schema- oder Funktionsmutation provozieren, wird der Rollback-Smoke **nicht**
   ausgeführt. Es wird ausdrücklich **kein** temporärer Test-Clone und keine sonstige
   DDL in der Produktions-DB angelegt. Stattdessen wird der Nachweis als
   *structural transaction proof* dokumentiert, mit explizit begrenzter Beweiskraft:
   belegt ist die Transaktionsgrenze aus dem Funktionsbody, nicht ein beobachteter
   Rollback zur Laufzeit.
4. `mux_dispatch_requested_at` ist **kein** Finalizer-Happy-Path-Kriterium. Der
   Regressionstest gehört zum Narrow-Patch von `render-sync-segments-audio-mux` und
   wird dort separat geführt (Merge statt Überschreiben des `audio_mux`-Objekts).
   Im Finalizer wird nur zusätzlich geprüft, dass er das Feld nicht zerstört.
5. Residuen-Nachweis nach dem Lauf: 0 Test-Zeilen, Funktions- und ACL-Snapshot vor/nach
   identisch (bis auf den absichtlich wieder entfernten Clone).

## V3 — Report-Korrektur

`docs/v431-g3-2-2-f1-imp-report.md` wird korrigiert und ergänzt:

- Status-Reklassifizierung „DB live / Edge nicht deployed" statt „STOP vor Deploy".
- Umgebungsbenennung: alle DB-Tests liefen gegen die produktive Projekt-DB.
- Baseline-Commit `b142c81c4`, Diff-Liste, Failure-Diff, Suitenliste, Deno-Vergleich.
- DB-Testmatrix inklusive Atomizitätsnachweis und dessen exakter Beweiskraft.
- Narrow-Patch-Nachweis getrennt geführt.
- Signatur-/ACL-Nachweis (eine Signatur, `SECURITY DEFINER`,
  `search_path=pg_catalog, public`, `service_role`-only, keine neuen Helper).

## Nicht Teil dieses Schritts

Kein Edge-Deploy, kein Production-Resmoke, keine Änderung an G3.1, RS3, Sync-Apply oder
Front-Half. Jede Abweichung endet mit STOP und Befund.

## Danach

Bei grüner Evidenz lautet das nächste Gate nicht mehr „DB zuerst", sondern:
Security-Smoke gegen die bereits live liegende RPC (`anon`/`authenticated` →
permission denied) → Deploy genau der zwei Edge Functions
(`remotion-webhook`, `render-sync-segments-audio-mux`) → frischer Production Resmoke.
