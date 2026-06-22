## Kontext

Du bist auf **Growth-Plan ($49) = 6 parallele Jobs**. 4 Sprecher-Passes sollten locker reinpassen. Trotzdem 429 um 12:28:42.

**Wahrscheinliche Ursache:** Aus früheren fehlgeschlagenen Runs (z. B. der 9-Sprecher-Test um 11:40) hängen noch Sync.so-Jobs als „in-flight" und blockieren Concurrency-Slots, bis Sync.so sie nach ~5–10 min selbst timeoutet. Beim neuen Run war damit das Budget faktisch < 4.

## Fix — zweistufig, beide klein

### Stufe A — Stale-Job-Cleanup beim Dispatch-Start (proaktiv)

Vor dem ersten Sync.so-`/generate`-Call in `compose-dialog-segments`:

1. Aus `inflight_sync_jobs`-Tabelle alle Jobs des aktuellen Users laden, die älter als 6 min und nicht terminal sind.
2. Für jeden: `GET https://api.sync.so/v2/generate/{job_id}` → wenn Sync.so `completed/failed/canceled` meldet, lokal als terminal markieren (kein Slot mehr belegt).
3. Wenn Sync.so noch `pending/processing` zeigt **und** lokaler Pass bereits `failed/done_suspect`: `POST .../cancel` → echter Slot-Free.
4. Best-effort, max 500 ms total, niemals Dispatch blockieren.

### Stufe B — 429-Backoff als Safety-Net (reaktiv)

In `compose-dialog-segments/index.ts` Z. 5292–5360, nur bei `resp.status === 429`:

1. Sleep mit Backoff 4s → 10s → 22s (~20% Jitter), max 3 Versuche, identischer Payload.
2. Log: `429_RETRY attempt=N/3 backoff_ms=...`.
3. Bei Erfolg → normaler Flow. Bei 3× 429 → bestehender Fehlerpfad mit `clip_error: "syncso_concurrency_exhausted"`.
4. Lock-TTL Z. 682 von 90s → **120s** (Retry kann bis ~36s dauern).
5. Keine Änderung an Webhook/Watchdog/Cancel/Per-Pass-Lock.

## Erwartete Wirkung

- **Stufe A** räumt das eigentliche Problem auf: keine Zombie-Slots mehr → 4 Passes laufen sauber parallel.
- **Stufe B** ist Versicherung, falls Sync.so trotzdem mal kurzzeitig throttelt (z. B. Burst-Schutz oder paralleles Talking-Head-Render aus anderem Modul).

## Verifikation

1. `inflight_sync_jobs` vor Test prüfen → alte non-terminal Rows zählen.
2. 4-Sprecher-Szene starten.
3. Logs: `STALE_JOB_RECONCILED` (Stufe A) + `v168_per_pass_lock ACQUIRED pass=0..3` mit <2s Abstand.
4. Idealfall: **kein** `429_RETRY` Log.
5. UI: grün, ~3:30 Renderzeit.

## Rollback

- Stufe A per Env `FEATURE_STALE_JOB_RECONCILE=false` deaktivierbar.
- Stufe B: Retry-Code no-op, wenn Sync.so kein 429 schickt.
- Per-Pass-Lock weiter über `FEATURE_PER_PASS_LOCK=false` instant abschaltbar.

## Sollen wir loslegen?

Ich kann Stufe A + B in einem Commit umsetzen (~80 Zeilen Code, 0 DB-Migration nötig, da `inflight_sync_jobs` existiert).
