## Ziel

Drei aufeinander aufbauende Observability-Layer einbauen, die "silent worker death"-Bugs (wie der Hedra-`running`-Stuck) **strukturell unmöglich** machen. Wir starten mit Layer 1 (Heartbeat-Watchdog), weil er sofort schützt und Voraussetzung für die anderen ist.

---

## Layer 1 — Heartbeat-Watchdog (jetzt umsetzen)

### Was passiert

Eine **interne** Watchdog-Edge-Function läuft alle 2 Minuten per pg_cron und prüft eigenständig auf hängende Prozesse — kein externer SaaS, keine zusätzlichen Kosten, sofortige Wirkung. Bei Anomalien wird automatisch ein `qa_bug_reports`-Eintrag (severity `high`) erzeugt und im QA-Cockpit als roter Alert angezeigt.

### Geprüfte Symptome

1. **`qa_live_runs`**: Zeilen mit `status IN ('pending','running','async_started')` älter als 10 min → auto-fail + Bug-Report
2. **`autopilot_queue`**: Slots in `generating_video`/`generating_image` älter als 15 min → auto-fail + Refund-Trigger + Bug-Report
3. **Lambda-Renders**: `lambda_health_metrics` ohne `completed_at` älter als 20 min → Bug-Report
4. **Provider-Quoten**: Wenn in den letzten 10 min >50% einer `provider_quota_log`-Provider-Gruppe failed sind → Bug-Report (Provider-Outage-Detection)
5. **Cron-Heartbeats**: Wenn `autopilot-cron-poller` oder `qa-bug-harvester` länger als ihr 2× Intervall keinen Eintrag in einer neuen `cron_heartbeats`-Tabelle hat → Bug-Report

### Neue Komponenten

- **Tabelle** `cron_heartbeats` (job_name, last_run_at, last_status) — jeder Cron-Job schreibt am Ende seinen Heartbeat
- **Edge-Function** `qa-watchdog` — führt die 5 Checks aus, erzeugt Bug-Reports, returnt Summary
- **pg_cron-Job** `qa-watchdog-tick` alle 2 Minuten
- **Cockpit-Tab** "Watchdog" in `/admin/qa-cockpit` zeigt: letzte 50 Watchdog-Runs, aktive Anomalien, Heartbeat-Status aller Cron-Jobs als grün/gelb/rote Lampen

### Integration in bestehende Funktionen

- `qa-live-sweep`, `autopilot-cron-poller`, `qa-bug-harvester`, `cron-poller` schreiben am Ende `cron_heartbeats` (1 Zeile pro Job-Name, upsert)
- `qa-watchdog` ruft am Ende auch sich selbst auf den Heartbeat

### Akzeptanzkriterien

- Hänge-Test: Manuell eine `qa_live_runs`-Zeile auf `running` mit `started_at = now() - 15 min` setzen → innerhalb von 2 min auto-failed + Bug-Report sichtbar
- Heartbeat-Test: pg_cron für `autopilot-cron-poller` deaktivieren → nach 4 min erscheint roter Bug "autopilot-cron-poller stale heartbeat"

---

## Layer 2 — Sentry Cron Monitors (nach Layer 1)

### Was passiert

Sentry hat eingebaute **Cron Monitors**: pro Job sendet man bei Start ein "in_progress" und bei Ende "ok"/"error". Wenn das Ende-Signal ausbleibt, alarmiert Sentry automatisch — auch wenn der gesamte Edge-Function-Worker tot ist (anders als Layer 1, der von der DB lebt).

### Voraussetzung

Sentry-Projekt + `SENTRY_DSN`-Secret. Du nutzt Sentry bereits (`src/pages/admin/SentryDashboard.tsx`).

### Neue Komponenten

- **Helper** `_shared/sentry-cron.ts` mit `withSentryCron(monitorSlug, schedule, fn)`-Wrapper
- **Wrapping** für: `qa-live-sweep`, `qa-watchdog`, `autopilot-cron-poller`, `cron-poller`, `qa-bug-harvester`, `analyze-ad-campaign-performance`
- **Sentry-Dashboard-Link** im neuen Cockpit-Tab "Cron Health"

### Akzeptanzkriterien

- Edge-Function während Lauf manuell killen → Sentry-Alert "missed check-in" innerhalb 1 min in Sentry + im Cockpit-Tab als rotes Banner
- Alle 6 Cron-Jobs im Sentry "Crons"-Dashboard mit grüner Heartbeat-Linie

---

## Layer 3 — Inngest Durable Workflows (nach Layer 2)

### Was passiert

Die fragilen `EdgeRuntime.waitUntil`-Worker (HeyGen-Bootstrap, Lambda-Polling, Replicate-Polling, Composer-Stitch) werden auf **Inngest Steps** migriert. Inngest garantiert: jeder Step retry-fähig, jeder Timeout konfigurierbar, jeder Fehler triggert automatisch Refund-Step. Connector ist bereits verfügbar (`inngest`).

### Migration Scope (in dieser Reihenfolge)

1. **HeyGen Talking Photo Bootstrap** (`_shared/heygen-bootstrap.ts`) → Inngest function `heygen.bootstrap`
2. **Talking Head Render Polling** (`generate-talking-head` waitUntil-Block) → Inngest function `heygen.render.poll`
3. **Lambda Render Polling** (`render-directors-cut` polling) → Inngest function `lambda.render.poll`
4. **Autopilot Video Generation** (`autopilot-cron-poller` Replicate-Polling) → Inngest function `autopilot.video.generate`
5. **Composer Multi-Scene Stitch** → Inngest function `composer.stitch`

### Pattern pro Migration

- Edge-Function returnt 202 + `event_id` sofort
- `sendInngestEvent('app/heygen.bootstrap.requested', {...})` triggert durable workflow
- Inngest function läuft mit Step-Retries (max 3, exp. backoff), `step.sleep`, `step.run`
- Bei Failure-Step: automatischer Refund-Call + Bug-Report
- Frontend pollt unverändert die DB-Status-Spalte (Inngest schreibt sie)

### Neue Komponenten

- **Edge-Function** `inngest-serve` mit allen 5 durable workflows (default-export `serve` von `inngest/deno`)
- **Helper** `_shared/inngest.ts` mit `sendInngestEvent`-Wrapper
- **Cockpit-Tab** "Workflows" mit Inngest-REST-API-Anbindung: zeigt letzte 100 Runs, Status, Retry-Count, Sentry-Links

### Akzeptanzkriterien

- HeyGen-Bootstrap manuell um 60s künstlich verzögern → Step retried 2× und completed; UI bleibt responsiv
- Replicate-API auf 503 mocken → Autopilot-Video-Step retried, refundet automatisch nach 3 Fails
- Inngest-Dashboard zeigt durable runs mit Step-Timeline

---

## Reihenfolge & Aufwand

| Layer | Aufwand | Sofortiger Schutz | Wann |
|---|---|---|---|
| **1. Heartbeat-Watchdog** | ~1 Stunde | ✅ deckt 90% der Stuck-Bugs | **Jetzt** |
| **2. Sentry Cron Monitors** | ~30 min | ✅ deckt komplette Worker-Deaths | Direkt nach Layer 1 |
| **3. Inngest Durable Workflows** | ~3–4 Stunden, 5 Migrationen | ✅ macht Bugs strukturell unmöglich | Nach Layer 1+2 stabil |

---

## Memory-Updates

- Neu: `mem://infrastructure/observability/heartbeat-watchdog-architecture` (Layer 1)
- Neu: `mem://infrastructure/observability/sentry-cron-monitors-pattern` (Layer 2)
- Neu: `mem://infrastructure/observability/inngest-durable-workflows-migration` (Layer 3)
- Update: `mem://features/qa-agent/architecture` mit Watchdog-Tab-Referenz

---

## Was wir jetzt bauen

**Nur Layer 1**: `cron_heartbeats`-Tabelle + `qa-watchdog`-Edge-Function + pg_cron + Cockpit-Tab "Watchdog" + Heartbeat-Schreiben in den 4 bestehenden Cron-Jobs.

Layer 2 und 3 starten wir jeweils nach grünem Live-Sweep & Watchdog-Run.

Soll ich loslegen mit Layer 1?
