# v431 G3.1 — Deploy & Drain-Fenster

## Deploy

- **T0 (Drain-Startmarke, UTC): `2026-08-15T09:05:17Z`**
- Deployte Functions (ein Zug, alle erfolgreich):
  `compose-video-clips`, `compose-clip-webhook`, `compose-dialog-segments`,
  `sync-so-webhook`, `render-sync-segments-audio-mux`, `remotion-webhook`,
  `lipsync-watchdog`
- Keine Migration in diesem Schritt. Alle DB-Objekte (Acquire-/Replace-RPC,
  Predecessor-Guard, Retry-Allowlist, Reaper, REVOKE) waren bereits migriert.

## Post-Deploy-Rauchprüfung

| Function | Boot/Import | Beleg |
| --- | --- | --- |
| lipsync-watchdog | OK | `booted (time: 38ms)` @ 09:06:02Z, Cron-Lauf `scanned=0 polled=0 advanced=0 failed=0` |
| compose-video-clips | kein Boot-Fehler | keine Logeinträge seit T0 (noch nicht invoziert) |
| compose-clip-webhook | kein Boot-Fehler | keine Logeinträge seit T0 |
| compose-dialog-segments | kein Boot-Fehler | keine Logeinträge seit T0 |
| sync-so-webhook | kein Boot-Fehler | keine Logeinträge seit T0 |
| render-sync-segments-audio-mux | kein Boot-Fehler | keine Logeinträge seit T0 |
| remotion-webhook | kein Boot-Fehler | keine Logeinträge seit T0 |

Der einzige Function-Kaltstart nach T0 (Watchdog, Cron-getrieben) ist sauber
gebootet — die geänderte `_shared/v431-ledger.ts` lädt live ohne Importfehler.
Für die übrigen sechs steht der Boot-Beleg erst mit dem ersten Post-Deploy-Lauf
im Drain aus.

## Drain-Status

Stand T0 + 0: `composer_pipeline_jobs` enthält **0 Zeilen mit `created_at >= T0`**.
Das Fenster ist eröffnet, aber noch ohne Verkehr — es braucht mindestens einen
echten Produktionslauf (Basisvideo → Sync-Segmente → Audio-Mux → Remotion), bevor
die Gates aussagekräftig sind.

## Auswertung je Callback-Kanal (auszufüllen am Fensterende)

| Kanal | Function | Post-Deploy-Attempts | missing_binding | job_not_found | wrong_job | binding_pending | stale_run | stale_generation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Replicate / Base-Video | `compose-clip-webhook` | 0 (nicht beobachtet) | – | – | – | – | – | – |
| Sync.so-Segment | `sync-so-webhook` | 0 (nicht beobachtet) | – | – | – | – | – | – |
| Audio-Mux | `render-sync-segments-audio-mux` | 0 (nicht beobachtet) | – | – | – | – | – | – |
| Remotion | `remotion-webhook` | 0 (nicht beobachtet) | – | – | – | – | – | – |

Kanäle mit 0 Post-Deploy-Attempts gelten ausdrücklich als **nicht beobachtet**,
nicht als grün.

Ergänzend am Fensterende auszuweisen:

- Attempt-Verteilung: Attempt 1 (Initial-Akquise) vs. Replace-Attempts (`attempt_no > 1`).
- Jedes Vorkommnis von `predecessor_exists`, `retry_superseded`,
  `failure_not_retryable` mit Begründung.
- `stale_run` / `stale_generation` je Vorkommnis auf einen legitimen Run-Wechsel
  zurückgeführt.

## Gates

Hart (jeweils 0 für Post-Deploy-Jobs): `missing_binding`, `job_not_found`, `wrong_job`.
Messwert ohne Blockade: `binding_pending`.
Diagnostisch: `stale_run`, `stale_generation`.

## Auswertungsabfragen

```sql
-- Attempt-Verteilung je Stage
select stage, attempt_no, status, count(*)
from composer_pipeline_jobs
where created_at >= '2026-08-15T09:05:17Z'
group by 1,2,3 order by 1,2,3;

-- Terminale/abgelöste Attempts
select stage, status, error_code, count(*)
from composer_pipeline_jobs
where created_at >= '2026-08-15T09:05:17Z'
  and status in ('failed','stale','dispatch_uncertain')
group by 1,2,3 order by 1,2,3;
```

Observe-Verdikte (`missing_binding`, `job_not_found`, `wrong_job`,
`binding_pending`, `stale_run`, `stale_generation`) werden aus den
Function-Logs der vier Callback-Kanäle gezogen (`v431_observe`-Zeilen).

## Abbruchkriterien

- Ein `missing_binding`, `job_not_found` oder `wrong_job` auf einem
  Post-Deploy-Job → Drain sofort stoppen, Ursache melden.
- Boot-/Importfehler in einer der sieben Functions → sofortiger Stopp.

## Status

G3.1 deployt, Drain-Fenster läuft. G3.2 bleibt gesperrt. STOP.
