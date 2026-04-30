## Ziel

Einmalige **Live-Komplettvalidierung aller 13 Provider-Pipelines** (10 AI-Video + Hedra Talking-Head + Lambda-Render + Music) mit hartem 20-€-Cap. Ergebnis: belastbare Aussage, welche Pipelines real funktionieren — kein Schätzwert mehr. Setup bleibt installiert für künftige On-Demand-Runs.

## Architektur

```text
Admin /admin/qa-cockpit
        │
        ▼
┌──────────────────────┐         ┌────────────────────────┐
│  "Live Sweep" Button │────────▶│ qa-live-sweep (orchestr)│
└──────────────────────┘         └───────────┬────────────┘
                                             │  pre-check budget
                                             ▼
                                  ┌──────────────────────┐
                                  │  qa_live_budget DB   │  Hard-Cap 20 €
                                  └──────────────────────┘
                                             │
                                             ▼
                            ┌────────────────────────────────┐
                            │ Sequential Provider-Calls:     │
                            │ Hailuo→Seedance→Vidu→Pika→...  │  (echte API)
                            │ FLUX → Stable-Audio → Lambda   │
                            └─────────────┬──────────────────┘
                                          ▼
                            ┌────────────────────────────────┐
                            │ qa_live_runs (results)         │
                            │ + qa_bug_reports (failures)    │
                            │ + Auto-Refund-Verification     │
                            └────────────────────────────────┘
```

## Phasen

### Phase 1 — Infrastruktur (Setup, ~0,01 €)

1. **DB-Tabellen** via Migration:
   - `qa_live_budget` (id, period_start, spent_eur, cap_eur, last_run_at)
   - `qa_live_runs` (id, provider, model, mode, status, cost_eur, duration_ms, asset_url, error, refund_verified, created_at)
2. **Test-Asset-Bucket** `qa-test-assets` (private, RLS: nur service_role + admin):
   - `test-image.png` — via FLUX Schnell auto-generiert (Picture Studio mit Prompt "neutral product on white background, studio light")
   - `test-video-2s.mp4` — kurzes Beispielvideo aus existierendem `qa-sample-assets`
3. **Edge Function** `qa-live-sweep-bootstrap` — generiert Test-Assets einmalig bei erster Ausführung (idempotent).

### Phase 2 — Orchestrator + Hard-Cap (~0 €)

`qa-live-sweep` Edge Function:
- Liest `qa_live_budget`, prüft `spent_eur < cap_eur` vor jedem Provider-Call
- Sequential (nicht parallel) → kein Cap-Overshoot
- Pro Provider: invoke ohne `x-qa-mock`, echte Generation, persistiert Ergebnis
- Bei Failure: prüft nach 30 s ob Credits zurückgebucht wurden → testet Refund-Pipeline gratis mit
- Bricht ab sobald Cap erreicht; protokolliert übersprungene Provider als `skipped_budget`

### Phase 3 — Provider-Test-Matrix (~16 €)

| # | Provider | Mode | Duration | Geschätzt | Asset benötigt |
|---|---|---|---|---|---|
| 1 | FLUX Schnell | T2I | — | 0,01 € | — |
| 2 | Stable Audio 2.5 | T2A | 10 s | 0,05 € | — |
| 3 | Hailuo 2.3 Std | T2V | 6 s | 0,30 € | — |
| 4 | Seedance Lite | I2V | 5 s | 0,25 € | image |
| 5 | Vidu Q2 | Ref2V | 5 s | 0,40 € | image |
| 6 | Wan 2.5 Std | T2V | 5 s | 0,50 € | — |
| 7 | Luma Ray 2 | T2V | 5 s | 0,80 € | — |
| 8 | Pika 2.2 Std | I2V | 5 s | 0,60 € | image |
| 9 | Kling 3 Omni Std | T2V | 5 s | 1,00 € | — |
| 10 | Sora 2 Std | T2V | 4 s | 1,50 € | — |
| 11 | Runway Aleph | V2V | 5 s | 1,50 € | video |
| 12 | Hedra Talking Head | A+I | 5 s | 0,60 € | image+audio |
| 13 | Lambda Director's Cut | Render | 5 s | 0,15 € | clip |
| | **Summe** | | | **~7,66 €** | |

Buffer für Retries/Refunds: ~12 € → bleibt sicher unter 20 €.

### Phase 4 — Cockpit-UI (~0 €)

`/admin/qa-cockpit` neuer Tab **"Live Sweep"**:
- Großer Button "Run Live Sweep (Cap: 20 €)" mit Confirmation-Dialog
- Live-Tabelle: Provider | Status | Kosten | Dauer | Refund-OK | Asset-Preview
- Total-Spent-Counter mit Progress-Bar bis 20 €
- Historie aller vergangenen Sweeps

### Phase 5 — Auto-Bug-Report

Jede Live-Failure erzeugt automatisch `qa_bug_reports`-Eintrag mit:
- Provider, Mode, exakter Error-Message, Replicate/API-Response
- Severity: `high` falls auch Refund nicht erfolgte, sonst `medium`
- Auto-Resolve auf nächstem grünen Sweep dieses Providers

## Sicherheitsnetze

1. **DB-Cap** — `qa_live_budget.cap_eur` darf nur Admin per UI ändern
2. **Sequential Calls** — kein paralleles Feuern, jeder Call wartet auf Vorgänger
3. **Mock-Default** — alle wöchentlichen Smoke-Missionen bleiben Mock; Live nur über expliziten "Sweep"-Button
4. **Refund-Verifikation** — bei Fail wird Credit-Konto automatisch gepollt, Rückerstattung dokumentiert
5. **Asset-Reuse** — Test-Bild + Video werden einmal generiert, beliebig oft wiederverwendet

## Erwartete Findings

Realistisch finden wir 2–5 echte Bugs (z. B. veraltete Provider-Modelle, Webhook-Race-Conditions, Refund-Lücken). Diese werden direkt als Bugs angelegt und können dann gezielt gefixt werden.

## Nicht im Umfang

- Wöchentliche Wiederholung (kommt später als Cron, falls gewünscht)
- Pro/Premium-Tier-Tests (nur Standard-Tiers)
- 1080p / lange Durations (kürzeste & günstigste Variante pro Provider)
- Webhook-Replay-Mission (separater Stage, falls Live-Sweep Webhook-Bugs zeigt)

## Geschätzte Gesamtkosten dieser Aktion

- Live-Provider-Calls: **~8 €** (Worst Case 12 €)
- Asset-Setup (FLUX): **~0,01 €**
- Build/Plan-Credits: separates Lovable-Budget
- **Hard-Cap: 20 €** — wird nie überschritten, Run stoppt vorher

Nach Approval starte ich mit Phase 1 (DB + Bucket + Bootstrap), dann Phase 2-5. Der eigentliche Live-Sweep läuft erst, wenn du im Cockpit auf den Button klickst — du behältst die volle Kontrolle.