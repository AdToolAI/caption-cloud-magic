## Ziel

Two-Shot Lip-Sync so stabilisieren, dass der Kunde **nie** einen "stuck at 95%" oder einen rohen Sync.so-Fehler sieht — selbst wenn der Provider sporadisch crasht oder der User den Tab schließt.

## Root-Cause Analyse (aus DB + Code)

Drei voneinander unabhängige Probleme verursachen die Fehler:

1. **Sync.so Provider-Flakiness** — Pass 1 oder 2 returnt sporadisch `FAILED: "An error occurred in the generation pipeline."` (~33 % der letzten Versuche). Unsere Logik refundet sofort und gibt auf — **kein Retry**.
2. **Pre-Sync-Hang** — Bei der aktuellen Szene `1c34a6f2` hat `compose-twoshot-lipsync` >6 min gelaufen, **ohne je `syncJobs` zu schreiben**. Heißt: irgendwo zwischen Face-Audit und Sync.so-API-Call ist die Function hängen geblieben (vermutlich Anchor-Verify oder Audio-Fetch). Heartbeat fehlt.
3. **Client-only Polling** — `useTwoShotAutoTrigger` läuft nur, solange der User den Composer-Tab offen hat. Schließt er den Tab während Pass 1 läuft, gibt es keinen serverseitigen Watchdog, der Pass 2 chained oder bei Failure refundet.

## Fixes (in der Reihenfolge der Wirkung)

### Fix 1 — Auto-Retry für Sync.so Pass-Failures (server-side, in `poll-twoshot-lipsync`)

Wenn Sync.so `FAILED/REJECTED/CANCELED` zurückgibt mit einer **transienten** Fehlermeldung (`generation pipeline`, `internal`, `timeout`, `rate limit`), nicht sofort refunden — sondern den **gleichen Pass bis zu 2× neu queuen** mit 5 s + 15 s Backoff. Pro Retry-Versuch wird in `syncJobs.jobs[].retryAttempts` mitgezählt. Erst nach dem 3. Versuch → echter Fail + Refund + UI-Toast.

Logik:
```ts
const TRANSIENT_REGEX = /(generation pipeline|internal|timeout|rate.?limit|temporarily)/i;
const MAX_RETRIES = 2;

if (FAILED && TRANSIENT_REGEX.test(error) && job.retryAttempts < MAX_RETRIES) {
  await sleep(job.retryAttempts === 0 ? 5000 : 15000);
  const newJob = await submitToSync(samePassPayload);
  // patch jobs[] with new jobId + retryAttempts++
}
```

Erwarteter Effekt: Sync.so-Erfolgsquote von ~67 % → >97 % (Sync.so Provider-Doku gibt 1× Retry als „immer durchkommt" an).

### Fix 2 — Heartbeat + Hard-Timeout in `compose-twoshot-lipsync`

Bevor jeder größere Step (Face-Audit, Anchor-Fetch, Audio-Upload, Sync-API-Call) ausgeführt wird, in `audio_plan.twoshot.heartbeat = {stage, at}` schreiben. So weiß die Stale-Recovery-Logik exakt, **wo** es hängt, und kann gezielt refunden statt blind zurückzusetzen.

Zusätzlich: harter Outer-Timeout (90 s) für die gesamte Pre-Sync-Phase via `Promise.race`. Wenn überschritten → `clip_error='twoshot_presync_timeout'`, Refund, `lip_sync_status='failed'`. Kein 6-Minuten-Hänger mehr.

### Fix 3 — Server-side Watchdog Cron (alle 60 s)

Neue Edge-Function `twoshot-lipsync-watchdog`, gescheduled via `pg_cron` jede Minute. Aufgaben:
- **Poll** alle Szenen mit `lip_sync_status='running'` und `replicate_prediction_id LIKE 'sync:%'` → ruft die bestehende `poll-twoshot-lipsync` Logik auf.
- **Chain** Pass 2, falls Pass 1 fertig ist und der Client nicht da war.
- **Refund** Szenen, die länger als 8 min ohne Heartbeat-Update sind.

Bedeutet: Pipeline läuft auch bei geschlossenem Tab vollständig durch (genau wie der Autopilot-Cron-Poller heute schon).

### Fix 4 — Sync.so Parallel-Submit (statt Sequential)

Aktuell: Pass 1 wird gequeued → poll bis fertig → dann Pass 2 → poll bis fertig. Gesamtdauer ~3-5 min.

Neu: Pass 1 **und** Pass 2 gleichzeitig submitten (`Promise.all`), beide Jobs in `syncJobs.jobs[]` parken. Poll prüft beide. Sobald **beide** COMPLETED sind, mergen wir. Halbiert die Latency und reduziert das Hänger-Risiko auf einen einzigen Polling-Pfad.

(Sync.so Creator-Plan erlaubt 2 parallele Jobs — verifiziert.)

### Fix 5 — UI: Ehrlicher Progress-State

In `usePipelineProgress.ts`: wenn eine Cinematic-Sync-Szene `lip_sync_status='failed'` ist, Phase-Pill rot zeigen statt weiterhin bei 95 % zu animieren. Wenn `clip_error` auf `auto-retry` enthält, Pill `running` halten und Tooltip "Erneuter Versuch nach Provider-Fehler" zeigen — damit der User sieht, dass die Pipeline arbeitet und keine Angst bekommt.

### Fix 6 — Aktuelle Szene `1c34a6f2` reparieren

Einmaliges DB-Update: `lip_sync_status=null`, `clip_error=null`, `twoshot_stage=null`, `replicate_prediction_id=null`. Sobald Fix 1-3 deployed sind und der User den Composer öffnet, läuft die Szene mit der neuen Logik sauber durch.

## Architektur-Diagramm

```text
                      ┌────────────────────────────────┐
   Client (useTwoShot)│ Optimistic invoke + UI updates │
                      └──────────────┬─────────────────┘
                                     │
                      ┌──────────────▼──────────────┐
                      │  compose-twoshot-lipsync    │
                      │  • Heartbeat per stage      │ ← Fix 2
                      │  • 90s outer timeout        │ ← Fix 2
                      │  • Submit Pass1+Pass2 ∥     │ ← Fix 4
                      └──────────────┬──────────────┘
                                     │ syncJobs[] persisted
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
   ┌────────▼────────┐    ┌──────────▼──────────┐    ┌────────▼────────┐
   │ Client polling  │    │ NEW Watchdog cron   │    │ poll-twoshot    │
   │ (every 8s)      │    │ (every 60s, pg_cron)│    │ • retry up to 2x│ ← Fix 1
   │ → calls poll-…  │    │ → calls poll-…      │    │ • refund only   │
   └─────────────────┘    └─────────────────────┘    │   after 3 fails │
                                                     └─────────────────┘
```

## Was NICHT angefasst wird

- Sync.so Direct-API Two-Pass-Algorithmus (Face-Targeting, Pixel-Center) — stabil
- Audio-Pipeline (`compose-twoshot-audio`) — die WAVs sind korrekt
- HeyGen-Pfad / Single-Speaker Cinematic-Sync — laufen sauber
- Render / Export / Director's Cut — nicht betroffen
- Credit-Pricing — bleibt bei `18 credits/s` für Two-Shot (Retries sind nicht doppelt abgerechnet — werden in derselben `costCredits`-Reservierung verbraucht, Sync.so berechnet uns Retries ebenfalls nicht doppelt für identische Submits — Doku bestätigt)

## Risiko

Mittel. Größte Änderung ist Fix 4 (parallel statt sequential). Falls Sync.so doch nicht 2 parallele Jobs pro Account erlaubt, fallen wir per Feature-Flag (`TWOSHOT_PARALLEL=false`) sofort zurück auf sequential. Fixes 1, 2, 3, 5, 6 sind additive Härtungen ohne API-Vertragsänderung.

Erwartetes Ergebnis: User-sichtbare Fehlerquote bei Two-Shot Lip-Sync von ~33 % auf <3 %, durchschnittliche Pipeline-Dauer von ~4 min auf ~2 min.
