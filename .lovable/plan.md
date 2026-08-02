## Warum im Hard-Reset überhaupt erstattet wird

Verifiziert im Code:

- `_shared/lipsync-fail.ts` erstattet nur, wenn `dialog_shots.refunded !== true` **und** `lip_sync_applied_at` leer ist. Fertige Lip-Sync-Szenen steigen früh mit `already_applied` aus.
- `_shared/scene-hard-reset.ts` Zeile 178–190 ruft `failLipSync` mit `refundCredits = dialog_shots.cost_credits` auf.

Die automatische Erstattung hängt am Fehler-Event. Beim Hard-Reset gibt es kein Fehler-Event — der Nutzer bricht selbst ab. Ohne den Aufruf würden reservierte Credits eines laufenden Sync.so-/Render-Jobs verfallen. Das ist der einzige Grund für die Zeile.

## Die reale Lücke

Der Guard prüft nur `lip_sync_applied_at`. Eine Szene, deren **Plate erfolgreich gerendert** wurde (Video geliefert, Provider bezahlt), die aber nie Lip-Sync erreicht hat, erfüllt diese Bedingung nicht. Klickt der Nutzer dort auf „Clip generieren", wird der gelieferte Clip erstattet — eine Gratis-Wiederholung auf Kosten der Marge.

## Änderung (v374)

1. In `scene-hard-reset.ts` die Erstattung an einen expliziten Zustandstest binden statt sie pauschal mitzugeben:
   - erstatten nur wenn der Job **offen** ist: `dialog_shots.status` in `queued|dispatched|running|rendering_preflight` oder eine aktive `syncso_inflight_jobs`-Zeile bzw. `replicate_prediction_id` existiert.
   - liegt ein verwertbares Ergebnis vor (`clip_url` der aktuellen Generation vorhanden **oder** `dialog_shots.status = 'completed'`), wird `refundCredits: 0` übergeben; Abbruch/Cleanup/Generationswechsel laufen unverändert.
2. `HardResetResult` um `refund_decision: 'refunded' | 'skipped_delivered' | 'skipped_already_refunded' | 'nothing_open'` erweitern und in `composer-hard-reset-scene` mitloggen, damit der Grund in den Logs nachvollziehbar ist.
3. Regressionstests in `supabase/functions/_shared/scene-hard-reset.test.ts`: laufender Job → Erstattung; gelieferte Plate ohne Lip-Sync → keine Erstattung; bereits erstattet → keine Doppelerstattung; fertiges Lip-Sync → unverändert `already_applied`.

## Technische Details

Keine Schemaänderung. Reine Entscheidungslogik vor dem `failLipSync`-Aufruf; die Idempotenz-Garantien in `lipsync-fail.ts` bleiben unangetastet, damit alle anderen Aufrufer (Watchdog, Webhook, Dispatch-Guards) ihr Verhalten behalten.
