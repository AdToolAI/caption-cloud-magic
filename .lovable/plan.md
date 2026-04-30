## Problem

Flow 2 (Director's Cut Lambda) ist im letzten Deep Sweep als **`failed`** (rot) markiert worden mit:

> `Error: AWS Concurrency limit reached (Original Error: Rate Exceeded). See https://www.remotion.dev/docs/lambda/troubleshooting/rate-limit ...`

Obwohl **drei separate Retry-Schichten** existieren, wurde der Fehler als harter Bug klassifiziert statt als transientes Infrastruktur-Problem (`timeout`).

## Root Cause Analysis

**Drei Layer existieren bereits, alle mit Lücken:**

1. **`render-directors-cut/index.ts` (Z. 538-614)**: 3 Retries × exponential backoff (5s/10s/20s). Wenn alle scheitern → return **HTTP 429** mit Body `{ error: 'RATE_LIMIT_EXCEEDED', message: '...' }`.

2. **`qa-weekly-deep-sweep` `triggerRenderWithBackoff` (Z. 112-143)**: Detektiert `"rate exceeded"`, `"concurrency limit"`, `" 429"` im **Error-String**. Bei Match → 3 weitere Retries (10s/20s/40s) und am Ende `throttled: true` → Status `timeout` (orange) statt `failed` (rot).

3. **`callEdge` (Z. 63-104)**: Generischer Fetch-Wrapper.

**Die Lücke**: Wenn alle 3 Retries in render-directors-cut scheitern, kommt **HTTP 429** zurück mit JSON-Body — aber `callEdge` hängt den Body nicht in den Error-String. Das Detection-Pattern in `triggerRenderWithBackoff` greift dann auf `"http 429"` zurück (existiert nur als ` 429` mit Leerzeichen). Die deutsche User-Message `"AWS Render-Kapazität vorübergehend erschöpft"` matched **keines** der englischen Throttle-Keywords. → Fehler wird als `failed` (Bug) klassifiziert statt als `timeout` (Infrastruktur).

Zusätzlich: Mit nur 90s Polling-Budget und parallelen Composer-Renders im selben Sweep ist die Wahrscheinlichkeit hoch, dass Remotions interne Concurrency-Counter genau zum Trigger-Zeitpunkt am Limit sind.

## Solution: 3-stufige Härtung

### Schritt 1 — `callEdge` propagiert HTTP-Status in Error

In `qa-weekly-deep-sweep/index.ts` Z. 63-104: Wenn HTTP-Status nicht ok, **Status-Code mit in den Error-String** packen:

```ts
error: `HTTP ${res.status}: ${bodyText.slice(0, 500)}`
```

So matched `triggerRenderWithBackoff` zuverlässig auf `"429"` und auf den Body-Inhalt (`"RATE_LIMIT_EXCEEDED"`, `"Render-Kapazität"`, `"vorübergehend erschöpft"`).

### Schritt 2 — Detection-Pattern erweitern

In `triggerRenderWithBackoff` Z. 118-128 weitere Keywords aufnehmen:

```ts
m.includes("http 429") ||
m.includes("rate_limit_exceeded") ||
m.includes("render-kapazität") ||
m.includes("vorübergehend erschöpft")
```

So fängt der Wrapper sowohl die englische AWS-Original-Message als auch die deutsche User-Message aus `render-directors-cut`.

### Schritt 3 — Pre-Flight-Spacing vor Flow 2

In `qa-weekly-deep-sweep/index.ts` Z. 864 existiert bereits ein Kommentar `// Wait before triggering DC Lambda to avoid AWS Concurrency throttling.` — aber der eigentliche `await sleep(...)` fehlt oder ist zu kurz. Direkt vor `flowDirectorsCutRender`:

```ts
// Cooldown nach Composer-Stitch (Flow 1) — gibt AWS Lambda 30s Zeit,
// die parallelen Composer-Render-Slots freizugeben.
await sleep(30_000);
```

30 Sekunden sind weniger als ein einziger Retry-Backoff (5s+10s+20s=35s) und drastisch reduzieren die Kollisionswahrscheinlichkeit, da Composer-Clips typischerweise ~30-60s brauchen.

### Schritt 4 — Klarere `timeout`-Klassifizierung im UI

`DeepSweepTab.tsx`: Der Status `timeout` sollte visuell als **gelbe Warnung** (nicht rot) erscheinen mit Tooltip "Transientes Infrastruktur-Limit, kein Code-Bug — automatischer Retry beim nächsten Sweep löst das in der Regel". Aktuell wird `timeout` vermutlich als generisches `failed` gerendert.

## Geänderte Dateien

- `supabase/functions/qa-weekly-deep-sweep/index.ts` — `callEdge` Error-String mit HTTP-Status, erweiterte Throttle-Keywords, 30s Cooldown vor Flow 2
- `src/pages/admin/DeepSweepTab.tsx` — `timeout`-Status als gelber Badge mit Erklärungs-Tooltip

**Keine DB-Migration. Kein neues Secret. Keine Edge-Function-Konfig-Änderung.**

## Validierung

Nach Deploy: Deep Sweep erneut starten. Erwartung:

- **Best Case (90%)**: Flow 2 grün — die 30s Cooldown haben gereicht, AWS hat Kapazität freigegeben
- **Worst Case (10%)**: Flow 2 wird als **gelber `timeout`-Badge** angezeigt mit Message "AWS Lambda concurrency throttled (4 retries exhausted)" — kein roter Failure mehr, Pass-Rate-Berechnung exkludiert `timeout` von "failed"

## Was wir bewusst NICHT machen

- **Sequenzielle Flow-Ausführung** (Flow 2 erst nach 60s Vollstillstand): zu langsam, würde Sweep auf 5+ Min verlängern
- **Lambda-Concurrency-Quota erhöhen** (AWS Account Setting): kostet ~$0/Monat aber erfordert AWS-Console-Zugriff & Approval-Wartezeit
- **Reservierte Concurrency** für `render-directors-cut`: würde Composer-Renders verlangsamen, falsche Optimierung

Soll ich loslegen?
