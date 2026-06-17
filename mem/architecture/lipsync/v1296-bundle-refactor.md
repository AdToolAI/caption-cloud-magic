---
name: v129.6 Forensik-Bundle Refactor
description: syncso-support-bundle returns provider_truth + reconstructed request_payload + verdict heuristic + optional Gemini face probe instead of SHA256/codec blobs
type: architecture
---

# v129.6 — Bundle = Diagnose statt Theater

`syncso-support-bundle` und `SyncsoForensicsSheet` Bundle-Tab komplett umgebaut.

## Bundle-JSON-Schema (v129.6)

```ts
{
  bundle_version: "v129.6",
  scene_id, pass_index, provider_job_id,
  verdict: { level: "red"|"yellow"|"orange"|"blue"|"gray", headline, suggestion },
  provider_truth: { fetched, status, error_details, model, options, worker_ms, raw, fetch_error },
  request_payload: { model, options: { sync_mode, active_speaker_detection }, input: [...] } | null,
  curl_snippet: string | null,
  asset_reachable: { video: HeadProbe, audio: HeadProbe },
  face_probe: null | { frame_0: { faces, raw, error } },
  pipeline_snapshot: { lip_sync_status, twoshot_stage, pass_status, pass_error, sync_error_bucket },
}
```

## Verdict-Heuristik (Reihenfolge wichtig)

1. `face_probe.frame_0.faces === 0` → **red** "Re-render plate"
2. `face_probe.frame_0.faces > 1` → **yellow** "Try `bboxes` preset"
3. provider error_details contains "face"/"detect" → **yellow** "Try `bboxes`"
4. provider FAILED with `worker_ms < 2000` → **orange** "Provider crash, try `exact` + report"
5. `options.sync_mode` was set → **blue** "Try `omit_sync_mode`"
6. provider truth not fetched → **gray** with fetch_error
7. fallback → **gray** "Inspect Provider Truth manually"

## Wichtige Implementierungsdetails

- **Dispatch lookup:** `syncso_dispatch_log` joined via `job_id = provider_job_id` (NOT scene_id — könnte mehrere passes haben).
- **URL Sanitizer:** Signed URLs werden zu `{origin}{path}?{signed_url_redacted}` — Pfad bleibt für Inspektion, Signatur weg.
- **Face-Probe:** default OFF. Body-Param `include_face_probe: true`. Gemini 2.5 Flash via Lovable AI Gateway, kein neuer Key. Sendet die Video-URL direkt — Gemini sampelt selbst.
- **Auth:** `admin.auth.getUser(token)` + `has_role('admin')`. Pattern aus `posthog-analytics`.
- **NO MUTATION:** Reads `composer_scenes` + `syncso_dispatch_log`. Schreibt nur in `support-bundles` Storage-Bucket.

## Migrations-Pfad

v129.5-Bundles (mit SHA256) bleiben im Bucket gültig, neue Generationen sind v129.6.
UI rendert basierend auf `bundle.verdict` — fehlt = altes Bundle, fällt auf "—" zurück ohne zu crashen.
