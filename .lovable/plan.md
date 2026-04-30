
## Ziel

Ein **separater "Weekly Deep Sweep"** (`qa-weekly-deep-sweep`), der nicht nur Provider-Pings macht wie der tägliche Live Sweep, sondern **vollständige Bezahl-Pipelines** durchläuft: Asset-Generierung → Stitching → Lambda-Render → Webhook-Roundtrip. Hard cap **50 € pro Run**, manueller Trigger im Cockpit, Ergebnis-Reports inkl. Render-URLs zum visuellen QA.

## Was abgedeckt wird (7 E2E-Flows)

| # | Flow | Was passiert | Geschätzt |
|---|------|--------------|-----------|
| 1 | **Composer Multi-Scene Stitch** | 3 Szenen (Hailuo, Seedance, Kling) parallel → `compose-stitch-and-handoff` → fertiges MP4 | ~2,50 € |
| 2 | **Director's Cut Lambda Render** | Fertiges Composer-MP4 → `render-directors-cut` mit 1 Filter + Subtitles → Lambda → Webhook | ~1,50 € |
| 3 | **Auto-Director (Brief → Video)** | Brief-Text → `auto-director-compose` → 3-Szenen-Storyboard → Stitch → Render | ~3,00 € |
| 4 | **Talking Head (Hedra)** | FLUX-Portrait → ElevenLabs TTS → `generate-talking-head` → 8s-Video | ~1,80 € |
| 5 | **Universal Video Creator** | Kategorie "Marketing" → `auto-generate-universal-video` → Wizard-Skript → Render | ~2,20 € |
| 6 | **Long-Form Render** | 3-Min-Skript → `render-long-form-video` (Lambda) | ~3,50 € |
| 7 | **Magic Edit (Inpaint)** | FLUX-Bild → Maske → `magic-edit-image` (FLUX Fill Pro) | ~0,15 € |

**Gesamt-Estimate: ~14,65 €** pro Voll-Run. Budget 50 € erlaubt **3× Wiederholung** (Stabilität) oder **Erweiterung** um Varianten (z.B. zweite Composer-Stitch mit Vidu+Pika+Wan).

## Architektur

### Neue Edge Function: `qa-weekly-deep-sweep`
- Sequentielle Ausführung der 7 Flows
- Pro Flow: Cost-Cap-Check vor Start, Asset-URLs aus `qa-test-assets` Bucket, vollständiger Roundtrip mit Polling auf Webhook-Status (max 300s pro Flow)
- Bei Render-Flows: wartet auf `status: "completed"` in DB-Tabelle, validiert dass Output-URL existiert und HEAD-Request 200 liefert
- Bei Failure: Auto-Refund prüfen (sind die Credits zurück?), Bug-Report mit Flow-Stage-Info

### Neue DB-Tabelle: `qa_deep_sweep_runs`
```text
id, started_at, finished_at, total_cost_eur, status (running/completed/failed)
flows_total, flows_succeeded, flows_failed
```

### Neue DB-Tabelle: `qa_deep_sweep_flow_results`
```text
id, run_id, flow_name, started_at, finished_at, duration_ms,
status (pending/running/success/failed/timeout/budget_skipped),
cost_eur, output_url, error_message, validation_checks (jsonb)
```

### Cockpit-UI: Neuer Tab "Deep Sweep"
- Button "Run Deep Sweep (Cap: 50 €)" mit Disable während Lauf
- Live-Status-Tabelle: 7 Zeilen mit Spinner → Grün/Rot, Render-Preview-Link, Dauer, Kosten
- History der letzten 10 Runs mit Pass-Rate-Trend
- Kostenanzeige vs. monatliches QA-Budget (300 € hard cap aus Bond QA Memory)

## Technische Details

### Polling-Pattern für asynchrone Renders
```text
1. Trigger Render → erhält job_id
2. Poll qa_deep_sweep_flow_results / video_creations alle 10s
3. Timeout nach 300s → markiere als "timeout", nicht "failed" (Lambda kann lange brauchen)
4. Bei "completed": HEAD-Request auf output_url → 200 = success
```

### Asset-Reuse aus täglichem Sweep
- Nutzt dieselben `qa-test-assets/sample-1024.jpg`, `sample-5s.mp4`, `sample-5s.mp3`
- Composer-Szenen referenzieren reale FLUX-Outputs aus Flow #1 als Frames für Continuity Guardian (kein Replicate-Call)

### Frequenz & Trigger
- **Manuell** im Cockpit (jetzt)
- **Optional später**: Cron `0 3 * * 0` (Sonntag 03:00 UTC) — wird nur als TODO im UI vermerkt, nicht jetzt eingebaut
- Hard-Lock: max 1 Deep Sweep pro 6h (verhindert Burn bei Fehlbedienung)

### QA-Mock-Header bewusst NICHT setzen
- Diese Function ist explizit dafür da, **echte** Calls zu machen
- Provider-Edge-Functions erkennen den `qa-deep-sweep@bond.local` Test-User aber **bypassen den Mock**, weil der Sweep den `x-qa-real-spend: true` Header sendet
- Erfordert Mini-Update in `_shared/qaMock.ts`: bei `x-qa-real-spend: true` → kein Short-Circuit

## Was nicht im Scope ist

- **Keine UI-E2E** (Browserless-Klicks) — das macht der Bond QA Agent bereits
- **Keine Social-Publishing-Tests** (Meta/TikTok/X) — separates Risk-Profil, eigener Sweep später
- **Keine Stripe/Payment-Tests** — Test-Mode-Abos existieren bereits separat
- **Kein automatisches Posting** der gerenderten Videos — bleiben in `qa-test-assets`, nach 7 Tagen Auto-Cleanup

## Erwartung

- Erster Run: ~15 € echte Kosten, ~12-15 Min Dauer, 7/7 grün ist das Ziel
- Findet Bugs die der Provider-Ping-Sweep nicht sieht: Webhook-Drift, Lambda-Bundle-Mismatch, Stitch-FFmpeg-Probleme, Continuity-Guardian-Frame-Bugs, Subtitle-Sync-Drift im Lambda-Output
- Bei einem grünen Deep Sweep + grünem Live Sweep am gleichen Tag: **hohe Konfidenz, dass alle Bezahl-Pfade funktionieren**

## Lieferung

1. Migration: 2 neue Tabellen + RLS (admin-only)
2. Edge Function `qa-weekly-deep-sweep/index.ts`
3. Mini-Patch in `_shared/qaMock.ts` für `x-qa-real-spend` Header
4. Neuer Tab `DeepSweepTab.tsx` im `/admin/qa-cockpit`
5. Memory-Update unter `mem://features/qa-agent/deep-sweep`

Bestätige mit "mach" und ich baue es. Bei "nein, nur 5 Flows" oder "lass Long-Form weg" passe ich vorher an.
