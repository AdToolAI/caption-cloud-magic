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

## Production Cutover + Watchdog-Forward Resmoke (2026-08-15)

### 1. Pre-Deploy Cutover-Gate (In-flight-Scope)

Messung 2026-08-15T17:07:18Z:

- Base-Video (`pipeline_state='plate_rendering'` AND `replicate_prediction_id IS NOT NULL`
  AND `plate_pipeline_job_id IS NULL`): **0**
- Sync (`pipeline_state IN (lipsync_dispatched, lipsync_running, lipsync_muxing)`,
  Pass mit `job_id` und ohne `pipeline_job_id`): **0**

Gate **PASS** (0/0) → Deploy freigegeben.

### 2. Deployment

Deployt 2026-08-15T17:07:54Z: `compose-video-clips`, `compose-dialog-segments`,
`lipsync-watchdog`, `recover-stuck-composer-clip`, `modelark-poll`.
DB-Migration/Bind-RPCs waren bereits Production. Keine Änderung an der
`sync-so-webhook`-Apply-Semantik, kein Frontend-Deploy.

Security-/Schema-Smoke (beide RPCs): genau eine Signatur, `SECURITY DEFINER`,
`search_path = pg_catalog, public`, EXECUTE nur `service_role`
(anon/authenticated/public = N), Stage-Gates `base_video` bzw. `sync_segment`
inkl. Scene-/Run-/Generation- bzw. Pass-Identitätsgate vorhanden.

### 3. Gezielter Watchdog-Forward-Resmoke (echt)

Szene `b34d1eae-6bf3-437d-a6ab-624be0155adc`.

Vorlauf (Run `aba7f1d5…`, Gen 6, 17:09:59Z): atomare Plate-Bindung bestätigt —
`plate_pipeline_job_id = f6a53693…` sofort mit `replicate_prediction_id` gesetzt;
Sync-Pass 0 mit Paar `job_id 574fda4c… / pipeline_job_id 2b3d10d8…`.

Resmoke-Run **`51f80471-8a3b-42be-894b-6754c4a49ef8`, Gen 7**:

- Sync-Dispatch 17:24:16Z, Ledger `sync_segment` `d12b2704-8d1c-422d-b24a-3b8fcf27f5a9`,
  `attempt_no = 1`, Provider-Job `50b402be-31d0-4f94-bc2f-9ae4f850fe42`.
- Attempt-Paar im Pass-Slot: `passes[0].job_id = 50b402be…` +
  `passes[0].pipeline_job_id = d12b2704…`.
- `lipsync-watchdog` (echte Production-Invocation, Antwort 17:25:39Z) las genau
  diesen Pass und meldete
  `polled: [{scene_id: b34d1eae…, job_id: 50b402be…, status: COMPLETED}]`,
  d. h. Poll + Forward an `sync-so-webhook` inkl. `pipeline_job_id`-Query-Parameter.
- Telemetrie `composer_callback_observations`, Stage `sync_segment`,
  `external_job_id = 50b402be…`:
  - 17:25:33.810Z — direkter Provider-Callback → `bound`, `pipeline_job_id = d12b2704…`
  - 17:25:35.324Z — **Watchdog-Forward** (Re-Injection, zeitlich innerhalb des
    Watchdog-Poll-Fensters 17:25:33–17:25:39Z, kein zweiter Provider-Callback) →
    **`bound`**, identischer `external_job_id`, identischer `pipeline_job_id`.
    Dieser Eintrag ersetzt den früheren `missing_binding`-Befund vom 16:14:03Z.
- Kein neuer Ledger-Job und kein neuer Attempt durch die Re-Injection:
  für `50b402be…` existiert genau **1** Ledger-Zeile (`attempt_no = 1`), und der
  Run hat genau **1** `sync_segment`-Job.
- Run-/Generation-/Pass-Identität unverändert (`run_id 51f80471…`, `gen 7`, Pass 0).
- Kette lief fachlich normal weiter: `audio_mux` 17:26:02Z `bound`,
  Szene `pipeline_state = complete`, `lip_sync_status = done`.

### 4. Regression-/Telemetrie-Check (Fenster ab 17:07Z)

7 Observationen, davon **7× `bound`**:
`missing_binding = 0`, `wrong_job = 0`, `stale_run = 0`, `stale_generation = 0`,
`binding_pending = 0`. Keine `reinject_missing_pipeline_job_id`-Errors.
Die beiden latenten Base-Video-Forwarder wurden bewusst nicht künstlich provoziert
(Vertrag über S1–S9 + statischen Guard abgedeckt).

### 5. Status

**G3.1f DONE / FROZEN.**
**G3.2.2 kann anschließend geöffnet werden.**
