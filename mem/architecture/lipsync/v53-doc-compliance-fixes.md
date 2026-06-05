---
name: Lip-Sync v53 Doc Compliance Fixes
description: Sync.so dispatches must not send undocumented segments_secs; every Sync.so pass must gate silent audio before provider dispatch.
type: constraint
---

# Lip-Sync v53 Doc Compliance Fixes

For Sync.so lip-sync dispatches:

1. **Do not send `segments_secs`** in Sync.so payloads. It is not part of the public Sync.so schema used by the current pipeline and caused provider `An unknown error occurred` failures, especially with `sync-3`.
2. **Run a silent-audio gate before provider dispatch.** A pass must contain detectable voiced audio (`peak_dbfs > -50` and non-zero voiced frames). Silent or invalid speaker audio must fail before Sync.so with `speaker_audio_silent_or_invalid` and trigger the existing idempotent refund path.

Turn scoping for multi-speaker passes must use tight per-turn WAVs plus documented `sync_mode: "cut_off"`, not video-side segment hints.