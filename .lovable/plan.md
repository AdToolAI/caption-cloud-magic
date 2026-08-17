# FA-4/P1-A — Accounting Fix Contract (Analyse + Lock, kein Code)

Ziel: Ein Credit darf nie ohne belegte Belastung entstehen. Kein Code, keine Migration, kein Deploy, kein Render in diesem Schritt. Der Run `d669dd27…` und die unberechtigten 6,30 € bleiben unangetastete Evidence.

## 1. Read-only verfolgter Debit-/Refund-Pfad (Ist-Zustand)

Belastungswege im Composer, beide führen in dieselbe Tabelle:

- **Legacy (heute aktiv):** `compose-video-clips` Zeile 5302 → RPC `deduct_ai_video_credits(p_user_id, p_amount, p_generation_id)` → Wallet-Debit + `INSERT INTO ai_video_transactions (type='deduction', amount_euros = -amount, generation_id = <projectId>, description='Video generation cost')`. **Post-hoc**, erst nach der Dispatch-Schleife.
- **v427B-Reservierung (heute AUS):** `reserveRunCredits` → `composer_reserve_run_credits` → Wallet-Debit + `composer_run_reservations`-Row + `ai_video_transactions (type='deduction', generation_id=<projectId>, metadata.reservation_id)`. Settlement über `composer_settle_run_reservation` schreibt bei Überdeckung einen `refund` mit `metadata.reservation_id`.
  Flag-Beleg: `system_config` enthält nur `v427.pipeline_jobs_dual_write` und `v427.callback_guard_mode`; `v427.credit_reservations` fehlt → `resolveBool(null)=false` → Default OFF. Passend dazu: 0 Zeilen in `composer_run_reservations` für S09.

Refund-Weg heute: `recover-stuck-composer-clip.refundScene()` berechnet `duration_seconds × CLIP_COSTS[clip_source][tier]` und ruft `refund_ai_video_credits(p_user_id, p_amount_euros, p_generation_id=scene_id)`. Die RPC addiert unkonditioniert auf die Wallet und schreibt `type='refund'`. Kein Lesen einer Belastung, keine Idempotenz, kein Unique-Key.

### Kanonische Charge-Provenance (Antwort auf die gestellte Frage)

**`ai_video_transactions` ist die kanonische Charge-Provenance**, mit `id` als stabilem Charge-Identifier. Begründung:
- Beide Debit-Wege schreiben dorthin, ausnahmslos und atomar in derselben Transaktion wie der Wallet-Debit.
- `credit_usage_events` ist ein Feature-Zähler (`credits_used` als Integer, `feature_code`) ohne Geldbezug zum Wallet — ungeeignet.
- `credit_reservations` gehört zu einem anderen (Text-/Feature-)Kreis und ist nicht der Composer-Weg.
- `composer_run_reservations` ist eine **zusätzliche** Provenance-Ebene, aber nur wenn das v427-Flag an ist; ihre Debits erscheinen ohnehin auch in `ai_video_transactions` (`metadata.reservation_id`).

Kein neues Accounting-Modell. Die Lücke ist nicht die Tabelle, sondern die fehlende Verknüpfung Refund→Charge.

### Belegte Präzisionslücke, die der Contract lösen muss

`generation_id` der Composer-Belastung ist die **project_id**, nicht die scene_id, und deckt eine **aggregierte Mehr-Szenen-Summe** ab. Der Watchdog refundet dagegen pro Szene mit `generation_id=scene_id`. Es gibt heute also gar keinen scene- oder run-scharfen Charge-Identifier im Composer-Legacy-Pfad — genau deshalb konnte der Preis frei erfunden werden. Der Contract muss daher die Zuordnung Charge → (run, scene) explizit fordern, statt sie anzunehmen.

## 2. Vertragsregeln (LOCKED)

1. **Charge-Provenance-Pflicht.** Ein Refund entsteht nur gegen eine existierende, refundierbare Belastung: eine `ai_video_transactions`-Zeile mit `type='deduction'` (oder eine `composer_run_reservations`-Row im reservierten Zustand). `duration × provider_price` ist keine Geldquelle und darf im Recovery-Pfad nicht mehr als Betrag dienen.
2. **Betrag aus eindeutig zugeordneter Charge.** Der Refundbetrag kommt ausschließlich aus einer Charge-Provenance, die eindeutig diesem Run-/Scene-Anteil zugeordnet ist (`abs(amount_euros)` einer run-/scene-scharfen Deduction bzw. `reserved_euros − actual_euros` der zugehörigen Reservierung), nie aus `CLIP_COSTS`/`videoPricingCatalog`. Preisänderungen nach der Belastung verändern die Erstattung nicht. **Aggregierte Legacy-Project-Charges sind ohne belegte Run-/Scene-Zuordnung nicht refundierbar; `abs(total project deduction)` darf niemals als Scene-Refund verwendet werden.** Fehlt die belegte Charge↔Run-Zuordnung, gilt zwingend Refund = 0.
3. **Keine Charge ⇒ kein Credit.** Der Recovery-Pfad terminalisiert die Szene weiterhin (`clip_status='failed'`, `pipeline_state='failed'`, cinematic-sync-Felder wie heute), aber mit Refund 0 und einem `clip_error`, das „keine Belastung gefunden" ausweist. Failure-Terminalisierung ist niemals von einem Refund abhängig.
4. **Idempotenz auf DB-Ebene mit persistierter Refund→Charge-Referenz.** Jeder erfolgreiche Refund persistiert dauerhaft eine eindeutige Referenz auf die ursprüngliche Charge (`charge_id`, bei Reservierungen zusätzlich `reservation_id`) plus `run_id` und `refund_reason`. Die DB-Serialisierung garantiert **höchstens einen Refund pro (charge_id, refund_reason)**. Ein Row-Lock ohne persistierte Provenance ist ausdrücklich zu schwach (Auditierbarkeit). `clip_error LIKE 'watchdog_%'` und jeder andere Caller-Guard zählen nicht als Idempotenzmechanismus.
5. **Race-Safety.** Zwei parallele Recovery-Caller erzeugen zusammen genau eine Gutschrift — Serialisierung im DB-Schritt (Row-Lock auf der Charge bzw. Unique-Constraint auf dem Refund-Schlüssel), nicht im Edge-Code.
6. **Run-/Charge-Schärfe statt scene_id.** `scene_id` allein ist kein Idempotenzschlüssel; eine Szene hat legitim mehrere Runs. Der Schlüssel ist die Charge-Identität, mit `run_id` als Zuordnungsdimension. Solange der Legacy-Debit nur `generation_id = project_id` trägt, gilt: der Contract verlangt eine eindeutige Charge↔Run-Zuordnung, und ohne sie greift Regel 3 (kein Credit).
7. **Bereits refundete Charge ⇒ No-op.** Zweiter Aufruf liefert Erfolg mit Betrag 0, kein Fehler, keine zweite Gutschrift, keine zusätzliche `ai_video_transactions`-Zeile.
8. **Keine synthetischen Teil-/Sammelbeträge.** Mehrere echte Charges eines Runs werden einzeln provenance-basiert behandelt. Der Watchdog darf keine Gesamtsumme bilden und keine aggregierte Charge anteilig aufteilen, wenn der Anteil nicht belegt ist.
9. **Unveränderte Nachbarsysteme.** Keine Änderung an `dispatch_uncertain`, Reaper-Schwellen, `composer_reap_orphaned_dispatches`, RS3-Fence, Ledger-Statusmodell, Retry-Verhalten, Plate-Dispatch, Provider-Auswahl oder Lip-Sync-Kette. Scope ist ausschließlich der Geld-Schritt im Recovery-Pfad.
10. **Evidence bleibt stehen.** Die 6,30 € aus `b6abc1b6-55a6-4a78-9fcf-26cf329504aa` werden in diesem Schritt nicht korrigiert; eine etwaige Bereinigung ist ein separates, eigenes Gate.

## 3. Verbindliche Vertragstests (genau sechs)

| # | Fall | Erwartung |
|---|---|---|
| T1 | keine Charge vorhanden | Szene wird `failed`, Refund = 0, keine neue `ai_video_transactions`-Zeile, Wallet unverändert |
| T2 | eine belegte Charge | genau deren ursprünglicher Betrag, genau eine Gutschrift |
| T3 | derselbe Refund zweimal | zweiter Aufruf No-op (Betrag 0, kein Fehler, keine zweite Zeile) |
| T4 | zwei parallele Refund-Caller | genau eine Gutschrift insgesamt |
| T5 | Preis-Konfiguration nach der Charge geändert | Refund bleibt beim ursprünglichen Charge-Betrag |
| T6 | zwei Runs derselben Szene mit je eigener Charge | Refunds bleiben run-/charge-spezifisch, keine Kollision, keine Doppelgutschrift |

## 4. Offene Entscheidung für den nächsten Schritt (bewusst nicht vorweggenommen)

Ob DB-Idempotenz eine kleine Migration braucht, hängt an einer Frage: Es gibt heute **keinen** Refund→Charge-Verweis (die `refund`-Zeile trägt nur `generation_id`, `metadata` ist NULL). Damit ist entweder ein Verweis-/Unique-Feld auf `ai_video_transactions` nötig oder eine RPC, die Idempotenz über einen Row-Lock der Charge plus deterministischen Existenz-Check herstellt. Diese Wahl wird erst nach diesem Lock getroffen.

**FA-4/P1-A ACCOUNTING FIX CONTRACT LOCKED → STOP.**
