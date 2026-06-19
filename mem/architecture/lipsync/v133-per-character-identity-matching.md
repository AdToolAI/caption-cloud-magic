---
name: v133 Per-Character Identity Matching
description: Fixes voice-swap in 3+ speaker scenes via per-character Gemini probe + Hungarian assignment + cross-check + ambiguity hard-fail with refund
type: architecture
---

# v133 — Per-Character Identity Matching

## Problem

In multi-speaker scenes (≥3 speakers) Sync.so occasionally produced
**voice swaps**: e.g. in a 4-speaker scene Character 1 and Character 4
were assigned each other's audio while Characters 2 and 3 stayed correct.
Lip-sync itself was technically clean — the wrong character was just
animated to the wrong audio track.

## Root cause

`askGeminiForPlateIdentity()` in `_shared/plate-face-identity.ts` issued
ONE Gemini Vision call carrying the plate frame plus N reference
portraits in a list. Gemini exhibits **positional bias** when comparing
several visually-similar portraits in sequence — edge slots (`slot 0`,
`slot N-1`) routinely got swapped while inner slots stayed correct.
The v117 `slot-order` fallback (L→R face = L→R speaker-array index)
silently extended the bug: if `speakers[]` was not pre-sorted by
on-screen position, the fallback guaranteed a swap.

## Fix

### `_shared/plate-face-identity.ts`

- `probeCharacterOnPlate()` (new): for ONE character, sends the plate
  frame + ONE portrait to Gemini Flash and asks for a per-slot score
  (0.0 = clearly different, 1.0 = clearly same). Position-bias-free
  because only one reference portrait is visible per call.
- `optimalAssignment()` (new): brute-force search over all permutations
  (N≤6 → ≤720 perms) returns the slot-pick that maximises the sum of
  diagonal scores — global-optimal 1:1 assignment, prevents two
  characters from claiming the same slot.
- `crossCheckAssignment()` (new): when the Hungarian result is
  ambiguous, sends the proposed assignment back to Gemini Pro for a
  binary verdict (`confirmed` | `swap:A↔B` | `rejected`). Applies the
  swap when reported; otherwise marks the map ambiguous.
- `resolvePlateFaceIdentities()` (refactored): N=1 trivial, N=2 legacy
  single-call, N≥3 per-char probe + Hungarian (+ optional cross-check).
- Returned `PlateIdentityMap` gains `identityMethod`, `minConfidence`,
  `minMargin`, `ambiguous`, `scoreMatrix`, `crossCheck` for forensics.
- The v117 slot-order fallback for N≥3 is **removed** — when probe and
  legacy fail, `resolvedCount === 0` and the existing
  `plate_quality_gate` (v117) blocks dispatch.

### `compose-dialog-segments/index.ts`

- New **v133 Identity-Ambiguity Hard-Fail** branch fires on the first
  dispatch attempt for N≥3 when `plateIdentityMap.ambiguous === true`:
  - Calls `failLipSync` with full refund (`refundCredits: totalCost`).
  - Resets the scene to `clip_status='pending'`,
    `twoshot_stage='needs_clip_rerender'`, clears `clip_url` so the
    next "Generate All" forces a plate re-render.
  - Writes `dialog_shots.v133_identity_audit` (method, minConfidence,
    minMargin, crossCheck verdict, scoreMatrix).
  - User-facing `clip_error` explains "Charaktere nicht eindeutig
    unterscheidbar — bitte neu rendern mit deutlicheren Posen / Kleidung".
  - Logs `PREFLIGHT_BLOCKED` with `error_class='v133_identity_ambiguous'`
    in `syncso_dispatch_log` for forensics.
- `v116_diag` per dispatched pass now carries `plate_identity_method`,
  `plate_identity_min_conf`, `plate_identity_min_margin`,
  `plate_identity_cross_check` — surfaced in the admin Sync.so
  Forensics Sheet.

## Ambiguity thresholds

- `minConfidence < 0.55` → ambiguous (best slot for SOME character is
  not clearly the same person).
- `minMargin < 0.15` → ambiguous (best slot is barely better than
  second-best — coin-flip risk).
- Either trigger → cross-check. Only `rejected` cross-check produces a
  hard-fail; `confirmed` and `swap` allow dispatch to proceed.

## Cost impact

- 4 parallel Gemini-Flash calls per N=4 scene (~€0.004) replacing 1
  Gemini-Pro multi-image call (~€0.005). Net cheaper.
- Cross-check (Gemini Pro, 1 call) only fires on ambiguous mappings.
- Saves the cost of a full Sync.so re-render (~€18) per prevented swap.

## Backward-compat

- N=1 and N=2 dispatch paths are unchanged.
- Caching (`plate_face_cache`) is keyed on `plate_url_hash` and is
  unaffected — a re-rendered plate gets a new hash and a fresh probe.
- "Sauber neu starten" already clears the cached `faceMap` from
  `audio_plan.twoshot`; new plate → new identity probe automatically.

## Files

- `supabase/functions/_shared/plate-face-identity.ts` (rewritten)
- `supabase/functions/compose-dialog-segments/index.ts` (v133 branch +
  v116_diag enrichment)
