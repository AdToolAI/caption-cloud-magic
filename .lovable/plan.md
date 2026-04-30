## Problem

Trotz des letzten Fixes (Server-Cap auf 30s) schlagen Missions weiter mit `Browserless 408: Request has timed out` fehl. Zwei Ursachen, die zusammenwirken:

### Ursache 1 — Client/Server-Timeout-Mismatch
In `_shared/browserlessClient.ts`:
```ts
export async function runBrowserlessFunction(code, context, timeoutMs = 130_000) {
  ...
  const SERVER_TIMEOUT_MS = clamp(envCap || 30_000, 1_000, 60_000);   // → 30_000
  const effectiveClientTimeout = Math.max(timeoutMs, SERVER_TIMEOUT_MS + 5_000);
  // → 130_000 — Client wartet 130s, Server gibt nach 30s 408 zurück
}
```
`qa-agent-execute-mission` ruft die Funktion **ohne** expliziten `timeoutMs` auf, also greift der 130s-Default. Resultat: Browserless killt die Session nach 30s (408), aber der Client hat das gar nicht antizipiert — kein sauberer Abbruch, keine sinnvolle Fehlermeldung pro Step.

### Ursache 2 — Eine Mission = ein Browserless-Request
`buildSmokeNavigationScript()` führt **alle** Steps einer Mission (smoke-04: 6 Steps inkl. Auth + Navigation, smoke-05: 7 Steps inkl. Composer-Render-Trigger) in einer **einzigen** Browserless-Function aus. Bei 30s Server-Cap reicht das nicht für Login + Navigation + Render-Wait.

### Ursache 3 — Browserless `/function` Hard-Cap auf Hobby
Browserless Hobby Plan cappt `/function`-Calls hart auf **30s wallclock**, egal was der `timeout`-Query-Param sagt. Das lässt sich nicht serverseitig umgehen.

## Lösung (3-Punkt-Plan)

### Punkt 1 — Client-Timeout an Server-Cap koppeln
In `supabase/functions/_shared/browserlessClient.ts`:
- Default `timeoutMs` von `130_000` auf `SERVER_TIMEOUT_MS + 5_000` setzen (also 35s)
- `effectiveClientTimeout` immer = `SERVER_TIMEOUT_MS + 5_000` (kein Override durch größeren `timeoutMs` mehr)
- Fehlermeldung verbessern: bei 408 explizit erwähnen "Browserless plan-cap (30s) reached, mission split required"

### Punkt 2 — Mission in Chunks splitten
Neuer Helper `runMissionInChunks(steps, context)` in `_shared/browserlessClient.ts`:
- Steps gruppieren: ein Chunk = Login + max. 3 weitere Steps (Schätzung: ~25s pro Chunk)
- Jeder Chunk = eigener Browserless-Call mit eigener Session
- Cookies/localStorage zwischen Chunks via `context.cookieJar` mitgeben (Browserless `setCookie` API)
- Ergebnisse (consoleLogs, networkErrors, stepResults) zusammenführen
- Bei Fehler in Chunk N: Folge-Chunks skippen, Result als `failed` markieren

In `qa-agent-execute-mission/index.ts`: `runBrowserlessFunction(...)` ersetzen durch `runMissionInChunks(steps, context)`.

### Punkt 3 — Per-Mission Timeout-Budget
- Neues Feld `qa_missions.max_chunks` (default 4 = ~120s gesamt)
- Vor Dispatch: warnen wenn `steps.length` zu hoch für `max_chunks * 4`
- Cockpit zeigt im Run-Card "Chunk 2/4 timed out" statt nur "408"

### Punkt 4 — Default `qa_email` / `qa_password` als Env-Var Fallback
Aktueller Verdacht: Wenn `QA_TEST_EMAIL`/`QA_TEST_PASSWORD` Secrets fehlen, läuft Auth-Step in 30s-Timeout (weil Selector nie sichtbar wird). Im Cockpit-Header gibt's bereits einen Button "Test-User einrichten" — dessen Status (`qa_test_user_provisioned`) prüfen wir vor jedem Run und brechen mit klarer Fehlermeldung ab statt in den Browserless-Timeout zu laufen.

## Dateien

- `supabase/functions/_shared/browserlessClient.ts` — Punkt 1 + 2
- `supabase/functions/qa-agent-execute-mission/index.ts` — Punkt 2 (Aufruf umstellen) + Punkt 4 (Pre-Flight-Check)
- `supabase/functions/qa-agent-orchestrator/index.ts` — Punkt 3 (Budget-Validierung)
- Migration: `qa_missions` ALTER TABLE ADD COLUMN `max_chunks int default 4`
- `mem://features/qa-agent/browserless-timeout-policy.md` — aktualisieren

## Erwartung nach Implementierung

- smoke-04 (Director's Cut Load, 6 Steps): 2 Chunks à ~25s → grün
- smoke-05 (Composer Render-Stitch, 7 Steps): 2-3 Chunks → grün oder klare Fehlerlokalisierung
- Keine `408 Request timed out` mehr, stattdessen entweder Erfolg oder konkreter Step-Fehler

## Out-of-scope

- Browserless-Plan-Upgrade (Standard = 60s Cap) — wäre einfacher, kostet aber Geld
- Selektor-Robustheit für smoke-03 (das ist Plan B aus letzter Session)
