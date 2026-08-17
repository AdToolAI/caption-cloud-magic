# FA-4 — Nachbeobachtung Reaper/Watchdog/Refund (read-only, abgeschlossen)

Run `d669dd27-a9b9-4c0c-b3bf-7f597e3fc862`, Szene S09 `ece6a71c-118e-436a-ac1a-15182cc88ddb`.
Messzeitpunkt 2026-08-17 10:53:29Z. Keine Writes, kein Retry, kein Reset, kein Render.

## Beobachtete Kette — exakt wie modelliert

| Erwartung | Beobachtung | Ergebnis |
|---|---|---|
| Ledger `dispatching` → `dispatch_uncertain` durch Reaper | `base_video`, `status=dispatch_uncertain`, `error_code=reaper_orphaned_dispatch`, `updated_at=10:51:00.235Z`, `attempt_no=1`, `external_job_id=NULL` | eingetreten |
| Szene `plate_rendering`/`generating` → `failed` durch qa-watchdog | `clip_status=failed`, `pipeline_state=failed`, `clip_error='watchdog_no_prediction_id (refunded €6.30)'`, `updated_at=10:52:02.746Z`; `pipeline_substate=anchor`, `active_run_id` unverändert | eingetreten |
| Refund-Event / Wallet-Differenz | `ai_video_transactions` `b6abc1b6…`: `type=refund`, `amount_euros=6.30`, `balance_after=87.28`, `generation_id=<scene>`, `created_at=10:52:02.709Z`. Wallet 80,98 € → **87,28 €** | eingetreten — unbelegt |
| Kein Provider-Job, kein neuer Ledger-Job, keine Preclip-Row | Ledger weiterhin genau 1 Job (nur `base_video`), kein `external_job_id`, `replicate_prediction_id=NULL`, `video_renders` seit 10:30Z = 0 | eingetreten |

Cron-Gesundheit: `composer-reap-orphaned-dispatches` last_run 10:53:00Z ok (`reaped_count=0`, threshold 10 min), `qa-watchdog` last_run 10:52:03Z ok (1706 ms).

## Klassifizierung (festgezogen)

- **Recovery-Semantik: strukturell VERIFIED.** Reaper→Watchdog-Kette greift deterministisch, kein Redispatch, kein Doppel-Job, kein Doppelrefund, keine Exactly-Once-Verletzung. Ein neuer allgemeiner Recovery-Contract wird nicht eröffnet.
- **FA-4/P1-A — unbacked watchdog refund (BESTÄTIGT).** 6,30 € gutgeschrieben ohne jede Belastung: keine `ai_video_transactions` vom Typ debit, keine `credit_usage_events`, keine `credit_reservations`, keine `composer_run_reservations` für diesen Run. Betrag stammt rein aus Providerpreis (15 s × 0,42 €/s). Idempotenz existiert nur als Caller-Guard (`clip_error LIKE 'watchdog_%'`), nicht auf DB-/Transaktionsebene — Geld-/Credit-Invariante verletzt.
- **FA-4/P1-B — compose-video-clips CPU exhaustion before plate dispatch (BESTÄTIGT).** `CPU Time exceeded` um 10:41:27Z, zwei Sekunden nach dem Anchor-Pin, vor jedem Provider-Dispatch. Blockiert FA-4 vor Preclip.
- **FA-4/P3 — `AWS_REGION='Global'`** als Konfig-Backlog notiert; Fallback auf `eu-central-1` greift, für FA-4 nicht blocking.
- **FA-4/P0 Exactly-Once-Fixstrecke:** bleibt **DEPLOY VERIFIED**, in diesem Retest jedoch **nicht ausgeübt** (Preclip nie erreicht).
- FA-1 bis FA-3 bleiben PASS.

## Reihenfolge danach (noch nichts umgesetzt, jeweils eigenes Gate)

1. **FA-4/P1-A — enger Accounting Fix Contract, zuerst.** Refund nur gegen belegte Debit-/Reservation-Provenance; kein aus Providerpreis berechneter Refund ohne zugehörige Belastung; echte Refund-Idempotenz auf DB-/Transaktionsebene statt Caller-Guard. Keine Änderung an Reaper-, RS3-, Ledger- oder Provider-Semantik.
2. **FA-4/P1-B — danach.** Ausschließlich: Anchor-Arbeit darf den Plate-Dispatch-Worker nicht vor dem Dispatch töten. Kein Retry- oder Recovery-Rewrite.
3. P3-Konfig separat, ohne Gate-Bindung.

**STOP.** Warte auf GO für den FA-4/P1-A Accounting Fix Contract.
