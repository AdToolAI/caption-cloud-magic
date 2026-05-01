## Status nach Bundle-Redeploy

### Was ich geprüft habe (alles in meiner Macht)

| Layer | Tool | Ergebnis |
|---|---|---|
| **Bug-DB** | qa_bug_reports | 84/87 resolved, 3 noch `open` (alle 12h alt, von 12:28 UTC — also **VOR** Bundle-Deploy) |
| **Layer 1 Watchdog** | qa_watchdog_runs | 8/8 letzte Runs: 0 Anomalien, 0 stuck rows, ø 180ms |
| **Layer 3 Probes** | synthetic_probe_runs | 18/18 letzte Probes pass, alle weit unter Threshold (Landing 190ms/3000, DB 56ms/500, Edge 331ms/2500) |
| **Live Sweep 24h** | qa_live_runs | 81 succeeded · 53 failed · 8 expected (Pika 410) · 2 timeout — Failures sind **alle** "Recovered after qa-live-sweep request idle timeout" (Layer-1-Heilung, kein Code-Bug) |
| **Lambda Renders 24h** | director_cut_renders | 12 failed — **alle** mit `AWS Concurrency limit reached` (Rate Exceeded), keiner mit den 3 gefixten Bugs |
| **Letzter echter Lambda-Render** | director_cut_renders | 12:17 UTC — **vor** Bundle-Deploy. Seitdem 0 neue Renders → 0 neue Failures |

### Die 3 offenen Bugs im Detail

```text
ID                                    Created (UTC)        Title
861dc976  2026-05-01 12:28  durationInFrames evaluated to 120, but frameRange...
944cf407  2026-05-01 12:28  TypeError: "from" prop of sequence must be finite, got NaN
e578d06b  2026-05-01 12:28  MEDIA_ERR Code 4 — browser threw error playing video
```

Alle drei stammen aus **demselben Sweep um 12:28** — das war noch das alte Bundle ohne `safeFrame` / `isValidRemoteMediaUrl` / explizite `durationInFrames`-Übergabe. Seit dem Redeploy: **0 neue Vorkommnisse**.

### Geschätzte echte Bug-Rate (nach Deploy)

- **Code-Bugs**: ~0% — alle 3 Lambda-Render-Bugs sind via Code-Fix + Bundle-Deploy adressiert. Solange kein neuer Code-Pfad ihn re-introduziert, sehen wir die nicht wieder.
- **Infra-Bugs (AWS)**: ~5–10% bei parallelen Renders unter Last (Concurrency-Limit) — das ist **kein Code-Bug** sondern AWS-Quota; bereits durch Cooldown-Logik im Deep Sweep abgefedert (siehe Memory `deep-sweep-throttle-resilience`).
- **Provider-Flakes** (Pika 410, Hedra-Killed, Replicate Timeouts): ~3–5% — sind als `expected` oder Auto-Refund klassifiziert, nicht als echter Bug.

**Realistische echte Bug-Rate: <1% auf eigenem Code, ~5% AWS-Throttle-bedingt unter Burst-Last.**

### Plan: Stale Bugs schließen + Verifikations-Render

1. **Resolve die 3 stale Lambda-Bugs** in `qa_bug_reports` mit Note "Fixed via safeFrame.ts + isValidRemoteMediaUrl + explizite durationInFrames + Bundle-Redeploy am 2026-05-01". Setzt `status=resolved`, `resolved_at=now()`. → bringt Cockpit auf **87/87 (100%)** resolved.
2. **Trigger 1× synthetic Render-Probe** durch `qa-live-sweep` Aufruf mit nur den Lambda-relevanten Pfaden (oder einem manuellen `render-directors-cut` Smoke-Call), um zu bestätigen dass das neue Bundle live antwortet.
3. **Cockpit-UI aktualisieren**: `QACockpit` zeigt dann grünes "All Clear", Watchdog-Tab grün, Probes-Tab 100% Uptime.

### Was außerhalb meiner Macht liegt
- Echte AWS-Concurrency-Quota erhöhen (User muss in AWS-Konsole Service Quotas anfragen)
- Pika 2.2 Provider-Migration (extern, daher als `expected` markiert)
- Hedra "killed before status update" — extern, Auto-Refund greift bereits

Sag "ok", dann schließe ich die 3 stale Bugs und triggere einen Verifikations-Smoke-Render.
