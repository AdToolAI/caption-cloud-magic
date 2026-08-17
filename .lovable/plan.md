# FA-4/P1-A — Provenance-based Refund (Implementation)

Ziel: Der Watchdog erstattet nur noch gegen eine DB-seitig belegte, run-scharfe Belastung. Ohne Beleg: 0 €, Szene failt trotzdem.

## 1. Additive Migration

### a) Partial Unique Index (wie vom Nutzer formuliert)

```sql
CREATE UNIQUE INDEX CONCURRENTLY-frei (in Migration normal)
  ai_video_transactions_refund_provenance_uniq
ON public.ai_video_transactions (
  (metadata->>'refund_charge_id'),
  (metadata->>'refund_reason')
)
WHERE type = 'refund'
  AND metadata ? 'refund_charge_id'
  AND metadata ? 'refund_reason';
```

Legacy-Historie (inkl. der 6,30-€-Evidence mit `metadata IS NULL`) liegt bewusst außerhalb der Idempotenzdomäne. Kein Backfill, keine Korrektur.

### b) Neue RPC `public.composer_refund_charge(p_charge_id uuid, p_run_id uuid, p_refund_reason text)`

`SECURITY DEFINER`, `search_path = public`, EXECUTE nur für `service_role`.

Atomarer Ablauf:

1. `SELECT ... FROM ai_video_transactions WHERE id = p_charge_id AND type = 'debit' FOR UPDATE` — existiert die Row nicht: `no_charge`.
2. **Provenance-Beweis DB-seitig** (Caller-Behauptung zählt nicht). Akzeptiert wird die Charge nur, wenn eine dieser Bedingungen gilt:
   - `generation_id = p_run_id`, oder
   - `metadata->>'run_id' = p_run_id::text`, oder
   - `metadata->>'reservation_id'` verweist auf genau eine `composer_run_reservations`-Row, deren Run `p_run_id` ist (Verifikation gegen die Reservation-Tabelle, keine neue Reservation-Semantik).
   Trifft nichts zu (heutiger Legacy-Debit mit `generation_id = project_id`): `no_charge`, Wallet unverändert.
3. Aggregat-Schutz: Ist die Charge nicht eindeutig diesem Run zuzuordnen (z. B. Project-Aggregat), `no_charge`. `abs(total project deduction)` wird nie verwendet.
4. Refund-Existenzprüfung innerhalb derselben Transaktion auf `(refund_charge_id, refund_reason)`: vorhanden → `already_refunded`, 0 €.
5. Sonst atomar: Wallet-Gutschrift um `abs(charge.amount_euros)` + Insert einer `type='refund'`-Transaction mit
   `metadata = { refund_charge_id, run_id, refund_reason }` → `refunded`.

Rückgabe (jsonb): `{ outcome, amount_euros, refund_transaction_id }` mit `outcome ∈ {no_charge, already_refunded, refunded}`.
Betrag ausschließlich aus der validierten Charge — kein `CLIP_COSTS`, kein Caller-Betrag.

## 2. `recover-stuck-composer-clip`

`refundScene()` wird ersetzt:

- Run auflösen: jüngste `composer_scene_runs`-Row der Szene → `run_id`. Kein Run → `no_charge` (kein RPC-Call).
- Charge auflösen: `ai_video_transactions` mit `type='debit'` und run-scharfer Provenance (`generation_id = run_id` oder `metadata->>'run_id' = run_id`). Keine Kandidatenrow oder mehrdeutig → `no_charge`.
- Sonst genau ein Aufruf `composer_refund_charge(charge_id, run_id, 'watchdog_stuck_clip')`.
- `markFailed()` läuft in allen drei Ausgängen unverändert; die Fehlermeldung nennt den Refundbetrag nur bei `refunded`.
- `CLIP_COSTS`-Import entfällt aus dieser Funktion.

## 3. Die sechs Contracttests

Als Deno-Tests neben der Funktion (`recover-stuck-composer-clip/refund-provenance.test.ts`, RPC-Ergebnisse gemockt bzw. reine Resolver-Logik):

1. Legacy-Project-Charge ohne Run-Zuordnung → `no_charge`, 0 €, Szene failt.
2. Run-scharfe Charge → `refunded`, Betrag exakt `abs(amount_euros)` der Charge.
3. Zweiter Aufruf mit identischem `(charge_id, reason)` → `already_refunded`, 0 €.
4. Refundbetrag ignoriert Preisänderungen (CLIP_COSTS abweichend) — Betrag bleibt der Charge-Betrag.
5. Kein Run / keine Charge → kein RPC-Aufruf, Terminalisierung trotzdem.
6. Reservation-Provenance nur bei DB-verifizierter Zuordnung, sonst `no_charge`.

## Nicht angefasst

`refund_ai_video_credits`, Reaper/Ledger/RS3, Pricing, Provider-/Plate-Dispatch, Lip-Sync, historische 6,30-€-Evidence.

Nach Umsetzung + sechs grünen Tests: **FA-4/P1-A IMPLEMENTED / TESTS GREEN → STOP vor Deploy.**
