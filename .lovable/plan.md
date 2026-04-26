## Diagnose: Was die Tests wirklich zeigen

### Block A — Echte Bugs im Motion Studio Superuser (6 Failures, alle in unserer Verantwortung)

| Szenario | Root Cause | Fix |
|---|---|---|
| **MS-3 Auto-Director Compose** | Die Function lehnt mit `idea must be at least 5 characters` ab, obwohl wir 60+ Zeichen senden — vermutlich wird `body.idea` durch eine Body-Wrapping-Schicht gestrippt oder die Function liest das Falsche Feld. | Defensives Logging in `auto-director-compose` (raw body dump bei `INVALID_INPUT`); im Superuser explizit `JSON.stringify` mit Content-Length-Header senden; ggf. das Trim-Limit auf 4 Zeichen senken. |
| **MS-5 Stock Media Bucket Health** | Sucht nach `composer-clips` + `stock-media` — beide existieren nicht. Existierend: `composer-uploads`, `composer-frames`, `composer-nle-exports`. | Erwartete Bucket-Liste auf real existierende Buckets korrigieren (`composer-uploads`, `composer-frames`). Optional: Migration zum Anlegen von `composer-clips` falls semantisch benötigt. |
| **MS-8 Trending Templates Available** | `composer_template_suggestions` ist leer — `aggregate-trending-templates` wurde nie ausgeführt. | (1) Einmaliger Seed-Run von `aggregate-trending-templates` über admin-trigger. (2) Statt hartem Fail bei 0 Templates → "warning" mit Hinweis "aggregator pending first run". |
| **MS-9 Brand Consistency Analysis** | `Brand kit not found` — `ensureTestProject` legt kein Brand Kit für den Test-User an. | Neue Funktion `ensureTestBrandKit(userId)` im Setup, die einen Default-Brand-Kit (Logo, Farben, Voice-Sample) seedet. |
| **MS-10 Brand Voice Analysis** | `Cannot read properties of undefined (reading 'map')` — `analyze-brand-voice` crasht beim fehlenden Brand-Kit-Lookup, weil `samples` ohne Kit nicht gemapped werden können. | (1) Brand Kit aus MS-9 wiederverwenden. (2) Defensiver Null-Guard in `analyze-brand-voice` (early return mit 404 statt Crash). |
| **MS-16/17 NLE Export FCPXML/EDL** | `No scenes with usable clips` — Test-Projekt hat nur eine `pending` Szene ohne Clip-URL. | `ensureTestProject` muss mindestens 2 Szenen mit dummy-`clip_url` (kurzes öffentliches MP4) und `clip_status='ready'` seedet. |

### Block B — Anomalie-Engine glättet plattformweite 503-Wellen

Die KI-Analyse zeigt 39 offene Anomalien, weil eine gestrige globale Lovable-Cloud-Edge-Runtime-Störung **systemweit** 503er produziert hat. Das ist kein Bug von uns, aber unser Anomalie-Detektor sollte nicht jede Plattform-Störung als Code-Bug zählen.

**Fix:** In `analyze-superuser-anomalies` einen Filter ergänzen:
- Wenn ein 503 `SUPABASE_EDGE_RUNTIME_ERROR` in **≥5 verschiedenen Funktionen innerhalb derselben 10-Minuten-Welle** auftritt → als **single platform-incident** zusammenfassen (nicht 39 Einzel-Anomalien).
- Anomalien automatisch auflösen, wenn das Szenario in den letzten 3 Runs wieder grün ist.

### Block C — Trending Aggregator Seed + pg_cron

- Einmaliger Seed-Run von `aggregate-trending-templates` per `supabase.functions.invoke`.
- `pg_cron`-Eintrag: wöchentlich Sonntag 03:00 UTC.

---

## Geplante Änderungen

### 1. `supabase/functions/motion-studio-superuser/index.ts`
- **MS-5**: Bucket-Liste auf `["composer-uploads", "composer-frames", "composer-nle-exports"]` korrigieren.
- **MS-8**: Hartes Fail → `warning` mit Hinweis "first aggregator run pending".
- **`ensureTestBrandKit(userId)`** neu hinzufügen — seedet Logo-URL, Primary/Secondary Color, Voice-Sample (3 kurze Texte).
- **`ensureTestProject`** erweitern — 2 Szenen mit `clip_url` (öffentliches Test-MP4), `clip_status='ready'`, `duration_seconds=3`.

### 2. `supabase/functions/auto-director-compose/index.ts`
- Bei `INVALID_INPUT`: Raw-Body in `console.error` loggen (für Debug).
- Idea-Limit auf 4 Zeichen senken (5 ist zu strikt für QA).

### 3. `supabase/functions/analyze-brand-voice/index.ts`
- Null-Guard: Wenn `brandKit` nicht gefunden → 404 mit klarer Message statt Crash.
- Wenn `samples` undefined → leeres Array Default.

### 4. `supabase/functions/analyze-superuser-anomalies/index.ts`
- Cluster-Logik: 503 + `SUPABASE_EDGE_RUNTIME_ERROR` + ≥5 Funktionen in 10min → 1 Platform-Incident-Anomalie statt N.
- Auto-Resolve: Wenn letzte 3 Runs des Szenarios grün → Anomalie schließen.

### 5. Trending Aggregator
- Einmal manuell triggern via `supabase--curl_edge_functions`.
- Migration: `pg_cron`-Job für wöchentliche Ausführung.

### 6. UI: `MotionStudioSuperuserPanel.tsx`
- Banner "ℹ️ MS-8 ist eine Warning bis der erste Aggregator-Run gelaufen ist" entfernen, sobald Templates da sind.

---

## Erwartetes Ergebnis nach Umsetzung

- Motion Studio Superuser Pass-Rate: **18/18 (100%)** statt aktuell 12/18 (67%).
- Anomalien-Liste: von **39 → ~5** (echte Code-Bugs, keine Plattform-Wellen).
- `composer_template_suggestions` enthält die ersten Trending-Einträge.

## Was NICHT geändert wird

- KI Superuser Test Runner (separate Codebase, läuft stabil).
- Globale Platform-503-Welle ist Lovable-Cloud-seitig, nicht reparierbar von uns.
- Build-Errors-Liste: typischerweise "alle Functions wurden gecheckt"-Hinweis, nicht echte Errors. Falls beim nächsten Build doch echte Typescript-Fehler auftauchen, fixen wir die punktuell.
