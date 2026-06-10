---
name: Plan B Hebel B — Batch Preclip Prefetch (Juni 2026)
description: compose-dialog-segments rendert auf first dispatch alle v69 Single-Face-Preclips parallel statt seriell pro Pass via Webhook-Chain. Gated by system_config.composer.batch_preclip_render (default false). Hebel A (TTS+Anchor parallel) deferred wegen Duration-Dependency (voDur → Hailuo 6s/10s).
type: architecture
---

# Plan B (Phase 1)

## Was
`compose-dialog-segments`: neuer Block direkt nach tightAudioInfo (~Z. 1958). Wenn Flag `composer.batch_preclip_render = true` UND fresh dispatch (currentPassIdx===0, !isAdvance, !isRetry) UND speakers.length>=2: Promise.allSettled über alle Passes → renderPassFacePreclip + validateFrameFace parallel. Ergebnisse landen in passes[i].preclip_url; existierender per-pass v69-Block (Z. 2139+) wird durch `!preclip_url`-Guard zum no-op.

## Einsparung
4 Sprecher: ~12-42s (3 serielle Preclips eliminiert). Sync.so v60 serial-chain unverändert.

## Flag-Migration
`system_config`:
- `composer.parallel_tts_anchor` = false (Hebel A deferred)
- `composer.batch_preclip_render` = false (Hebel B aktiv-fähig)

Aktivieren: `UPDATE system_config SET value='true'::jsonb WHERE key='composer.batch_preclip_render'`.

## Telemetrie
Logs: `plan_b_B_batch_preclip_start` / `_complete ms_total=… ok=N/M results=[idx:status,…]`.

## Backward-Compat
- Flag off → 0 Verhaltensänderung
- Pro Pass: render_failed / face_gate_blocked / skip_edge / skip_no_coords → existierender per-pass-Block übernimmt auf seinem Chain-Turn (full-plate fallback)
- Mirrors v88 edge-speaker skip, v77 plate-native bbox, v76 sibling coords, face-gate

## Hebel A (deferred)
TTS+Anchor parallel in compose-video-clips ist **nicht** drin: TTS output duration (`voDur`) steuert via auto-extend (Z. 1078-1098) ob Hailuo 6s oder 10s rendert. Blinde Parallelisierung würde 6s-Renders verschwenden wenn VO >6s. Sichere Variante (nur bei scene.durationSeconds===10 oder Trennung Anchor-Image vs Hailuo) in eigenem Ticket.
