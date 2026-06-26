## Realer Coverage-Stand (frisch gemessen)
- **473 Edge Functions** insgesamt.
- **22** haben einen `isQaMockRequest`-Guard im Handler.
- **30** sind in `_shared/smokeRegistry.ts` registriert (Block 1 = 29 grün).
- **~450 Functions** noch ohne Smoke-Pfad.

Die frühere „424/473"-Aussage war ein Rechenfehler — Realität ist deutlich kleiner. Wave B ist also Pflicht, wenn wir echte Full-Coverage wollen.

## Wave B — Sub-Wellen Rollout

| Welle | Scope | ca. Anzahl | Aufwand pro Function |
|---|---|---|---|
| **B1** | Trivial-Mocks: `check-*`, `health-*`, `get-*`, `fetch-*`, `search-*`, `list-*`, `analytics-*`, `calendar-*`, `planner-*` (Read-only Lookups) | ~80 | Guard + `{ok:true,mock:true,...}` |
| **B2** | Provider-Wrapper: restliche `generate-*` (Video/Image/Audio/TTS) | ~70 | Guard + Sample-Asset-URL aus `qaMock.ts` |
| **B3** | Composer / Director / Render / Compose / Process Pipelines | ~80 | Guard + strukturierter Mock-Body (Scene/Plan/Job) |
| **B4** | Social-Publishing (`twitch-*`, `tiktok-*`, `instagram-*`, `linkedin-*`, `x-*`, `publish-*`, `send-*`) | ~55 | Guard + `{external_id, permalink, mock:true}` |
| **B5** | Admin / Cron / Watchdog / QA-intern + Skip-Liste | ~115 | meist **Skip mit Grund** (cron-only, webhook, service_role-only) |
| **B6** | AI-Gateway / Gemini-strukturierte Outputs (`extract-*`, `briefing-*`, `analyze-*` mit Schema) | ~50 | Guard + schemakonformer JSON-Mock |

**Reihenfolge:** B1 → B2 → B5 (Skip-Liste, damit Cockpit „Coverage" realistisch wird) → B4 → B3 → B6.

## Pro Sub-Welle (gleicher Loop)
1. Inventar-Skript listet alle Functions im Scope, die noch keinen Guard haben.
2. Patch in 2 Teilen pro Function:
   - **Handler:** `import { isQaMockRequest, qaMockResponse } from '../_shared/qaMock.ts'` + Guard direkt nach OPTIONS.
   - **Registry:** Eintrag in `_shared/smokeRegistry.ts` mit `category`, `body`, optional `expect: 'structured'` + `requiredKeys`.
3. `smoke-matrix-run` deployen, im Cockpit Sweep starten, rote Kacheln gezielt nachpatchen.
4. Done-Kriterium pro Welle: **100 % grün oder explizit `skip` mit Grund**.

## Registry-Erweiterungen (einmalig, mit B1)
- `SmokeEntry.expect = 'structured'` zusätzlich mit `requiredKeys?: string[]` → Validator prüft Top-Level-Keys, damit ein leeres `{}` nicht fälschlich grün ist.
- Neue Kategorien: `social-publishing`, `analytics-reports`, `admin-cron` (im Cockpit-Filter ergänzen).
- Skip-Einträge bekommen im Cockpit eine **graue „SKIP"-Kachel** statt rot, mit Tooltip = `skip`-Begründung.

## Konkret jetzt: **Sub-Welle B1 (~80 Trivial-Mocks)**
Scope-Liste wird beim Start automatisch aus den Präfixen `check-*`, `health-*`, `get-*`, `fetch-*`, `list-*`, `search-*` (außer den 2 bereits gepatchten), `analytics-*`, `calendar-*`, `planner-*` gezogen. Lieferung in **3 Batches à ~25 Functions** in einer einzigen Build-Runde:
- Batch 1: `check-*` + `health-*` + `get-*` + `fetch-*`
- Batch 2: `analytics-*` + `calendar-*` + `planner-*`
- Batch 3: restliche `search-*` + `list-*`

Nach jedem Batch deployen, damit ein eventueller Tippfehler nicht 80 Functions auf einmal rot färbt.

## Done-Definition Wave B (komplett)
- Cockpit „Smoke Matrix" zeigt **Coverage X/473** mit grün / rot / skip.
- 0 € Provider-Kosten für einen Full-Sweep.
- Skip-Liste sichtbar mit Grund.
- Voller Sweep < 3 min Laufzeit.

## Nicht im Scope
- Keine Änderung an Produktionslogik der Functions.
- Keine echten Spends (bleibt Deep-Sweep).
- Keine UI-Redesigns am Cockpit außer Kategorien-Filter + Skip-Kachel.

**Start mit Sub-Welle B1, Batch 1 (`check-*`/`health-*`/`get-*`/`fetch-*`)?**
