# FA-4/P1-A — Provenance-based Refund (Implementation)

Ziel: Der Watchdog erstattet nur noch gegen eine DB-seitig belegte, run-scharfe Belastung. Ohne Beleg: 0 €, Szene failt trotzdem.

## 1. Additive Migration

### a) Partial Unique Index — höchstens ein Full Refund pro Charge

Die RPC kennt nur Full Refund (`abs(charge.amount_euros)`). Die finanzielle Idempotenzidentität ist deshalb allein die Charge, nicht der Grund.

```sql
CREATE UNIQUE INDEX ai_video_transactions_refund_charge_uniq
ON public.ai_video_transactions (
  (metadata->>'refund_charge_id')
)
WHERE type = 'refund'
  AND metadata ? 'refund_charge_id';
```

`refund_reason` bleibt verpflichtend in `metadata` (Audit/Diagnose), ist aber kein Teil der Idempotenzidentität. Damit gilt:
- gleiche Charge + gleicher Grund → `already_refunded`
- gleiche Charge + anderer Grund → ebenfalls `already_refunded`
- zwei verschiedene Charges → getrennt refundierbar

Dies ist der **einzige** neue Index. Ein zusätzlicher Composite-Index auf `(refund_charge_id, refund_reason)` wird nicht angelegt — er wäre durch den strengeren Charge-Index redundant.

Legacy-Historie (inkl. der 6,30-€-Evidence mit `metadata IS NULL`) liegt bewusst außerhalb der Idempotenzdomäne. Kein Backfill, keine Korrektur.

### b) Neue RPC `public.composer_refund_charge(p_charge_id uuid, p_run_id uuid, p_refund_reason text)`

`SECURITY DEFINER`, `search_path = public`, EXECUTE nur für `service_role`.

Atomarer Ablauf:

0. Eingangsvalidierung: `p_refund_reason` muss NOT NULL und nach `btrim()` nicht leer sein — sonst Abbruch mit Fehler, keine finanzielle Transaktion. Der Grund ist dauerhafte Audit-Provenance.
1. `SELECT ... FROM ai_video_transactions WHERE id = p_charge_id AND type = 'deduction' FOR UPDATE` — existiert die Row nicht: `no_charge`.
2. **Provenance-Beweis DB-seitig** (Caller-Behauptung zählt nicht). Akzeptiert wird die Charge nur, wenn eine dieser Bedingungen gilt:
   - `generation_id = p_run_id`, oder
   - `metadata->>'run_id' = p_run_id::text`, oder
   - `metadata->>'reservation_id'` verweist auf genau eine `composer_run_reservations`-Row, deren Run `p_run_id` ist.
   Trifft nichts zu (heutiger Legacy-Pfad mit `generation_id = project_id`): `no_charge`, Wallet unverändert.
3. Aggregat-Schutz: Ist die Charge nicht eindeutig diesem Run zuzuordnen (z. B. Project-Aggregat), `no_charge`. Ein Project-Aggregat wird niemals synthetisch aufgeteilt.
4. Refund-Existenzprüfung innerhalb derselben Transaktion **allein auf `refund_charge_id`** (Grund ist nicht Teil der Identität): vorhanden → `already_refunded`, 0 €.
5. Sonst in **einer** DB-Transaktion (die RPC ist der gesamte Transaktionsrahmen, keine Edge-seitige Zweischritt-Operation): Wallet-Gutschrift **und** Insert der `type='refund'`-Transaction. Schlägt der Insert fehl, wird die Wallet-Erhöhung mit zurückgerollt. **User/Wallet stammen ausschließlich aus der gelockten Charge** (`charge.user_id` → dessen Wallet), nie aus Caller-Parametern. Betrag `abs(charge.amount_euros)`, Metadata `{ refund_charge_id, run_id, refund_reason }` → `refunded`.
6. Race-Schutz ist primär der Charge-Lock: Caller 2 wartet auf `FOR UPDATE` und sieht danach in Schritt 4 den Refund von Caller 1. Der Unique-Index ist nur die letzte harte DB-Sicherung. Falls er dennoch greift: Wallet-Update und Refund-Insert liegen zusammen in **einem** PL/pgSQL-`BEGIN ... EXCEPTION`-Block, sodass die Wallet-Erhöhung dieses Versuchs beim Insert-Fehler mit zurückgerollt ist, bevor `already_refunded` zurückgegeben wird. Behandelt wird **ausschließlich** die Verletzung von `ai_video_transactions_refund_charge_uniq` (Constraint-Name via `GET STACKED DIAGNOSTICS CONSTRAINT_NAME` geprüft): bestehende Refund-Row erneut lesen, `already_refunded` mit 0 € zurückgeben. Kein generisches `WHEN unique_violation`; jeder andere Constraint-Fehler wird re-raised.

Die neue Refund-Row führt ihre Provenance ausschließlich in `metadata.refund_charge_id`, `metadata.run_id` und `metadata.refund_reason`. `generation_id` der Refund-Row ist **keine** Provenancequelle und wird von der Idempotenzlogik nie gelesen (historisch uneinheitliche Bedeutung).

Rückgabe (jsonb): `{ outcome, amount_euros, refund_transaction_id }` mit `outcome ∈ {no_charge, already_refunded, refunded}`.
Betrag ausschließlich aus der validierten Charge — kein `CLIP_COSTS`, kein Caller-Betrag.

## 2. `recover-stuck-composer-clip`

`refundScene()` wird ersetzt:

- Run auflösen: `p_run_id = scene.active_run_id` (kanonische Run-Provenance). `active_run_id IS NULL` → `no_charge`, kein RPC-Call. `composer_scene_runs` wird **nicht** zur Bestimmung des aktuellen Runs herangezogen.
- Charge auflösen mit **derselben Provenance-Definition wie die RPC** (gemeinsame Regel, inkl. Reservation-Pfad): `ai_video_transactions` mit `type='deduction'` und (`generation_id = run_id` ODER `metadata->>'run_id' = run_id` ODER `metadata->>'reservation_id'` einer Reservation dieses Runs). Keine oder mehrdeutige Kandidatenrow → `no_charge`.
- Sonst genau ein Aufruf `composer_refund_charge(charge_id, run_id, 'watchdog_stuck_clip')`. Die RPC bleibt der endgültige Trust Boundary und verifiziert alles erneut.
- `markFailed()` läuft in allen drei Ausgängen unverändert; die Fehlermeldung nennt den Refundbetrag nur bei `refunded`.
- `CLIP_COSTS`-Import entfällt aus dieser Funktion.

## 3. Die sechs Contracttests

Zweistufig: Resolver-/Caller-Logik als Deno-Unit-Tests (`recover-stuck-composer-clip/refund-provenance.test.ts`), die DB-Semantik zusätzlich als echte Contracttests gegen PostgreSQL (Fixtures anlegen, RPC aufrufen, Wallet-Differenz und Refund-Rows messen, Fixtures wieder entfernen).

1. **T1 (No/Weak Provenance)** — Legacy-Charge `generation_id = project_id` → `no_charge`, Wallet unverändert, Szene trotzdem `failed`. *(Unit + DB)*
2. **T2 (Success)** — run-scharfe Charge → `refunded`, exakt `abs(amount_euros)` der Charge. *(Unit + DB)*
3. **T3 (Idempotenz, echt in der DB)** — zweiter Aufruf, auch mit **anderem** `refund_reason` → `already_refunded`, 0 €; genau eine Refund-Row, Wallet-Differenz genau einmal. *(DB verpflichtend)*
4. **T4 (Parallel-Race, echt in der DB)** — zwei gleichzeitige RPC-Aufrufe auf dieselbe Charge aus zwei separaten PostgreSQL-Sessions → genau eine Wallet-Gutschrift, genau eine Refund-Row, der Verlierer erhält `already_refunded`. Kein Fake-Lock, echtes `FOR UPDATE` + Unique-Constraint. *(DB verpflichtend)*
5. **T5 (Pricing-Drift)** — Pricing nach der Charge geändert → Refund unverändert aus der Charge. *(Unit + DB)*
6. **T6 (Zwei Runs derselben Szene)** — zwei run-scharfe Charges → getrennt refundierbar, jeder Refund charge-spezifisch, keine Kollision. *(DB verpflichtend)*

Zusätzlich (nicht anstelle von T4/T6): Reservation-Provenance wird nur bei DB-verifizierter Zuordnung akzeptiert, sonst `no_charge`.



## Nicht angefasst

`refund_ai_video_credits`, Reaper/Ledger/RS3, Pricing, Provider-/Plate-Dispatch, Lip-Sync, historische 6,30-€-Evidence.

Nach Umsetzung + sechs grünen Tests: **FA-4/P1-A IMPLEMENTED / TESTS GREEN → STOP vor Deploy.**
