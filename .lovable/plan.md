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

### 1. Preflight-Zombie — eigene Uhr, persistentes Budget (`lipsync-watchdog`)

- Neuer Zeitstempel `v459_preflight_started_at` wird im Pass-JSONB **beim Übergang nach `rendering_preflight`** gesetzt (`compose-dialog-segments`). Der Watchdog altert ausschließlich auf diesem Wert, nie auf `started_at`.
- Zombie-Bedingung (alle gleichzeitig):

```text
status == 'rendering_preflight'
AND job_id == null
AND run_id == aktiver Run
AND kein gültiger Lease-Eintrag in dialog_dispatch_locks (scene_id, pass_idx, expires_at > now())
AND now() - v459_preflight_started_at > 8 min      // > 420s Lease, kein Eingriff vor normaler Lease-Recovery
```

- Recovery-Budget persistent im Pass: `v459_preflight_recovery_count`, geführt pro `(run_id, pass_idx)` — ein neuer Run erbt das Budget nicht. Keine In-Memory-Zählung.
  - Count 0 → Reset auf `pending` (Preclip-Cache bleibt), Count := 1, Telemetrie `v459_preflight_zombie_recovered`.
  - Count >= 1 → terminal `failed`, Refund über den kanonischen Pfad.

### 2. Fencing-sicherer Lock-Release (`compose-dialog-segments`)

- Der Per-Pass-Lock wird in `finally` freigegeben — aber **ausschließlich der eigene**: Release/CAS nur `WHERE scene_id = ? AND pass_idx = ? AND holder = myToken`. Damit kann ein wiederbelebter Dispatcher A nach Lease-Ablauf niemals den frischen Lock von Dispatcher B löschen.
- Takeover ist ebenfalls fencing-safe: Übernahme nur über `try_acquire_dialog_lock` (setzt neuen `holder`), nie durch blindes Löschen.
- Ein Pass in `rendering_preflight` ohne `job_id` und ohne gültige Lease gilt als übernehmbar statt als „busy überspringen".

### 3. Terminal-Aggregation mit Billing-Invariante (`lipsync-watchdog` / kanonischer Pfad)

Alle sechs Pässe sind für ein vollständiges Resultat erforderlich, also macht ein terminal gescheiterter Pass den Run unrettbar. Regel:

```text
mindestens ein required pass terminal failed
AND kein Geschwister hat einen echten, noch unreconcilten Provider-Job
  -> Fan-out schließen
  -> pending / preflight-ohne-job Geschwister NICHT mehr dispatchen
  -> Scene terminal failed
  -> genau ein Refund über den bestehenden kanonischen Pfad
```

Hat dagegen irgendein Geschwister einen echten in-flight Provider-Job, wird **nicht** vorzeitig terminalisiert und **nicht** refundiert: erst Provider-/Ledger-Reconciliation abwarten, dann über den bestehenden Terminalisierungspfad abschließen. Invariante: kein Refund für Arbeit, deren Provider-/Ledger-Zustand ungeklärt in-flight ist.

Für `3ca7e6c7…` greift der erste Zweig: der Zombie hat kein `job_id`, Pass 5 wurde nie gestartet.

### 4. Webhook-Idempotenz vor Logging und Writes (`sync-so-webhook`)

Guard so früh wie möglich, vor jedem Log und State-Write:

```text
Pass bereits terminal failed
AND error == sync_noop_unrecoverable
AND Callback gehört zum validierten aktuellen/terminalen Attempt-Job-Tupel
  -> idempotenter No-Op (kein NOOP_LADDER_EXHAUSTED-Log, keine Aggregation,
     kein State-Write, kein Refund, kein Retry)
```

Die bestehende Attempt-/Job-Tupelprüfung (Run-Guard) bleibt vorgeschaltet, damit ein verspäteter Callback eines alten Attempts nicht als aktueller Callback gilt.

## Tests (grün vor Deploy)

- Fencing: Dispatcher A (abgelaufene Lease) im `finally` kann den neuen Lock von B **nicht** löschen.
- Zombie-Uhr: Altern nur auf `v459_preflight_started_at`; 7-min-Fall → kein Eingriff, 8-min-Fall mit gültiger Lease → kein Eingriff, 8-min-Fall ohne Lease → Recovery.
- Recovery-Budget pro `(run_id, pass_idx)`: #1 → `pending`, #2 → terminal + genau ein Refund; neuer Run startet wieder bei 0.
- Aggregation A: terminal sibling + pending sibling ohne Job → pending sibling wird **nicht** dispatcht, Scene terminal, ein Refund.
- Aggregation B: terminal sibling + Geschwister mit echtem in-flight Job → keine vorzeitige Terminalisierung, kein Doppel-/Fehlrefund.
- Webhook: zweiter NOOP-Callback auf bereits terminalem Pass → No-Op ohne Log/Write; Callback eines alten Attempts → weiterhin `run_guard_discarded`.

## Deploy und Live-Bereinigung

Deploy exakt: `lipsync-watchdog`, `compose-dialog-segments`, `sync-so-webhook`.

Danach Bereinigung von Run `3ca7e6c7…` **über die neue kanonische Aggregationslogik** (ein Watchdog-Durchlauf), nicht über zusammengesetzte Einzel-DB-Updates. Zielzustand: Run/Scene eindeutig terminal, keine offenen Locks, keine neuen Provider-Dispatches, kein pending Pass kann später anspringen, genau ein Refund-Pfad, keine Doppel-Refunds. Danach Health-Check und STOP — kein neuer S01-Lauf ohne separate Freigabe.

## Nicht Teil von V459

Der eigentliche Lip-Sync-Fehlschlag (`sync_noop_unrecoverable`: Provider liefert unbewegten Mund) bleibt unberührt. V458 liefert jetzt korrekten Plate-Space und echte Provider-NOOPs — das ist ein Qualitätsproblem für ein separates Gate, kein Geometrie-/Messfehler mehr.

