# Memory: index.md
Updated: today

# Project Memory

## Core
- **Design System**: 'James Bond 2028'. Deep black (#050816), gold (#F5C76A), cyan accents. Glassmorphism. Playfair Display, Inter.
- **Localization**: UI, scripts, and VOs in EN, DE, ES. Visual prompts for AI models MUST remain in English for output quality.
- **Credit Reliability**: Automatic, idempotent credit refunds are mandatory for external API/render failures.
- **Storage Constraints**: Storage buckets enforce strict RLS. User ID must be the first directory in the path.
- **Rendering Stability**: Lambda max 5 workers (tiered by frame count); framesPerLambda=270 default, scene-aligned dynamic for composer. Use imperative DOM updates for video transforms.
- **Social Integration**: X requires Basic API. TikTok uses Sandbox. Meta uses Graph API v24 (media_view fallback to impressions).
- **Audio/Video Separation**: Treat video scenes with variable durations; audio (original, VO, music) are linear tracks. Sync playback rates.
- **Director's Cut Export**: Hard-crop for burned-in subtitles. WYSIWYG parity between Studio state and snake_case export payload.
- **Data Persistence**: Video creations go to 'video_creations' table; other media to 'content_items'.
- **Timeouts**: Complex AI edge functions require 120s - 300s.
- **Video Rate Limits**: Per-user hourly limit removed; wallet balance is the only spend protection.
- **Lip-Sync Sync.so Compliance**: Never send undocumented `segments_secs`; gate silent speaker audio before Sync.so dispatch.
- **Lip-Sync Multi-Speaker Model**: 3+ speaker official segments dispatch uses `sync-3`, NOT `lipsync-2-pro` (static plates → unknown error).

## Memories
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
