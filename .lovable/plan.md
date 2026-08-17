# FA-4 — Zombie-/Refund-/Recovery-Audit (read-only)

Scope: Run `d669dd27-a9b9-4c0c-b3bf-7f597e3fc862`, Szene S09 `ece6a71c-118e-436a-ac1a-15182cc88ddb`.
Kein Retry, kein Reset, kein Render, keine Writes. Stand der Messungen: 2026-08-17 10:50Z.

## Befund je Auditfrage

1. **Bleibt base_video dauerhaft `dispatching`?**
   Nein — der Reaper greift, aber erst spät. Ledger-Row `2a2c796b…`: `stage=base_video`, `status=dispatching`, `external_job_id=NULL`, `started_at=10:40:05.867Z`, `updated_at` unverändert, kein Heartbeat. Cron `composer-reap-orphaned-dispatches` läuft jede Minute und ist gesund (`cron_heartbeats`: last_run 10:48:00Z, ok, reaped_count 0 — Schwelle noch nicht erreicht).

2. **Timeout-/Stale-Grenze für `dispatching`.**
   `composer_reap_orphaned_dispatches(10)`: `status IN ('pending','dispatching') AND external_job_id IS NULL AND started_at < now() - 10 min` → `status='dispatch_uncertain'`, `error_code='reaper_orphaned_dispatch'`. Für diesen Job also ab ca. 10:50:06Z.

3. **Terminal oder Recovery-Pfad?**
   `dispatch_uncertain` ist bewusst nicht-terminal und steht in `RETRYABLE_FAILURE_REASONS` (`dispatch_uncertain_recovery`). Der Reaper schreibt ausschließlich die Ledger-Row: keine Szenen-Transition, kein Refund, kein Dispatch.

4. **Wird die Szene mitterminalisiert?**
   Nicht durch den Ledger. Szene steht weiter auf `pipeline_state=plate_rendering`, `pipeline_substate=anchor`, `clip_status=generating`, `active_run_id` gesetzt, `clip_url=NULL`, `replicate_prediction_id=NULL`, `plate_pipeline_job_id=NULL`, `updated_at=10:41:25Z`.
   Terminalisiert wird sie von `qa-watchdog` Block 4b: `clip_status='generating' AND clip_url IS NULL AND updated_at < now()-10min` → invoke `recover-stuck-composer-clip`. Dort greift wegen fehlender `replicate_prediction_id` der Zweig `no_prediction_refunded`: `clip_status='failed'`, `pipeline_state='failed'`, cinematic-sync-Felder genullt — plus Refund. Block 4c-2 (orphan ohne Run) greift hier nicht, weil `active_run_id` gesetzt ist.

5. **Refund: ausgelöst, genau einmal, idempotent?**
   Kritischer Punkt. Es wurde **nie belastet**: `compose-video-clips` bucht erst nach der Dispatch-Schleife ab; der Worker starb davor. Beleg: `ai_video_transactions` seit 10:20Z = 0 Zeilen, Wallet `8948d3d9…` unverändert seit 2026-08-17 00:23:57Z (80,98 €), keine `credit_usage_events`, keine `credit_reservations`, keine `composer_run_reservations`.
   Der Watchdog-Refund ist aber unkonditioniert an den Fail-Pfad gekoppelt: `refundScene()` = `duration_seconds × CLIP_COSTS['ai-happyhorse'].standard` = 15 × 0,42 € = **6,30 € Gutschrift ohne vorherige Belastung**.
   Idempotenz: `refund_ai_video_credits` hat **keine** interne Idempotenz (reines `balance + amount` plus Insert). Schutz nur über den Caller-Guard `clip_error LIKE 'watchdog_%'` und den Vor-Check `clip_status !== 'generating'`. Ergebnis: pro Szene faktisch ein Refund, aber ein **unbelegter** — Accounting-Drift, keine Doppelerstattung.

6. **Automatischer Redispatch?**
   Keiner für `base_video`. Der Reaper dispatcht nicht. `lipsync-watchdog`/`buildRetryContext` bedient `sync_segment`/Mux, nicht die Plate-Stage. `recover-stuck-composer-clip` pollt nur Replicate und startet keinen Provider neu. → **kein Doppelrender-Risiko**.

7. **Wurde HappyHorse erreicht?**
   Kein Hinweis darauf. Log-Sequenz: 10:41:25Z Anchor gepinnt (faces 4/4, humans 4/4, identity ok) → 10:41:27Z `CPU Time exceeded` → `shutdown`. Danach keine Provider-Zeile, kein `external_job_id`, kein `replicate_prediction_id`, keine Bindung via `composer_bind_plate_attempt`. Formal bleibt es nach Vertrag `dispatch_uncertain` (der Tod des Workers ist kein Negativ-Beweis), praktisch spricht alles für „Provider nie erreicht".

8. **Anchor konsistent?**
   Ja. `reference_image_url` zeigt auf den gepinnten Multi-Cast-Anchor (`…ece6a71c…-fa4d467a3539.png`), `plate_generation=2`, `active_run_id`/`active_run_started_at` konsistent zum Run. Achtung: der Watchdog-Fail-Pfad nullt bei cinematic-sync `lip_sync_status`, `twoshot_stage`, `lip_sync_source_clip_url`, `dialog_shots` — `reference_image_url` und `dialog_turns` bleiben unberührt.

9. **Keine Folge-Artefakte.**
   `video_renders` seit 10:30Z: 0 Zeilen. Ledger: genau 1 Job (nur `base_video`), keine `sync_segment`-, keine `audio_mux`-, keine Stitch-Jobs. Preclip wurde nie erreicht → die FA-4/P0-Strecke wurde nicht durchlaufen und ist von diesem Run unberührt.

## Klassifizierung

- **Kein P0.** Kein Doppel-Dispatch, keine Doppelabrechnung, kein Datenverlust, kein automatischer Redispatch, Exactly-Once nirgends verletzt.
- **P1 (Plate-Stage-Blocker):** `compose-video-clips` stirbt nach 4 Anchor-Attempts an `CPU Time exceeded`, bevor der HappyHorse-Dispatch erfolgt.
- **P2 (Accounting-Hygiene, neu belegt):** Der Recovery-Pfad erstattet 6,30 € für eine Stage, die nie belastet wurde, und `refund_ai_video_credits` ist nicht idempotent — der Schutz hängt allein am `watchdog_`-Präfix im `clip_error`.
- **Beobachtungslücke:** Zwischen Worker-Tod (10:41:27Z) und Watchdog-Terminalisierung (~10:51Z) zeigt die UI ~10 Minuten lang einen laufenden Balken; die Ledger-Row bleibt bis 10:50Z `dispatching`.

## Vorschlag für den nächsten Schritt (noch nichts umgesetzt)

Reihenfolge zur Freigabe:
1. Nachbeobachtung read-only: bestätigen, dass Reaper (`dispatch_uncertain`) und Watchdog (`failed` + Refund) tatsächlich wie modelliert feuern — damit ist die Recovery-Schicht abgenommen oder widerlegt.
2. Danach P2 zuerst adressieren (Refund nur bei belegter Belastung, echte Idempotenz), weil das Geld betrifft.
3. Erst dann der enge Resilienz-Fix in `compose-video-clips` (Anchor-Attempts aus dem CPU-Budget des Dispatch-Workers lösen). Kein neuer Recovery-Contract nötig — der bestehende v431/G3.1-Vertrag fängt den Fall strukturell auf.
