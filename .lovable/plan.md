# v431 G2.3 — Abschlussbericht S1–S4 (Abnahme-Vorlage)

S1–S4 sind bereits umgesetzt und verifiziert. Dieser Plan legt die Abnahme vor: jede verbindliche Grenze aus dem Auftrag gegen ihren Nachweis. Kein weiterer Code-Change, kein G2.4.

## Grenzen und Nachweise

| Verbindliche Grenze | Nachweis | Status |
| --- | --- | --- |
| Nach S1 exakt eine auflösbare `composer_fail_scene_with_mirrors`-Signatur | `pg_proc`-Abfrage liefert genau eine Signatur (10 Argumente, letztes `boolean` mit Default); alte 9-Arg-Signatur gedroppt | erfüllt |
| Echte 7-/8-Arg-Calls ohne PGRST203 | Named-Args-Calls mit 7, 8 und 10 Argumenten lösen eindeutig auf; Smoke-Fälle B1/B3/C1/C2 rufen genau so auf | erfüllt |
| `_clear_lip_sync_fields=true` nur für `cvc:failed/pika` | Allowlist in der Funktion; Fremd-`write_id` → `clear_flag_not_allowed`, keine Mutation, Audit-Zeile vorhanden (Fälle B3, AUDIT_clear_flag_rejected) | erfüllt |
| Upload: vorhandenen `runContext` wiederverwenden, ein Dispatch = eine Run-ID + ein Generation-Bump | Akquise nur für Szenen ohne Stempel im `run_context`; abweichender/veralteter Kontext → `stale_or_missing_run_context` statt zweitem Run | erfüllt |
| Upload-Source vor Output-Clear immutable gesichert, exakt dieselbe URL finalisiert | `uploadSourceSnapshot` vor jeder Run-Akquise; Smoke-Fall A6 finalisiert nach Output-Clear exakt die Snapshot-URL in `base_video_url` und `clip_url` | erfüllt |
| Upload/Pika ohne vollständige Provenienz → kein State-/Output-Write, kein Legacy-Fallback | fail-closed mit `upload_missing_run_provenance`; alle Legacy-Fallbacks in beiden Zweigen entfernt | erfüllt |
| Stale / falsche Generation / falscher From-State / falsche `writeId` → Output- und Legacy-Felder unangetastet | Smoke-Fälle A2–A5, B2, C2 vergleichen Vorher/Nachher über den vollen Feldsatz (State, `lip_sync_status`, `twoshot_stage`, `dialog_shots`, `lip_sync_source_clip_url`, `clip_status`, `base_video_url`, `clip_url`) — identisch | erfüllt |
| S4 nutzt denselben exakten Frozen-Suite-Command wie die Vergleichsbaseline | Baseline-Selektor `src/lib/composer` + `src/lib/video-composer`: 482 (G2.2) → 527 (G2.3), beide grün; enger Selektor separat ausgewiesen | erfüllt |

## Testbaseline (wörtlich)

- `npx vitest run src/lib/composer src/lib/video-composer` → 46 Dateien / 527 Tests grün (Baseline-Command, identisch zu G2.2)
- `npx vitest run src/lib/composer/__tests__` → 30 Dateien / 373 Tests grün (enger Selektor)
- `npx tsgo --noEmit` → keine Fehler

Die frühere Diskrepanz „482 vs. 373“ war ein Selektor-Vergleichsfehler im Zwischenbericht, keine Regression.

## DB-Smoke

15 Fälle, alle PASS, jeweils mit Fixture-Rollback (0 Restzeilen): A1–A6 (Upload applied, stale run, stale generation, falscher From-State, falsche `write_id`, Snapshot nach Output-Clear), B1–B3 (Pika applied + Clear, stale, Clear-Flag-Allowlist), C1–C2 (CTA hard fail, stale), D (Signatur-Eindeutigkeit) sowie drei Audit-Fälle (abgelehnter Upload, abgelehntes Clear-Flag, angewendeter Upload) mit `run_id`, `generation`, `applied`, `reason`, `caller_role`.

## Was diese Freigabe bewirkt

- Kein Code- oder Schema-Change mehr in diesem Schritt; der Bericht liegt in `docs/v431-g2-3-report.md`.
- Mit der Freigabe gilt G2.3 als DONE / FROZEN.
- G2.4 wird erst nach separater Freigabe aufgesetzt; `compose-dialog-segments` (Deferred-Refund-Race) bleibt ausdrücklich offen.

## Nach der Freigabe

STOP. Keine weiteren Änderungen ohne neuen Auftrag.
