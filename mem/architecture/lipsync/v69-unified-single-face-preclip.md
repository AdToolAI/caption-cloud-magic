---
name: v69 Unified Single-Face Preclip (ALL speaker counts)
description: Extends v68 from N≥3 to ALL speaker counts (1..4). compose-dialog-segments renders a single-face SQUARE CROP preclip per pass via Remotion Lambda for every speaker, regardless of N. Sync.so always sees exactly one face → `auto_detect:true` is unambiguous → no more `provider_unknown_error` on multi-face plates. Full-plate fallback preserved on preclip failure.
type: architecture
---

## Why

v68 fixed 4-speaker `provider_unknown_error` by sending Sync.so a tight
single-face crop instead of the full multi-face plate. The 1- and 2-speaker
paths still used the legacy full-plate + `coords-pro` /
`active_speaker_detection` dispatch, which was an ongoing source of
`provider_unknown_error` (see v60, v64 notes).

v69 collapses everything onto one canonical path: every speaker pass,
regardless of N, goes through a single-face preclip render.

## Change

`supabase/functions/compose-dialog-segments/index.ts`:

```diff
- const wantPassPreclip =
-   speakers.length >= 3 &&
+ const wantPassPreclip =
+   speakers.length >= 1 &&
    !!plateDims &&
    Array.isArray(pass.coords) &&
    Number.isFinite(pass.coords[0]) &&
    Number.isFinite(pass.coords[1]) &&
    !!tightAudioInfo;
```

Log tags `v68_preclip*` → `v69_preclip_unified*` so the path is
auditable in edge logs.

No other code changes. The downstream pieces already support per-pass
preclips:

- `sync-so-webhook` — N=1 with `audio_tight` (always true under v69 once
  windows resolve) hits the `singleTight` branch and dispatches
  `render-sync-segments-audio-mux`. N≥2 already dispatched the mux.
- `render-sync-segments-audio-mux` — `useOverlay` branch already handles
  `preclip_crop` for any pass count (`donePasses.length >= 1 && anyTight`).
- `DialogStitchVideo` — existing `crop` shot type circular-mask overlays.
- Tight-WAV slicing (v66/v67), `sync_mode` gating (v63/v64/v66), v60
  serial-chain, MAX_SPEAKERS=4, idempotent refund: **unchanged**.

## Tradeoffs

- Latency: +5–15s per pass for the preclip Lambda render. Most noticeable
  on N=1 scenes (previously dispatched directly).
- Cost: ~€0.01–0.02 extra Lambda cost per speaker.
- Single point of failure: preclip Lambda outage now affects all N.
  Mitigation: existing full-plate fallback path is still active on
  preclip render failure (compose-dialog-segments logs
  `v69_preclip_unified_failed … falling back to full-plate dispatch`).

## Invariant

Sync.so MUST NEVER receive a multi-face plate as `input[].video`, for
any speaker count. Provider input MUST be a single-face preclip. The
full-plate path is permitted ONLY as automatic fallback when the
preclip Lambda render fails.

## Verification

- N=1 scene: edge logs show `v69_preclip_unified dispatching` + `_ready`,
  exactly one Sync.so call with `auto_detect:true`, audio-mux runs in
  `single-tight-overlay` mode with one crop overlay.
- N=2 scene: two preclips, two serial Sync.so passes (v60 serial chain),
  audio-mux in `fanout-2-speakers` mode.
- N=3/4 scene: identical to v68 with new log tag.

## Out of scope

- Sync.so pricing / refund logic
- Tight-WAV slicing (v66/v67)
- `sync_mode` gating (v63/v64/v66)
- v60 serial-chain dispatch
- UI / Composer frontend
