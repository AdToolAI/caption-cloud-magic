# FA-4/P1-A — Implementation-Analyse (kleinste DB-/RPC-Lösung)

Analyse only. Kein Code, keine Migration, kein Deploy, kein Render. Evidence (Refund `b6abc1b6…`, 6,30 €) bleibt unangetastet.

## 1. Read-only geprüfter Bestand

**`ai_video_transactions`** — Spalten: `id, user_id, type, amount_euros, balance_after, pack_size, bonus_percent, stripe_*, generation_id, description, metadata jsonb, created_at, currency`. Indizes nur auf `id`, `generation_id`, `user_id`. Check-Constraint auf `type IN (purchase, deduction, refund, bonus)`. **Kein Unique-Index, kein Refund→Charge-Verweis, kein `run_id`.**

**`refund_ai_video_credits(p_user_id, p_amount_euros, p_generation_id)`** — SECURITY DEFINER, addiert unkonditioniert auf die Wallet und schreibt `type='refund'`, `generation_id = p_generation_id`, `metadata` NULL. Kein Charge-Lookup, kein Lock, keine Idempotenz. 11 weitere Aufrufer außerhalb des Composers (`generate-ai-video`, `generate-hailuo-video`, `generate-happyhorse-video`, `compose-clip-webhook`, …).

**`deduct_ai_video_credits(p_user_id, p_amount, p_generation_id)`** — Wallet-Lock (`FOR UPDATE`), Debit, `type='deduction'`, `amount_euros` negativ, `generation_id = projectId`, **`metadata` wird nicht geschrieben**. Belegt an den letzten 8 Transaktionen: alle `metadata` NULL, mehrere Deductions teilen dieselbe `generation_id` (Projekt `035273d7…`).

**`composer_settle_run_reservation`** — schreibt Refunds bereits mit `metadata = {reservation_id}` unter Reservierungs-Row-Lock; Status `reserved → settled` ist die faktische Idempotenz. Das ist der einzige heute korrekt provenanzierte Refund-Pfad. Reservierungs-Flag ist AUS.

**`composer_scene_runs`** — hat `run_id` (PK), `scene_id`, `quoted_cost_euros`, `reservation_id`. Wird aber **nur im Reservierungs-Zweig** von `compose-video-clips` geschrieben (`recordSceneRunContracts`, Zeile 5281). Beleg: 0 Rows für S09 `ece6a71c…` trotz laufendem Run `d669dd27…`.

**Watchdog-Caller** — `recover-stuck-composer-clip.refundScene()` (Zeilen 62–95): `duration_seconds × CLIP_COSTS[clip_source][tier]`, Fallback 0,15 €/s, `p_generation_id = scene.id`. Vier Aufrufstellen (kein prediction_id, 404, provider failed/canceled, hard-kill). Idempotenz nur über `clip_error LIKE 'watchdog_%'` im Edge-Code.

### Daraus folgende Kernaussage

Im heute aktiven Legacy-Pfad existiert **keine** run-/scene-scharfe Charge. Die Deduction ist eine aggregierte Projekt-Summe ohne Scene- oder Run-Bezug. Nach Contract-Regel 2/3 heißt das: für einen Run wie FA-4 ist der korrekte Refund **0** — nicht „irgendein berechneter Betrag". Die Minimallösung muss das erzwingen, nicht umgehen.

## 2. Bevorzugte Minimalvariante

**Neue, eng gefasste RPC `composer_refund_charge(p_charge_id uuid, p_run_id uuid, p_refund_reason text)` + ein additiver Unique-Index. `refund_ai_video_credits` bleibt unverändert** (11 Fremdaufrufer außerhalb des Scopes).

### Warum nicht „nur `metadata` nutzen"

`metadata` allein trägt zwar Provenance, aber kein DB-seitiges „höchstens ein Refund pro (charge_id, refund_reason)". Serialisierung nur über einen Charge-Row-Lock wäre in Postgres zwar korrekt (zwei parallele Caller serialisieren am `SELECT … FOR UPDATE` der Deduction-Row), hinterlässt aber keine erzwungene Eindeutigkeit gegen spätere Caller-Fehler oder gegen einen dritten Codepfad. Contract-Regel 4 verlangt beides: persistierte Referenz **und** DB-garantierte Eindeutigkeit.

### Minimale DB-Änderung (zwingend, aber rein additiv)

Ein partieller Unique-Index auf `ai_video_transactions`, ohne neue Spalte, ohne Tabellenänderung:

```text
UNIQUE (metadata->>'refund_charge_id', metadata->>'refund_reason')
  WHERE type = 'refund' AND metadata ? 'refund_charge_id'
```

Bestehende Refund-Rows (inkl. der Evidence-Row, `metadata` NULL) fallen aus dem Index-Prädikat und bleiben unberührt. Keine Spalten, keine Constraints auf Altdaten, keine Backfills.

### Betroffene Objekte

| Objekt | Änderung |
| --- | --- |
| `ai_video_transactions` | nur additiver partieller Unique-Index; Refund-Rows des neuen Pfads füllen `metadata = {refund_charge_id, run_id, refund_reason, scene_id}` |
| `composer_refund_charge` (neu) | atomare Refund-RPC gegen eine konkrete `charge_id` |
| `refund_ai_video_credits` | **unverändert** |
| `deduct_ai_video_credits`, `composer_settle_run_reservation`, `composer_run_reservations`, `composer_scene_runs` | **unverändert** |
| `recover-stuck-composer-clip` | `refundScene()` wird ersetzt durch Charge-Auflösung + RPC-Aufruf |
| Reaper, Ledger, RS3, Provider-Dispatch, Lip-Sync | **unverändert** |

### Atomarer Ablauf der RPC (eine Transaktion)

1. Deduction-Row `SELECT … FOR UPDATE` mit `id = p_charge_id AND type = 'deduction'`. Nicht gefunden ⇒ `('no_charge', 0)`, kein Write.
2. Unter demselben Lock prüfen, ob ein Refund mit `metadata->>'refund_charge_id' = p_charge_id` und gleichem `refund_reason` existiert ⇒ `('already_refunded', 0)`.
3. Refundierbaren Rest bestimmen: `abs(charge.amount_euros) − Σ(bereits refundierte Beträge dieser charge_id)`. `≤ 0` ⇒ `('already_refunded', 0)`.
4. Wallet-Update (`balance_euros +`, `total_spent_euros −`, geklammert bei 0) und Insert der Refund-Row mit `metadata = {refund_charge_id, run_id, refund_reason, scene_id}` ⇒ `('refunded', betrag)`.
5. Unique-Verletzung aus einem Race wird abgefangen und als `('already_refunded', 0)` zurückgegeben — kein Fehler nach außen.

Der Betrag stammt ausschließlich aus der Charge. `CLIP_COSTS` und `videoPricingCatalog` kommen in der RPC nicht vor.

### Verhalten

- `no_charge` — keine Wallet-Bewegung, keine Transaktionszeile; Caller terminalisiert die Szene trotzdem.
- `already_refunded` — Erfolg mit Betrag 0, keine zweite Zeile.
- `refunded` — genau eine Gutschrift, Betrag = Charge-Betrag, Provenance persistiert.

### Minimale Anpassung des Watchdog-Callers

`refundScene()` verliert die Preisberechnung und macht stattdessen zwei Schritte: (a) run-scharfe Charge auflösen — bevorzugt über `composer_scene_runs.reservation_id` → Reservierungs-Deduction, sonst über eine Deduction, die diesen Run eindeutig ausweist; (b) gefundene `charge_id` an `composer_refund_charge` geben. Keine eindeutige Charge ⇒ Refund 0 und `clip_error`-Suffix `(no charge found, refund €0.00)`. `markFailed()` bleibt unverändert und läuft in **allen** Fällen — Terminalisierung hängt nicht am Refund. `CLIP_COSTS`-Import entfällt aus dieser Datei. Der bisherige `clip_error LIKE 'watchdog_%'`-Guard bleibt als reine Arbeitsersparnis stehen, ist aber nicht mehr der Idempotenzmechanismus.

Konsequenz für den heutigen Legacy-Zustand, bewusst so: solange die Deduction nur `generation_id = project_id` trägt, findet Schritt (a) keine eindeutige Charge und der Watchdog gutschreibt **0 €**. Das ist genau die Contract-Absicht — der 6,30-€-Fall wäre nicht mehr entstanden.

## 3. Abbildung der sechs Contracttests

| # | Abbildung auf diese Lösung |
| --- | --- |
| T1 | RPC mit unbekannter/fehlender `charge_id` ⇒ `no_charge`, Wallet unverändert, keine neue Zeile; Szene trotzdem `failed` |
| T2 | RPC gegen eine echte Deduction ⇒ `refunded` mit `abs(amount_euros)`, genau eine Refund-Zeile mit gefüllter `metadata` |
| T3 | zweiter Aufruf mit identischen Parametern ⇒ Schritt 2 greift ⇒ `already_refunded`, Betrag 0 |
| T4 | zwei parallele Aufrufe ⇒ `FOR UPDATE` serialisiert, der Verlierer sieht den Refund bzw. die Unique-Verletzung ⇒ genau eine Gutschrift |
| T5 | `CLIP_COSTS`-Änderung ist wirkungslos, weil der Betrag ausschließlich aus `charge.amount_euros` kommt |
| T6 | zwei Runs mit je eigener Charge ⇒ zwei verschiedene `charge_id` ⇒ zwei unabhängige Refunds, keine Kollision im Unique-Index |

T3/T4 brauchen keine echten Parallelläufe im Produktivsystem: der Index und der Row-Lock sind gegen zwei sequenzielle bzw. zwei gleichzeitige RPC-Aufrufe auf derselben `charge_id` prüfbar.

## 4. Offen für die Umsetzungsphase

Die Charge-Auflösung (Schritt a) ist der einzige noch nicht endgültig festgelegte Teil: entweder bleibt es beim heutigen Zustand „ohne Reservierung keine Charge, also Refund 0", oder der Debit bekommt in einem separaten Gate eine run-scharfe Provenance (`metadata.run_id` beim `deduct`-Insert). Das zweite ist bewusst **nicht** Teil dieser Minimallösung.

**FA-4/P1-A IMPLEMENTATION ANALYSIS READY — STOP.**
