# v129.1 — Sync.so Payload-Contract Hotfix (Surgical)

**Gate:** v129.0 Classification A accepted (16/17 Multi-Speaker passes dispatched with `auto_detect:true` + `coords_sent:null`, violating v106 doc-strict).

**Goal:** Force Sync.so to receive deterministic target-speaker coordinates in Preclip-space for every Multi-Speaker pass that has persisted plate-space coords. Nothing else.

---

## Hard Scope Boundary

**In scope** (touch ONLY these):
- Sync.so request builder for Multi-Speaker passes inside `compose-dialog-segments` (the function that builds `options.active_speaker_detection`)
- Dispatch-time preflight assertion
- `syncso_dispatch_log.meta` payload persistence (no schema change — column is already `jsonb`)
- Idempotent credit refund path on preflight block (re-use existing refund util)

**Out of scope — do NOT modify:**
- State Machine / pass status enum (beyond reusing existing `PASS_FAILED_PROVIDER` with new meta)
- `transitionPass`, `withDialogLock`
- Watchdog (`poll-dialog-shots`), Plan-D, Terminal-Protection
- Retry logic, user-retry UI
- Model selection (no `lipsync-2-pro` swap, no `sync-2`)
- Segments API
- Stage 4 A/B
- `bounding_boxes_url` default behavior (preserve existing explicit path; do not promote)
- SUSPECT-Badge or any UI work
- Stitch / Composite / Lambda
- v128 invariants

---

## Implementation

### 1. Plate → Preclip coordinate transform

For each Multi-Speaker pass with persisted `meta.coords` (plate-space) AND `meta.preclip_crop`:

```ts
const scale = preclip_crop.outputSize / preclip_crop.size;
const xPrime = Math.round((plateX - preclip_crop.x) * scale);
const yPrime = Math.round((plateY - preclip_crop.y) * scale);
```

Build payload:

```json
{
  "options": {
    "active_speaker_detection": {
      "auto_detect": false,
      "frame_number": <persisted>,
      "coordinates": [xPrime, yPrime]
    }
  }
}
```

`preclip_auto_detect` branch is **disabled** for Multi-Speaker when coords + preclip_crop exist.

### 2. Bounds check — no silent clamping

If `xPrime` or `yPrime` lies outside `[0, outputSize)`:
- **Do not clamp.**
- Block dispatch (see §4).

### 3. Precedence (preserve bbox_url outlier)

1. Explicit valid `bounding_boxes_url` set → use it unchanged.
2. Else, persisted coords + preclip_crop present → doc-strict transform (§1).
3. Else → `DISPATCH_BLOCKED_PAYLOAD_PRECHECK`.

`bbox_url` is **not** promoted to default. Stage 4 territory.

### 4. Preflight assertion (hard block)

Before any Sync.so HTTP call, assert:

- If persisted coords exist AND payload would send `auto_detect:true` → block.
- If transformed coords out of bounds → block.

On block:
- No Sync.so request issued.
- No retry, no `transitionPass` to retry state.
- Mark `sync_status = 'DISPATCH_BLOCKED_PAYLOAD_PRECHECK'` on dispatch log.
- Pass-level status: reuse existing `PASS_FAILED_PROVIDER` (avoid new enum value to keep scope tight) with meta:
  ```json
  {
    "error_class": "internal_payload_contract_violation",
    "provider_call_made": false,
    "refund_reason": "dispatch_blocked_payload_precheck"
  }
  ```
- Idempotent refund via existing reservation refund util (keyed on `reservation_id` to stay safe under re-dispatch).

### 5. Outbound payload persistence

On every dispatch (success path or block), write to `syncso_dispatch_log.meta`:

```json
{
  "v1291_payload_contract": true,
  "outbound_payload": { "model": "sync-3", "options": { ... full options ... } },
  "coord_transform": {
    "source_space": "plate",
    "target_space": "preclip",
    "plate_coords": [302, 103],
    "preclip_crop": { "x": 184, "y": 0, "size": 234, "outputSize": 720 },
    "scale": 3.0769,
    "transformed_coords_float": [363.07, 316.92],
    "transformed_coords_int": [363, 317]
  }
}
```

Signed URLs in payload are redacted; `options.active_speaker_detection` is stored verbatim.

Update `meta.v116_diag`:
- `coords_sent`: now the transformed `[x', y']`
- `asd_mode`: `"preclip_coords_doc_strict"` (was `"preclip_auto_detect"`)

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

### Post-deploy log signature
```
asd_mode = preclip_coords_doc_strict
coords_sent = [x', y']
active_speaker_detection.auto_detect = false
frame_number = <int>
```

### Success criteria (ALL must hold)
1. `meta.outbound_payload.options.active_speaker_detection.auto_detect === false` and transformed `coordinates` present.
2. No `DISPATCH_BLOCKED_PAYLOAD_PRECHECK` on the canary scene.
3. Sync.so returns `completed`.
4. **Mouth/face ROI diff** between `sync_output_url` and `input_preclip_url` during audio-active frames is non-trivial (per-frame diff, not whole-image mean).
5. `final_url` composites Sync.so output as before — no Stitch regression.
6. v128 invariants intact: no terminal recycles, no duplicate dispatches, no lock bypass, no Plan-D escapes, no Watchdog redispatches.

### If still no-op after doc-strict payload
- Do NOT swap model.
- Reopen as Classification B/C:
  - Re-verify coords actually land on face in preclip frame_number.
  - Re-verify audio non-silent / duration match / preclip integrity.
- Only then prepare Sync.so support bundle.

---

## Files touched

- `supabase/functions/compose-dialog-segments/index.ts` — request builder + preflight only (around existing `sanitizeSync3Options` / ASD construction).
- `docs/lipsync/v129-implementation.md` — new, documents transform formula, preflight, log signatures, canary.
- `.lovable/plan.md` — flip v129.1 from "Conditional" to "Active", document canary plan.
- `mem://architecture/lipsync/sync-3-doc-strict-options-v106` — append v129.1 enforcement note.

No DB migration. No new edge function. No new table. No new column.

---

## Explicit non-goals (re-stated)

No State Machine, no Watchdog, no Retry, no Plan-D, no User-Retry, no `lipsync-2-pro`, no Segments, no Stage 4 A/B, no SUSPECT UI, no `bbox_url` promotion, no Stitch touch, no v128 changes.
