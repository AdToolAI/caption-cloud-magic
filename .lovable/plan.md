## Bond QA Agent — 300€ Smart-Budget Tester

KI-gesteuerter End-to-End-Tester der die **gesamte Plattform** abdeckt mit einem harten Budget-Cap von **300€ Credits**. Lambda-Renders & Browserless sind unlimitiert (kein Provider-Cost). Fokus: Maximale Bug-Abdeckung pro Cent.

**Setup:** Live-Preview + Test-Account `qa-bot@useadtool.ai` (Enterprise-Plan, separater Credit-Pool von 300€). Beides kombiniert: Nightly Smoke + Wöchentliche Deep Regression + Random Exploration.

---

### Budget-Allokation (300€ über 4 Wochen Testlauf, dann Quartals-Refill)

| Bereich | Budget | Strategie |
|---|---|---|
| **AI Video Provider** (10 Modelle) | 180€ | Rotations-Matrix: jede Woche 2-3 Provider mit minimalsten Settings (5s, niedrigste Auflösung). Alle 10 Provider in 4 Wochen 1× echt getestet. |
| **AI Bilder** (Picture Studio, FLUX, Gemini Image) | 30€ | Smart-Sampling: 1 Generation pro Modus pro Woche (T2I, Inpaint, Outpaint, Upscale, Variations) |
| **Voiceover/TTS** (ElevenLabs) | 20€ | Kurze 3-Sekunden-Texte, alle Stimmen rotieren |
| **Music Studio** (Stable Audio, MiniMax) | 15€ | 1 Track pro Tier pro Woche, jeweils 10s |
| **Talking Head** (Hedra) | 15€ | 1 kurzer Avatar-Render pro Woche |
| **Autopilot End-to-End** | 25€ | Vollständiger Wochenlauf 1×/Monat mit echten Generierungen (4 Slots) |
| **Translator + Sora Long-Form** | 10€ | 1 Lauf mit minimalem Input |
| **Reserve / Random Exploration** | 5€ | Fail-Safe wenn Cost-Cap pro Run überschritten |

**Cost-Cap pro Run hart enforced:** Smoke 0€ (alles gemockt), Regression 5€, Deep 15€. Workspace-Credit-Hook stoppt automatisch wenn Test-User unter 10€ fällt → Telegram-Alert.

---

### Kernprinzipien für maximale Bug-Abdeckung pro €

1. **Provider-Rotations-Matrix** — Statt jeden Provider jeden Tag, rotiert die KI durch alle 10 AI-Video-Provider über 4 Wochen. Jede Woche: 2-3 echte Renders + 7 gemockte. Workflow-Logik (Routing, Refund, Polling, DB-Writes) ist provider-agnostisch und wird täglich abgedeckt.
2. **Cached Asset-Pool** — Test-User hat 50 vorgenerierte Assets (Videos/Bilder/Audios/Scripts). Workflows die nur **konsumieren** (Director's Cut, Composer, Translator) nutzen diese als Input → 0€ Cost.
3. **Mock-by-Default** — `is_test_user`-Flag → alle teuren Edge-Functions mocken standardmäßig. Echte Calls nur wenn die Mission explizit `cost_real: true` setzt.
4. **Differential Testing** — Screenshot/DOM/Performance-Diff gegen letzten grünen Baseline-Run. Nur Diffs werden mit Vision-AI tief analysiert → spart 80% Gemini-Vision-Calls.
5. **Smart Mission Scheduler** — Statt fester Reihenfolge wählt der Orchestrator die Mission mit höchstem **Bug-Yield-pro-Cent**: Bereiche mit kürzlich vielen Bugs/Code-Änderungen werden öfter getestet.
6. **Lambda & Browserless = unlimitiert** — Voller End-to-End-Render-Test täglich (Composer → Multi-Scene-Render → Director's Cut → Export) als Workflow-Backbone. Das ist der wichtigste Korrektheits-Check und kostet keine Credits.

---

### Wochenrhythmus

```text
Mo-Fr 02:00 UTC → Smoke-Suite (0€/Nacht)
                  • Login, Navigation, alle 24 Module laden
                  • 1 echter Lambda-Render (Composer-Pipeline)
                  • 8 Workflow-Missionen mit gemockten Providern

Sa 02:00 UTC    → Regression (~50€/Woche)
                  • Smoke + 2-3 echte AI-Video-Provider (rotierend)
                  • Echte Bild-Generation (1× pro Modus)
                  • Echte VO/Music/Hedra-Calls (kurz)
                  • 30 Min Random-Exploration

So 02:00 UTC    → Performance-Audit (0€)
                  • Lighthouse alle Hauptrouten
                  • JS-Heap, LCP, FID, CLS
                  • Diff gegen Vorwoche

Monatlich 1×   → Deep Autopilot Run (~25€)
                  • Vollständiger Wochenplan mit echten Generierungen
```

Über 4 Wochen sind alle 10 Video-Provider, alle Bild-Modi, alle TTS-Stimmen und alle Music-Tiers mindestens 1× echt durchgelaufen.

---

### Datenmodell

- **`qa_test_runs`** — `tier`, `mission`, `status`, `duration_ms`, `bugs_found`, `cost_actual_cents`, `cost_budgeted_cents`, `baseline_run_id`
- **`qa_bug_reports`** — `severity`, `category` (workflow / visual / data-integrity / performance / regression / cost-overrun), `route`, `reproduce_steps[]`, `screenshot_url`, `console_log`, `network_trace`, `diff_from_baseline`
- **`qa_missions`** — `name`, `tier`, `steps[]`, `expected_assertions[]`, `cost_real_providers[]` (welche Provider in diesem Run echt laufen dürfen), `cost_cap_cents`
- **`qa_test_assets`** — vorgenerierte Inputs, getagged
- **`qa_baselines`** — pro Mission+Step: Screenshot-Hash, DOM-Snapshot, Performance-Bandbreiten
- **`qa_budget_ledger`** — Tages/Wochen/Monats-Spending pro Bereich, Hard-Cap-Enforcement
- **`qa_provider_rotation`** — welcher Provider wann zuletzt echt getestet wurde, Next-In-Line Logik

RLS: Nur Admins.

---

### Edge Functions

- **`qa-agent-orchestrator`** (cron nightly) — Wählt Tier nach Wochentag, prüft `qa_budget_ledger`, picked Provider via Rotation-Matrix, startet Missions sequenziell.
- **`qa-agent-execute-mission`** — Browserless-Loop mit Gemini Flash Lite für Action-Decisions, programmatischen Assertions (80% der Checks ohne AI), Screenshots nur bei Failure oder Mission-Ende.
- **`qa-agent-mock-providers`** — Middleware-Pattern: alle teuren Provider-Edge-Functions checken `request.user.is_test_user` UND ob die laufende Mission diesen Provider in `cost_real_providers` hat. Sonst sofort Cached-Asset zurück.
- **`qa-agent-budget-guard`** — Pre-Flight-Check vor jedem realen Provider-Call. Stoppt Run wenn Cost-Cap überschritten oder Monatsbudget erreicht.
- **`qa-agent-diff-baseline`** — Screenshot-Hash + DOM-Diff. Nur echte Abweichungen → Gemini Flash Vision für Detail.
- **`qa-agent-explore`** (Sa nur) — 30 Min Random-Click in unbesuchten Routen.
- **`qa-agent-performance-audit`** (So) — Lighthouse via Browserless + JS-Heap-Snapshots.
- **`qa-agent-digest`** (cron 07:00 UTC) — Telegram + In-App. Inkl. Budget-Status: "Diese Woche 12€/75€ verbraucht, alle Provider grün."
- **`qa-cleanup-test-data`** — Tägliches Aufräumen aller Test-User-Inhalte > 24h.

---

### Frontend — `/admin/qa-cockpit` (5 Tabs, Bond-Design)

1. **Live Run** — Step-Progress, Live-Console, letzter Screenshot, aktueller Cost-Counter
2. **Bug Inbox** — Severity-Filter, Click → Drawer mit Reproduce-Steps + Diff-View (Baseline ↔ Aktuell)
3. **Missions** — CRUD, "Jetzt ausführen", Tier-Badge, `cost_real_providers` Toggle
4. **Budget Tracker** — Stacked Bar pro Bereich, Burn-Rate Forecast, Provider-Rotation-Matrix als Heatmap
5. **Baselines & Performance** — Pro Mission letzter grüner Run + Lighthouse-Trends

---

### Mission-Library (Workflow-fokussiert)

**Smoke (täglich, 0€):**
1. Login + Dashboard + alle 24 Hauptmenüs öffnen
2. Picture Studio: Generate (Mock) → Save → Media Library check
3. AI Video Toolkit: Provider-Switch, Render-Job startet, Polling, Refund-Pfad
4. Director's Cut: Cached Test-Video laden, Subtitles, Filter, Speed-Ramp
5. Composer: 2 Cached Scenes → "Render All & Stitch" → **echter Lambda-Render** → Director's Cut Übergabe → Subtitle-Track sichtbar → Export → MP4-Header valide
6. Autopilot Briefing-Form, Strategie-Generation triggert (Gemini = günstig, läuft echt)
7. Social Calendar Slot CRUD
8. Music Studio Tier-Buttons klickbar
9. Marketplace Liste + Detail + Buy-Flow startet
10. Brand Character Auswahl in allen Studios
11. Avatar Library, Talking Head Dialog mit Preset-Avatar
12. Credit-Refund Validation: Mock-Failure → DB-Refund-Check

**Regression (Sa, ~50€):**
13. **Provider-Rotation Realtest:** 2-3 AI-Video-Provider rotierend mit minimalsten Settings
14. **Echte Bild-Generation:** 1× T2I, 1× Inpaint, 1× Upscale (~3€)
15. **Echte VO+Music:** 3s ElevenLabs, 10s Stable Audio
16. **Continuity Guardian:** Frame-Extraction → Reference → Next Scene generation
17. Localization-Sweep DE/EN/ES auf allen Hauptseiten
18. Stock-Library Live-Search (Pexels/Pixabay)
19. Video Translator mit Cached Input
20. Email Director Draft-Generation + Test-Send

**Deep (monatlich, ~25€):**
21. Autopilot Full-Week-Pipeline: Briefing → Plan → 4 Slots echt generieren → Approve → Publish (Sandbox)

---

### Safety & Cost Controls

- **Hard Budget Cap 300€/Monat** im `qa_budget_ledger` — bei Erreichen automatischer Stop aller Real-Calls bis zum 1. des Folgemonats
- **Cost-Cap pro Run** programmatisch enforced
- **Lambda-Test-Composition** auf 5s/720p limitiert (kostet keine Credits, aber spart Render-Zeit)
- **Auto-Cleanup** nach 24h
- **Rate Limit:** max 1 Run pro Mission pro 4h
- **Kill-Switch** im Cockpit
- **Telegram-Alert** bei: jedem kritischen Bug, Budget > 80% verbraucht, Run-Failure ohne Refund

---

### Technische Details

- **Browser:** Browserless.io — du brauchst `BROWSERLESS_API_KEY` als Secret später
- **KI:** `gemini-2.5-flash-lite` für Action-Decisions, `gemini-2.5-flash` nur für Visual-Diff
- **Assertions:** 80% programmatisch (Element-Existenz, HTTP-Status, DB-Row-Counts) → keine Token-Kosten
- **Test-User:** Enterprise-Plan mit 999M Plattform-Credits aber **separater 300€/Monat Real-Money-Budget** im Ledger getrackt

---

### Diagramm

```text
        ┌──────────────┐
Cron ───┤ Orchestrator ├──checks──▶ qa_budget_ledger
        └──────┬───────┘            qa_provider_rotation
               ▼
        ┌─────────────────────┐    ┌────────────────┐
        │ execute-mission     │───▶│ Browserless    │
        │ • Assertions (free) │    │ (Chromium)     │
        │ • Gemini Flash Lite │    └────────┬───────┘
        │ • Diff vs Baseline  │             │
        └──────────┬──────────┘             ▼ provider call
                   │                ┌────────────────┐
                   │                │ budget-guard   │──over cap─▶ STOP+Alert
                   │                │ + mock-check   │
                   │                └────────┬───────┘
                   │                         │ ok
                   │                         ▼
                   │                   real / mock
                   ▼
        bug_reports + budget_ledger ──▶ Telegram + Cockpit
```

---

### Roadmap (3 Sessions)

- **QA-1:** Schema (8 Tabellen) + Test-User mit 300€-Ledger + `is_test_user`-Mock-Hooks in alle teuren Provider-Functions + Browserless-Anbindung + Orchestrator-Skelett + Budget-Guard
- **QA-2:** `execute-mission` mit Assertions-Engine + Differential-Testing + Provider-Rotations-Matrix + 12 Smoke-Missionen geseedet + Cached-Asset-Pool
- **QA-3:** Admin-Cockpit (5 Tabs inkl. Budget-Tracker) + Telegram-Digest + Performance-Audit + 8 Regression-Missionen + Deep-Autopilot-Mission + Cleanup-Cron

**Soll ich mit Session QA-1 starten?**
