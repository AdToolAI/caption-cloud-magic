# v129.2.1 — Doc-Strict ASD + Preclip Ambiguity-Guard (Implementation)

Surgical follow-up to **v129.1** (`docs/lipsync/v129-implementation.md`) addressing the Speaker-0 lipsync asymmetry root cause from **v129.2.0 forensics**
(`docs/lipsync/v129-2-speaker0-forensics.md`).

## Scope

Single file: `supabase/functions/compose-dialog-segments/index.ts`.

Two surgical changes inside / next to the existing `usePassPreclip` branch:

1. **Preclip-Ambiguity Diagnostic** computed for every Multi-Speaker preclip pass.
2. **Belt-and-Suspenders Preflight Guard** — block dispatch when `auto_detect:true` would be sent into a crop that we already know contains a sibling face center.

**Out of scope (do not change in this hotfix):**
`computeFaceCrop` (no floor edit, no MIN_VIABLE_SYNC_CROP_PX), state machine, retry, watchdog, plan-D, UI, `lipsync-2-pro`, Stage 4 A/B, segments, `bounding_boxes_url` promotion.

## What it does, in one paragraph

For every Multi-Speaker preclip pass we now project the centers of all *other* `faceMap.faces` into plate-space and test whether any falls inside the persisted `preclip_crop` rect. We persist that as `_v102_probe.preclip_ambiguity = { sibling_centers_inside_crop, siblings_inside, min_neighbor_dist, crop_size, crop_x, crop_y, preclip_face_count, risk }`. The existing v129.1 payload-contract preflight is extended with a third trigger — `auto_detect_with_ambiguous_crop` — so we refuse to call Sync.so on a crop we already know is unsafe, and refund idempotently via the existing `failBeforeProviderDispatch` path. Crops themselves are not changed.

## Code Touchpoints

### 1. Ambiguity computation (new block inside `if (usePassPreclip)`)

Right after `refFrame` is defined. Uses the same `faceMap.faces` projection math as the existing `coords-pro-box` / `bbox-url-pro` branch (face-map dims → plate dims). Self-face is excluded via `characterId` OR `slotIndex` match against the current pass. Result lives on `pass._v1291_ambiguity` and is also folded into `_v102_probe.preclip_ambiguity`.

### 2. Preflight extension (extends the existing `v1291` payload-contract block)

```ts
const ambiguousAutoDetect =
  wouldAutoDetect && !!v1291Ambig?.sibling_centers_inside_crop;
if (v1291Block || (hasCoords && wouldAutoDetect) || ambiguousAutoDetect) {
  // failBeforeProviderDispatch(...) with reason:
  //   "auto_detect_with_ambiguous_crop"
}
```

This catches the rare path where a pass would otherwise fall through to `auto_detect:true` without persisted coords AND the crop has a sibling center inside — the exact Samuel/Sarah scenario from v129.2.0 forensics.

## Production observation **before** this patch (from `docs/lipsync/v129-2-1-preflight.md`)

All recent dispatch rows on Scenes `25512d7f-…` and `225ea521-…` showed `stage = "preclip-sync3-auto-detect-v115"` (a string that no longer exists in source) and `asd_mode = "auto_detect"`. That proves production was running an **older bundle** without the v129.1 doc-strict branch. v129.2.1 ships together with that branch on the next deploy.

## Canary

1 user, 1 fresh Multi-Speaker scene with a vertically tight stack (`Δy < 100 px`). Reproduce the Samuel/Sarah-style geometry if possible.

**Pre-deploy baseline (already captured):**
- `stage = "preclip-sync3-auto-detect-v115"`, `asd_mode = "auto_detect"`, Speaker 0 visually static.

**Post-deploy expectation, for every Multi-Speaker pass (incl. Sarah/Kailee — correction vs. the earlier "Pass 1–3 unchanged" claim, since both sides of a vertical pair are affected):**
- `meta.v102_probe.stage = "preclip-sync3-v1291"`
- `meta.v102_probe.asd_mode = "preclip_coords_doc_strict"`
- `meta.v102_probe.v1291.in_bounds = true`
- `meta.v102_probe.preclip_ambiguity.risk ∈ { "clean", "neighbor_inside_crop" }` (diagnostic only; no block as long as coords are sent)
- `meta.v1291_payload_contract = true` on outbound payload persistence
- Frame-diff in the mouth ROI of `sync_output_url` > 0 during audio-active frames for **each** pass.

**Abort triggers:**
- Doc-strict coords sent, Sync.so still no-op → A2 falsified, reopen as **v129.3** (`bounding_boxes_url` / two-face / mask strategy).
- `DISPATCH_BLOCKED_PAYLOAD_PRECHECK / auto_detect_with_ambiguous_crop` fires for passes that were previously working → block predicate too strict, loosen immediately.

## Verification SQL

```sql
-- v1291 + ambiguity coverage
SELECT
  created_at,
  scene_id,
  meta->>'pass_idx' AS pass,
  meta->'v102_probe'->>'stage' AS stage,
  meta->'v102_probe'->>'asd_mode' AS asd_mode,
  meta->'v102_probe'->'v1291'->>'in_bounds' AS in_bounds,
  meta->'v102_probe'->'preclip_ambiguity'->>'risk' AS amb_risk,
  meta->'v102_probe'->'preclip_ambiguity'->>'min_neighbor_dist' AS neigh_dist,
  meta->'v102_probe'->'preclip_ambiguity'->>'crop_size' AS crop_size
FROM syncso_dispatch_log
WHERE created_at > now() - interval '6 hours'
ORDER BY created_at DESC
LIMIT 50;

-- preflight blocks (should be rare; populated only on truly ambiguous inputs)
SELECT created_at, scene_id, error_class, error_message,
       meta->'v1291_ambiguity'->>'risk' AS amb_risk
FROM syncso_dispatch_log
WHERE error_class = 'internal_payload_contract_violation'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;
```

## Roadmap

- **v129.2.2** — `computeFaceCrop` floor cleanup **plus** `MIN_VIABLE_SYNC_CROP_PX = 160` enforced before dispatch (no tiny-crop calls to Sync.so).
- **v129.3** — Stack strategy for layouts coords alone cannot solve: `bounding_boxes_url`, two-face / twoshot crop, mouth-mask compositing, layout preflight.
