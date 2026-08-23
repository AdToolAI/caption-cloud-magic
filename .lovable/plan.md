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

1. `supabase/functions/lipsync-watchdog/index.ts`
   - Neue Bedingung **Preflight-Zombie**: Pass mit `status='rendering_preflight'`, ohne `job_id`, `started_at` älter als 6 min und kein aktiver Lock-Eintrag in `dialog_dispatch_locks` → einmalig auf `pending` zurücksetzen (Preclip-Cache bleibt erhalten), Telemetrie `v459_preflight_zombie_recovered`, maximal 1 Recovery pro Pass und Run; beim zweiten Mal terminal `failed` mit Refund.
   - Neue Bedingung **Terminal-Aggregation**: Sobald für den aktiven Run kein Pass mehr Fortschritt machen kann (alle Pässe `done`/`failed`, oder verbleibende Pässe blockiert und mindestens ein Pass terminal `failed`), Szene deterministisch abschließen: Fan-out beenden, `dialog_shots.status` setzen, Credits gemäß bestehender Refund-Regel, klare Nutzermeldung statt Endlos-Spinner.

2. `supabase/functions/compose-dialog-segments/index.ts`
   - Lock-Freigabe robust machen: der Per-Pass-Lock wird in `finally` freigegeben, auch wenn der Preflight früh returned oder wirft; zusätzlich Lock-Release beim Setzen von `rendering_preflight`-Folgestatus.
   - Beim Betreten des Dispatch eines Passes, der bereits `rendering_preflight` ohne `job_id` und ohne gültige Lease ist: Zustand als übernehmbar behandeln statt zu überspringen.

3. `supabase/functions/sync-so-webhook/index.ts`
   - Idempotenz-Stopp: für einen Pass, der bereits `status='failed'` mit `sync_noop_unrecoverable` ist, kein erneutes `NOOP_LADDER_EXHAUSTED`-Log und kein erneuter Aggregationsversuch.

## Tests (grün vor Deploy)

- Watchdog: Pass in `rendering_preflight` > 6 min ohne Lock → genau ein Reset auf `pending`; zweiter Durchlauf → terminal + Refund.
- Watchdog: 3 `failed` + 1 `done` + 1 `pending` + 1 Zombie → nach Recovery-Budget genau ein terminaler Szenenabschluss, kein Doppel-Refund.
- Dispatcher: Exception im Preflight → Lock freigegeben (kein 7-Minuten-BUSY-Fenster).
- Webhook: zweiter NOOP-Callback auf bereits terminalem Pass → No-Op, kein Log, kein State-Write.

## Deploy und Live-Bereinigung

Deploy exakt: `lipsync-watchdog`, `compose-dialog-segments`, `sync-so-webhook`.
Danach einmalige Bereinigung des laufenden Runs `3ca7e6c7…` (Szene terminal setzen bzw. Recovery anstoßen, genau ein Refund-Pfad), dann STOP — der nächste kontrollierte S01-Lauf erst nach separater Freigabe.

## Offene Frage

Der eigentliche Lip-Sync-Fehlschlag (3 × `sync_noop_unrecoverable`, Provider liefert unbewegten Mund) bleibt davon unberührt. V459 sorgt nur dafür, dass der Lauf nicht mehr hängt, sondern ehrlich und schnell terminalisiert. Die NOOP-Ursache wäre ein separates Gate.
