# v431 G2.3 — Abschlussbericht (inkl. Schließungspaket S1–S4)

Status: **umgesetzt und verifiziert** — Freigabe/FREEZE liegt beim Auftraggeber.

## Scope (verbindlicher Endvertrag)

Drei Pfade, keine weiteren:

| writeId | Primitive | Provenienz | Legacy-Spiegel |
| --- | --- | --- | --- |
| `cvc:upload-complete` | `composer_finalize_upload_scene` | Run-Stempel aus kanonischer Akquise (fail-closed) | atomar im selben Write |
| `cvc:failed/pika` | `composer_fail_scene_with_mirrors` (+ `_clear_lip_sync_fields`) | Run-Stempel (fail-closed) | atomar im selben Write |
| `cta:id_only_dialog_turns_required` | `composer_fail_scene_with_mirrors` | Dispatch-Provenienz | atomar im selben Write |

`compose-dialog-segments` bleibt ausdrücklich **außerhalb** von G2.3 (Deferred-Refund-Race noch offen).

## S1 — Overload-Fix

- Die ambige 9-Argument-Signatur von `composer_fail_scene_with_mirrors` wurde gedroppt (Ursache für PGRST203 bei Named-Args-Aufrufen).
- `_clear_lip_sync_fields = true` ist per Allowlist ausschließlich für `cvc:failed/pika` zulässig; jede andere `write_id` wird mit `clear_flag_not_allowed` abgelehnt und protokolliert.
- Nachweis: genau eine Signatur in `pg_proc` (Smoke-Fall `D_single_signature`), RPC-Auflösung für 7-, 8- und 10-Argument-Aufrufe erfolgreich.

## S2 — Upload-Schließung (kein Legacy-Fallback mehr)

- `uploadSourceSnapshot` friert die Upload-Quelle **vor** jeder Run-Akquise ein (`beginSceneRun` räumt `base_video_url`/`clip_url`).
- Upload-Szenen durchlaufen denselben kanonischen Run-Vertrag wie `ai-*`-Szenen; vorhandene Runs aus `run_context` werden wiederverwendet → keine Doppel-Runs. Fehlt der Stempel im mitgelieferten `run_context`, wird genau einmal akquiriert; stale/abweichende Kontexte werfen `stale_or_missing_run_context`.
- Ohne Run-Provenienz: **fail-closed** (`upload_missing_run_provenance`), kein ungeguardeter State-/Output-Write. Derselbe fail-closed-Pfad gilt für die Pika-Failure.

## S3 — Transaktionaler DB-Smoke

Ausgeführt über die Migrations-Schiene (psql-Rolle darf SECURITY-DEFINER-Funktionen nicht ausführen), jeweils mit Fixture-Rollback; Verbleib nach Lauf: 0 Fixture-Zeilen.

| Fall | Erwartung | Ergebnis |
| --- | --- | --- |
| A1 upload applied | `applied`, `base/clip = Snapshot-URL`, `pipeline_state_run_id = run_id` | PASS |
| A2 stale run | `stale_run`, keine Output-/Spiegeländerung | PASS |
| A3 stale generation | `stale_generation`, unverändert | PASS |
| A4 falscher from-State | `unexpected_state`, unverändert | PASS |
| A5 falsche write_id | `invalid_write_id`, unverändert | PASS |
| A6 Snapshot nach Output-Clear | Finalisierung schreibt Snapshot-URL | PASS |
| B1 pika applied + clear | `failed`, Lip-Sync-Spiegel (`lip_sync_status`, `twoshot_stage`, `dialog_shots`, `lip_sync_source_clip_url`) geleert, `clip_status=failed` | PASS |
| B2 pika stale run | `stale_run`, State **und** Legacy-Spiegel unverändert | PASS |
| B3 clear-Flag mit fremder write_id | `clear_flag_not_allowed`, unverändert | PASS |
| C1 cta hard fail | `applied`, Spiegel `failed/failed` | PASS |
| C2 cta stale | `stale_run`, unverändert | PASS |
| D Signatur-Eindeutigkeit | genau 1 Signatur, alte Signatur weg | PASS |
| AUDIT upload rejected | Reject-Zeile im Transition-Log (`applied=false`, `reason=stale_run`, run/generation/caller_role gesetzt) | PASS |
| AUDIT clear-Flag rejected | Reject-Zeile mit `reason=clear_flag_not_allowed` | PASS |
| AUDIT upload applied | Applied-Zeile mit korrekter write_id/Provenienz | PASS |

Alle abgelehnten Fälle wurden per Vorher/Nachher-Snapshot des gesamten geprüften Feldsatzes (State, Lip-Sync-Spiegel, `clip_status`, `base_video_url`, `clip_url`) verglichen — keine Mutation.

## S4 — Verifikation

Wörtliche Kommandozeilen und Ergebnisse:

- `npx vitest run src/lib/composer/__tests__` → **30 Dateien / 373 Tests grün**
- `npx vitest run src/lib/composer src/lib/video-composer` → **46 Dateien / 527 Tests grün**
- `npx tsgo --noEmit` → **keine Fehler**

### Einordnung der Testzahlen

Die frühere Zahl „482“ (G2.2) und „373“ im G2.3-Zwischenbericht sind **unterschiedliche Selektoren**, keine Regression:

| Selektor | G2.2 | G2.3 |
| --- | --- | --- |
| `src/lib/composer/__tests__` (Kernverzeichnis) | 368 (G1) | 373 |
| `src/lib/composer` + `src/lib/video-composer` (breit) | 482 | 527 |

Der G2.3-Zwischenbericht hatte versehentlich die enge Zahl gegen die breite Zahl gestellt. Bei identischem Selektor ist die Testmenge monoton gewachsen (482 → 527).

## Offene Punkte (bewusst außerhalb G2.3)

- `compose-dialog-segments` (conditional running / deferred) inkl. race-sicherem Deferred-Refund: erst nach Credit-Härtung migrierbar.
- Ungestempelte Restbranches in `compose-video-clips` außerhalb der drei Pfade.
