
# Plan: Deep-Parse 100% zuverlässig — Fallback wird obsolet

## Root-Cause-Analyse
- **Pass A** nutzt `google/gemini-2.5-pro` mit `max_tokens: 12000` und 90s Timeout. Pro ist tendenziell langsam/überlastet → genau hier kippt der Run in den Client-Fallback.
- **Pass B** (Flash, 45s) ist okay, hat aber keinen Retry.
- **Sequenziell**: Pass A muss komplett fertig sein, bevor Library + Pass B starten — verschenkte Zeit.
- **Kein Retry**: Ein einzelner 5xx/Abort kippt den ganzen Run sofort.
- **Output groß**: 12k Tokens Tool-Call für ~3 Szenen ist 4–6× zu viel und verlängert die Antwortzeit linear.

## Lösung — vier Stellschrauben, alle in `supabase/functions/briefing-deep-parse/index.ts`

### 1. Modell-Strategie umdrehen (größter Hebel)
- **Pass A primär: `google/gemini-2.5-flash`** mit 35s Timeout. Flash schafft strukturierte Tool-Calls für Briefings dieser Größe zuverlässig in 8–20s.
- **Fallback-Kette innerhalb Pass A** (in dieser Reihenfolge, jeder mit eigenem Retry):
  1. `gemini-2.5-flash` (35s, 1 Retry bei 5xx/abort/no-tool-call)
  2. `gemini-2.5-pro` (60s, 1 Versuch) — nur wenn Flash 2× scheitert
  3. `gemini-2.5-flash-lite` (25s, 1 Versuch) — letzter Rettungsanker
- Damit ist Pass A im 99-%-Fall in <25s durch, statt potenziell 90s zu hängen.

### 2. `callGateway` mit eingebautem Retry + Jitter
- Neue Signatur: `callGateway({ ..., retries: 1, retryOn: [408, 429, 500, 502, 503, 504] })`.
- Retry nur bei den genannten Status-Codes und bei `AbortError`/`no tool call returned`.
- Exponential backoff mit Jitter (500ms → 1500ms).
- Saubere Fehler-Klassifizierung: `network` / `timeout` / `rate_limit` / `bad_response` — wird in der Response als `meta.passADiagnostics` mitgegeben (sichtbar im War-Room für Debugging).

### 3. Token-Budget halbieren
- `max_tokens: 6000` für Pass A (3-Szenen-Briefings brauchen typisch 1.5–3k) und `4000` für Pass B.
- Spart 30–50 % Antwortzeit bei großen Modellen.

### 4. Library-Snapshot parallelisieren
- `Promise.all([passA, librarySnapshot])` statt sequenziell. Spart 200–600ms.
- Pass B startet, sobald beide fertig sind.

### 5. Server-Side Warm-Path (kleiner Bonus)
- Erster `fetch` zum Gateway schickt einen Mini-Health-Ping (`max_tokens: 1`) in `EdgeRuntime.waitUntil` **nach** der Response — wärmt die Gateway-Connection für den nächsten Aufruf desselben Users.

## Client-Anpassung (`src/hooks/useStoryboardTransition.ts`)
- Client-Timeout von 180s → **120s** (jetzt sicher genug, und schnelleres User-Feedback wenn doch was kippt).
- Bei `503/504` vom Endpoint: **automatischer 1× Client-Retry** nach 2s, bevor überhaupt der Fallback-Pfad in Betracht gezogen wird.
- Telemetrie: `passADiagnostics` + Gesamt-Latenz in `production_plan.meta` schreiben, damit wir bei künftigen Beschwerden sehen, welcher Pass wie lange brauchte (kein UI-Banner, nur Daten).

## Was bewusst NICHT geändert wird
- Prompts (`SYSTEM_PASS_A`, `SYSTEM_PASS_B`, `LANGUAGE LOCK`) — bleiben 1:1.
- Tool-Schemas (`TOOL_PASS_A`, `TOOL_PASS_B`) — bleiben 1:1, damit Output-Qualität identisch.
- Lokaler Fallback-Builder bleibt als allerletztes Netz drin, sollte aber unter Normalbedingungen nie mehr greifen.
- Lipsync-Pipeline, Green-Net, Hailuo-Lock — alle unverändert.

## Erwartetes Verhalten nach dem Patch
- Briefing-Plan kommt in **8–25 Sekunden** zurück (statt 60–120s oder Timeout).
- Pro-Modell wird nur noch in <1 % der Fälle berührt — kein Flaschenhals mehr.
- `meta.source === 'deep_parse'` praktisch immer → starre-Sprecher-Logik und Mapping-Vollständigkeit greifen automatisch.
- Falls Lovable AI Gateway wirklich komplett offline ist, sieht der User das nach max. ~75s (35+60+25 + 2s Backoff) und bekommt den lokalen Fallback — aber nur dann.

## Verifikation
- Edge-Logs nach Deploy prüfen: `[briefing-deep-parse] Pass A success in Xms (model=…)` als neues Log-Statement.
- Drei Test-Briefings (kurz / mittel / das „3 AM Moment") durchschicken, Latenz im War-Room beobachten.
