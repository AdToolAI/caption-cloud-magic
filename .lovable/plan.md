## Was die Bugs uns sagen

Die alten 408er sind weg (gut!). Jetzt sehen wir **drei neue, echte Probleme**:

### Bug-Cluster A — `ERR_BLOCKED_BY_CLIENT` auf `companion-diagnose`
Erscheint in **smoke-04, smoke-05, smoke-06** als `expect_no_console_error`-Failure:
```
Failed to load resource: net::ERR_BLOCKED_BY_CLIENT
Access to fetch at 'https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/companion-diagnose' from o[rigin]
Failed to load resource: net::ERR_FAILED
```

**Ursache:** Browserless wird mit `&blockAds=true` aufgerufen (Zeile 57 in `browserlessClient.ts`). Browserless' Ad-Blocker blockt `companion-diagnose`-Calls als „tracking". Das ist **kein App-Bug** — es ist eine falsch-positive Erkennung des QA-Agents selbst.

### Bug-Cluster B — Falsche Selektoren (`click_text "Subtitles" / "Briefing"`)
- `smoke-04` sucht Text **„Subtitles"** auf `/universal-directors-cut` → existiert nicht (App ist DE/multilingual, Tab heißt z.B. „Untertitel" oder ist ein Icon-Button).
- `smoke-06` sucht Text **„Briefing"** auf `/autopilot` → ebenfalls nicht so beschriftet.

Diese Steps wurden ohne Code-Verifizierung in die DB-Missions geseedet.

### Bug-Cluster C — `smoke-05-composer-render-stitch` Browserless 408
Mission hat 7 Steps, aber `/video-composer` ist eine schwere Page (Lambda-Render-Engine bootet, Realtime-Channels, viele Edge-Function-Probes). Login + 7 Steps + heavy page = >30s. Hobby-Cap reicht nicht.

## Lösung

### 1. `blockAds=true` ausschalten oder gezielt allowlist-en
**Datei:** `supabase/functions/_shared/browserlessClient.ts`
- `&blockAds=true` aus dem `/function`-Call entfernen. Wir wollen alle Real-User-Requests sehen, inklusive companion-diagnose. Nicht-genutzte Drittanbieter-Pixel landen sowieso in der `qa_muted_patterns`-Tabelle.

### 2. Selektoren in den Smoke-Missions korrigieren
**Datei:** Migration `update qa_missions steps`
Zuerst die echten UI-Texte verifizieren mit:
- `rg -i "subtitle|untertitel" src/pages/UniversalDirectorsCut.tsx src/pages/DirectorsCut/`
- `rg -i "briefing|brief" src/pages/Autopilot* src/components/autopilot/`

Dann die DB-Steps so anpassen, dass entweder:
- ein **tatsächlich vorhandener** Tab/Button-Text gesucht wird, ODER
- ein robuster `data-testid="…"`-Selector benutzt wird (Engine in `browserlessClient.ts` unterstützt das schon via `selector`-Feld).

Falls die App noch keine `data-testid`s an den richtigen Stellen hat: **lieber die problematischen Steps ersatzlos streichen** und nur navigate + expect_visible (auf Page-Header) + expect_no_console_error behalten. Lieber 3 grüne Steps als 6 rote.

### 3. `smoke-05-composer-render-stitch` entschlacken
**Migration auf `qa_missions`:**
- 7 → max. 4 Steps: `navigate /video-composer` → `expect_visible "Composer"` (oder echter Header) → `sleep 1500` (Heavy-Page-Bootstrap) → `expect_no_console_error`.
- Den `click_text "Add Scene"` + `expect_visible "Scene"` rauswerfen (zu fragil, hier nicht der Test-Fokus).

### 4. Auto-Resolve für „Mission execution failed: Browserless 408"
**Datei:** `supabase/functions/qa-agent-execute-mission/index.ts`
- Beim nächsten erfolgreichen Run einer Mission alle vorherigen `qa_bug_reports` derselben `mission_name` mit Title-Prefix `"Mission execution failed: Browserless 408"` auf `status = 'resolved'` setzen. So leert sich die Bug Inbox automatisch, statt dass der User 24 stale Einträge manuell wegklicken muss.

### 5. (Optional, nice-to-have) `companion-diagnose` als Muted-Pattern
Falls Schritt 1 (`blockAds=false`) doch noch etwas durchlässt: einen Eintrag in `qa_muted_patterns` mit `pattern_regex = 'companion-diagnose.*ERR_(BLOCKED|FAILED)'` und `severity_when_matched = 'ignore'`. Das ist Defense-in-Depth.

## Dateien

- `supabase/functions/_shared/browserlessClient.ts` — `blockAds=true` entfernen
- `supabase/functions/qa-agent-execute-mission/index.ts` — Auto-Resolve-Block ergänzen
- Migration: `UPDATE qa_missions SET steps = ... WHERE name IN ('smoke-04-...', 'smoke-05-...', 'smoke-06-...')`
- Optional Migration: `INSERT INTO qa_muted_patterns ...` für companion-diagnose

## Erwartung nach dem Fix

- smoke-04 / smoke-06 grün (keine fake "Subtitles"/"Briefing"-Klicks mehr, keine falschen `ERR_BLOCKED_BY_CLIENT`-Console-Errors)
- smoke-05 grün (4 statt 7 Steps, passt in 30s Hobby-Cap)
- Bug Inbox: 24 → ~0–2 echte Einträge nach dem nächsten Cron-Lauf
- Wir sehen wieder **echte** App-Probleme statt QA-Agent-Eigenartefakte

## Out-of-scope

- Browserless-Plan-Upgrade
- Komplette Selektor-Robustheits-Initiative (z.B. `data-testid` auf jeden Tab) — separater PR
