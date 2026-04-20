

# Plan: KI Superuser — Proaktives Bug-Hunting System

## Was wird gebaut

Ein automatisierter „KI Test-Agent", der **wie ein echter User** durch die App läuft, kritische Workflows durchspielt und Bugs meldet **bevor** echte User sie sehen. Ergänzt das bestehende Setup (Sentry + Bug-Reporter + Smoke-Tests) um die fehlende **proaktive Schicht**.

## Die 4 Verteidigungsebenen (komplettes Bild)

```text
┌─────────────────────────────────────────────────────────┐
│ Ebene 1: SENTRY (passiv)                                │
│   → Fängt Errors die ECHTE User triggern                │
│   ✅ schon gebaut                                        │
├─────────────────────────────────────────────────────────┤
│ Ebene 2: BUG-REPORTER (passiv)                          │
│   → User melden Probleme manuell                        │
│   ✅ schon gebaut                                        │
├─────────────────────────────────────────────────────────┤
│ Ebene 3: SMOKE-TESTS (semi-aktiv, oberflächlich)        │
│   → Pingt 5 Functions per CORS                          │
│   ✅ schon gebaut, aber dünn                             │
├─────────────────────────────────────────────────────────┤
│ Ebene 4: KI SUPERUSER (proaktiv, tiefgehend) ← NEU      │
│   → Durchläuft echte User-Flows mit echten Daten        │
│   → Findet Bugs BEVOR User sie sehen                    │
└─────────────────────────────────────────────────────────┘
```

## Architektur des KI Superusers

### Komponente 1: Test-Account in DB
- Service-Account `ai-superuser@adtool-ai-internal.test` mit Enterprise-Plan + 999M Credits
- Markierung in `profiles.is_test_account = true` damit er **nicht in echten Statistiken** auftaucht
- Eigener Workspace mit Demo-Daten (Logo, Brand Kit, 1 Test-Video)

### Komponente 2: Test-Szenarien-Bibliothek
12 kritische User-Flows als TypeScript-Definitionen:

| # | Szenario | Was wird getestet |
|---|---|---|
| 1 | **Caption Generation** | `generate-caption` → DB-Speicherung → Credit-Abzug |
| 2 | **Bio Generation** | `generate-bio` mit allen 3 Sprachen (EN/DE/ES) |
| 3 | **Hooks Generation** | `generate-hooks` mit verschiedenen Stilen |
| 4 | **Reel Script** | `generate-reel-script` für 15s/30s/60s |
| 5 | **Image Generation** | `generate-studio-image` → Storage Upload → Thumbnail |
| 6 | **Picture Studio Background** | Smart Background Replacer End-to-End |
| 7 | **Trend Radar** | `fetch-trends` für DE/EN/ES mit Cache-Check |
| 8 | **Calendar Auto-Schedule** | `calendar-autoschedule` mit Posting-Time-Recommendations |
| 9 | **Performance Analytics** | `analyze-performance` mit Mock-Daten |
| 10 | **Credit Pipeline** | `credit-preflight` → `credit-reserve` → `credit-commit` |
| 11 | **Auth Flow** | Signup → Email Verify → Wallet Created Trigger |
| 12 | **AI Video Generation** | `generate-kling-video` Mini-Test (3s Clip) |

### Komponente 3: Edge Function `ai-superuser-test-runner`
- Läuft alle 12 Szenarien als Service-Account
- Misst: Latenz, Status, Error-Message, Response-Schema
- Erkennt **Schema-Drift** (z.B. wenn ein Feld plötzlich fehlt)
- Speichert Ergebnisse in neue Tabelle `ai_superuser_runs`
- **Auto-Refund:** Verbrauchte Credits werden nach Test-Run automatisch zurückgebucht (Service-Account hat eh unlimited)

### Komponente 4: Schedule
- **Stündlich:** 6 schnelle Szenarien (Caption, Bio, Hooks, Reel, Trends, Credit-Pipeline)
- **Täglich 03:00 UTC:** Alle 12 Szenarien (inkl. Bild & Video)
- **Auf Demand:** Admin-Button „Jetzt alle Tests ausführen"

### Komponente 5: Admin Dashboard Tab „KI Superuser"
Im bestehenden `/admin` Bereich, neuer Tab neben „Smoke Tests":

- **Live-Status-Grid:** 12 Szenarien mit ✅/❌/⚠️ und letzter Latenz
- **Verlauf-Chart:** Erfolgsrate pro Szenario (letzte 7/30 Tage)
- **Detail-Drill-Down:** Klick auf ein fehlgeschlagenes Szenario → exakter Request, Response, Stack-Trace
- **„Issue erstellen"-Button:** Konvertiert einen Failed-Run direkt in einen Bug-Report im bestehenden System
- **Anomalie-Erkennung:** Warnt wenn Latenz +50% gegenüber 7-Tage-Schnitt

### Komponente 6: KI-Powered Anomaly Detection (Bonus)
Edge Function `analyze-superuser-anomalies` läuft täglich um 04:00:
- Nimmt letzte 24h Test-Runs
- Schickt sie an Lovable AI (Gemini Flash)
- Prompt: „Identifiziere ungewöhnliche Patterns: gestiegene Latenz, neue Error-Typen, intermittierende Fehler"
- Bei kritischen Findings → automatischer Bug-Report mit Severity „critical"

## Datenmodell (neue Tabellen)

```text
ai_superuser_runs
├── id
├── scenario_name
├── status (pass | fail | warning)
├── latency_ms
├── http_status
├── error_message
├── response_schema_hash  ← erkennt Schema-Drift
├── credits_consumed
├── full_request_json
├── full_response_json
└── started_at

ai_superuser_anomalies
├── id
├── detected_at
├── severity (critical | high | medium | low)
├── pattern_description
├── affected_scenarios[]
├── ai_analysis (Gemini Output)
└── auto_bug_report_id → bug_reports.id
```

## Sicherheit & Sauberkeit

- ✅ Service-Account hat `is_test_account = true` → **wird aus allen User-Statistiken gefiltert** (Conversion, Revenue, Cost)
- ✅ Alle Test-Runs werden mit Header `X-AI-Superuser: true` markiert → erscheinen nicht in PostHog Analytics
- ✅ Generierte Test-Inhalte landen in dediziertem Workspace, **nie** in echter Mediathek
- ✅ Edge Function `ai-superuser-test-runner` ist nur per Service-Role-Key callbar (keine User-Auth)
- ✅ RLS-Policy auf `ai_superuser_runs`: nur Admins können lesen

## Reicht das jetzt komplett?

**Ja — mit dieser Erweiterung ist das System vollständig.** Die 4 Ebenen decken zusammen ab:

| Bug-Typ | Wer findet ihn? |
|---|---|
| Frontend JS-Error in echter User-Session | Sentry |
| User merkt etwas funktioniert nicht | Bug-Reporter |
| Edge Function ist offline / nicht erreichbar | Smoke-Tests |
| Edge Function antwortet, aber liefert kaputte Daten | **KI Superuser** ← NEU |
| Schema-Drift (Feld umbenannt, fehlt) | **KI Superuser** ← NEU |
| Performance-Regression (Latenz +50%) | **KI Superuser Anomaly Detection** ← NEU |
| Credit-Pipeline broken | **KI Superuser** ← NEU |
| Sprach-spezifische Bugs (nur DE betroffen) | **KI Superuser** (testet alle 3 Sprachen) ← NEU |

## Was der KI Superuser **nicht** ersetzt
- 🎨 **Visuelles QA** (Designfehler, kaputte Layouts) → bleibt manuell oder via späteren Visual Regression Test
- 🤝 **UX-Tests** (Confusing Flows, schlechte Beschriftungen) → bleiben manuell
- 🌐 **Browser-Kompatibilität** (Safari-Bug auf iOS) → bleibt manuell

Diese 3 Lücken sind **akzeptabel** für eine MVP-Bug-Strategie.

## Implementierungsreihenfolge

1. DB-Migration: `ai_superuser_runs` + `ai_superuser_anomalies` Tabellen + `is_test_account` Spalte in `profiles`
2. Test-Account Setup-Skript (einmalig erstellt den AI-Superuser + Workspace + Demo-Daten)
3. Edge Function `ai-superuser-test-runner` mit den 12 Szenarien
4. Edge Function `analyze-superuser-anomalies` (KI-Analyse via Gemini Flash)
5. Cron-Jobs (stündlich + täglich)
6. Admin Dashboard Tab `/admin` → „KI Superuser"
7. Filter `is_test_account = true` aus allen bestehenden Admin-Statistiken (Cost, Revenue, Conversion)

## Aufwand

- **Geschätzte Zeit:** 1 langer Build-Run (alle Komponenten in einem Rutsch, wie beim Bug-Hunting-System)
- **Laufende Kosten:** ~5–10€/Monat (Edge Function Calls + Gemini Flash)
- **ROI:** Findet Bugs bevor zahlende Kunden sie melden → schützt deine Revenue

