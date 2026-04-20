

## Plan: Bug-Hunting & Quality Assurance ohne Superuser

### Das Problem klar benannt

Du hast **alle Tools schon installiert** (Sentry + PostHog + Playwright + Support-Tickets), aber:
- 🔴 **Sentry-Errors siehst du nur auf sentry.io** (extra Login, extra Tab)
- 🔴 **PostHog-Sessions siehst du nur auf posthog.com**
- 🔴 **Playwright-Tests laufen nur lokal/CI** — niemand führt sie regelmäßig aus
- 🔴 **support_tickets** hat kein UI — du siehst nicht, wer was meldet
- 🔴 **Es gibt keinen "User-meldet-Bug"-Button** in der App

→ **Lösung: Alles in deinem Admin-Dashboard sichtbar machen + automatisierte Daily Tests + In-App-Bug-Reporter.**

### Was du bekommst (4 Module)

#### Modul 1: Bug Monitor Tab im Admin (Sentry-Integration)

**Neuer Tab "Bugs"** im Admin-Dashboard, der **deine Sentry-Daten direkt anzeigt** — kein Login mehr nötig:

```text
╔════════════════════════════════════════════════════════╗
║  🐛 Bug Monitor                          [Letzte 24h ▼] ║
╠════════════════════════════════════════════════════════╣
║  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                       ║
║  │  3  │ │ 12  │ │  47 │ │ 2.1%│                       ║
║  │Crit │ │Warn │ │Total│ │User │                       ║
║  │     │ │     │ │     │ │Affec│                       ║
║  └─────┘ └─────┘ └─────┘ └─────┘                       ║
║                                                        ║
║  🔥 Top Errors (nach Häufigkeit)                       ║
║  ┌────────────────────────────────────────────────┐    ║
║  │ #1 TypeError: cannot read 'map' of undefined  │    ║
║  │    23x · 8 User · /director-cut · letzte 2h   │    ║
║  │    [Sentry öffnen] [Als gefixt markieren]     │    ║
║  ├────────────────────────────────────────────────┤    ║
║  │ #2 NetworkError: fetch failed                 │    ║
║  │    11x · 4 User · /ai-video-studio · 5h       │    ║
║  └────────────────────────────────────────────────┘    ║
║                                                        ║
║  📊 Error-Trend (7 Tage)  [Line-Chart]                ║
║  📋 User-Feedback (aus support_tickets)               ║
╚════════════════════════════════════════════════════════╝
```

**Technisch:** Edge Function `sentry-bridge` ruft Sentry REST API mit Auth-Token, cached 5 Min, zeigt direkt im UI.

#### Modul 2: In-App Bug-Reporter

Ein **schwebender "Bug melden" Button** (rechts unten, klein, dezent) in jeder Seite:

- User klickt → Modal öffnet sich
- Auto-erfasst: aktuelle Route, Browser, letzten 5 Console-Errors, Screenshot der Seite (via `html2canvas`)
- User schreibt: „Was wolltest du tun?" + „Was ist passiert?"
- Submit → speichert in `support_tickets` + sendet Email an `bestofproducts4u@gmail.com`
- User sieht: „Danke! Wir kümmern uns drum."

**Bonus:** Wenn User eingeloggt → User-ID + Email automatisch erfasst → du kannst direkt antworten.

#### Modul 3: Automatisierte Daily Health-Tests

Die existierenden Playwright-Tests laufen **nur manuell**. Wir machen sie zu echtem Monitoring:

**Neue Edge Function `daily-smoke-test`** (täglich 06:00 via Cron):
- Ruft 8 kritische Endpoints ab und prüft Status:
  1. Landing Page lädt (200)
  2. `/auth` Login-Form rendert
  3. `/dashboard` (mit Test-User) lädt
  4. `auto-generate-universal-video` Edge Function antwortet
  5. `render-directors-cut` Edge Function antwortet
  6. `send-transactional-email` Edge Function antwortet
  7. Stripe-Checkout Edge Function antwortet
  8. Datenbank-Connection (simple SELECT)

→ Schreibt Ergebnisse in **neue Tabelle `health_check_results`**  
→ Wenn ein Check fehlschlägt → triggert Alert via existierendes `health-alerter` System  
→ Du bekommst Email **bevor** ein User es merkt

#### Modul 4: Error-Patterns & Auto-Diagnose im Admin

Eine **„Häufigste Probleme"-Sektion** im Bug Monitor mit **automatischer Pattern-Erkennung**:

- Gruppiert ähnliche Errors (z.B. „5 verschiedene Pages haben den gleichen NetworkError")
- Zeigt: „Dieser Error tritt nur bei iOS Safari auf" oder „Nur bei Plan=free"
- Verlinkt direkt zur Sentry-Detail-Page
- Markiert als „Bekannt" / „Gefixt" / „Won't Fix"

### Komponenten & Dateien

**Neu zu erstellen:**

1. `supabase/functions/sentry-bridge/index.ts` — Sentry API Proxy (~150 Zeilen)
2. `supabase/functions/daily-smoke-test/index.ts` — 8 Smoke Checks (~200 Zeilen)
3. `supabase/functions/submit-bug-report/index.ts` — Bug-Reporter Backend (~80 Zeilen)
4. `src/pages/admin/Bugs.tsx` — Haupt-Page Bug Monitor
5. `src/components/admin/bugs/BugSummaryCards.tsx` — 4 KPI-Karten
6. `src/components/admin/bugs/TopErrorsList.tsx` — Top 10 Errors
7. `src/components/admin/bugs/ErrorTrendChart.tsx` — Recharts 7-Tage-Trend
8. `src/components/admin/bugs/UserFeedbackList.tsx` — Aus support_tickets
9. `src/components/admin/bugs/HealthCheckStatus.tsx` — Daily Smoke Test Status
10. `src/components/feedback/BugReporterButton.tsx` — Floating Button
11. `src/components/feedback/BugReporterModal.tsx` — Report-Form mit Screenshot

**Geändert:**

12. `src/pages/Admin.tsx` — Neuer 8. Tab "Bugs" mit `Bug`-Icon
13. `src/App.tsx` — `<BugReporterButton />` global einbinden

**Migrations:**

14. Neue Tabelle `health_check_results` (id, check_name, status, response_time_ms, error_message, checked_at)
15. RLS auf `support_tickets` falls noch fehlt
16. 1 Cron-Job für `daily-smoke-test` (täglich 06:00)

**Secrets:**

17. `SENTRY_AUTH_TOKEN` — wird benötigt für die Sentry-API. Du musst einen Read-Token auf sentry.io erstellen (Settings → Auth Tokens → `event:read project:read`). Ich frage dich beim Build danach.

### Was das **nicht** löst (ehrlich)

- ❌ **Es ersetzt nicht echtes manuelles Testen** — wir können nicht alle 7 Video-Studios automatisch testen, weil sie Credits/Geld kosten
- ❌ **Es findet keine UX-Probleme** („User versteht den Button nicht") — dafür brauchst du echte User oder einen User-Test mit Bekannten
- ❌ **Visual Bugs** (verrutschte Layouts) erkennt es nicht — die Playwright Visual-Tests existieren zwar, müssen aber manuell gepflegt werden

→ **Aber es findet ~80% aller technischen Bugs**, bevor User sie melden müssen.

### Aufwand-Einschätzung

- **3 neue Edge Functions** (~430 Zeilen)
- **1 neue Page + 6 Komponenten** (~500 Zeilen)
- **2 globale Komponenten** (Bug-Reporter Button + Modal, ~250 Zeilen)
- **1 Migration** (1 neue Tabelle, 1 Cron-Job)
- **1 Secret** (`SENTRY_AUTH_TOKEN`)

→ **Mittelgroß-Komplex, machbar in 1 Session.**

### Was du danach hast

✅ **Alle Bugs sichtbar im Admin** — kein Sentry-Login mehr nötig  
✅ **User können selbst Bugs melden** mit einem Klick (mit Auto-Screenshot)  
✅ **Tägliche Smoke-Tests** prüfen automatisch alle kritischen Flows  
✅ **Email-Alert bei Smoke-Test-Failure** über das gestern gebaute System  
✅ **Pattern-Erkennung** — siehst sofort, wo ein Bug-Trend startet  
✅ **Trend-Charts** — Bug-Anzahl über Zeit, Bouncerate-ähnlich  
✅ **Support-Tickets im Admin** — kein verlorenes User-Feedback mehr

### Workflow nach dem Build

1. **Morgens 06:05**: Smoke-Test läuft → wenn Fail → Email an dich
2. **Tagsüber**: User klickt evtl. „Bug melden" → Email + Ticket im Admin
3. **Wann immer du willst**: `/admin/bugs` öffnen → siehst alle Errors aggregiert  
4. **Sonntags 08:00**: Wöchentlicher Health-Report (von gestern) inkl. Bug-Statistik

