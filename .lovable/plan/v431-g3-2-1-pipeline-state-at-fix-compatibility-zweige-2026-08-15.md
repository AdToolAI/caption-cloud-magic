# v431 G3.2.1 — pipeline_state_at-Fix (Compatibility-Zweige)

Enger Fix in der Datenbankfunktion `composer_finalize_plate_scene`, damit ein state-preserving Compatibility-Finalize die Staleness-Provenienz der Szene nicht mehr zerstört.

## Problem

In den Compatibility-Zweigen (`plate_ready`, `audio_prep`, `audio_ready`) bleibt der Zustand fachlich erhalten, aber die Legacy-Bridge schreibt `pipeline_state_at` auf `now()`. Watchdog- und Staleness-Semantik sehen die Szene dadurch als "gerade eben eingetreten".

## Änderung (nur diese Funktion, kein Edge-Function-Redeploy)

1. Unter dem bereits gehaltenen Row-Lock den vollständigen Canonical-Tupel snapshotten: `pipeline_state`, `pipeline_substate`, `pipeline_state_at`, `pipeline_state_run_id`.
2. Output-Finalisierung unverändert durchführen.
3. Wenn die Bridge State oder Substate verschoben hat: wie bisher zurückstellen (jetzt zusätzlich `pipeline_substate` explizit).
4. Danach im Compatibility-Zweig ein letzter Write ausschließlich auf `pipeline_state_at = <Snapshot>` — keine Legacy-Felder, kein State/Substate, kein `updated_at`-Seiteneffekt auf State-Spalten.
5. Erst danach den Ledger-Job auf `succeeded` setzen. Alles bleibt ein DB-Commit.

**Ausgenommen:** `plate_rendering → plate_ready` bleibt eine echte Transition; `pipeline_state_at` wird dort korrekt auf den Übergangszeitpunkt gesetzt.

## Verifikation vor Produktions-Resmoke

Smoke **S-A2** erweitern und erneut laufen lassen (transaktional, Rollback):

- `plate_ready`, `audio_prep`, `audio_ready` — je mit konsistenten und mit stale Legacy-Spiegeln:
  alle vier Canonical-Felder nach vollständigem RPC exakt wie vorher; Outputs korrekt; Job `succeeded`.
- `plate_rendering`: State → `plate_ready`, `pipeline_state_at` entsprechend echter Transition aktualisiert.
- Rejected States: Row und Job vollständig unverändert.
- Duplicate-Callback: No-op.
- Frozen-Suite 540/540, `tsgo`, Deno-Baseline unverändert (bestehender `_shared/ambient-audio.ts`-Typfehler bleibt offene Schuld).

## Abschluss

`docs/v431-g3-2-1-report.md` aktualisieren, kein Redeploy, dann STOP für dein GO zum echten Plate-Produktions-Resmoke.
