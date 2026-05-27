## Root Cause

Aus den Edge-Logs: `render-with-remotion` loggt `✅ Render start queued` und sofort danach `shutdown` — **`EdgeRuntime.waitUntil` wird auf Supabase Edge Functions nicht zuverlässig ausgeführt**. Der Worker stirbt, bevor der AWS-Lambda-Call passiert. Folge:

- `real_remotion_render_id` wird nie in die DB geschrieben (DB-Row bleibt mit `real_id=null`).
- `check-remotion-progress` fällt auf S3-Listing zurück → `ListObjects failed: 403`.
- Lambda's getRenderProgress mit einer bogus ID läuft ins interne Timeout → DOMException **"The operation was aborted"** → landet als `progress.errors[0]` im Frontend-Toast.

## Fix

### 1. `supabase/functions/render-with-remotion/index.ts`
- `EdgeRuntime.waitUntil(startRemotionRenderInBackground(...))` ersetzen durch **`await startRemotionRender(...)`**.
- Retry-Backoffs kürzen auf `[2000, 5000, 10000]` ms (max 3 Retries, worst-case ~17 s — passt locker ins Edge-Budget von ~150 s, da der reine Lambda-Start nur 1–3 s dauert).
- Response erst nach erfolgreichem Start zurückgeben, inkl. `real_remotion_render_id` im Body.
- Bei `failRenderAndRefundOnce` zusätzlich `{ ok: false, error, error_category }` zurückgeben statt nur DB-Update.

### 2. `supabase/functions/check-remotion-progress/index.ts`
- Wenn `real_id=null` UND `started_at` < 30 s alt → `status: 'rendering', progress: 0` zurückgeben (kein S3-Listing).
- Lambda-getRenderProgress-Fetch in try/catch wrappen: bei AbortError/Timeout transient als `rendering` mit altem Progress zurückgeben — niemals als `failed`/`errors[]` propagieren.

### 3. `src/components/universal-creator/steps/PreviewExportStep.tsx`
- `invoke('render-with-remotion')`-Response prüfen: bei `data.ok === false` oder thrown error den Job direkt auf `failed` setzen (kein 10-Min-Polling-Wait).
- Bei Fehler-Texten die `/aborted|timeout/i` matchen → freundliche Toast: „AWS-Kapazität gerade ausgelastet. Bitte in einer Minute erneut starten."

### 4. Verifikation
- `supabase--deploy_edge_functions` für beide Functions.
- `curl_edge_functions` Mini-Render-Test → Response muss `real_remotion_render_id` enthalten.
- DB: `content_config.real_remotion_render_id` ist gesetzt, `status='rendering'`.

## Geänderte Dateien
- `supabase/functions/render-with-remotion/index.ts`
- `supabase/functions/check-remotion-progress/index.ts`
- `src/components/universal-creator/steps/PreviewExportStep.tsx`

## Risiken
Der HTTP-Request zum Edge-Function blockiert jetzt bis Lambda den Start akzeptiert (typ. 2–5 s, bei Throttle bis ~20 s). Das ist deutlich besser als der bisherige stille Fehlschlag.
