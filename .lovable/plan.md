## Problem

Mission `smoke-01-dashboard-tour` failed with **HTTP 408 "Request has timed out"** after **60.664 ms** against `https://useadtool.ai`.

The 60-Sekunden-Wand ist nicht unsere — sie kommt von **Browserless `/function`**, das einen serverseitigen Default-Timeout von ~60 s pro Request hat. Unser eigener Client-Timeout steht zwar auf 90 s (`browserlessClient.ts` Zeile 26), aber Browserless killt die Session vorher und antwortet mit 408 + leerem `heartbeats`-Array (siehe Screenshot: `"heartbeats": []`).

Was die Mission macht:
1. `/auth` öffnen + Login (≈ 3–8 s)
2. **12 Routen** nacheinander mit `waitUntil: 'networkidle2'`, je `timeout: 25000 ms`
3. Final-Screenshot

Bei 12 Routen × `networkidle2` (wartet 500 ms ohne Netzwerktraffic) reicht 60 s realistisch nicht — eine einzige langsame Route (z. B. `/news-hub` mit Perplexity-Fetch oder `/marketplace` mit vielen Bildern) frisst den ganzen Budget auf.

Dass `heartbeats: []` und `last_heartbeat: null` ankommen, bestätigt: Browserless hat das Skript abgebrochen, bevor es überhaupt einen Heartbeat zurückschicken konnte.

## Fix-Strategie

Drei kombinierte Änderungen — alle in zwei Dateien + ein DB-Update:

### 1. Browserless-Server-Timeout explizit hochsetzen (Hauptfix)

In `supabase/functions/_shared/browserlessClient.ts`:
- Browserless akzeptiert einen `timeout`-Query-Parameter (Millisekunden) auf `/function`. Default ist 60 000.
- URL um `&timeout=120000` erweitern (2 Minuten Server-Budget).
- Unseren Client-`AbortController` parallel auf 130 000 ms anheben (10 s Puffer über Server-Timeout).
- Zusätzlich `&blockAds=true` setzen, damit Tracker/Ads keine `networkidle2`-Wartezeit aufblähen.

### 2. Per-Route schneller werden (Robustheits-Fix)

In `buildSmokeNavigationScript()`:
- `waitUntil: 'networkidle2'` → `waitUntil: 'domcontentloaded'` für die Tour-Routen. Reicht für Smoke-Test (Page rendert, Route ist erreichbar). `networkidle2` ist für Scrape-Use-Cases zu teuer.
- Per-Route-Timeout von 25 s → 12 s.
- Nach jedem Goto **harten 800-ms-Sleep** statt auf Netzwerk zu warten (gibt React Zeit zum Mounten, ohne Polling-Hänger).
- Login-Goto bleibt auf `networkidle2` (Auth muss vollständig sein).

Damit landet ein realistisches Worst-Case-Budget bei: Login ≤ 10 s + 12 × ~3 s + Final ~5 s ≈ **50 s** — komfortabel unter 120 s.

### 3. Mission verschlanken (Datenebene, defensiv)

SQL-Migration: `smoke-01-dashboard-tour` von 12 Routen auf **6 Kern-Routen** kürzen (`/dashboard`, `/picture-studio`, `/ai-video-toolkit`, `/video-composer`, `/universal-directors-cut`, `/autopilot`). Die restlichen 6 Routen (`/calendar`, `/music-studio`, `/marketplace`, `/avatars`, `/brand-characters`, `/news-hub`) wandern in eine **neue Mission `smoke-02-secondary-tour`** mit gleichem Tier `smoke`. Damit hat der Round-Robin-Picker zwei kleinere Smoke-Missionen statt einer Riesigen, und ein Single-Route-Hänger reißt nur eine halbe Tour mit.

## Technical details (kompakt)

**`browserlessClient.ts`**:
```ts
const url = `${BROWSERLESS_BASE}/function?token=${encodeURIComponent(apiKey)}&timeout=120000&blockAds=true`;
// runBrowserlessFunction default: timeoutMs = 130_000
```

**Skript-Änderungen** in `buildSmokeNavigationScript()`:
```js
// Tour-Routen:
await page.goto(opts.baseUrl + p, { waitUntil: 'domcontentloaded', timeout: 12000 });
await new Promise(r => setTimeout(r, 800));
```

**SQL-Migration**:
```sql
UPDATE qa_missions
SET steps = '[
  {"type":"navigate","path":"/dashboard"},
  {"type":"navigate","path":"/picture-studio"},
  {"type":"navigate","path":"/ai-video-toolkit"},
  {"type":"navigate","path":"/video-composer"},
  {"type":"navigate","path":"/universal-directors-cut"},
  {"type":"navigate","path":"/autopilot"}
]'::jsonb
WHERE name = 'smoke-01-dashboard-tour';

INSERT INTO qa_missions (name, tier, enabled, steps, rate_limit_minutes, cost_cap_cents, cost_real_providers)
VALUES (
  'smoke-02-secondary-tour', 'smoke', true,
  '[{"type":"navigate","path":"/calendar"},{"type":"navigate","path":"/music-studio"},
    {"type":"navigate","path":"/marketplace"},{"type":"navigate","path":"/avatars"},
    {"type":"navigate","path":"/brand-characters"},{"type":"navigate","path":"/news-hub"}]'::jsonb,
  15, 0, '{}'
)
ON CONFLICT (name) DO NOTHING;
```

## Files

- `supabase/functions/_shared/browserlessClient.ts` — URL-Param `timeout=120000&blockAds=true`, Default `timeoutMs` auf 130 000, `waitUntil` + per-Route-Timeout im Smoke-Skript anpassen.
- `supabase/migrations/<new>.sql` — Mission verschlanken + neue Sekundär-Tour.

Kein UI-Change nötig — Cockpit zeigt die neue Mission automatisch im Round-Robin.

## Erwartetes Ergebnis

- Browserless-408 verschwindet (Server hat 120 s, Tour braucht ≤ 50 s).
- Ein hängender Single-Provider-Call reißt höchstens **eine** der zwei Smoke-Touren mit, nicht beide.
- Heartbeats / Login-Screenshot werden bei zukünftigen Failures wirklich übermittelt (weil Skript Zeit hat zurückzukehren).
