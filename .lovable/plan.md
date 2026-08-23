# V459 — Hänger bei 5/6: Preflight-Zombie + fehlende Terminal-Aggregation

## Befund (belegt, Szene `be60d106…`, aktiver Run `3ca7e6c7…`)

Der Lauf kann nicht mehr weiterlaufen — er wartet auf einen Pass, der nie wieder angefasst wird, und niemand beendet die Szene.

Pass-Zustand (DB, 17:08 UTC):

```text
Pass 0  rendering_preflight   seit 16:55:55   (13+ min, kein job_id)
Pass 1  failed                sync_noop_unrecoverable
Pass 2  failed                sync_noop_unrecoverable
Pass 3  done
Pass 4  failed                sync_noop_unrecoverable
Pass 5  pending               nie gestartet
dialog_shots.status = "rendering"
```

1. **Preflight-Zombie mit Lock-Lease.** Um 17:01:35 hat ein Dispatcher den Per-Pass-Lock für Pass 0 geholt (`v168_per_pass_lock ACQUIRED pass=0`), lief bis 17:01:39 und endete dann ohne Release — kein Dispatch, kein Fehler, kein Statuswechsel. Jeder folgende Cron-Tick (17:02–17:08) protokolliert `BUSY — another dispatcher holds the (scene,pass) lock; skipping`. Erst nach Ablauf der 420-s-Lease (`try_acquire_dialog_lock`) ist die Sperre weg; die Zeile in `dialog_dispatch_locks` ist inzwischen leer. Der Pass bleibt trotzdem auf `rendering_preflight` — es gibt keinen Pfad, der einen Pass aus diesem Zustand zurückholt.
2. **Keine Terminal-Aggregation.** Drei Pässe sind bereits endgültig gescheitert. Die Szene kann kein vollständiges Ergebnis mehr liefern, wird aber weder beendet noch als fehlgeschlagen markiert — deshalb friert die UI bei „Pass 5/6" ein.
3. **Watchdog greift nicht.** `lipsync-watchdog` hat für diese Szene keinen einzigen Logeintrag; diese Konstellation (Fan-out, tote Geschwister, ein Pass in `rendering_preflight` ohne `job_id`) fällt durch keine seiner Bedingungen.
4. **Webhook-Rauschen.** `NOOP_LADDER_EXHAUSTED` wird für bereits `failed`-Pässe im Minutentakt erneut geloggt (Turn 1/2/4 mehrfach) — Re-Entry ohne Idempotenz-Stopp.

Nicht Ursache dieses Hängers: V458. Der Mund-Vektor wird korrekt erzeugt (`v458_mouth_offset space=plate xy=0,7 px=7`), die Pässe scheitern als echter Provider-NOOP, nicht mehr als `mouth_roi_unresolved`.

## Fix-Scope (eng, nur Verklemmung — kein neuer Lip-Sync-Scope)

### 0. Watchdog-Reihenfolge: Aggregation vor Recovery

```text
Watchdog
  |
  +- terminaler Required-Pass vorhanden?
  |     |
  |     +- ja  -> Fan-out fenced schliessen
  |     |         -> Ledger/Provider-Jobs erneut pruefen
  |     |         -> nichts unreconciled: canonical terminalize + exactly-once refund
  |     |         -> STOP (keine Zombie-Recovery)
  |     |
  |     +- nein -> Zombie-Recovery zulaessig
  |
  +- Zombie-Recovery
        -> eigenen Pass-Lock fenced erwerben
        -> Zustand erneut validieren
        -> #1 pending
        -> #2 pass failed -> Aggregator (kein eigener Refund)
```

Recovery-Budget gilt nur für noch rettbare Runs, nie für bereits verlorene.

### 1. Preflight-Zombie — eigene Uhr, persistentes Budget, fenced Recovery (`lipsync-watchdog`)

- Neuer Zeitstempel `v459_preflight_started_at` wird im Pass-JSONB **beim Übergang nach `rendering_preflight`** gesetzt (`compose-dialog-segments`). Der Watchdog altert ausschließlich auf diesem Wert, nie auf `started_at`.
- Zombie-Kandidat:

```text
status == 'rendering_preflight'
AND job_id == null
AND run_id == aktiver Run
AND now() - v459_preflight_started_at > V459_PREFLIGHT_ZOMBIE_MS
```

  `V459_PREFLIGHT_ZOMBIE_MS` wird als Konstante aus der Lease-Dauer abgeleitet (`DIALOG_LOCK_TTL_S = 420` + Puffer = 480 s), damit Lease und Zombie-Schwelle nie auseinanderlaufen.

- **Kein TOCTOU:** Der Watchdog prüft nicht per `SELECT`, ob ein Lock frei ist. Er versucht selbst `try_acquire_dialog_lock(scene, pass, watchdogToken)`:
  - BUSY → nichts tun (ein Dispatcher arbeitet).
  - ACQUIRED → Pass-Zustand, `run_id`, `job_id`, `v459_preflight_started_at` **erneut** lesen und validieren, erst dann Recovery; eigener Token im `finally` freigeben, Release ausschließlich `WHERE holder = watchdogToken`.
- Recovery-Budget persistent im Pass: `v459_preflight_recovery_count`, geführt pro `(run_id, pass_idx)` — ein neuer Run erbt das Budget nicht. Keine In-Memory-Zählung.
  - Count 0 → Reset auf `pending` (Preclip-Cache bleibt), Count := 1, Telemetrie `v459_preflight_zombie_recovered`.
  - Count >= 1 → Pass terminal `failed`, danach **Run-Aggregation triggern**. Der Zombie-Handler hat keinen eigenen Refund-Pfad; Geld bewegt ausschließlich die kanonische Run-/Scene-Terminalisierung.

### 2. Fencing-sicherer Lock-Release (`compose-dialog-segments`)

- Der Per-Pass-Lock wird in `finally` freigegeben — aber **ausschließlich der eigene**: Release/CAS nur `WHERE scene_id = ? AND pass_idx = ? AND holder = myToken`. Ein wiederbelebter Dispatcher A kann nach Lease-Ablauf niemals den frischen Lock von Dispatcher B löschen.
- Takeover nur über `try_acquire_dialog_lock` (setzt neuen `holder`), nie durch blindes Löschen.
- Ein Pass in `rendering_preflight` ohne `job_id` und ohne gültige Lease gilt als übernehmbar statt als „busy überspringen".
- **Pre-Dispatch-Recheck:** unmittelbar vor dem echten Provider-Call nochmals prüfen, ob Scene/Run noch aktiv (Fan-out nicht geschlossen) und der Pass noch dispatchbar ist. Ist der Fan-out geschlossen → kein Provider-Call, sauberer Abbruch.

### 3. Terminal-Aggregation: Fence zuerst, Ledger danach, dann Refund

Alle sechs Pässe sind für ein vollständiges Resultat erforderlich — ein terminal gescheiterter Required-Pass macht den Run unrettbar. Reihenfolge ist race-kritisch:

```text
1. mindestens ein required pass terminal failed?
2. Fan-out-Fence setzen (CAS auf aktivem Run: rendering -> terminalizing,
   bzw. bestehende kanonische Run-Lock-Mechanik). Ab hier darf kein
   Dispatcher mehr einen Provider-Call starten.
3. ERST DANACH Ledger-/Provider-Jobs erneut pruefen:
     keine unreconciled Jobs -> canonical terminalize + exactly-once refund
     noch ein in-flight Job  -> KEIN Refund, Reconciliation abwarten,
                                Abschluss ueber den bestehenden Terminalisierungspfad
4. pending / preflight-ohne-job Geschwister werden nie mehr dispatcht.
```

Billing-Invariante: kein Refund für Arbeit, deren Provider-/Ledger-Zustand ungeklärt in-flight ist — und kein neuer Provider-Dispatch kann zwischen „kein Job vorhanden" und Refund hineinschlüpfen.

Für `3ca7e6c7…` greift Zweig „keine unreconciled Jobs": P0 hat kein `job_id`, P5 wurde nie gestartet.

### 4. Webhook-Idempotenz vor Logging und Writes (`sync-so-webhook`)

Guard so früh wie möglich, vor jedem Log und State-Write:

```text
Run-/Attempt-Tupel validieren (bestehender Run-Guard)
-> Pass bereits terminal failed AND error == sync_noop_unrecoverable
   -> idempotenter No-Op (kein NOOP_LADDER_EXHAUSTED-Log, keine Aggregation,
      kein State-Write, kein Refund, kein Retry)
```

Verspätete Callbacks eines alten Attempts bleiben unverändert `run_guard_discarded`.

## Tests (grün vor Deploy)

- Priorität: `3 failed + 1 done + 1 pending(no job) + 1 zombie(no job)` → **sofort** terminale Aggregation, **kein** Zombie-Reset, **kein** P5-Dispatch, genau ein Refund.
- Zombie-Uhr: Boundary exakt gegen die Konstante `V459_PREFLIGHT_ZOMBIE_MS` getestet (nicht textuell „8 Minuten"): `t - 1ms` → kein Recovery, `t + 1ms` bei fenced erwerbbarem Lock → Recovery.
- Zombie-Lock: `try_acquire` liefert BUSY → keine Zustandsänderung (kein TOCTOU-Reset unter laufendem Dispatcher).
- Fencing: Dispatcher A (abgelaufene Lease) im `finally` kann den neuen Lock von B **nicht** löschen; Watchdog-Release trifft nur den eigenen Token.
- Recovery-Budget pro `(run_id, pass_idx)`, nur in rettbaren Runs: #1 → `pending`, #2 → Pass terminal + Aggregator; neuer Run startet bei 0.
- Aggregation-Race: Fence gesetzt → Dispatcher-Pre-Dispatch-Recheck bricht ab, kein Provider-Call; Refund erst nach dem Fence-Ledger-Recheck, genau einmal.
- Aggregation B: terminal sibling + Geschwister mit echtem in-flight Job → keine vorzeitige Terminalisierung, kein Doppel-/Fehlrefund.
- Webhook: zweiter NOOP-Callback auf bereits terminalem Pass → No-Op ohne Log/Write; Callback eines alten Attempts → weiterhin `run_guard_discarded`.

## Deploy und Live-Bereinigung

Deploy exakt: `lipsync-watchdog`, `compose-dialog-segments`, `sync-so-webhook`.

Danach Bereinigung von Run `3ca7e6c7…` **über die neue kanonische Aggregationslogik** (ein Watchdog-Durchlauf), nicht über zusammengesetzte Einzel-DB-Updates. Zielzustand: Run/Scene eindeutig terminal, keine offenen Locks, keine neuen Provider-Dispatches, kein pending Pass kann später anspringen, genau ein Refund-Pfad, keine Doppel-Refunds. Danach Health-Check und STOP — kein neuer S01-Lauf ohne separate Freigabe.

## Nicht Teil von V459

Der eigentliche Lip-Sync-Fehlschlag (`sync_noop_unrecoverable`: Provider liefert unbewegten Mund) bleibt unberührt. V458 liefert jetzt korrekten Plate-Space und echte Provider-NOOPs — das ist ein Qualitätsproblem für ein separates Gate, kein Geometrie-/Messfehler mehr.

