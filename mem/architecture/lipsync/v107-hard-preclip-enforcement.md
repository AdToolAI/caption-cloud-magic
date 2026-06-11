---
name: v107 Hard-Preclip Enforcement + Coords-Collision Guard
description: Multi-speaker dialog scenes MUST go through single-face preclip; full-plate dispatch on a multi-face plate is forbidden. Coords closer than max(120 px, plate.width * 0.08) hard-fail with refund.
type: architecture
---

# Why

v105 force-fullplate for N≥2 reproducibly caused "2 mouths closed, 2 mouths
speak everyone's lines" + morph artefacts on 4-speaker scenes (DB-verified
scene 89db58ca on 2026-06-11): pixel coords 838 and 901 on a 1376 px-wide
plate (Δ 63 px) collided so sync-3 active-speaker-detection routed two
audios onto the same face. The full-plate path is fundamentally unsafe on
multi-face plates with close coords — Sync.so morphs neighbours together.

# Rule

In `compose-dialog-segments`:

1. **`wantPassPreclip` is mandatory for `speakers.length >= 1`** — no
   N=1-only carve-out, no v105 `skipPreclipForMultiSpeaker` flag.
2. **`speakers.length >= 2 && !usePassPreclip && !skipPreclipForEdgeSpeaker`
   → hard fail.** Mark scene `failed`, refund idempotently, set
   `clip_error: v107_preclip_required_for_multispeaker:<reason>`, log
   `PREFLIGHT_BLOCKED / v107_preclip_required`, return 422. **No silent
   full-plate fallback after preclip render or face-gate failure.**
3. **Coords-Collision Guard (fresh dispatch, N≥2):** compute min pairwise
   pixel distance across `speakerCoords`. If
   `minDist < max(120, plateDims.width * 0.08)` → fail+refund with
   `clip_error: v107_coords_collision:<reason>`. The error_class
   `v107_coords_collision` is the canonical bucket.

The only doc-compliant escape hatch is `skipPreclipForEdgeSpeaker` (v88):
edge-positioned speakers with `bbox-url-pro` available get the full plate
+ per-frame `bounding_boxes_url`, which sync-3 handles natively.

# Files

- `supabase/functions/compose-dialog-segments/index.ts`
  - Coords-collision guard (after v87 heuristic block).
  - `wantPassPreclip` rewritten, `skipPreclipForMultiSpeaker` removed.
  - v107 multispeaker preclip-required block right after `usePassPreclip`
    resolution.

# Refund / Reset

Migration `20260611_v107_refund_and_reset_89db58ca_c8fb1fe6.sql` refunds
324 credits for the wrong-lipsync scene and resets both 89db58ca and
c8fb1fe6 for a clean re-run under v107.

# Verification

Fresh 4-speaker dispatch must show every pass with
`dispatch_video_kind: "preclip"`, `preclip_face_count: 1`,
`preclip_url` populated. No `full_plate` rows for N≥2 outside the
explicit edge-speaker `bbox-url-pro` path. No `provider_unknown_error`
loops, no morph artefacts.
