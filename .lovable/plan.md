# Lipsync Pipeline – Complete Post-Mortem & Final Architecture

Goal: Document, in one place, the full journey from the first broken lipsync attempts to the now-working v166 "Holy Grail" pipeline, so future agents (and you) never re-attempt dead ends.

## Deliverable
A single new memory doc:

- `mem/architecture/lipsync/HOLY-GRAIL-v166-complete-pipeline.md`

Plus index entry in `mem/index.md` under the lipsync section, replacing the now-superseded v161–v165 bullet points with one canonical pointer.

No code changes. Documentation only.

## Document structure

### 1. Executive Summary
- One paragraph: what works now (v166), why it works, key invariants.

### 2. Timeline of Failed Approaches (grouped, not version-by-version)
Five eras, each with: *what we tried → why it failed → lesson*.

1. **Segments-era (v41–v70)** – official Sync.so `segments` payload, multi-speaker ASD experiments, dead-segment blocks, neighbor-aware preclips. Failed because Sync.so segments are not frame-accurate for >2 speakers and we kept hitting `provider_unknown_error`.
2. **Preclip / single-face era (v68–v123)** – per-speaker single-face preclips with bounding-box coords. Failed due to identity drift, stale payloads, plate-gate collisions, and circular fallback loops.
3. **Doc-strict / sync-3 era (v124–v131)** – locked the payload to documented options only. Stabilised provider errors but still had wrong-mouth animations on multi-character scenes.
4. **Parallel passes & tight-window era (v93–v95, v38–v40, v149)** – tried parallelising and trimming audio windows. Cut latency but exposed speaker-to-face mapping bugs.
5. **Today's iterations (v161–v165)** – bbox-url-pro JSON, silent-face overlays, viewport-translate crop. Caused ghosting/morphs and 12:30 render times. Two root causes finally surfaced:
   - speaker index ≠ visual slot (script order was blindly used)
   - silent-face overlays double-rendered the master plate

### 3. The Breakthrough (v166)
Three decisive fixes:

a. **Anchor-Identity Slot Bridge** in `compose-dialog-segments`: when `plate_identity.faces[]` has no `characterId`, copy it in from `faceMap` by `slot`/`slotIndex` so script order maps to the correct visual face.
b. **Hard-fail instead of guess**: removed the `unlabeled.find(f => f.slot === idx)` fallback. If a speaker can't be resolved to a visual face, the pass aborts and refunds.
c. **Removed silent-face overlays** in both `render-sync-segments-audio-mux` and `DialogStitchVideo.tsx`. Sync.so already handles non-speaking faces via `null` bbox entries; the Remotion overlay was a redundant source of ghosting.

### 4. Final End-to-End Pipeline (v166)
Step-by-step with file references:

1. User triggers cinematic-sync → `compose-dialog-scene`
2. Scene-level lock via `try_acquire_dialog_lock`
3. Plate generation (Hailuo i2v) + anchor portrait extraction
4. Per-turn dispatch loop in `compose-dialog-segments`:
   - resolve speaker → `character_id` via faceMap (Anchor-Identity Slot Bridge)
   - call `_shared/pass-face-preclip.ts` to produce frame-exact bbox JSON
   - POST to Sync.so `sync-3` with `active_speaker_detection: { bounding_boxes_url, auto_detect: false }`
5. Sync.so webhook (`sync-so-webhook`) patches `dialog_shots`, triggers `poll-dialog-shots`
6. `render-sync-segments-audio-mux` ffmpeg-muxes the per-turn lipsync clips with original audio (no silent overlays anymore)
7. `DialogStitchVideo.tsx` (Remotion/Lambda) stitches turns into the final clip
8. Idempotent refund path on any failure (per FROZEN-INVARIANTS)

Include a Mermaid diagram of the flow under `/mnt/documents/lipsync-v166-pipeline.mmd`.

### 5. Frozen Invariants (do not regress)
- sync-3 only, doc-strict options
- bbox-url-pro is the single source of truth (no `auto_detect: true`)
- Speaker→face mapping MUST go through `character_id`, never raw script index
- No silent-face overlays in Remotion
- Hard-fail + refund > silent wrong animation
- Per-scene lock; webhook-driven, not polling-driven dispatch

### 6. Index Cleanup
In `mem/index.md`:
- Add `[Holy Grail Lipsync v166](mem://architecture/lipsync/HOLY-GRAIL-v166-complete-pipeline)` to the lipsync section
- Mark v161–v165 docs as "superseded by v166" in this new doc's appendix (do not delete them — historical record)

## Out of scope
- No code changes
- No new migrations
- No edge function redeploys

After you approve, I'll switch to build mode and write only those two files (doc + index update) plus the Mermaid artifact.
