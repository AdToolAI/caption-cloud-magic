# Layer 2 — Sentry Cron Monitors

Ergänzt Layer 1 (Watchdog) um eine **zweite, externe Beobachtungsebene**: Sentry selbst überwacht jetzt, ob unsere Cron-Jobs überhaupt noch leben — und alarmiert via Email/Slack, wenn ein Job stirbt, ohne dass unser eigenes System es merkt.

## Warum Sentry zusätzlich zum Watchdog?

| Szenario | Watchdog (Layer 1) erkennt? | Sentry Cron (Layer 2) erkennt? |
|---|---|---|
| Edge Function startet, hängt 15min in API-Call | Ja (stuck row) | Ja (kein "ok" check-in) |
| Edge Function crasht beim Boot | Nur indirekt | **Ja, sofort (missed check-in)** |
| pg_cron selbst ist down | **Nein** | **Ja (kein in-progress check-in)** |
| Ganze Supabase-Region down | **Nein** (Watchdog läuft auch nicht) | **Ja, externer Service** |

Sentry deckt also genau die Lücke ab, wo unser eigenes Monitoring **selbst** ausfällt.

## Was umgesetzt wird

### 1. Shared Helper `_shared/sentryCron.ts`
Neue Mini-Library mit zwei Funktionen:
- `sentryCronCheckIn(monitorSlug, status, checkInId?)` — sendet POST an Sentry Cron Monitor API
- `withSentryCron(monitorSlug, schedule, handler)` — Wrapper: schickt `in_progress` beim Start, `ok` bei Erfolg, `error` bei Exception

Verwendet die existierende DSN/Auth-Infrastruktur (`SENTRY_ORG_SLUG`, `SENTRY_PROJECT_SLUG`, `SENTRY_AUTH_TOKEN`).

### 2. Wrapping der 5 kritischen Cron-Jobs
Jede Function bekommt 3 Zeilen:
- `qa-live-sweep` (manuell + cron, monitor: `qa-live-sweep`, schedule: nur on-demand → wir tracken nur Dauer)
- `autopilot-video-poll` (monitor: `autopilot-video-poll`, schedule: `* * * * *`)
- `autopilot-publish-due` (monitor: `autopilot-publish-due`, schedule: `* * * * *`)
- `qa-bug-harvester` (monitor: `qa-bug-harvester`, schedule: `*/15 * * * *`)
- `sync-metrics-cron` (monitor: `sync-metrics-cron`, schedule: `0 * * * *`)
- `qa-watchdog` (monitor: `qa-watchdog`, schedule: `*/2 * * * *`) — auch der Watchdog wird beobachtet

Monitore werden **automatisch in Sentry angelegt** beim ersten Check-in (kein manuelles Setup im Sentry-Dashboard nötig).

### 3. Monitor-Konfiguration
Pro Job in Sentry:
- **checkin_margin**: 1 Minute (Toleranz für späte Check-ins)
- **max_runtime**: doppelt so hoch wie Watchdog-Threshold (z.B. 20min für Live-Sweep, 30min für Autopilot)
- **failure_issue_threshold**: 1 (sofort alarmieren)
- **timezone**: UTC

### 4. Cockpit-UI Erweiterung (optional, klein)
Im Watchdog-Tab eine zusätzliche Zeile pro Job: **"Sentry: ✓ aktiv"** mit Link zum Sentry-Monitor-Dashboard. Falls SENTRY_* Secrets fehlen → "⚠ Sentry nicht konfiguriert".

## Was NICHT gemacht wird
- Keine neuen Secrets (alles vorhanden)
- Keine neuen DB-Tabellen (Sentry hostet die Monitor-Historie selbst)
- Keine Änderung an bestehenden Cron-Schedules
- Kein Sentry-SDK-Init in Edge Functions (zu schwergewichtig) — wir nutzen direkt die HTTP Check-In API

## Technische Details

**Sentry Cron Check-In API:**
```
POST https://sentry.io/api/0/organizations/{org}/monitors/{monitor_slug}/checkins/
Authorization: Bearer {SENTRY_AUTH_TOKEN}
Body: { "status": "in_progress" | "ok" | "error", "duration": ms }
```

**Wrapper-Pattern:**
```ts
Deno.serve(withSentryCron("qa-watchdog", "*/2 * * * *", async (req) => {
  // existing handler logic unchanged
}));
```

Wird alles **non-blocking** gemacht (`EdgeRuntime.waitUntil`) — wenn Sentry mal down ist, läuft der Job trotzdem normal durch.

## Verifikation nach Deploy
1. Watchdog manuell triggern → Sentry-Monitor `qa-watchdog` taucht im Sentry-Dashboard auf
2. Innerhalb 2 min: erster `in_progress` + `ok` Check-in sichtbar
3. Cockpit "Watchdog"-Tab zeigt grünes "Sentry aktiv" Badge

## Zeit/Kosten
- Implementation: ~10 min
- Sentry-Kosten: enthalten in deinem aktuellen Plan (Cron Monitors sind im Free-Tier mit 1 Monitor / Paid-Tier mit unlimited)
