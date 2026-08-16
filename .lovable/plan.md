# v431 G3.2.2-F1.IMP — Pre-Deploy Evidence Pack (V1–V3)

Kein Deploy in diesem Schritt. Ziel: die drei offenen Nachweise belastbar erbringen,
damit das Deploy-Gate auf Beweisen statt Behauptungen steht.

Zwei Punkte konnte ich bereits read-only prüfen und sie sind grün:

- `remotion-webhook` `dialog-stitch`-Success-Branch enthält keinen Direct-Update-/
  Materialize-Fallback mehr. Ohne `stage='sync_segments_audio_mux'` oder ohne
  `pipeline_job_id` gibt es nur `observeCallbackProvenance` + Log, keine Scene-Mutation;
  jedes Verdict außer `finalized`/`already_completed` liefert 409, `succeeded` bleibt
  idempotent. Einzige Mutation außerhalb der RPC ist `video_renders`, nicht die Szene.
- `composer_finalize_lipsync_scene` existiert genau einmal
  (`_pipeline_job_id uuid, _external_job_id text, _scene_id uuid, _final_url text, _write_id text`),
  ist `SECURITY DEFINER`, `search_path=pg_catalog, public`, ACL
  `postgres=X, service_role=X` (plus die read-only Sandbox-Rolle) — kein `anon`,
  kein `authenticated`. Die Migration enthält explizite `REVOKE` für PUBLIC/anon/authenticated.
  Neue interne Helper wurden nicht angelegt; die Migration erzeugt nur diese eine Funktion.

Offen sind damit V1 (Vitest-/Deno-Baseline) und V2 (DB-Test-Nachweis inkl. Rollback-Smoke).

## V1 — Baseline-Beweis statt Behauptung

1. Read-only Diff-Beleg: der F1.IMP-Commit berührt an Frontend-Code ausschließlich
   `src/integrations/supabase/types.ts` (+10 Zeilen, reine Typdeklaration der neuen RPC).
   Alles Übrige sind Edge Functions, SQL-Migrationen, Tests und Docs.
2. Baseline-Lauf: `git worktree` auf den Pre-F1.IMP-Commit (`HEAD~1`) in ein temporäres
   Verzeichnis, dort derselbe Befehl `npx vitest run` mit identischer Config.
   Kein Checkout im Arbeitsbaum, keine Änderung am aktuellen Stand.
3. Vergleich der Failure-Listen als sortierte Testnamen (nicht nur Zahlen):
   `baseline.txt` vs. `head.txt`, Diff muss leer sein. Ein einziger neuer Failure ⇒ NO-GO.
   Hinweis: der volle Lauf auf HEAD ergibt aktuell 720 passed / 44 failed über 764 Tests —
   die zuvor berichteten 721/43 stammen aus einem anderen Suite-Zuschnitt. Der Bericht
   wird auf den vollen, reproduzierbaren Befehl vereinheitlicht.
4. Zielgerichteter Grün-Nachweis der relevanten Suiten (müssen auf HEAD grün sein):
   G3.1-, G3.1f-, G3.2.2-, RS3- und Frozen-Contract-Tests einzeln ausgeführt und gelistet.
   Die aktuell roten Dateien werden klassifiziert: Playwright-Specs, die unter Vitest gar
   nicht laufen können, vs. echte Unit-Failures (u. a. `lipsync-frozen-contract.test.ts`,
   `scene-state-write-contract.test.ts`, `materializeSceneOutput.test.ts`) — für letztere
   gilt: identisch rot in der Baseline, sonst NO-GO.
5. Deno: `deno check` derselben Dateien auf Baseline-Worktree und HEAD, Diagnostics
   textuell gegenübergestellt. Erwartung: exakt dieselben sechs Meldungen
   (`dialog-lock.ts`, `hasBackgroundMusic`).

## V2 — DB-Contracttests inkl. Crash-/Rollback-Smoke

1. Beleg, dass die acht Szenarien gegen die deployte neue RPC liefen:
   `pg_get_functiondef` Hash der Funktion zum Testzeitpunkt gegen den Migrationsinhalt.
2. Happy Path explizit als Ein-Commit-Nachweis: Ledger `dispatched → succeeded`
   und Scene → `complete` innerhalb derselben Transaktion, inklusive Erhalt von
   `mux_dispatch_requested_at`.
3. **Neu, im F1-Contract verlangt und bisher nicht abgedeckt:** Exception-/Rollback-Smoke.
   Fehler wird nach dem Ledger-Update und vor dem Scene-Update erzwungen; danach muss
   gelten: Ledger unverändert `dispatched`, Scene unverändert nicht-`complete`,
   kein Teilzustand. Läuft als eigener transaktionaler Testfall.
4. Residuen-Nachweis nach dem Lauf: Query auf `composer_pipeline_jobs`,
   `composer_scenes`, `composer_projects` nach den Test-IDs ⇒ 0 Zeilen; keine zusätzlichen
   Funktionen, keine zusätzlichen Grants gegenüber dem Stand vor dem Testlauf
   (Funktions- und ACL-Snapshot davor/danach vergleichen).

## V3 — Report-Update

`docs/v431-g3-2-2-f1-imp-report.md` bekommt einen Abschnitt „Pre-Deploy Evidence":
Baseline-Diff (leer), Suitenliste grün, Deno-Diagnostics-Vergleich, DB-Testmatrix
inklusive Rollback-Smoke, Residuen-Nachweis, Signatur-/ACL-Nachweis.

## Nicht Teil dieses Schritts

Kein Deploy, kein Production-Resmoke, keine Änderung an G3.1, RS3, Sync-Apply oder
Front-Half. Findet V1 einen neuen Failure oder V2 einen Rollback-Verstoß, endet der
Schritt mit STOP und Befund statt mit einem Fix.

## Danach

Bei durchgehend grüner Evidenz: F1.IMP DEPLOY GO in der Reihenfolge
DB-Migration → Security-Smoke (anon/authenticated → permission denied) →
genau zwei Edge Functions (`remotion-webhook`, `render-sync-segments-audio-mux`) →
frischer Production Resmoke.
