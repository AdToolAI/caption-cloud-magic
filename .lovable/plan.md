
# Render-Zeit Analyse & Speed-Plan (Universal Content Creator)

## 1. Ist-Zustand (echte Messwerte, letzte 30 Tage)

| Quelle | Anzahl | p50 | p95 | max |
|---|---|---|---|---|
| Universal Creator 1:1 (dialog-pass-preclip) | 857 | **29,6 s** | 61,5 s | – |
| Universal Creator 16:9 (dialog-stitch) | 140 | **70,8 s** | 126,1 s | – |
| Composer-Final-Renders | 2 | 128,6 s | 185,6 s | – |
| Universal Creator 9:16 (jüngster Run, 01.07.) | 1 | – | – | **473,3 s** ⚠️ |

Ableitungen:
- **Kurze 1:1 Preclips** laufen sauber unter 1 min.
- **16:9 Stitches** liegen bei ~1–2 min – im erwarteten Rahmen.
- **9:16 Universal-Creator** ist ein **Ausreißer bei 7,9 min** – deutlich zu langsam, wahrscheinlich Cold-Start + framesPerLambda zu hoch für vertikales Format.
- **`universal_video_renders`-Tabelle ist leer** → **Blindflug**: Der eigentliche Creator-Render logged nicht sauber, wir haben nur Zufallsdaten aus `video_renders`. Ohne Telemetrie kein sauberes Tuning.

## 2. Bottlenecks (Code-Review-Ergebnis)

1. **`render-universal-video`**: `timeoutInMilliseconds: 300_000`, `maxRetries: 1`, aber **kein dynamisches `framesPerLambda`** – bei 9:16 & langen Voiceovers wird 1 Lambda überlastet.
2. **Kein Prewarming**: Jeder erste Render eines Users hat ~5–15 s Lambda Cold-Start.
3. **Preflight sequentiell**: Voiceover-Generation → Music-Fetch → Bundle-Check laufen nacheinander, nicht parallel.
4. **Kein Telemetrie-Insert**: `universal_video_renders` wird beim Start/Ende nicht befüllt → weder p50/p95-Monitoring noch Alerting möglich.
5. **Max 3–5 Worker-Concurrency-Policy** ist konservativ – für ≤600 Frames (20 s @30fps) könnten wir aggressiver splitten.

## 3. Optimierungsplan (3 Wellen)

### Welle 1 — Telemetrie & Sichtbarkeit (Grundlage, 1 Datei-Set)
- `universal_video_renders` beim Start (status=`queued`), Lambda-Invoke (status=`rendering`) und Webhook (status=`completed|failed`) sauber schreiben.
- Zusätzlich Felder: `frames_total`, `frames_per_lambda`, `workers_used`, `lambda_duration_ms`, `preflight_ms`, `cold_start_bool`.
- Admin-Widget in `/admin/qa-cockpit`-Tab **„Render Health"**: p50/p95/p99 nach Aspect + Länge, Cold-Start-Rate, Fehlerquote.

### Welle 2 — Speed-Optimierungen (Kern)
- **Dynamisches `framesPerLambda`** nach Frame-Count-Buckets:
  - ≤300 frames (10 s) → 150 fpl (2 Worker)
  - 301–900 frames (10–30 s) → 200 fpl (max 5 Worker)
  - 901–1800 frames (30–60 s) → 270 fpl (max 7 Worker)
  - über 1800 frames → 360 fpl (max 5 Worker, Memory-Schutz)
- **Concurrency-Cap auf 7** heben (statt 5), guarded durch Lambda-Health-Metrics.
- **Preflight parallelisieren** in `PreviewExportStep.tsx`: VO-Synthese, Music-URL-Resolve, Bundle-Version-Check via `Promise.all`.
- **Lambda Prewarm-Ping** beim Öffnen von Step 5 (Export): leichter `invoke-remotion-render`-Health-Call, damit der eigentliche Render-Klick auf warmer Lambda landet.
- **Payload-Preflight-Cache**: `universalCreatorRenderPayload.ts` cached die normalisierten Scenes im `sessionStorage`, damit Retry-Renders keine Re-Normalization brauchen.

### Welle 3 — UX-Feedback (kein Blindwarten)
- **Live Progress-Balken** aus Lambda-Chunks (Remotion liefert `overallProgress` pro Chunk via Webhook-Poll).
- **ETA-Anzeige** basierend auf gemessenem p50 für die jeweilige Länge/Aspect-Ratio (aus Welle 1 Telemetrie).
- **Retry-Button** (schon vorhanden) mit Reuse des gecachten Payloads statt kompletter Rebuild.

## 4. Erwartete Verbesserung

| Video-Länge / Format | Heute (p50) | Nach Plan (Ziel p50) |
|---|---|---|
| 10 s / 1:1 | ~30 s | **~15 s** |
| 30 s / 9:16 | ~120 s (extrapoliert) | **~40 s** |
| 60 s / 16:9 | ~70 s | **~35 s** |
| 9:16 Ausreißer | 473 s | **<90 s** (durch dynamisches framesPerLambda + Prewarm) |

## 5. Technische Änderungen (Dateien)

- `supabase/functions/render-universal-video/index.ts` – dynamisches `framesPerLambda`, Telemetrie-Inserts, Prewarm-Handler.
- `supabase/functions/invoke-remotion-render/index.ts` – Concurrency-Cap-Anhebung, Warmup-Mode.
- `supabase/functions/estimate-render-cost/index.ts` – p50-basierte ETA aus Telemetrie ableiten.
- `supabase/migrations/*` – neue Felder in `universal_video_renders`, Index auf `(status, created_at)`.
- `src/components/universal-creator/steps/PreviewExportStep.tsx` – Preflight-`Promise.all`, Prewarm-Trigger, ETA + Progress-UI.
- `src/lib/universalCreatorRenderPayload.ts` – sessionStorage-Cache für Retry.
- `src/components/admin/qa-cockpit/RenderHealthTab.tsx` (neu) – p50/p95-Dashboard.

## 6. Was NICHT angefasst wird

- Der Remotion-Bundle selbst (`UniversalCreatorVideo.tsx`) – der ist stabil, Änderungen dort riskieren neue Bugs.
- Lambda-RAM (bleibt 3008 MB) und globaler Timeout (600 s) – kein Grund zur Änderung.
- Sync.so / Composer-Pipeline – separate Domain, außerhalb des Scopes.

## 7. Rollout-Reihenfolge

1. Welle 1 mergen → **2–3 Tage Daten sammeln** (echte p50/p95 pro Bucket).
2. Welle 2 auf Basis der Messdaten fein-tunen (framesPerLambda-Buckets ggf. justieren).
3. Welle 3 UX zum Schluss – braucht die p50-Daten aus Welle 1 für sinnvolle ETAs.
