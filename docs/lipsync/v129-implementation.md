# v129.1 — Sync.so Payload-Contract Hotfix (Implementation)

**Status:** Shipped. Surgical scope: request builder + dispatch-time preflight only.
**Gate:** v129.0 Classification A accepted — see `docs/lipsync/v129-syncso-output-authenticity.md`.
**Touched file:** `supabase/functions/compose-dialog-segments/index.ts` only.

---

## What changed

### 1. Plate → Preclip coordinate transform (Multi-Speaker preclip)

In the `if (usePassPreclip) { ... }` branch:

- **Multi-Speaker (`speakers.length >= 2`) + persisted `pass.coords` (plate-space) + valid `pass.preclip_crop`:**
  ```ts
  const scale = outSize / crop.size;
  const xPrime = Math.round((plateX - crop.x) * scale);
  const yPrime = Math.round((plateY - crop.y) * scale);
  syncOptions.active_speaker_detection = {
    auto_detect: false,
    frame_number: referenceFrameNumber,
    coordinates: [xPrime, yPrime],
  };
  ```
  `asd_mode = "preclip_coords_doc_strict"`.

- **Single-Speaker preclip:** unchanged — `auto_detect: true` (v115 path preserved).

- **Single-Speaker with face-gate seeing 0 or >1 faces:** unchanged — `coords_center_fallback`.

### 2. No silent clamping

If transformed `(x', y')` falls outside `[0, outSize)`, the pass is marked
`_v1291_block = { reason: "transformed_coords_out_of_bounds", details }`
and asd_mode becomes `preclip_coords_oob_blocked`. The preflight assertion (§3)
refuses to dispatch.

### 3. Preflight assertion (`DISPATCH_BLOCKED_PAYLOAD_PRECHECK`)

After the existing v108 full-plate guard, before any Sync.so HTTP call:

```ts
if (usePassPreclip && speakers.length >= 2) {
  const hasCoords = !!_v1291 && Array.isArray(_v1291.plate_coords);
  const wouldAutoDetect = asdForProbe?.auto_detect === true;
  if (_v1291_block || (hasCoords && wouldAutoDetect)) {
    return await failBeforeProviderDispatch(
      "DISPATCH_BLOCKED_PAYLOAD_PRECHECK",
      "internal_payload_contract_violation",
      ...,
      500,
      { v1291, v1291_block, v105_probe, provider_call_made: false,
        refund_reason: "dispatch_blocked_payload_precheck" },
    );
  }
}
```

Block reasons:
- `transformed_coords_out_of_bounds`
- `multi_speaker_missing_coords_or_crop`
- (defensive) Multi-Speaker preclip would still dispatch `auto_detect:true` despite persisted coords.

`failBeforeProviderDispatch` handles:
- Idempotent wallet refund (only if `prevState.refunded !== true`).
- Sets `dialog_shots.status = "failed"`, `lip_sync_status = "failed"`.
- Writes `syncso_dispatch_log` row with `sync_status = "PRE_DISPATCH_FAILED"` and `error_class = "internal_payload_contract_violation"`.

No retry, no `transitionPass`, no model swap.

### 4. Outbound payload persistence (`syncso_dispatch_log.meta`)

On every successful dispatch (`sync_status = DISPATCHED`):
```jsonc
{
  "v1291_payload_contract": true,
  "outbound_payload": {
    "model": "sync-3",
    "options": { /* full sanitized options incl. active_speaker_detection */ }
  },
  "coord_transform": {
    "enabled": true,
    "source_space": "plate",
    "target_space": "preclip",
    "plate_coords": [302, 103],
    "preclip_crop": { "x": 184, "y": 0, "size": 234, "outputSize": 720 },
    "scale": 3.0769,
    "transformed_coords_float": [363.07, 316.92],
    "transformed_coords_int": [363, 317],
    "in_bounds": true,
    "frame_number": 0
  },
  "v1291_block": null
}
```

Signed input/output URLs are NOT included in `outbound_payload` (they are
already on `video_url` / `payload_video_url` / `payload_summary.input_video`).
`options.active_speaker_detection` is stored verbatim.

### 5. `v116_diag.asd_mode` rewired

For multi-speaker preclip the value is now `preclip_coords_doc_strict`
when `auto_detect === false && coordinates` are present (was hardcoded
`preclip_auto_detect`). `coords_sent` carries the transformed `[x', y']`.

---

## Out of scope (explicitly NOT touched)

- State Machine / pass status enum
- `transitionPass`, `withDialogLock`
- Watchdog (`poll-dialog-shots`), Plan-D, Terminal-Protection
- Retry logic / user-retry UI
- `lipsync-2-pro` / `sync-2` swap
- Segments API
- Stage 4 A/B
- `bounding_boxes_url` default (explicit `bbox-url-pro` retry variant preserved)
- SUSPECT-Badge / any UI
- Stitch / Composite / Lambda
- v128 invariants

No DB migration. No new column. No new edge function.

---

## Canary

- **1 user / 1 new Multi-Speaker scene**, sync-3, cut_off, existing `force_multipass`.
- No model swap, no A/B.

### Pre-deploy log signature
```
asd_mode = preclip_auto_detect
coords_sent = null
active_speaker_detection.auto_detect = true
```

### Post-deploy log signature (success)
```
asd_mode = preclip_coords_doc_strict
coords_sent = [x', y']
active_speaker_detection.auto_detect = false
frame_number = <int>
```

### Success criteria (all must hold)
1. `meta.outbound_payload.options.active_speaker_detection.auto_detect === false` and transformed `coordinates` present.
2. No `DISPATCH_BLOCKED_PAYLOAD_PRECHECK` on the canary scene.
3. Sync.so returns `completed`.
4. **Mouth/face ROI diff** between `sync_output_url` and `input_preclip_url` during audio-active frames is non-trivial (per-frame, not whole-image mean).
5. `final_url` composites Sync.so output as before — no Stitch regression.
6. v128 invariants intact: no terminal recycles, no duplicate dispatches, no lock bypass, no Plan-D escapes, no Watchdog redispatches.

### If still no-op after doc-strict payload
- Do NOT swap model.
- Reopen as Classification B/C.
- Re-verify coords actually land on face in preclip `frame_number`; re-verify audio non-silent / duration match / preclip integrity.
- Only then prepare Sync.so support bundle.

---

## Verification queries

Outbound payload visible on the new dispatch rows:
```sql
SELECT scene_id,
       meta->>'v1291_payload_contract' AS v1291,
       meta->'v116_diag'->>'asd_mode' AS asd_mode,
       meta->'coord_transform'->'transformed_coords_int' AS coords_int,
       meta->'outbound_payload'->'options'->'active_speaker_detection' AS asd
FROM syncso_dispatch_log
WHERE created_at > now() - interval '1 hour'
  AND meta->>'v1291_payload_contract' = 'true'
ORDER BY created_at DESC;
```

Preflight blocks:
```sql
SELECT scene_id, error_class, error_message, meta->'v1291_block' AS blk
FROM syncso_dispatch_log
WHERE sync_status = 'PRE_DISPATCH_FAILED'
  AND error_class = 'internal_payload_contract_violation'
ORDER BY created_at DESC;
```
