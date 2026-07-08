---
name: v208 Root-Cause Isolation for N≥2 Ghost-Mouthing
description: Non-invasive 4-layer diagnostic (master plate → preclip → pass output → final mux) with matrix mapping each observed symptom to the single correct fix. Replaces prompt/layer guesswork.
type: architecture
---

# v208 — Root-Cause Isolation for Ghost-Mouthing (N≥2)

## Context

After the v207 audit confirmed the pipeline is fully v169-conform and the
v171/v172 plate-prompt hardening is intentional, ghost-mouthing on N≥2
scenes remains reported. Continuing to iterate on the plate prompt or
adding another overlay layer (v183–v197 pattern) is contraindicated:

- Rolling back the plate prompt to v167 re-introduces the exact symptom v171 fixed.
- Every overlay layer added between v183 and v197 either failed or produced side-effects.

The professional next step is **empirical isolation**: identify which of the
four possible stages introduces the non-speaker mouth motion, then fix
that one stage.

## Diagnostic Layers (all data already exists)

`composer_scenes.dialog_shots` (JSONB) already contains every URL needed
for isolation — no edge-function change required.

| # | Layer | Source in dialog_shots |
|---|-------|------------------------|
| 1 | Master plate (raw Hailuo/Kling, pre-Sync) | `source_clip_url` |
| 2 | Preclip per speaker | `passes[i].preclip_url` |
| 3 | Pass output per speaker (Sync.so return) | `passes[i].output_url` |
| 4 | Final muxed | `final_url` (fallback `composer_scenes.clip_url`) |

Debug view: `/debug/lipsync/:sceneId` renders all four layers side-by-side.

## Diagnostic Matrix

```
Non-speaker mouth moves in…            → Ursache                → Right fix
────────────────────────────────────────────────────────────────────────────
1 · master_plate_url                     Hailuo/Kling model       Phase 2A
2 · preclip_urls[X] outside Turn(X)      Pre-clip segmentation    Phase 2B
3 · only in pass_output_urls[X]          Sync.so bleed            Phase 2C
4 · only in final_muxed                   Mux/composite            Phase 2D
```

## Phase 2 — Targeted Fixes (one only, determined by phase 1)

- **2A · Model** — Provider A/B test (Hailuo vs Kling), then set provider
  preference for N≥2 to the better one. Prompt iteration only if both are
  equally bad; A/B against current v175/v182, never a rollback to v167.
- **2B · Segmentation** — Re-verify turn-windows in
  `v204MultiSpeakerPreclipDispatch` against `dialog_turns`, tune padding.
  One-line fix, no architectural change.
- **2C · Sync.so** — Reproducible ticket to Sync.so with preclip + output.
  No client-side workaround without provider confirmation.
- **2D · Mux** — Verify v166 anchor-identity slot-bridging in
  `render-sync-segments-audio-mux`.

## Guardrails

- **Never** add another overlay layer.
- **Never** revert the plate prompt to v167.
- **Never** apply phase 2 before phase 1 identifies which stage is at
  fault.
