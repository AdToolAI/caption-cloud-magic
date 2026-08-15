# v431 G3.1f — Provenienz-Transport-Fix für Recovery-/Poll-Forwarder

Status: **IMPLEMENTED / SMOKED — AWAITING PRODUCTION EXERCISE**
Stand: 2026-08-15

## Auftrag

Enger Fix für exakt die drei in G3.1e identifizierten Re-Injection-Pfade ohne
`pipeline_job_id` (`lipsync-watchdog`, `recover-stuck-composer-clip`,
`modelark-poll`). Keine neue Ledger-Identität, keine Resolve-Heuristik im
Webhook, Pointer strikt attempt-bound.

## Vertragserfüllung

| Vertragspunkt | Umsetzung |
| --- | --- |
| Pointer ist attempt-bound | `plate_pipeline_job_id` (Spalte) bzw. `dialog_shots.passes[i].pipeline_job_id` (Slot) wird nur zusammen mit der Provider-ID desselben Versuchs gesetzt. |
| Atomare Paarbindung | `composer_bind_plate_attempt()` und `composer_bind_sync_pass_attempt()` schreiben Provider-ID + Pointer in einer Transaktion unter Row-Lock; `update_dialog_pass_slot()` verweigert halbe Paare. |
| Keine neue Ledger-Identität | Beide RPCs binden ausschließlich einen bereits existierenden `composer_pipeline_jobs`-Datensatz; kein Insert. |
| Paar-Invariante im Reset | Trigger `composer_scenes_plate_pointer_pair` nullt den Pointer bei jedem Wechsel/Reset von `replicate_prediction_id`; alle Slot-Resets nullen `job_id` und `pipeline_job_id` gemeinsam. |
| Post-Cutover nie ohne Pointer reinjecten | Alle drei Forwarder sind fail-closed: ohne Pointer kein Callback, stattdessen `logMissingReinjectPointer()`-Telemetrie. |
| G0-Sicherheitsvertrag | Beide neuen RPCs sind `SECURITY DEFINER`, `search_path = pg_catalog, public`, `EXECUTE` nur für `service_role`. Die Trigger-Funktion ist für `anon`/`authenticated`/`PUBLIC` revoked. |
| Gate-Bindung | Guards prüfen `scene_id`, `run_id`, `plate_generation` (Plate) bzw. `pass_idx`-Identität aus den Ledger-Metadaten (Sync). |

## Geänderte Artefakte

- Migration `20260815164946_v431_g3_1f_transport_pointers.sql` — Spalte, Trigger,
  Bind-RPCs, gehärtetes `update_dialog_pass_slot`.
- Folge-Migration — `REVOKE` auf der Trigger-Funktion + transaktionaler DB-Smoke.
- `_shared/v431-ledger.ts` — `bindPlateAttempt`, `bindSyncPassAttempt`,
  `logMissingReinjectPointer`.
- Dispatcher: `compose-video-clips`, `compose-dialog-segments`.
- Forwarder: `lipsync-watchdog`, `recover-stuck-composer-clip`, `modelark-poll`.
- Reset-Pfade: `sync-so-webhook`, `report-lipsync-motion-probe`.
- `composer_reset_lipsync_full` benötigt keine Anpassung: es setzt
  `replicate_prediction_id = NULL` und `dialog_shots = NULL`, der Trigger nullt
  den Pointer dadurch mit (verifiziert).

## Verifikation

DB-Smoke S1–S9 (transaktional, Testdaten anschließend gelöscht) — alle PASS:

| Smoke | Prüfung | Ergebnis |
| --- | --- | --- |
| S1 | Plate-Bindung schreibt Provider-ID + Pointer | `bound`, Paar gesetzt |
| S2 | identische Wiederholung | `noop` |
| S3 | falsche `plate_generation` | abgewiesen, kein Write |
| S4 | Reset der Provider-ID | Pointer genullt |
| S5 | Legacy-Einzelschreiber | kein verwaister Pointer |
| S6 | Sync-Bind mit falschem `pass_idx` | abgewiesen, keine Teilbindung |
| S7 | Sync-Bind korrekt | Paar im Slot |
| S8 | `job_id` ohne Pointer im Slot | abgewiesen |
| S9 | Slot-Reset | beide Felder null |

Statischer Guard: `src/lib/video-composer/__tests__/v431G31fTransportPointer.test.ts`
(6/6 PASS) friert fail-closed-Forwarding, atomare Dispatch-Bindung und
paarweise Resets ein.

Deno-Vertragstests `supabase/functions/_shared/`: 61 passed / 9 failed.
Alle 9 Fehler sind vorbestehend und G3.1f-fremd:
8x `asd-strategy.test.ts` (unberührt) und 1x `scene-state-write-contract.test.ts`
(Legacy-`pipeline_state`-Writes, per `git blame` vom 12./13.08., u. a.
`compose-video-clips:1733`, `recover-stuck-composer-clip:108` — bekannte G2-Schuld).
`plate-attempt.test.ts` und `lipsync-frozen-contract.test.ts` sind grün.

Typecheck (`tsgo --noEmit`): grün.

Bestand ungebundener In-Flight-Jobs zum Zeitpunkt der Umstellung: 0.

## Offen (kein Teil von G3.1f)

- Produktions-Exercise der drei Forwarder-Pfade (bisher im Drain-Fenster nie
  ausgelöst) zur Bestätigung von `bound`-Verdikten statt `missing_binding`.
- G3.2.2 bleibt bis dahin BLOCKED.
