# Memory: index.md
Updated: today

# Project Memory

## Core
- **Design System**: 'James Bond 2028'. Deep black (#050816), gold (#F5C76A), cyan accents. Glassmorphism. Playfair Display, Inter.
- **Localization**: UI, scripts, and VOs in EN, DE, ES. Visual prompts for AI models MUST remain in English for output quality.
- **Credit Reliability**: Automatic, idempotent credit refunds are mandatory for external API/render failures.
- **Storage Constraints**: Storage buckets enforce strict RLS. User ID must be the first directory in the path.
- **Rendering Stability**: Lambda max 5 workers (tiered by frame count); framesPerLambda=270 default, scene-aligned dynamic for composer. Use imperative DOM updates for video transforms. Tight-WAV slicer must be frame-exact (v67) — allocation and copy share `floor(timeSec*sr)` boundaries.
- **Social Integration**: X requires Basic API. TikTok uses Sandbox. Meta uses Graph API v24 (media_view fallback to impressions).
- **Audio/Video Separation**: Treat video scenes with variable durations; audio (original, VO, music) are linear tracks. Sync playback rates.
- **Director's Cut Export**: Hard-crop for burned-in subtitles. WYSIWYG parity between Studio state and snake_case export payload.
- **Data Persistence**: Video creations go to 'video_creations' table; other media to 'content_items'.
- **Timeouts**: Complex AI edge functions require 120s - 300s.
- **Video Rate Limits**: Per-user hourly limit removed; wallet balance is the only spend protection.
- **Lip-Sync Sync.so Compliance**: Never send undocumented `segments_secs`; gate silent speaker audio before Sync.so dispatch.
- **Lip-Sync Unified Pipeline (v60+v61+v62+v64)**: Every dialog scene uses the chained per-speaker Sync.so pipeline. **Default model is `sync-3` for ALL speaker counts** (v62). **N=1 now also uses the tight-slice + overlay path** (v64) — same successful pipeline as N≥2; `sync_mode=cut_off` for N=1 (tight WAV), `sync_mode=loop` for N≥2 (long master VO). `lipsync-2-pro` kept as ladder fallback via `coords-pro-lp2pro` variant. See `mem://architecture/lipsync/v64-n1-tight-slice-parity`, `mem://architecture/lipsync/v62-sync3-universal-default`, `mem://architecture/lipsync/v60-unified-multispeaker-pipeline`.
- **Lip-Sync Pipeline FROZEN (≤4 speakers)**: Read `mem://architecture/lipsync/FROZEN-INVARIANTS` before editing `compose-dialog-segments`, `sync-so-webhook`, `compose-video-clips` (neutralTwoShotPrompt / CINEMATIC_SYNC_SILENT_MASTER_NEGATIVE), `_shared/cast-validation.ts` (MAX_SPEAKERS=4), or `StoryboardTab` cast handling. Grep `FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md` for load-bearing sites.

## Memories
- [Orphaned Lip-Sync Pending after Clip Fail](mem://architecture/lipsync/orphaned-pending-after-clip-fail) — Cinematic-Sync clip failures clear lip_sync_status/twoshot_stage when no master clip exists; watchdog resets pending+no-clip rows to avoid endless Lip-Sync spinner
- [Lip-Sync Frozen Invariants (≤4 speakers)](mem://architecture/lipsync/FROZEN-INVARIANTS) — 8 load-bearing rules (v58 multipass, useV41Official gate, v59 sticky markers, locked-camera prompt, no auto-ASD ≥2 speakers, MAX_SPEAKERS=4, safeCharacters, safeLower) with soft-log runtime guards (`INVARIANT_VIOLATION_*`)
- [Lip-Sync v57 Locked-Plate & Multi-Speaker ASD Guard](mem://architecture/lipsync/v57-locked-plate-and-multispeaker-asd-guard) — Cinematic-Sync master plates hard-block cuts/zoom/shot-changes; sync-so-webhook auto-ASD retry disabled for ≥2 speakers
- [Lip-Sync v56 Master-Audio Crop](mem://architecture/lipsync/v56-master-audio-crop) — Single master dialog WAV + per-segment audioInput crop; manual ASD first, single-speaker auto-ASD retry
- [Lip-Sync v55 Stale-Payload Guard](mem://architecture/lipsync/v55-stale-payload-guard) — New Sync.so segments are v55/ref_only; stale v52 crop payloads fail locally with idempotent refund
- [Lip-Sync v54 Sync-3 Official Segments](mem://architecture/lipsync/v54-sync3-official-segments) — Multi-speaker segments dispatch in compose-dialog-segments uses `sync-3`; no `temperature`/`occlusion_detection_enabled`
- [Lip-Sync v53 Doc Compliance Fixes](mem://architecture/lipsync/v53-doc-compliance-fixes) — Sync.so payloads must omit undocumented `segments_secs`; silent speaker audio fails before provider dispatch
- [Lip-Sync v51 Plate-Side Face Detection (superseded)](mem://architecture/lipsync/v51-plate-side-face-detection) — Gemini Vision on rendered plate + 30d `plate_face_cache`, fallback to v50 anchor-rescale then auto_detect
- [Lip-Sync Cleanup v48](mem://architecture/lipsync/v48-cleanup) — historical pipeline cleanup, partial-mux race fix
- [v46 Official Segments (superseded)](mem://architecture/lipsync/v46-lipsync2pro-official-segments) — failed single-call attempt, kept for context
- [v41–v45 Lip-Sync (superseded)](mem://architecture/lipsync/v43-bounding-boxes-asd) — historical iterations
- [Per-Turn Tight-Window Lip-Sync v38](mem://architecture/lipsync/per-turn-tight-window-v38) — Fix for speaker-2-talks-in-speaker-3-window bug via segments_secs + turn-start frame_number + windowed compositor
- [Sync-3 Fallback + Identity Soft-Pass v37](mem://architecture/lipsync/sync-3-fallback-and-identity-soft-pass-v37) — sync-3 retry variant + identity-match face-gate soft-pass for 3+ speakers
- [Multi-Speaker Honesty Policy v36](mem://architecture/lipsync/multi-speaker-honesty-policy-v36) — Partial-mux forbidden for 3+ speakers; full refund on missing speaker
- [Sync.so Default Segments Engine](mem://architecture/lipsync/syncso-default-segments-engine) — default dialog engine = sync-segments
- [Sync.so N-Slot Face Map](mem://architecture/lipsync/syncso-n-slot-face-map) — 1..N speaker face map cache via twoshot-face-map.ts
- [Syncso Segments Face Targeting](mem://architecture/lipsync/syncso-segments-face-targeting) — per-segment activeSpeakerDetection coords (legacy)
- [Syncso Stage E/F/G](mem://architecture/lipsync/syncso-stage-e-complete) — auto-normalize, face-quality, artlist reliability
- [Syncso Preflight Stage B+C](mem://architecture/lipsync/syncso-preflight-stage-b-c) — shared preflight + telemetry
- [Syncso Face-Gate Stage D](mem://architecture/lipsync/syncso-face-gate-stage-d) — validate-frame-face + frame_face_cache
- [Webhook + 8min Watchdog](mem://architecture/lipsync/sync-so-webhook-stage5) — sync-so-webhook + watchdog
- [v78 Conditional Strict Gate](mem://architecture/lipsync/v78-conditional-strict-gate) — strict face-gate for 3+ speakers only runs when plate identity resolved; else soft-pass + face-repair
- [v79 Dead Segments Block Removed](mem://architecture/lipsync/v79-dead-segments-block-removed) — 499 lines of debug-only v41/v54/v56 single-call `segments[]` dispatch deleted from compose-dialog-segments; backwards-compat body flags kept as no-ops
- [v80 Webhook Legacy Branch Removed](mem://architecture/lipsync/v80-webhook-legacy-branch-removed) — 342 lines of v41-v56 single-call segments[] handler deleted from sync-so-webhook + orphan hasSegmentAudioInputCrop helper; late legacy webhooks fall through to existing legacy_v4_ignored 200
- [v81 Shared CLIP_COSTS + Dialog-Speakers](mem://architecture/lipsync/v81-shared-clip-costs-dialog-speakers) — `_shared/clip-costs.ts` + `_shared/dialog-speakers.ts` ersetzen duplizierte Tabellen/Parser in compose-video-clips + compose-clip-webhook; Charge/Refund-Drift bei neuen Providern unmöglich
- [Lipsync Pro Pricing Policy](mem://architecture/lipsync/sync-so-pro-model-policy) — duration-based credits + refunds
- [Sync.so v50 Pro + BBox](mem://architecture/lipsync/v50-pro-bounding-boxes) — 3+ speakers: lipsync-2-pro + segments[] + per-segment bounding_boxes from faceMap (fixes lost speaker_3, ups quality vs v49)
- [Multi-Char Pipeline Hardening v33](mem://architecture/lipsync/multi-character-pipeline-hardening-v33) — coords-pro-box + plate-probe
- [Plate Probe + Hailuo Fallback v34](mem://architecture/lipsync/plate-probe-hailuo-fallback-v34) — probeMp4Dims fallback
- [Auto-Abort Single-Flight](mem://architecture/lipsync/auto-abort-single-flight-cast-validation) — cast change cancels in-flight
- [Circuit Breaker Loop Fix v32](mem://architecture/lipsync/circuit-breaker-loop-fix-v32) — circuit + retry loop fix
- [Fan-Out Webhook + Watchdog v26](mem://architecture/lipsync/fanout-webhook-and-watchdog-v26) — multi-pass chaining
- [Happyhorse Master Guard](mem://architecture/lipsync/happyhorse-master-guard) — provider guard
- [Sync Segments Multi-Speaker Audio Mux](mem://architecture/lipsync/sync-segments-multispeaker-audio-mux) — render-sync-segments-audio-mux
- [Server-Owned State Machine v23](mem://architecture/lipsync/server-owned-state-machine-v23) — dialog_shots schema
- [Unified Multi-Pass v6](mem://architecture/lipsync/unified-multi-pass-v6) — pass chaining
- [v63 sync_mode=loop](mem://architecture/lipsync/v63-sync-mode-loop) — N≥2 uses `sync_mode=loop` so output length == VO length; superseded for N=1 by v64
- [v64 N=1 Tight-Slice Parity](mem://architecture/lipsync/v64-n1-tight-slice-parity) — N=1 now uses tight-slice + audio-mux overlay (same path as N≥2 success); `sync_mode=cut_off` for N=1, `loop` for N≥2; fixes provider_unknown_error on 78%-silence WAVs
- [No Per-User Video Rate Limit](mem://architecture/video-edge-functions/no-per-user-rate-limit) — wallet-only spend protection
- [Composer Engine Normalization](mem://architecture/video-composer/engine-normalization-policy) — ai-sora → ai-hailuo, Kling 3 Omni for T2V
- [James Bond 2028 Design](mem://design/james-bond-2028-comprehensive-design-system) — Deep black/gold aesthetic
- [Credit Refund Automation](mem://architecture/failure-credit-refund-automation) — Lambda/Sora timeout refunds
- [Lambda Production Config](mem://infrastructure/remotion-lambda-production-configuration) — 3008MB RAM, 600s timeout
- [Universal Video Style Profiles](mem://design/universal-video/category-style-profiles) — 12 format identities
- [RLS Path Constraint](mem://infrastructure/storage/background-projects-rls-path-constraint) — user ID first in storage path
- [Lambda Concurrency Policy](mem://infrastructure/aws-lambda/rendering-concurrency-stability-policy) — framesPerLambda 270
- [Director's Cut Boundary Stability](mem://architecture/directors-cut/playback-boundary-stability-strategy) — boundary markers
- [Ad/Email Director, Composer, AI Video Toolkit, Marketplace, Avatars, Music, SFX, Stock Videos, Status Page, QA Agent, etc.] — see prior index for full list
- [Composer Replicate Fetch-Timeout Resilience](mem://architecture/video-composer/replicate-fetch-timeout-resilience) — composer-frames cacheControl=3600 + CLIP_COSTS sync (+happyhorse/vidu/grok/ltx) + Auto-Retry im compose-clip-webhook bei transienten Replicate-Read-Timeouts via re-dispatch (max 2)
- [Lipsync v66 sync_mode tight-gated](mem://architecture/lipsync/v66-sync-mode-tight-gated) — Behebt 4-Sprecher provider_unknown_error: sync_mode wird tight-gated bestimmt (`tightAudioInfo ? cut_off : loop`) statt count-gated; vorher loopte Sync.so 1.6s Tight-Audio ~5× über 9s Plate
- [Lipsync v69 unified single-face preclip](mem://architecture/lipsync/v69-unified-single-face-preclip) — Erweitert v68 von N≥3 auf ALLE Sprecherzahlen: jeder Sync.so-Pass läuft jetzt über einen Single-Face-Square-Crop-Preclip (Remotion Lambda), unabhängig von N. Eine einheitliche Pipeline, kein Multi-Face-Plate mehr an Sync.so. Full-Plate-Fallback bei Preclip-Render-Fehler bleibt erhalten.
- [Lipsync v75 windowed moving master](mem://architecture/lipsync/v72-static-anchor-master) — v72/v74 Static-Anchor + Hold-to-End ist superseded; Multi-Speaker-Mux nutzt bewegten Master + per-speaker windowed Sync.so-Overlays. Static master nicht als Default reaktivieren.
- [Lipsync v76 neighbor-aware preclip](mem://architecture/lipsync/v76-neighbor-aware-preclip) — Behebt "Character 2 spricht das ganze Skript": `computeFaceCrop` clampt die Crop-Kante auf `max(160, 0.9 * minNeighborDistance)` und softet den Floor für N≥3 auf `srcH * 0.35/0.4`, damit Single-Face-Preclips auf engen 3–4-Sprecher-Plates wirklich nur ein Gesicht enthalten.
- [Anchor CastActions + Asymmetric Framing](mem://architecture/video-composer/anchor-cast-actions-asymmetric) — compose-scene-anchor v14: [CastActions] werden vor dem Dialog-Stripper extrahiert + als geschützte CHARACTER ACTIONS Klausel reinjiziert; TWO_SHOT_FRAMING_SUFFIX wird bei asymmetrischen Keywords (background/phone/leaning/…) aufgeweicht, EXACT_COUNT + N-Faces bleiben für Lip-Sync
- [Lipsync v77 plate-native face targeting](mem://architecture/lipsync/v77-plate-native-face-targeting) — Multi-speaker dialog scenes resolve per-character coords/bbox on the rendered plate via `resolvePlateFaceIdentities`; anchor faceMap becomes fallback only. Soft-pass for "all anchor identity-matched" removed; preclip face-count gate added.
