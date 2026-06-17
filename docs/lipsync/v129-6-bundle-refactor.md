# v129.6 — Forensik-Bundle Refactor

**Status:** shipped 2026-06-17
**Scope:** `syncso-support-bundle` edge function + `SyncsoForensicsSheet` UI.
**Isolation:** unchanged — strictly read-only, no production-state mutation.

## Why

v129.5 bundles showed SHA256 hashes + codec-hints. None of these answer
"why did `generation_unknown_error` happen". The bundle was decorative,
not diagnostic.

## What changed

**Out:**
- `video.sha256`, `audio.sha256`
- `inspectWavLite` / `inspectMp4Lite` codec inference
- "Audio Meta" / "Video Meta" JSON blobs in the UI

**In:**
1. **`provider_truth`** — `GET https://api.sync.so/v2/generate/:id`
   surfaces `status`, `error_details`, `model`, `options`, and
   `worker_ms = updated_at - created_at`. This is the single source
   that shows what Sync.so really saw.
2. **`request_payload` + `curl_snippet`** — reconstructed from
   `syncso_dispatch_log` (`job_id`, `mode`, `coords`, `frame_number`,
   `video_url`, `audio_url`). Signed URLs sanitized.
3. **`face_probe`** (opt-in) — Gemini 2.5 Flash counts faces in frame 0
   of the plate. Catches the #1 root cause: 0 or >1 faces in the
   Hailuo-generated video.
4. **`verdict`** heuristic — turns the three above into a single
   actionable banner: red (face count 0), yellow (face count >1 or
   provider mentions face/detect), orange (worker crashed <2s),
   blue (`sync_mode` was set → try `omit_sync_mode`), gray (manual
   inspection needed).

## Diagnostic flow

```text
Open Forensik Sheet on failed scene
    ↓
[ ] Face-Probe (~€0.001)   ← optional opt-in
    ↓
Click "Bundle erzeugen"
    ↓
Verdict banner answers:
  - red  → re-render plate (no replay needed)
  - yellow → try replay preset `bboxes`
  - orange → provider-internal, try `exact` then report to Sync.so
  - blue → try replay preset `omit_sync_mode`
  - gray → inspect Provider Truth JSON manually
```

No replays are auto-triggered. Human in the loop, always.

## Files

- `supabase/functions/syncso-support-bundle/index.ts` — rewritten
- `src/components/admin/SyncsoForensicsSheet.tsx` — Bundle-tab rewritten,
  Replay-tab unchanged
- `mem/architecture/lipsync/v1296-bundle-refactor.md` — memory

## Not in scope

- New replay presets
- Auto-replay engine
- Any change to production dispatch / webhook / watchdog
