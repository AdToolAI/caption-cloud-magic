## Status

Der QA-Bot läuft jetzt korrekt durch (`smoke-07-calendar-crud`: Login OK, `/calendar` lädt in 5.9s, Screenshot vorhanden). Run wird trotzdem als "failed" markiert, weil:

- **16 Console-Errors** (alle nur als 1 Sammel-Bug erfasst, ohne URL/Stack)
- **13 Network-Errors** (komplett unsichtbar im Cockpit — werden nur gezählt, kein Bug erstellt für 4xx)
- **1 generischer Bug** ohne actionable Details

Beispiel-Errors aus dem letzten Run (sichtbar in der DB):
- `X-Frame-Options may only be set via an HTTP header sent along with a document. It may not be set inside <meta>` → kosmetisch, fix in `index.html`
- `Failed to load resource: 404` und `406` → echte Bugs, aber wir wissen nicht *welche* URL

**Ohne saubere Aufschlüsselung können wir nichts gezielt fixen.** Daher zuerst: Detail-Telemetrie + Triage-UI, dann iterativ die echten Bugs.

## Plan

### 1. Detail-Erfassung im Edge-Function (`qa-agent-execute-mission/index.ts`)

- **4xx/Non-5xx Network-Errors** ebenfalls als Bug speichern (aktuell nur 5xx). Severity: `medium` für 404/406, `high` für 401/403.
- **Console-Errors gruppieren**: pro einzigartigem Error-Pattern einen Bug, statt einen Sammel-Bug. Inkl. erster URL und (falls vorhanden) Stack-Trace.
- **Allowlist** für bekannte Noise-Errors (z.B. `X-Frame-Options via meta`, `ResizeObserver`, `Loading chunk`) — diese als `severity: low` taggen, nicht als High.
- **Run nicht als "failed" markieren**, wenn nur Low-Severity-Bugs vorhanden — neuer Status `succeeded_with_warnings`.

### 2. Browserless-Script erweitert (`_shared/browserlessClient.ts`)

- Bei `console error`-Events zusätzlich `location.url`, `location.lineNumber`, `args[0]?.stack` capturen.
- Bei `requestfailed`/`response.status>=400` Events: `request.resourceType`, `request.method`, `response.headers['content-type']` mitspeichern.

### 3. Bug-Inbox-UI (`QACockpit.tsx`)

- Neue **"Bug-Triage"-Sektion** unter den Run-Cards mit Tabs:
  - **Action Required** (high/critical)
  - **Warnings** (medium, low)
  - **Ignored** (manuell stummgeschaltet)
- Pro Bug: Erste-Hilfe-Buttons:
  - **"Mark as fixed"** → `qa_bug_reports.resolved_at = now()`
  - **"Mute pattern"** → speichert Regex in neuer Tabelle `qa_muted_patterns` (zukünftige Runs ignorieren)
  - **"Show in code"** → Modal mit Stack/URL und (wenn möglich) File-Pfad

### 4. Bekannte Quick-Wins parallel fixen

Aus dem Run sehen wir bereits konkrete Issues — diese können wir sofort angehen:

- **`index.html`**: `<meta http-equiv="X-Frame-Options">` entfernen (gehört in HTTP-Header oder `_headers`).
- **404/406 auf `/calendar`**: nach Detail-Erfassung in Schritt 1 sehen wir die URL — vermutlich eine Supabase-Query mit `.single()` ohne Daten (406) oder ein fehlendes Asset (404). Fix dann gezielt.

### 5. Migration

Neue Tabelle `qa_muted_patterns` (id, pattern_regex, reason, created_by, created_at) + `qa_bug_reports.resolved_at` + `qa_bug_reports.resolved_by` Spalten.

## Erwartetes Ergebnis

Nach Schritt 1-3: Du siehst im Cockpit eine sortierte Bug-Liste, jede mit URL/Stack, und kannst pro Bug entscheiden: Fix, Mute oder Ignore. Aktuell sind 16+13 Errors = 1 Sammel-Bug, danach werden es ~5-8 distinct, fixbare Bugs sein.

Schritt 4 (kosmetisch + erste echte Fixes) folgt im selben Durchgang, sobald wir die URLs kennen.

## Betroffene Dateien

- `supabase/functions/qa-agent-execute-mission/index.ts`
- `supabase/functions/_shared/browserlessClient.ts`
- `src/pages/admin/QACockpit.tsx`
- `index.html` (X-Frame-Options Meta entfernen)
- Neue Migration: `qa_muted_patterns` Tabelle + `resolved_at`/`resolved_by` auf `qa_bug_reports`
